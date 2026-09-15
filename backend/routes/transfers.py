"""
Inter-PHC Transfer State Machine REST API Routes.
Hardened with Gemini 3.6 Flash Secondary Double-Audit Recommendations:
1. Transit-aware shelf life buffer passed to allocate_fefo_batches.
2. Optimistic Concurrency Control (OCC) version checking on batch reservation updates.
3. Return inspection safety: re-validates expiration date and status upon RECEIVE RETURN.
   Expired returns are diverted to WASTED_EXPIRED, and recalled/quarantined returns are diverted to QUARANTINED.
4. Physical reality mirroring: elimination of teleportation bugs.
5. Strict RFC 9110 HTTP 422 & HTTP 409 status code mappings.
"""

from datetime import datetime, timezone, timedelta
import uuid
import math
import sqlite3
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, status, Query, BackgroundTasks

from database import (
    get_connection,
    get_db_path,
    record_inventory_transaction,
    execute_write_transaction_async,
)
from schemas import (
    TransferStatus,
    TransferUrgency,
    CreateTransferRequest,
    ApproveTransferRequest,
    DispatchTransferRequest,
    InTransitTransferRequest,
    ReceiveTransferRequest,
    CancelTransferRequest,
    AbortTransitRequest,
    ReceiveReturnRequest,
    TransferResponse,
    TransferDetailResponse,
    TransferListResponse,
    BatchAllocationItem,
    BatchLedgerEntry,
)
from transfers_core import (
    calculate_haversine_distance,
    estimate_transit_time,
    validate_state_transition,
    allocate_fefo_batches,
    sweep_expired_soft_reservations,
)
from routes.stats import invalidate_stats_cache
from alerts import broadcast_transfer_event

router = APIRouter(prefix="/api/transfers", tags=["Inter-PHC Transfers"])


def _format_utc_timestamp() -> str:
    """Returns standard UTC timestamp string compatible with SQLite CURRENT_TIMESTAMP."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _fetch_transfer_row(cursor: sqlite3.Cursor, transfer_id: int) -> sqlite3.Row:
    """Helper to fetch a single transfer row with joined facility and medicine metadata."""
    cursor.execute("""
        SELECT 
            t.id, t.transfer_code, t.source_facility_id, t.destination_facility_id,
            t.medicine_id, t.quantity, t.status, t.urgency, t.distance_km,
            t.estimated_transit_hours, t.reason, t.ai_recommended, t.ai_rationale,
            t.requested_at, t.approved_at, t.dispatched_at, t.received_at, t.returned_at,
            (SELECT COUNT(*) FROM inventory_transactions it WHERE it.transfer_id = t.id) AS transaction_count,
            f_src.facility_code AS source_facility_code,
            f_src.name AS source_facility_name,
            f_src.district AS source_district,
            f_src.terrain_type AS source_terrain,
            f_src.facility_gln AS source_facility_gln,
            f_dst.facility_code AS destination_facility_code,
            f_dst.name AS destination_facility_name,
            f_dst.district AS destination_district,
            f_dst.terrain_type AS destination_terrain,
            f_dst.facility_gln AS destination_facility_gln,
            m.sku AS medicine_sku,
            m.name AS medicine_name,
            m.category AS medicine_category,
            m.unit AS medicine_unit,
            m.gtin AS medicine_gtin
        FROM transfers t
        JOIN facilities f_src ON t.source_facility_id = f_src.id
        JOIN facilities f_dst ON t.destination_facility_id = f_dst.id
        JOIN medicines m ON t.medicine_id = m.id
        WHERE t.id = ?;
    """, (transfer_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Transfer with ID {transfer_id} not found")
    return row


def _row_to_transfer_response(row: sqlite3.Row) -> TransferResponse:
    """Maps database row to TransferResponse schema."""
    return TransferResponse(
        id=row["id"],
        transfer_code=row["transfer_code"],
        source_facility_id=row["source_facility_id"],
        source_facility_code=row["source_facility_code"],
        source_facility_name=row["source_facility_name"],
        source_district=row["source_district"],
        source_terrain=row["source_terrain"],
        destination_facility_id=row["destination_facility_id"],
        destination_facility_code=row["destination_facility_code"],
        destination_facility_name=row["destination_facility_name"],
        destination_district=row["destination_district"],
        destination_terrain=row["destination_terrain"],
        medicine_id=row["medicine_id"],
        medicine_sku=row["medicine_sku"],
        medicine_name=row["medicine_name"],
        medicine_category=row["medicine_category"],
        medicine_unit=row["medicine_unit"],
        quantity=row["quantity"],
        status=row["status"],
        urgency=row["urgency"],
        distance_km=row["distance_km"],
        estimated_transit_hours=row["estimated_transit_hours"],
        reason=row["reason"],
        ai_recommended=row["ai_recommended"],
        ai_rationale=row["ai_rationale"],
        requested_at=row["requested_at"],
        approved_at=row["approved_at"],
        dispatched_at=row["dispatched_at"],
        received_at=row["received_at"],
        returned_at=row["returned_at"] if "returned_at" in row.keys() else None,
        transaction_count=row["transaction_count"] if "transaction_count" in row.keys() else 0,
    )


def _row_to_transfer_detail_response(cursor: sqlite3.Cursor, row: sqlite3.Row) -> TransferDetailResponse:
    """Builds TransferDetailResponse including batches and cryptographic transaction ledger entries."""
    base = _row_to_transfer_response(row)

    cursor.execute("""
        SELECT 
            id, transaction_type, facility_gln, gtin, batch_id, batch_number,
            serial_number, expiry_date, quantity, balance_after, reference_id,
            notes, logged_by, user_reported_at, created_at, previous_hash, hash
        FROM inventory_transactions
        WHERE transfer_id = ?
        ORDER BY id ASC;
    """, (row["id"],))
    tx_rows = cursor.fetchall()

    transactions = [
        BatchLedgerEntry(
            id=t["id"],
            transaction_type=t["transaction_type"],
            facility_gln=t["facility_gln"],
            gtin=t["gtin"],
            batch_number=t["batch_number"],
            serial_number=t["serial_number"],
            expiry_date=t["expiry_date"],
            quantity=t["quantity"],
            balance_after=t["balance_after"],
            reference_id=t["reference_id"],
            notes=t["notes"],
            logged_by=t["logged_by"],
            user_reported_at=t["user_reported_at"],
            created_at=t["created_at"],
            previous_hash=t["previous_hash"],
            hash=t["hash"],
        )
        for t in tx_rows
    ]

    dispatched_batches = [
        BatchAllocationItem(
            batch_id=t["batch_id"],
            batch_number=t["batch_number"],
            gtin=t["gtin"],
            serial_number=t["serial_number"],
            expiry_date=t["expiry_date"],
            quantity=t["quantity"],
        )
        for t in tx_rows if t["transaction_type"] == "TRANSFERRED_OUT"
    ]

    received_batches = [
        BatchAllocationItem(
            batch_id=t["batch_id"],
            batch_number=t["batch_number"],
            gtin=t["gtin"],
            serial_number=t["serial_number"],
            expiry_date=t["expiry_date"],
            quantity=t["quantity"],
        )
        for t in tx_rows if t["transaction_type"] == "TRANSFERRED_IN"
    ]

    return TransferDetailResponse(
        **base.model_dump(),
        dispatched_batches=dispatched_batches,
        received_batches=received_batches,
        transactions=transactions
    )


# =====================================================================
# Database Logic Callables (for execute_write_transaction_async)
# =====================================================================

def _create_transfer_db_logic(conn: sqlite3.Connection, req: CreateTransferRequest) -> TransferResponse:
    cursor = conn.cursor()

    if req.source_facility_id == req.destination_facility_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Source and destination facilities must be different."
        )

    # Validate Source Facility
    cursor.execute("SELECT id, name, latitude, longitude, terrain_type FROM facilities WHERE id = ? AND is_active = 1;", (req.source_facility_id,))
    src = cursor.fetchone()
    if not src:
        raise HTTPException(status_code=404, detail=f"Source facility {req.source_facility_id} not found or inactive")

    # Validate Destination Facility
    cursor.execute("SELECT id, name, latitude, longitude, terrain_type FROM facilities WHERE id = ? AND is_active = 1;", (req.destination_facility_id,))
    dst = cursor.fetchone()
    if not dst:
        raise HTTPException(status_code=404, detail=f"Destination facility {req.destination_facility_id} not found or inactive")

    # Validate Medicine
    cursor.execute("SELECT id, name, sku, gtin FROM medicines WHERE id = ? AND is_active = 1;", (req.medicine_id,))
    med = cursor.fetchone()
    if not med:
        raise HTTPException(status_code=404, detail=f"Medicine {req.medicine_id} not found or inactive")

    # Compute distance and terrain-aware transit duration
    distance_km = calculate_haversine_distance(
        src["latitude"], src["longitude"], dst["latitude"], dst["longitude"]
    )
    est_hours = estimate_transit_time(distance_km, src["terrain_type"], dst["terrain_type"])

    # Check donor active unexpired stock availability (accounting for transit buffer)
    transit_days = math.ceil((est_hours or 0.0) / 24.0)
    buffer_days = max(2, transit_days + 1)
    min_viable_expiry = (datetime.now(timezone.utc) + timedelta(days=buffer_days)).strftime("%Y-%m-%d")

    cursor.execute("""
        SELECT COALESCE(SUM(quantity_available), 0) AS total_stock
        FROM stock_batches
        WHERE facility_id = ? AND medicine_id = ? AND status = 'ACTIVE' AND expiry_date >= ?;
    """, (req.source_facility_id, req.medicine_id, min_viable_expiry))
    stock_row = cursor.fetchone()
    total_stock = stock_row["total_stock"] if stock_row else 0

    if total_stock < req.quantity:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                f"Source facility '{src['name']}' has only {total_stock} active units of {med['name']} "
                f"viable through required transit buffer ({min_viable_expiry}), but {req.quantity} requested."
            )
        )

    transfer_code = f"TRF-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    now_ts = _format_utc_timestamp()

    init_status = TransferStatus.APPROVED.value if req.auto_approve else TransferStatus.DRAFT.value
    approved_at = now_ts if req.auto_approve else None

    cursor.execute("""
        INSERT INTO transfers (
            transfer_code, source_facility_id, destination_facility_id, medicine_id,
            quantity, status, urgency, distance_km, estimated_transit_hours,
            reason, ai_recommended, ai_rationale, requested_at, approved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, (
        transfer_code, req.source_facility_id, req.destination_facility_id, req.medicine_id,
        req.quantity, init_status, req.urgency.value, distance_km, est_hours,
        req.reason, 1 if req.ai_recommended else 0, req.ai_rationale, now_ts, approved_at
    ))
    new_id = cursor.lastrowid

    # If auto_approve is requested, immediately execute soft batch reservation with OCC check-and-set
    if req.auto_approve:
        try:
            allocated = allocate_fefo_batches(
                cursor=cursor,
                facility_id=req.source_facility_id,
                medicine_id=req.medicine_id,
                required_quantity=req.quantity,
                estimated_transit_hours=est_hours
            )
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e))

        for alloc in allocated:
            cursor.execute("""
                UPDATE stock_batches
                SET quantity_available = quantity_available - ?,
                    quantity_reserved = quantity_reserved + ?,
                    version = version + 1
                WHERE id = ? AND version = ? AND quantity_available >= ?
                RETURNING id, quantity_available, quantity_reserved, version;
            """, (alloc["quantity"], alloc["quantity"], alloc["batch_id"], alloc["version"], alloc["quantity"]))
            updated_batch = cursor.fetchone()

            if not updated_batch:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Concurrency Conflict: Batch '{alloc['batch_number']}' was modified concurrently during allocation. Please retry."
                )

            cursor.execute("""
                INSERT INTO transfer_batch_allocations (transfer_id, batch_id, quantity)
                VALUES (?, ?, ?);
            """, (new_id, alloc["batch_id"], alloc["quantity"]))

    row = _fetch_transfer_row(cursor, new_id)
    return _row_to_transfer_response(row)


def _approve_transfer_db_logic(conn: sqlite3.Connection, transfer_id: int, req: ApproveTransferRequest) -> TransferResponse:
    cursor = conn.cursor()
    row = _fetch_transfer_row(cursor, transfer_id)

    if row["status"] != TransferStatus.DRAFT.value:
        if not validate_state_transition(row["status"], TransferStatus.APPROVED.value):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Illegal transition: Cannot approve transfer with current status '{row['status']}'."
            )

    # 1. Soft Reservation: Allocate batches and lock stock with OCC version check
    try:
        allocated = allocate_fefo_batches(
            cursor=cursor,
            facility_id=row["source_facility_id"],
            medicine_id=row["medicine_id"],
            required_quantity=row["quantity"],
            estimated_transit_hours=row["estimated_transit_hours"]
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e))

    for alloc in allocated:
        cursor.execute("""
            UPDATE stock_batches
            SET quantity_available = quantity_available - ?,
                quantity_reserved = quantity_reserved + ?,
                version = version + 1
            WHERE id = ? AND version = ? AND quantity_available >= ?
            RETURNING id, quantity_available, quantity_reserved, version;
        """, (alloc["quantity"], alloc["quantity"], alloc["batch_id"], alloc["version"], alloc["quantity"]))
        updated_batch = cursor.fetchone()

        if not updated_batch:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Concurrency Conflict: Batch '{alloc['batch_number']}' was modified or consumed concurrently. Please refresh inventory and retry."
            )

        cursor.execute("""
            INSERT INTO transfer_batch_allocations (transfer_id, batch_id, quantity)
            VALUES (?, ?, ?);
        """, (transfer_id, alloc["batch_id"], alloc["quantity"]))

    now_ts = _format_utc_timestamp()
    cursor.execute("""
        UPDATE transfers 
        SET status = 'APPROVED', approved_at = ?
        WHERE id = ?;
    """, (now_ts, transfer_id))

    updated_row = _fetch_transfer_row(cursor, transfer_id)
    return _row_to_transfer_response(updated_row)


def _dispatch_transfer_db_logic(conn: sqlite3.Connection, transfer_id: int, req: DispatchTransferRequest) -> TransferDetailResponse:
    cursor = conn.cursor()
    row = _fetch_transfer_row(cursor, transfer_id)

    if not validate_state_transition(row["status"], TransferStatus.DISPATCHED.value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Illegal transition: Cannot dispatch transfer with current status '{row['status']}'. Transfer must be in APPROVED status."
        )

    # 1. Fetch reserved batch allocations from approval phase
    cursor.execute("""
        SELECT tba.batch_id, tba.quantity, sb.batch_number, sb.gtin, sb.serial_number, sb.expiry_date, sb.quantity_reserved
        FROM transfer_batch_allocations tba
        JOIN stock_batches sb ON tba.batch_id = sb.id
        WHERE tba.transfer_id = ?;
    """, (transfer_id,))
    allocated = cursor.fetchall()

    if not allocated:
        # Fallback if allocations weren't recorded: allocate now
        try:
            alloc_dicts = allocate_fefo_batches(
                cursor, row["source_facility_id"], row["medicine_id"], row["quantity"], row["estimated_transit_hours"]
            )
            for a in alloc_dicts:
                cursor.execute("""
                    UPDATE stock_batches 
                    SET quantity_available = quantity_available - ?, version = version + 1
                    WHERE id = ?;
                """, (a["quantity"], a["batch_id"]))
            allocated_items = alloc_dicts
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e))
    else:
        allocated_items = [dict(a) for a in allocated]

    now_ts = _format_utc_timestamp()

    # 2. Deduct from quantity_reserved & Inscribe TRANSFERRED_OUT in SHA-256 ledger
    for alloc in allocated_items:
        b_id = alloc["batch_id"]
        qty = alloc["quantity"]

        # Deduct from reserved stock
        cursor.execute("""
            UPDATE stock_batches
            SET quantity_reserved = quantity_reserved - ?, version = version + 1
            WHERE id = ? AND quantity_reserved >= ?
            RETURNING id, quantity_available, quantity_reserved, version, batch_number, expiry_date, gtin, serial_number;
        """, (qty, b_id, qty))
        updated_batch = cursor.fetchone()

        if not updated_batch:
            cursor.execute("""
                SELECT id, quantity_available, quantity_reserved, version, batch_number, expiry_date, gtin, serial_number
                FROM stock_batches WHERE id = ?;
            """, (b_id,))
            updated_batch = cursor.fetchone()

        gtin = updated_batch["gtin"] if updated_batch else alloc.get("gtin")
        if not gtin or len(str(gtin).strip()) < 8:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"DSCSA Compliance Error: Batch {alloc['batch_number']} lacks a valid GTIN-14 barcode."
            )

        # Record TRANSFERRED_OUT in immutable ledger
        record_inventory_transaction(
            cursor=cursor,
            facility_id=row["source_facility_id"],
            facility_gln=row["source_facility_gln"],
            medicine_id=row["medicine_id"],
            gtin=str(gtin).strip(),
            batch_id=b_id,
            batch_number=alloc["batch_number"],
            serial_number=alloc.get("serial_number"),
            expiry_date=alloc["expiry_date"],
            transaction_type="TRANSFERRED_OUT",
            quantity=qty,
            balance_after=updated_batch["quantity_available"] if updated_batch else 0,
            transfer_id=transfer_id,
            reference_id=row["transfer_code"],
            notes=f"Dispatched inter-facility transfer to {row['destination_facility_name']}. {req.notes or ''}".strip(),
            logged_by=req.dispatched_by or "Donor Facility Pharmacist"
        )

    # 3. Update Transfer Record Status
    cursor.execute("""
        UPDATE transfers
        SET status = 'DISPATCHED', dispatched_at = ?
        WHERE id = ?;
    """, (now_ts, transfer_id))

    updated_row = _fetch_transfer_row(cursor, transfer_id)
    return _row_to_transfer_detail_response(cursor, updated_row)


def _mark_in_transit_db_logic(conn: sqlite3.Connection, transfer_id: int, req: InTransitTransferRequest) -> TransferResponse:
    cursor = conn.cursor()
    row = _fetch_transfer_row(cursor, transfer_id)

    if not validate_state_transition(row["status"], TransferStatus.IN_TRANSIT.value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Illegal transition: Cannot transition from '{row['status']}' to IN_TRANSIT. Expected DISPATCHED."
        )

    cursor.execute("UPDATE transfers SET status = 'IN_TRANSIT' WHERE id = ?;", (transfer_id,))
    updated_row = _fetch_transfer_row(cursor, transfer_id)
    return _row_to_transfer_response(updated_row)


def _receive_transfer_db_logic(conn: sqlite3.Connection, transfer_id: int, req: ReceiveTransferRequest) -> TransferDetailResponse:
    cursor = conn.cursor()
    row = _fetch_transfer_row(cursor, transfer_id)

    if not validate_state_transition(row["status"], TransferStatus.RECEIVED.value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Illegal transition: Cannot receive transfer with current status '{row['status']}'. Expected IN_TRANSIT."
        )

    # 1. Fetch dispatched batches from ledger
    cursor.execute("""
        SELECT 
            batch_id, batch_number, gtin, serial_number, expiry_date, quantity
        FROM inventory_transactions
        WHERE transfer_id = ? AND transaction_type = 'TRANSFERRED_OUT'
        ORDER BY id ASC;
    """, (transfer_id,))
    dispatched_items = cursor.fetchall()

    if not dispatched_items:
        raise HTTPException(
            status_code=500,
            detail=f"Data Integrity Error: Transfer {transfer_id} has no recorded dispatch transactions."
        )

    total_dispatched = sum(item["quantity"] for item in dispatched_items)
    received_quantity = req.received_quantity if req.received_quantity is not None else total_dispatched

    if received_quantity < 0 or received_quantity > total_dispatched:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Received quantity ({received_quantity}) must be between 0 and total dispatched ({total_dispatched})."
        )

    is_partial = received_quantity < total_dispatched
    final_status = TransferStatus.PARTIALLY_RECEIVED.value if is_partial else TransferStatus.RECEIVED.value
    now_ts = _format_utc_timestamp()

    # 2. Ingest stock into Destination Facility
    remaining_to_receive = received_quantity

    for item in dispatched_items:
        if remaining_to_receive <= 0:
            qty_to_receive_this_batch = 0
        else:
            qty_to_receive_this_batch = min(item["quantity"], remaining_to_receive)
            remaining_to_receive -= qty_to_receive_this_batch

        spoilage_qty = item["quantity"] - qty_to_receive_this_batch

        # Augment or create batch at destination
        if qty_to_receive_this_batch > 0:
            cursor.execute("""
                SELECT id, quantity_available FROM stock_batches
                WHERE facility_id = ? AND medicine_id = ? AND batch_number = ?;
            """, (row["destination_facility_id"], row["medicine_id"], item["batch_number"]))
            existing_dest_batch = cursor.fetchone()

            if existing_dest_batch:
                dest_batch_id = existing_dest_batch["id"]
                cursor.execute("""
                    UPDATE stock_batches
                    SET quantity_available = quantity_available + ?, version = version + 1, status = 'ACTIVE'
                    WHERE id = ?
                    RETURNING id, quantity_available;
                """, (qty_to_receive_this_batch, dest_batch_id))
                updated_dest = cursor.fetchone()
                dest_balance_after = updated_dest["quantity_available"]
            else:
                cursor.execute("""
                    INSERT INTO stock_batches (
                        facility_id, medicine_id, gtin, batch_number, serial_number,
                        expiry_date, quantity_available, quantity_reserved, status, version
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'ACTIVE', 1);
                """, (
                    row["destination_facility_id"], row["medicine_id"], item["gtin"],
                    item["batch_number"], item["serial_number"], item["expiry_date"],
                    qty_to_receive_this_batch
                ))
                dest_batch_id = cursor.lastrowid
                dest_balance_after = qty_to_receive_this_batch

            # Record TRANSFERRED_IN in ledger
            record_inventory_transaction(
                cursor=cursor,
                facility_id=row["destination_facility_id"],
                facility_gln=row["destination_facility_gln"],
                medicine_id=row["medicine_id"],
                gtin=item["gtin"],
                batch_id=dest_batch_id,
                batch_number=item["batch_number"],
                serial_number=item["serial_number"],
                expiry_date=item["expiry_date"],
                transaction_type="TRANSFERRED_IN",
                quantity=qty_to_receive_this_batch,
                balance_after=dest_balance_after,
                transfer_id=transfer_id,
                reference_id=row["transfer_code"],
                notes=f"Received inter-facility transfer from {row['source_facility_name']}. {req.notes or ''}".strip(),
                logged_by=req.received_by or "Recipient Pharmacist"
            )

        # If any units were damaged/spoiled in transit, log them in ledger
        if spoilage_qty > 0:
            record_inventory_transaction(
                cursor=cursor,
                facility_id=row["destination_facility_id"],
                facility_gln=row["destination_facility_gln"],
                medicine_id=row["medicine_id"],
                gtin=item["gtin"],
                batch_id=dest_batch_id if qty_to_receive_this_batch > 0 else item["batch_id"],
                batch_number=item["batch_number"],
                serial_number=item["serial_number"],
                expiry_date=item["expiry_date"],
                transaction_type="WASTED_EXPIRED",
                quantity=spoilage_qty,
                balance_after=dest_balance_after if qty_to_receive_this_batch > 0 else 0,
                transfer_id=transfer_id,
                reference_id=row["transfer_code"],
                notes=f"Transit loss/damage for transfer {row['transfer_code']}: {req.spoilage_reason or 'Damaged/spoiled during transit'}",
                logged_by=req.received_by or "Recipient Pharmacist"
            )

    # 3. Update Transfer Record Status
    cursor.execute("""
        UPDATE transfers
        SET status = ?, received_at = ?
        WHERE id = ?;
    """, (final_status, now_ts, transfer_id))

    updated_row = _fetch_transfer_row(cursor, transfer_id)
    return _row_to_transfer_detail_response(cursor, updated_row)


def _cancel_transfer_db_logic(conn: sqlite3.Connection, transfer_id: int, req: CancelTransferRequest) -> TransferResponse:
    cursor = conn.cursor()
    row = _fetch_transfer_row(cursor, transfer_id)

    # Strict physical reality check: cannot cancel from DISPATCHED or IN_TRANSIT
    if row["status"] in [TransferStatus.DISPATCHED.value, TransferStatus.IN_TRANSIT.value]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                f"Physical Reality Constraint: Transfer is currently '{row['status']}' and physically on a transport vehicle. "
                f"Instant cancellation is physically impossible. Use POST /api/transfers/{transfer_id}/abort-transit "
                f"to turn vehicle back and then physically receive the return at the donor facility."
            )
        )

    if not validate_state_transition(row["status"], TransferStatus.CANCELLED.value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Illegal transition: Cannot cancel transfer with current status '{row['status']}'."
        )

    # If cancelled from APPROVED, release the soft reservation
    if row["status"] == TransferStatus.APPROVED.value:
        cursor.execute("""
            SELECT batch_id, quantity FROM transfer_batch_allocations WHERE transfer_id = ?;
        """, (transfer_id,))
        allocations = cursor.fetchall()

        for alloc in allocations:
            cursor.execute("""
                UPDATE stock_batches
                SET quantity_available = quantity_available + ?,
                    quantity_reserved = quantity_reserved - ?,
                    version = version + 1
                WHERE id = ? AND quantity_reserved >= ?;
            """, (alloc["quantity"], alloc["quantity"], alloc["batch_id"], alloc["quantity"]))

        cursor.execute("DELETE FROM transfer_batch_allocations WHERE transfer_id = ?;", (transfer_id,))

    cursor.execute("UPDATE transfers SET status = 'CANCELLED' WHERE id = ?;", (transfer_id,))
    updated_row = _fetch_transfer_row(cursor, transfer_id)
    return _row_to_transfer_response(updated_row)


def _abort_transit_db_logic(conn: sqlite3.Connection, transfer_id: int, req: AbortTransitRequest) -> TransferResponse:
    """Initiates physical vehicle turnaround back to donor facility (RETURN_IN_PROGRESS)."""
    cursor = conn.cursor()
    row = _fetch_transfer_row(cursor, transfer_id)

    if not validate_state_transition(row["status"], TransferStatus.RETURN_IN_PROGRESS.value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Cannot abort transit: current status is '{row['status']}'. Expected DISPATCHED, IN_TRANSIT, or PARTIALLY_RECEIVED."
        )

    cursor.execute("""
        UPDATE transfers 
        SET status = 'RETURN_IN_PROGRESS', reason = COALESCE(reason, '') || ' [ABORTED: ' || ? || ']'
        WHERE id = ?;
    """, (req.reason, transfer_id))

    updated_row = _fetch_transfer_row(cursor, transfer_id)
    return _row_to_transfer_response(updated_row)


def _receive_return_db_logic(conn: sqlite3.Connection, transfer_id: int, req: ReceiveReturnRequest) -> TransferDetailResponse:
    """
    Physically receives returned vehicle at donor facility dock and restores active inventory.
    Hardened with Double-Audit Safeguards:
    - Re-validates batch expiry date: if expired during transit, diverts directly to WASTED_EXPIRED.
    - Re-validates batch status: if recalled/quarantined during transit, keeps non-active.
    """
    cursor = conn.cursor()
    row = _fetch_transfer_row(cursor, transfer_id)

    if row["status"] != TransferStatus.RETURN_IN_PROGRESS.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Cannot receive return: current status is '{row['status']}'. Expected RETURN_IN_PROGRESS."
        )

    # 1. Fetch originally dispatched batches
    cursor.execute("""
        SELECT batch_id, batch_number, gtin, serial_number, expiry_date, quantity
        FROM inventory_transactions
        WHERE transfer_id = ? AND transaction_type = 'TRANSFERRED_OUT'
        ORDER BY id ASC;
    """, (transfer_id,))
    dispatched_items = cursor.fetchall()

    if not dispatched_items:
        raise HTTPException(status_code=500, detail="Data Integrity Error: Missing dispatch transactions for return.")

    total_dispatched = sum(item["quantity"] for item in dispatched_items)
    returned_quantity = req.returned_quantity if req.returned_quantity is not None else total_dispatched

    if returned_quantity < 0 or returned_quantity > total_dispatched:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Returned quantity ({returned_quantity}) must be between 0 and dispatched quantity ({total_dispatched})."
        )

    now_ts = _format_utc_timestamp()
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    remaining_to_restore = returned_quantity

    for item in dispatched_items:
        if remaining_to_restore <= 0:
            qty_to_restore = 0
        else:
            qty_to_restore = min(item["quantity"], remaining_to_restore)
            remaining_to_restore -= qty_to_restore

        lost_qty = item["quantity"] - qty_to_restore

        # Fetch current status and expiry of donor batch
        cursor.execute("""
            SELECT id, status, expiry_date, quantity_available, quantity_reserved
            FROM stock_batches WHERE id = ?;
        """, (item["batch_id"],))
        donor_batch = cursor.fetchone()

        is_expired = (donor_batch["expiry_date"] <= today_str) if donor_batch else False
        is_quarantined_or_recalled = (donor_batch["status"] in ["QUARANTINED", "RECALLED", "EXPIRED"]) if donor_batch else True

        if qty_to_restore > 0:
            if is_expired:
                # Arrived physically expired: divert directly to WASTED_EXPIRED, do not restore to active stock
                record_inventory_transaction(
                    cursor=cursor,
                    facility_id=row["source_facility_id"],
                    facility_gln=row["source_facility_gln"],
                    medicine_id=row["medicine_id"],
                    gtin=item["gtin"],
                    batch_id=item["batch_id"],
                    batch_number=item["batch_number"],
                    serial_number=item["serial_number"],
                    expiry_date=item["expiry_date"],
                    transaction_type="WASTED_EXPIRED",
                    quantity=qty_to_restore,
                    balance_after=donor_batch["quantity_available"] if donor_batch else 0,
                    transfer_id=transfer_id,
                    reference_id=row["transfer_code"],
                    notes=f"Physical return arrived expired (expiry: {donor_batch['expiry_date']}). Diverted to quarantine/destruction.",
                    logged_by=req.received_by or "Donor Facility Pharmacist"
                )
            elif is_quarantined_or_recalled:
                # Batch status drifted into quarantine/recall while on road: restore quantity but keep status non-active
                cursor.execute("""
                    UPDATE stock_batches
                    SET quantity_available = quantity_available + ?, version = version + 1
                    WHERE id = ?
                    RETURNING id, quantity_available;
                """, (qty_to_restore, item["batch_id"]))
                restored = cursor.fetchone()
                new_balance = restored["quantity_available"] if restored else qty_to_restore

                record_inventory_transaction(
                    cursor=cursor,
                    facility_id=row["source_facility_id"],
                    facility_gln=row["source_facility_gln"],
                    medicine_id=row["medicine_id"],
                    gtin=item["gtin"],
                    batch_id=item["batch_id"],
                    batch_number=item["batch_number"],
                    serial_number=item["serial_number"],
                    expiry_date=item["expiry_date"],
                    transaction_type="QUARANTINED",
                    quantity=qty_to_restore,
                    balance_after=new_balance,
                    transfer_id=transfer_id,
                    reference_id=row["transfer_code"],
                    notes=f"Physical return received for {donor_batch['status']} batch. Diverted to quarantine holding.",
                    logged_by=req.received_by or "Donor Facility Pharmacist"
                )
            else:
                # Normal healthy active batch: restore to quantity_available
                cursor.execute("""
                    UPDATE stock_batches
                    SET quantity_available = quantity_available + ?, version = version + 1
                    WHERE id = ?
                    RETURNING id, quantity_available;
                """, (qty_to_restore, item["batch_id"]))
                restored = cursor.fetchone()
                new_balance = restored["quantity_available"] if restored else qty_to_restore

                record_inventory_transaction(
                    cursor=cursor,
                    facility_id=row["source_facility_id"],
                    facility_gln=row["source_facility_gln"],
                    medicine_id=row["medicine_id"],
                    gtin=item["gtin"],
                    batch_id=item["batch_id"],
                    batch_number=item["batch_number"],
                    serial_number=item["serial_number"],
                    expiry_date=item["expiry_date"],
                    transaction_type="AUDIT_CORRECTION",
                    quantity=qty_to_restore,
                    balance_after=new_balance,
                    transfer_id=transfer_id,
                    reference_id=row["transfer_code"],
                    notes=f"Physical return received at donor loading dock. {req.notes or ''}".strip(),
                    logged_by=req.received_by or "Donor Facility Pharmacist"
                )

        if lost_qty > 0:
            record_inventory_transaction(
                cursor=cursor,
                facility_id=row["source_facility_id"],
                facility_gln=row["source_facility_gln"],
                medicine_id=row["medicine_id"],
                gtin=item["gtin"],
                batch_id=item["batch_id"],
                batch_number=item["batch_number"],
                serial_number=item["serial_number"],
                expiry_date=item["expiry_date"],
                transaction_type="WASTED_EXPIRED",
                quantity=lost_qty,
                balance_after=donor_batch["quantity_available"] if donor_batch else 0,
                transfer_id=transfer_id,
                reference_id=row["transfer_code"],
                notes=f"Transit spoilage/damage during aborted return: {req.spoilage_reason or 'Damaged during return transit'}",
                logged_by=req.received_by or "Donor Facility Pharmacist"
            )

    cursor.execute("""
        UPDATE transfers
        SET status = 'RETURNED', returned_at = ?
        WHERE id = ?;
    """, (now_ts, transfer_id))

    updated_row = _fetch_transfer_row(cursor, transfer_id)
    return _row_to_transfer_detail_response(cursor, updated_row)


# =====================================================================
# REST Endpoints
# =====================================================================

@router.post("", response_model=TransferResponse, status_code=status.HTTP_201_CREATED)
async def create_transfer(req: CreateTransferRequest, background_tasks: BackgroundTasks):
    """
    Creates an inter-facility transfer order.
    Calculates great-circle Haversine distance and terrain-aware transit time.
    Verifies donor stock availability and records order as DRAFT or APPROVED.
    """
    result = await execute_write_transaction_async(get_db_path(), _create_transfer_db_logic, req)
    background_tasks.add_task(invalidate_stats_cache)
    background_tasks.add_task(
        broadcast_transfer_event,
        transfer_id=result.id,
        transfer_code=result.transfer_code,
        old_status="NONE",
        new_status=result.status.value if hasattr(result.status, "value") else str(result.status),
        source_facility_id=result.source_facility_id,
        destination_facility_id=result.destination_facility_id,
        medicine_id=result.medicine_id,
        quantity=result.quantity,
        reason=req.reason
    )
    return result


@router.get("", response_model=TransferListResponse)
def list_transfers(
    status_filter: Optional[TransferStatus] = Query(None, alias="status", description="Filter by transfer status"),
    facility_id: Optional[int] = Query(None, description="Filter by facility ID (source or destination)"),
    source_facility_id: Optional[int] = Query(None, description="Filter by source facility ID"),
    destination_facility_id: Optional[int] = Query(None, description="Filter by destination facility ID"),
    medicine_id: Optional[int] = Query(None, description="Filter by medicine ID"),
    urgency: Optional[TransferUrgency] = Query(None, description="Filter by urgency"),
    limit: int = Query(50, ge=1, le=200, description="Max records to return"),
    skip: int = Query(0, ge=0, description="Records to skip")
):
    """Retrieves list of inter-facility transfer orders with rich geospatial and routing metadata."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        query = """
            SELECT 
                t.id, t.transfer_code, t.source_facility_id, t.destination_facility_id,
                t.medicine_id, t.quantity, t.status, t.urgency, t.distance_km,
                t.estimated_transit_hours, t.reason, t.ai_recommended, t.ai_rationale,
                t.requested_at, t.approved_at, t.dispatched_at, t.received_at, t.returned_at,
                (SELECT COUNT(*) FROM inventory_transactions it WHERE it.transfer_id = t.id) AS transaction_count,
                f_src.facility_code AS source_facility_code,
                f_src.name AS source_facility_name,
                f_src.district AS source_district,
                f_src.terrain_type AS source_terrain,
                f_src.facility_gln AS source_facility_gln,
                f_dst.facility_code AS destination_facility_code,
                f_dst.name AS destination_facility_name,
                f_dst.district AS destination_district,
                f_dst.terrain_type AS destination_terrain,
                f_dst.facility_gln AS destination_facility_gln,
                m.sku AS medicine_sku,
                m.name AS medicine_name,
                m.category AS medicine_category,
                m.unit AS medicine_unit,
                m.gtin AS medicine_gtin
            FROM transfers t
            JOIN facilities f_src ON t.source_facility_id = f_src.id
            JOIN facilities f_dst ON t.destination_facility_id = f_dst.id
            JOIN medicines m ON t.medicine_id = m.id
            WHERE 1=1
        """
        params: List[Any] = []

        if status_filter:
            query += " AND t.status = ?"
            params.append(status_filter.value)
        if facility_id:
            query += " AND (t.source_facility_id = ? OR t.destination_facility_id = ?)"
            params.extend([facility_id, facility_id])
        if source_facility_id:
            query += " AND t.source_facility_id = ?"
            params.append(source_facility_id)
        if destination_facility_id:
            query += " AND t.destination_facility_id = ?"
            params.append(destination_facility_id)
        if medicine_id:
            query += " AND t.medicine_id = ?"
            params.append(medicine_id)
        if urgency:
            query += " AND t.urgency = ?"
            params.append(urgency.value)

        count_query = f"SELECT COUNT(*) AS total FROM ({query})"
        cursor.execute(count_query, params)
        total_count = cursor.fetchone()["total"]

        query += " ORDER BY t.id DESC LIMIT ? OFFSET ?;"
        params.extend([limit, skip])

        cursor.execute(query, params)
        rows = cursor.fetchall()
        transfers = [_row_to_transfer_response(r) for r in rows]

        return TransferListResponse(total=total_count, transfers=transfers)
    finally:
        conn.close()


@router.get("/{transfer_id}", response_model=TransferDetailResponse)
def get_transfer_detail(transfer_id: int):
    """Retrieves full details of a transfer including dispatched/received batches and cryptographic ledger history."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        row = _fetch_transfer_row(cursor, transfer_id)
        return _row_to_transfer_detail_response(cursor, row)
    finally:
        conn.close()


@router.post("/{transfer_id}/approve", response_model=TransferResponse)
async def approve_transfer(transfer_id: int, req: ApproveTransferRequest, background_tasks: BackgroundTasks):
    """
    Transitions a transfer from DRAFT to APPROVED status.
    Executes soft stock reservation: allocates FEFO batches and transfers stock
    from quantity_available to quantity_reserved with atomic OCC check-and-set.
    """
    result = await execute_write_transaction_async(get_db_path(), _approve_transfer_db_logic, transfer_id, req)
    background_tasks.add_task(invalidate_stats_cache)
    background_tasks.add_task(
        broadcast_transfer_event,
        transfer_id=result.id,
        transfer_code=result.transfer_code,
        old_status="REQUESTED",
        new_status=result.status.value if hasattr(result.status, "value") else str(result.status),
        source_facility_id=result.source_facility_id,
        destination_facility_id=result.destination_facility_id,
        medicine_id=result.medicine_id,
        quantity=result.quantity,
        reason=req.notes
    )
    return result


@router.post("/{transfer_id}/dispatch", response_model=TransferDetailResponse)
async def dispatch_transfer(transfer_id: int, req: DispatchTransferRequest, background_tasks: BackgroundTasks):
    """
    Transitions transfer from APPROVED to DISPATCHED.
    Deducts stock from reserved batches at donor facility.
    Records an immutable TRANSFERRED_OUT cryptographic ledger transaction for each batch.
    """
    result = await execute_write_transaction_async(get_db_path(), _dispatch_transfer_db_logic, transfer_id, req)
    background_tasks.add_task(invalidate_stats_cache)
    background_tasks.add_task(
        broadcast_transfer_event,
        transfer_id=result.id,
        transfer_code=result.transfer_code,
        old_status="APPROVED",
        new_status=result.status.value if hasattr(result.status, "value") else str(result.status),
        source_facility_id=result.source_facility_id,
        destination_facility_id=result.destination_facility_id,
        medicine_id=result.medicine_id,
        quantity=result.quantity,
        reason=req.notes
    )
    return result


@router.post("/{transfer_id}/in-transit", response_model=TransferResponse)
async def mark_transfer_in_transit(transfer_id: int, req: InTransitTransferRequest, background_tasks: BackgroundTasks):
    """Transitions transfer from DISPATCHED to IN_TRANSIT with driver/vehicle telemetry."""
    result = await execute_write_transaction_async(get_db_path(), _mark_in_transit_db_logic, transfer_id, req)
    background_tasks.add_task(
        broadcast_transfer_event,
        transfer_id=result.id,
        transfer_code=result.transfer_code,
        old_status="DISPATCHED",
        new_status=result.status.value if hasattr(result.status, "value") else str(result.status),
        source_facility_id=result.source_facility_id,
        destination_facility_id=result.destination_facility_id,
        medicine_id=result.medicine_id,
        quantity=result.quantity,
        reason=None
    )
    return result


@router.post("/{transfer_id}/receive", response_model=TransferDetailResponse)
async def receive_transfer(transfer_id: int, req: ReceiveTransferRequest, background_tasks: BackgroundTasks):
    """
    Transitions transfer from IN_TRANSIT to RECEIVED (or PARTIALLY_RECEIVED).
    Increments batch quantities at recipient facility, creates new batch entries if necessary,
    and records an immutable TRANSFERRED_IN cryptographic ledger entry.
    Logs any transit spoilage as WASTED_EXPIRED.
    """
    result = await execute_write_transaction_async(get_db_path(), _receive_transfer_db_logic, transfer_id, req)
    background_tasks.add_task(invalidate_stats_cache)
    background_tasks.add_task(
        broadcast_transfer_event,
        transfer_id=result.id,
        transfer_code=result.transfer_code,
        old_status="IN_TRANSIT",
        new_status=result.status.value if hasattr(result.status, "value") else str(result.status),
        source_facility_id=result.source_facility_id,
        destination_facility_id=result.destination_facility_id,
        medicine_id=result.medicine_id,
        quantity=result.quantity,
        reason=req.notes
    )
    return result


@router.post("/{transfer_id}/cancel", response_model=TransferResponse)
async def cancel_transfer(transfer_id: int, req: CancelTransferRequest, background_tasks: BackgroundTasks):
    """
    Cancels transfer from DRAFT or APPROVED.
    If APPROVED, releases soft reservation back to quantity_available.
    Rejects cancellation from DISPATCHED or IN_TRANSIT (use /abort-transit instead).
    """
    result = await execute_write_transaction_async(get_db_path(), _cancel_transfer_db_logic, transfer_id, req)
    background_tasks.add_task(invalidate_stats_cache)
    background_tasks.add_task(
        broadcast_transfer_event,
        transfer_id=result.id,
        transfer_code=result.transfer_code,
        old_status="ACTIVE",
        new_status="CANCELLED",
        source_facility_id=result.source_facility_id,
        destination_facility_id=result.destination_facility_id,
        medicine_id=result.medicine_id,
        quantity=result.quantity,
        reason=req.reason
    )
    return result


@router.post("/{transfer_id}/abort-transit", response_model=TransferResponse)
async def abort_transit(transfer_id: int, req: AbortTransitRequest, background_tasks: BackgroundTasks):
    """
    Aborts transit for a DISPATCHED or IN_TRANSIT transfer (e.g. road landslide, vehicle failure).
    Transitions transfer to RETURN_IN_PROGRESS state. Physical stock remains on truck until received.
    """
    result = await execute_write_transaction_async(get_db_path(), _abort_transit_db_logic, transfer_id, req)
    background_tasks.add_task(
        broadcast_transfer_event,
        transfer_id=result.id,
        transfer_code=result.transfer_code,
        old_status="IN_TRANSIT",
        new_status="RETURN_IN_PROGRESS",
        source_facility_id=result.source_facility_id,
        destination_facility_id=result.destination_facility_id,
        medicine_id=result.medicine_id,
        quantity=result.quantity,
        reason=req.reason
    )
    return result


@router.post("/{transfer_id}/receive-return", response_model=TransferDetailResponse, status_code=status.HTTP_200_OK)
async def receive_return(transfer_id: int, req: ReceiveReturnRequest, background_tasks: BackgroundTasks):
    """
    Physically receives the returned transport vehicle at donor facility loading dock.
    Restores intact stock back to active inventory with an AUDIT_CORRECTION ledger record.
    If batch expired during transit, diverts to WASTED_EXPIRED.
    If batch was recalled during transit, diverts to QUARANTINED.
    Logs any transit damage/spoilage as WASTED_EXPIRED.
    """
    result = await execute_write_transaction_async(get_db_path(), _receive_return_db_logic, transfer_id, req)
    background_tasks.add_task(invalidate_stats_cache)
    background_tasks.add_task(
        broadcast_transfer_event,
        transfer_id=result.id,
        transfer_code=result.transfer_code,
        old_status="RETURN_IN_PROGRESS",
        new_status=result.status.value if hasattr(result.status, "value") else str(result.status),
        source_facility_id=result.source_facility_id,
        destination_facility_id=result.destination_facility_id,
        medicine_id=result.medicine_id,
        quantity=result.quantity,
        reason=req.notes
    )
    return result


@router.post("/sweep-expired")
async def sweep_expired_transfers(
    ttl_hours: float = Query(24.0, ge=0.0, description="Expiration threshold in hours"),
    as_of: Optional[str] = Query(None, description="Anchor timestamp for simulation"),
    background_tasks: BackgroundTasks = None
):
    """
    Sweeps and cancels abandoned soft reservations that have exceeded their TTL threshold.
    Releases locked stock back to available inventory.
    """
    def _sweep_db_logic(conn: sqlite3.Connection):
        return sweep_expired_soft_reservations(conn, ttl_hours=ttl_hours, as_of=as_of)

    result = await execute_write_transaction_async(get_db_path(), _sweep_db_logic)
    if background_tasks:
        background_tasks.add_task(invalidate_stats_cache)
    return {
        "status": "SUCCESS",
        "ttl_hours": ttl_hours,
        "swept_count": len(result),
        "expired_transfers": result
    }
