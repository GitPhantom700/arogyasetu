from datetime import datetime, timezone
import sqlite3
from fastapi import APIRouter, HTTPException, status, BackgroundTasks
from database import (
    get_connection,
    get_db_path,
    record_inventory_transaction,
    execute_write_transaction_async,
    verify_dscsa_ledger_integrity,
    LedgerIntegrityError,
)
from schemas import (
    FacilityInventoryResponse,
    StockItemResponse,
    BatchItemResponse,
    ConsumeStockRequest,
    ReceiveStockRequest,
    WriteOffStockRequest,
    WriteOffReason,
    StockTransactionResponse,
    BatchHistoryResponse,
    BatchLedgerEntry,
    NetworkDepletionResponse,
    FacilityDepletionResponse,
    MedicineDepletionItem,
    InventoryStatus,
    IoTCompromiseRequest,
)
from routes.stats import invalidate_stats_cache
from burn_rate import calculate_depletion_metrics
from alerts import check_and_broadcast_stock_alert
from fastapi import Query
from typing import Optional

router = APIRouter(prefix="/api/inventory", tags=["Inventory Management"])


@router.get("/depletion", response_model=NetworkDepletionResponse)
def get_inventory_depletion(
    facility_id: Optional[int] = Query(None, description="Filter by facility ID"),
    medicine_id: Optional[int] = Query(None, description="Filter by medicine ID"),
    district: Optional[str] = Query(None, description="Filter by district (e.g. Pune, Satara)"),
    status_filter: Optional[InventoryStatus] = Query(None, alias="status", description="Filter by triage status (CRITICAL, WARNING, HEALTHY)"),
    window_days: int = Query(7, ge=1, le=90, description="Rolling consumption window in days"),
    as_of: Optional[str] = Query(None, description="Anchor timestamp for simulation or back-testing (ISO-8601 string)")
):
    """
    Computes dynamic burn rate, Daily Average Consumption (DAC),
    Days of Inventory Remaining (DIR), surge multiplier, and triage status.
    """
    status_str = status_filter.value if status_filter else None
    try:
        result = calculate_depletion_metrics(
            facility_id=facility_id,
            medicine_id=medicine_id,
            district=district,
            status_filter=status_str,
            window_days=window_days,
            as_of=as_of
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return NetworkDepletionResponse(**result)


@router.get("/{facility_id}/depletion", response_model=FacilityDepletionResponse)
def get_facility_depletion(
    facility_id: int,
    status_filter: Optional[InventoryStatus] = Query(None, alias="status", description="Filter by triage status (CRITICAL, WARNING, HEALTHY)"),
    window_days: int = Query(7, ge=1, le=90, description="Rolling consumption window in days"),
    as_of: Optional[str] = Query(None, description="Anchor timestamp for simulation or back-testing (ISO-8601 string)")
):
    """
    Retrieves dynamic burn rate and depletion timeline for all medicines at a specific facility.
    """
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, facility_code, name, district FROM facilities WHERE id = ? AND is_active = 1;", (facility_id,))
        fac = cur.fetchone()
        if not fac:
            raise HTTPException(status_code=404, detail=f"Facility ID {facility_id} not found")
        fac_code = fac["facility_code"]
        fac_name = fac["name"]
        district = fac["district"]
    finally:
        conn.close()

    status_str = status_filter.value if status_filter else None
    try:
        result = calculate_depletion_metrics(
            facility_id=facility_id,
            status_filter=status_str,
            window_days=window_days,
            as_of=as_of
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    return FacilityDepletionResponse(
        facility_id=facility_id,
        facility_code=fac_code,
        facility_name=fac_name,
        district=district,
        as_of=result["as_of"],
        window_days=result["window_days"],
        total_medicines_evaluated=len(result["items"]),
        critical_count=result["total_critical_items"],
        warning_count=result["total_warning_items"],
        healthy_count=result["total_healthy_items"],
        medicines=result["items"]
    )


@router.get("/{facility_id}", response_model=FacilityInventoryResponse)
def get_facility_inventory(facility_id: int):
    """Returns the complete batch-level inventory and stockout warnings for a facility."""
    conn = get_connection()
    try:
        cursor = conn.cursor()

        # Check facility existence
        cursor.execute("SELECT id, facility_code, name FROM facilities WHERE id = ? AND is_active = 1;", (facility_id,))
        facility = cursor.fetchone()
        if not facility:
            raise HTTPException(status_code=404, detail="Facility not found")

        # Fetch medicines and their batches for this facility
        cursor.execute("""
            SELECT 
                m.id AS medicine_id,
                m.sku,
                m.gtin AS medicine_gtin,
                m.name AS medicine_name,
                m.category,
                m.unit,
                m.min_safety_stock,
                m.is_emergency,
                m.requires_cold_chain,
                sb.id AS batch_id,
                sb.batch_number,
                sb.gtin AS batch_gtin,
                sb.serial_number AS batch_serial_number,
                sb.expiry_date,
                sb.quantity_available,
                sb.status AS batch_status,
                sb.version AS batch_version
            FROM medicines m
            LEFT JOIN stock_batches sb ON m.id = sb.medicine_id AND sb.facility_id = ?
            WHERE m.is_active = 1
            ORDER BY m.is_emergency DESC, m.name ASC, sb.expiry_date ASC;
        """, (facility_id,))
        rows = cursor.fetchall()

        # Group batches by medicine
        inventory_map = {}
        for r in rows:
            m_id = r["medicine_id"]
            if m_id not in inventory_map:
                inventory_map[m_id] = {
                    "medicine_id": m_id,
                    "sku": r["sku"],
                    "medicine_name": r["medicine_name"],
                    "category": r["category"],
                    "unit": r["unit"],
                    "min_safety_stock": r["min_safety_stock"],
                    "is_emergency": r["is_emergency"],
                    "requires_cold_chain": r["requires_cold_chain"],
                    "total_quantity": 0,
                    "is_critical_stockout": False,
                    "batches": []
                }

            if r["batch_id"] is not None:
                qty = r["quantity_available"]
                inventory_map[m_id]["total_quantity"] += qty
                inventory_map[m_id]["batches"].append({
                    "id": r["batch_id"],
                    "batch_number": r["batch_number"],
                    "gtin": r["batch_gtin"] or r["medicine_gtin"] or "08901234567890",
                    "serial_number": r["batch_serial_number"],
                    "expiry_date": r["expiry_date"],
                    "quantity_available": qty,
                    "status": r["batch_status"],
                    "version": r["batch_version"]
                })

        # Calculate critical stockout flags
        stock_items = []
        for item in inventory_map.values():
            item["is_critical_stockout"] = item["total_quantity"] < item["min_safety_stock"]
            stock_items.append(StockItemResponse(**item))

        return FacilityInventoryResponse(
            facility_id=facility["id"],
            facility_code=facility["facility_code"],
            facility_name=facility["name"],
            inventory=stock_items
        )
    finally:
        conn.close()


def _consume_stock_db_logic(conn: sqlite3.Connection, req: ConsumeStockRequest) -> StockTransactionResponse:
    """Atomic write transaction logic for consuming stock."""
    cursor = conn.cursor()

    # 1. Verify Facility
    cursor.execute("SELECT id, facility_gln, name FROM facilities WHERE id = ? AND is_active = 1;", (req.facility_id,))
    facility = cursor.fetchone()
    if not facility:
        raise HTTPException(status_code=404, detail=f"Facility with ID {req.facility_id} not found or inactive")
    facility_gln = req.facility_gln or facility["facility_gln"] or "8901234567890"

    # 2. Atomic Decrement with RETURNING clause
    # Eliminates 409 retry storms under high concurrency when expected_version is omitted
    if req.expected_version is not None:
        cursor.execute("""
            UPDATE stock_batches 
            SET quantity_available = quantity_available - ?, version = version + 1
            WHERE id = ? AND facility_id = ? AND status = 'ACTIVE' AND quantity_available >= ? AND version = ?
            RETURNING id, facility_id, medicine_id, gtin, batch_number, serial_number, expiry_date, quantity_available, status, version;
        """, (req.quantity, req.batch_id, req.facility_id, req.quantity, req.expected_version))
    else:
        cursor.execute("""
            UPDATE stock_batches 
            SET quantity_available = quantity_available - ?, version = version + 1
            WHERE id = ? AND facility_id = ? AND status = 'ACTIVE' AND quantity_available >= ?
            RETURNING id, facility_id, medicine_id, gtin, batch_number, serial_number, expiry_date, quantity_available, status, version;
        """, (req.quantity, req.batch_id, req.facility_id, req.quantity))

    updated_batch = cursor.fetchone()

    # 3. Fallback Diagnostic Precision if atomic conditional update matched 0 rows
    if updated_batch is None:
        cursor.execute("""
            SELECT id, facility_id, medicine_id, batch_number, quantity_available, status, version 
            FROM stock_batches 
            WHERE id = ? AND facility_id = ?;
        """, (req.batch_id, req.facility_id))
        latest = cursor.fetchone()
        if latest is None:
            raise HTTPException(
                status_code=404,
                detail=f"Stock batch with ID {req.batch_id} not found at facility {req.facility_id}"
            )
        if latest["status"] != "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Cannot consume from non-active batch (current status: {latest['status']})"
            )
        if req.expected_version is not None and latest["version"] != req.expected_version:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Concurrency Conflict: Batch version has changed from expected {req.expected_version} to {latest['version']}. Please refresh inventory and retry."
            )
        if latest["quantity_available"] <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Cannot consume from batch {latest['batch_number']}: batch is already depleted (balance: 0)."
            )
        if latest["quantity_available"] < req.quantity:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Insufficient stock: requested {req.quantity}, but only {latest['quantity_available']} available in batch {latest['batch_number']}."
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Concurrent modification detected during update. Please retry."
        )

    # 4. Resolve GS1 Identifiers & Record DSCSA/NHM Cryptographic Ledger
    gtin = updated_batch["gtin"] or "08901234567890"
    serial_number = updated_batch["serial_number"]

    tx_record = record_inventory_transaction(
        cursor=cursor,
        facility_id=req.facility_id,
        facility_gln=facility_gln,
        medicine_id=updated_batch["medicine_id"],
        gtin=gtin,
        batch_id=updated_batch["id"],
        batch_number=updated_batch["batch_number"],
        serial_number=serial_number,
        expiry_date=updated_batch["expiry_date"],
        transaction_type="CONSUMED",
        quantity=req.quantity,
        balance_after=updated_batch["quantity_available"],
        reference_id=req.reference_id,
        notes=req.notes,
        logged_by=req.logged_by or "PHC Staff",
        user_reported_at=req.user_reported_at
    )

    return StockTransactionResponse(
        transaction_id=tx_record["id"],
        transaction_type="CONSUMED",
        facility_id=req.facility_id,
        facility_gln=facility_gln,
        medicine_id=updated_batch["medicine_id"],
        gtin=gtin,
        batch_id=updated_batch["id"],
        batch_number=updated_batch["batch_number"],
        serial_number=serial_number,
        expiry_date=updated_batch["expiry_date"],
        quantity=req.quantity,
        balance_after=updated_batch["quantity_available"],
        batch_version_after=updated_batch["version"],
        batch_status_after=updated_batch["status"],
        reference_id=req.reference_id,
        notes=req.notes,
        logged_by=req.logged_by or "PHC Staff",
        user_reported_at=tx_record["user_reported_at"],
        created_at=tx_record["created_at"],
        previous_hash=tx_record["previous_hash"],
        hash=tx_record["hash"],
        message=f"Successfully consumed {req.quantity} units from batch {updated_batch['batch_number']}. Remaining balance: {updated_batch['quantity_available']}."
    )


@router.post("/consume", response_model=StockTransactionResponse)
async def consume_stock(req: ConsumeStockRequest, background_tasks: BackgroundTasks):
    """
    ACID-compliant stock consumption endpoint.
    Verifies batch availability, prevents negative stock, enforces Optimistic Concurrency Control (OCC),
    updates batch balance atomically via RETURNING clause, and records an immutable
    cryptographically hash-chained ledger transaction (DSCSA/NHM compliant).
    Offloads write lock acquisition away from Starlette's main threadpool to avoid worker exhaustion.
    """
    result = await execute_write_transaction_async(get_db_path(), _consume_stock_db_logic, req)
    background_tasks.add_task(invalidate_stats_cache)
    background_tasks.add_task(
        check_and_broadcast_stock_alert,
        facility_id=result.facility_id,
        medicine_id=result.medicine_id,
        current_balance=result.balance_after,
        trigger_action="CONSUMED"
    )
    return result


def _receive_stock_db_logic(conn: sqlite3.Connection, req: ReceiveStockRequest) -> StockTransactionResponse:
    """Atomic write transaction logic for receiving stock."""
    cursor = conn.cursor()

    # 1. Verify Facility
    cursor.execute("SELECT id, facility_gln, name FROM facilities WHERE id = ? AND is_active = 1;", (req.facility_id,))
    facility = cursor.fetchone()
    if not facility:
        raise HTTPException(status_code=404, detail=f"Facility with ID {req.facility_id} not found or inactive")
    facility_gln = facility["facility_gln"] or "8901234567890"

    # 2. Verify Medicine
    cursor.execute("SELECT id, gtin, name FROM medicines WHERE id = ? AND is_active = 1;", (req.medicine_id,))
    medicine = cursor.fetchone()
    if not medicine:
        raise HTTPException(status_code=404, detail=f"Medicine with ID {req.medicine_id} not found or inactive")
    gtin = req.gtin or medicine["gtin"] or "08901234567890"

    # 3. Check for existing batch
    cursor.execute("""
        SELECT id, quantity_available, status, version 
        FROM stock_batches 
        WHERE facility_id = ? AND medicine_id = ? AND batch_number = ?;
    """, (req.facility_id, req.medicine_id, req.batch_number))
    existing_batch = cursor.fetchone()

    if existing_batch:
        batch_id = existing_batch["id"]
        cursor.execute("""
            UPDATE stock_batches 
            SET quantity_available = quantity_available + ?,
                status = 'ACTIVE',
                expiry_date = ?,
                gtin = COALESCE(?, gtin),
                serial_number = COALESCE(?, serial_number),
                version = version + 1
            WHERE id = ?
            RETURNING id, quantity_available, version, status;
        """, (req.quantity, req.expiry_date, gtin, req.serial_number, batch_id))
        updated = cursor.fetchone()
        new_balance = updated["quantity_available"]
        new_version = updated["version"]
        new_status = updated["status"]
    else:
        new_balance = req.quantity
        new_version = 1
        new_status = "ACTIVE"
        cursor.execute("""
            INSERT INTO stock_batches (
                facility_id, medicine_id, gtin, batch_number, serial_number, expiry_date, quantity_available, status, version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1);
        """, (req.facility_id, req.medicine_id, gtin, req.batch_number, req.serial_number, req.expiry_date, req.quantity))
        batch_id = cursor.lastrowid

    # 4. Immutable Cryptographic Ledger Entry
    tx_record = record_inventory_transaction(
        cursor=cursor,
        facility_id=req.facility_id,
        facility_gln=facility_gln,
        medicine_id=req.medicine_id,
        gtin=gtin,
        batch_id=batch_id,
        batch_number=req.batch_number,
        serial_number=req.serial_number,
        expiry_date=req.expiry_date,
        transaction_type="RECEIVED",
        quantity=req.quantity,
        balance_after=new_balance,
        reference_id=req.reference_id,
        notes=req.notes,
        logged_by=req.logged_by or "Store Incharge",
        user_reported_at=req.user_reported_at
    )

    return StockTransactionResponse(
        transaction_id=tx_record["id"],
        transaction_type="RECEIVED",
        facility_id=req.facility_id,
        facility_gln=facility_gln,
        medicine_id=req.medicine_id,
        gtin=gtin,
        batch_id=batch_id,
        batch_number=req.batch_number,
        serial_number=req.serial_number,
        expiry_date=req.expiry_date,
        quantity=req.quantity,
        balance_after=new_balance,
        batch_version_after=new_version,
        batch_status_after=new_status,
        reference_id=req.reference_id,
        notes=req.notes,
        logged_by=req.logged_by or "Store Incharge",
        user_reported_at=tx_record["user_reported_at"],
        created_at=tx_record["created_at"],
        previous_hash=tx_record["previous_hash"],
        hash=tx_record["hash"],
        message=f"Successfully received {req.quantity} units for {medicine['name']} (Batch: {req.batch_number}). Total stock: {new_balance}."
    )


@router.post("/receive", response_model=StockTransactionResponse)
async def receive_stock(req: ReceiveStockRequest, background_tasks: BackgroundTasks):
    """
    ACID-compliant stock receiving endpoint.
    Validates facility, medicine, and future expiry date (RFC 9110 HTTP 422).
    Augments existing batch balance if batch number matches, or creates a new batch entry.
    Records an immutable cryptographic ledger transaction and dispatches background cache invalidation.
    Offloads write lock acquisition to prevent Starlette threadpool exhaustion.
    """
    # Expiry validation (RFC 9110 HTTP 422)
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if req.expiry_date <= today_str:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Cannot receive expired supplies. Expiry date ({req.expiry_date}) must be in the future."
        )

    result = await execute_write_transaction_async(get_db_path(), _receive_stock_db_logic, req)
    background_tasks.add_task(invalidate_stats_cache)
    return result


def _write_off_stock_db_logic(conn: sqlite3.Connection, req: WriteOffStockRequest) -> StockTransactionResponse:
    """Atomic write transaction logic for writing off / quarantining stock."""
    # Map write-off reason to ledger transaction_type
    if req.reason == WriteOffReason.EXPIRED:
        tx_type = "WASTED_EXPIRED"
        target_status = "EXPIRED"
    elif req.reason == WriteOffReason.COLD_CHAIN_BREACH:
        tx_type = "QUARANTINED"
        target_status = "QUARANTINED"
    else:
        tx_type = "AUDIT_CORRECTION"
        target_status = None

    cursor = conn.cursor()

    # 1. Verify Facility
    cursor.execute("SELECT id, facility_gln, name FROM facilities WHERE id = ? AND is_active = 1;", (req.facility_id,))
    facility = cursor.fetchone()
    if not facility:
        raise HTTPException(status_code=404, detail=f"Facility with ID {req.facility_id} not found or inactive")
    facility_gln = req.facility_gln or facility["facility_gln"] or "8901234567890"

    # 2. Query Batch for existence and status check
    cursor.execute("""
        SELECT id, facility_id, medicine_id, gtin, batch_number, serial_number, expiry_date, quantity_available, status, version 
        FROM stock_batches 
        WHERE id = ? AND facility_id = ?;
    """, (req.batch_id, req.facility_id))
    batch = cursor.fetchone()
    if not batch:
        raise HTTPException(status_code=404, detail=f"Stock batch with ID {req.batch_id} not found at facility {req.facility_id}")

    # 3. OCC Check
    if req.expected_version is not None and batch["version"] != req.expected_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Concurrency Conflict: Batch version has changed from expected {req.expected_version} to {batch['version']}."
        )

    # 4. Invariant: Stock availability (RFC 9110 HTTP 422)
    if req.quantity > batch["quantity_available"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Cannot write off {req.quantity} units. Only {batch['quantity_available']} units available in batch {batch['batch_number']}."
        )

    # 5. Atomic Batch Update
    new_status = target_status if target_status is not None else batch["status"]

    if req.expected_version is not None:
        cursor.execute("""
            UPDATE stock_batches 
            SET quantity_available = quantity_available - ?, status = ?, version = version + 1
            WHERE id = ? AND facility_id = ? AND quantity_available >= ? AND version = ?
            RETURNING id, facility_id, medicine_id, gtin, batch_number, serial_number, expiry_date, quantity_available, status, version;
        """, (req.quantity, new_status, batch["id"], req.facility_id, req.quantity, req.expected_version))
    else:
        cursor.execute("""
            UPDATE stock_batches 
            SET quantity_available = quantity_available - ?, status = ?, version = version + 1
            WHERE id = ? AND facility_id = ? AND quantity_available >= ?
            RETURNING id, facility_id, medicine_id, gtin, batch_number, serial_number, expiry_date, quantity_available, status, version;
        """, (req.quantity, new_status, batch["id"], req.facility_id, req.quantity))

    updated_batch = cursor.fetchone()
    if updated_batch is None:
        cursor.execute("SELECT quantity_available, version, status FROM stock_batches WHERE id = ?;", (batch["id"],))
        latest = cursor.fetchone()
        if latest is None:
            raise HTTPException(status_code=404, detail="Batch was removed during operation.")
        if req.expected_version is not None and latest["version"] != req.expected_version:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Concurrency Conflict: Batch version has changed from expected {req.expected_version} to {latest['version']}."
            )
        if latest["quantity_available"] < req.quantity:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Cannot write off {req.quantity} units. Only {latest['quantity_available']} units available in batch {batch['batch_number']}."
            )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Concurrent modification detected during update. Please retry.")

    # 6. Immutable Cryptographic Ledger Entry
    gtin = updated_batch["gtin"] or "08901234567890"
    serial_number = updated_batch["serial_number"]

    tx_record = record_inventory_transaction(
        cursor=cursor,
        facility_id=req.facility_id,
        facility_gln=facility_gln,
        medicine_id=updated_batch["medicine_id"],
        gtin=gtin,
        batch_id=updated_batch["id"],
        batch_number=updated_batch["batch_number"],
        serial_number=serial_number,
        expiry_date=updated_batch["expiry_date"],
        transaction_type=tx_type,
        quantity=req.quantity,
        balance_after=updated_batch["quantity_available"],
        reference_id=req.reference_id,
        notes=req.notes,
        logged_by=req.logged_by or "Medical Officer",
        user_reported_at=req.user_reported_at
    )

    return StockTransactionResponse(
        transaction_id=tx_record["id"],
        transaction_type=tx_type,
        facility_id=req.facility_id,
        facility_gln=facility_gln,
        medicine_id=updated_batch["medicine_id"],
        gtin=gtin,
        batch_id=updated_batch["id"],
        batch_number=updated_batch["batch_number"],
        serial_number=serial_number,
        expiry_date=updated_batch["expiry_date"],
        quantity=req.quantity,
        balance_after=updated_batch["quantity_available"],
        batch_version_after=updated_batch["version"],
        batch_status_after=updated_batch["status"],
        reference_id=req.reference_id,
        notes=req.notes,
        logged_by=req.logged_by or "Medical Officer",
        user_reported_at=tx_record["user_reported_at"],
        created_at=tx_record["created_at"],
        previous_hash=tx_record["previous_hash"],
        hash=tx_record["hash"],
        message=f"Stock write-off recorded: {req.quantity} units marked as {req.reason.value} for batch {updated_batch['batch_number']}. Remaining balance: {updated_batch['quantity_available']}."
    )


@router.post("/write-off", response_model=StockTransactionResponse)
async def write_off_stock(req: WriteOffStockRequest, background_tasks: BackgroundTasks):
    """
    ACID-compliant stock write-off / quarantine endpoint.
    Handles expired medicines, damaged stock, cold-chain temperature breaches, or audit discrepancies.
    Enforces OCC, prevents negative balance (HTTP 422), updates batch status, and records an immutable audit ledger entry.
    Offloads write transactions to prevent worker threadpool starvation.
    """
    result = await execute_write_transaction_async(get_db_path(), _write_off_stock_db_logic, req)
    background_tasks.add_task(invalidate_stats_cache)
    background_tasks.add_task(
        check_and_broadcast_stock_alert,
        facility_id=result.facility_id,
        medicine_id=result.medicine_id,
        current_balance=result.balance_after,
        trigger_action=f"WRITE_OFF_{req.reason.value}"
    )
    return result


@router.get("/batches/{batch_id}/transactions", response_model=BatchHistoryResponse)
def get_batch_transaction_history(batch_id: int):
    """
    Retrieves the complete immutable DSCSA/NHM audit ledger for a specific medicine batch,
    displaying all receipts, consumptions, and write-offs chronologically with cryptographic seals.
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                sb.id AS batch_id,
                sb.batch_number,
                sb.quantity_available AS current_quantity,
                sb.status,
                sb.version,
                f.id AS facility_id,
                f.name AS facility_name,
                m.id AS medicine_id,
                m.name AS medicine_name
            FROM stock_batches sb
            JOIN facilities f ON sb.facility_id = f.id
            JOIN medicines m ON sb.medicine_id = m.id
            WHERE sb.id = ?;
        """, (batch_id,))
        batch = cursor.fetchone()
        if not batch:
            raise HTTPException(status_code=404, detail=f"Stock batch with ID {batch_id} not found")

        cursor.execute("""
            SELECT id, transaction_type, facility_gln, gtin, batch_number, serial_number, expiry_date, quantity, balance_after,
                   reference_id, notes, logged_by, user_reported_at, created_at, previous_hash, hash
            FROM inventory_transactions
            WHERE batch_id = ?
            ORDER BY id ASC;
        """, (batch_id,))
        tx_rows = cursor.fetchall()

        transactions = [BatchLedgerEntry(**dict(row)) for row in tx_rows]

        return BatchHistoryResponse(
            batch_id=batch["batch_id"],
            batch_number=batch["batch_number"],
            facility_id=batch["facility_id"],
            facility_name=batch["facility_name"],
            medicine_id=batch["medicine_id"],
            medicine_name=batch["medicine_name"],
            current_quantity=batch["current_quantity"],
            status=batch["status"],
            version=batch["version"],
            transactions=transactions
        )
    finally:
        conn.close()

@router.post("/batches/{batch_id}/flag-compromised", response_model=StockTransactionResponse)
async def flag_batch_compromised(batch_id: int, req: IoTCompromiseRequest, background_tasks: BackgroundTasks):
    """
    IoT Thermal Compromise Endpoint.
    Automatically quarantines a batch when an IoT sensor reports temperatures outside 2-8°C.
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()
        
        # 1. Fetch batch
        cursor.execute("SELECT * FROM stock_batches WHERE id = ?", (batch_id,))
        batch = cursor.fetchone()
        if not batch:
            raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
            
        if batch["status"] == "QUARANTINED":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Batch {batch_id} is already quarantined")

        if batch["quantity_available"] <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Batch {batch_id} has zero available stock to quarantine"
            )

        # Explicit OCC version check if caller provided expected_version
        if req.expected_version is not None and batch["version"] != req.expected_version:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Concurrency conflict: expected version {req.expected_version} but batch version is {batch['version']}"
            )
            
        # 2. Quarantine batch
        new_version = batch["version"] + 1
        cursor.execute("""
            UPDATE stock_batches
            SET status = 'QUARANTINED', thermal_status = 'COMPROMISED', temperature_celsius = ?, version = ?
            WHERE id = ? AND version = ?
        """, (req.temperature_celsius, new_version, batch_id, batch["version"]))
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Concurrency conflict: batch modified by another process")
            
        # 3. Record transaction
        tx_record = record_inventory_transaction(
            cursor=cursor,
            facility_id=batch["facility_id"],
            medicine_id=batch["medicine_id"],
            batch_id=batch_id,
            batch_number=batch["batch_number"],
            serial_number=batch["serial_number"],
            expiry_date=batch["expiry_date"],
            transaction_type="QUARANTINED",
            quantity=batch["quantity_available"],
            balance_after=batch["quantity_available"],
            reference_id=f"IOT-ALERT-{req.sensor_id}",
            notes=f"Thermal compromise: {req.temperature_celsius}C for {req.duration_minutes}m",
            logged_by="IoT System"
        )
        
        # Look up facility GLN
        cursor.execute("SELECT facility_gln FROM facilities WHERE id = ?", (batch["facility_id"],))
        fac_row = cursor.fetchone()
        fac_gln = fac_row["facility_gln"] if fac_row and fac_row["facility_gln"] else "8901234567890"
        
        conn.commit()
        
        # 4. Invalidate stats
        background_tasks.add_task(invalidate_stats_cache)
        
        return StockTransactionResponse(
            transaction_id=tx_record["id"],
            transaction_type="QUARANTINED",
            facility_id=batch["facility_id"],
            facility_gln=fac_gln,
            medicine_id=batch["medicine_id"],
            gtin=batch["gtin"] or "08901234567890",
            batch_id=batch_id,
            batch_number=batch["batch_number"],
            serial_number=batch["serial_number"],
            expiry_date=batch["expiry_date"],
            quantity=batch["quantity_available"],
            balance_after=batch["quantity_available"],
            batch_version_after=new_version,
            batch_status_after="QUARANTINED",
            reference_id=f"IOT-ALERT-{req.sensor_id}",
            notes=f"Thermal compromise: {req.temperature_celsius}C for {req.duration_minutes}m",
            logged_by="IoT System",
            user_reported_at=tx_record["user_reported_at"],
            created_at=tx_record["created_at"],
            previous_hash=tx_record["previous_hash"],
            hash=tx_record["hash"],
            message=f"Batch {batch['batch_number']} quarantined due to thermal breach."
        )
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

@router.get("/ledger/verify")
def verify_audit_ledger():
    """
    Cryptographically verifies the entire DSCSA / NHM audit ledger hash chain across all transactions.
    Returns HTTP 200 with ledger verification statistics if intact, or HTTP 409 Conflict if tampering is detected.
    """
    try:
        res = verify_dscsa_ledger_integrity()
        return res
    except LedgerIntegrityError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cryptographic Ledger Tampering Detected: {str(e)}"
        )


@router.get("/ledger/blocks")
def get_audit_ledger_blocks(limit: int = Query(50, ge=1, le=200)):
    """
    Returns the latest cryptographically sealed DSCSA audit ledger transaction blocks
    including SHA-256 seals, parent hash pointers, and GS1 GLN/GTIN traceability.
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                it.id,
                it.transaction_type,
                it.facility_id,
                f.name AS facility_name,
                it.facility_gln,
                it.medicine_id,
                m.name AS medicine_name,
                it.gtin,
                it.batch_id,
                it.batch_number,
                it.serial_number,
                it.expiry_date,
                it.quantity,
                it.balance_after,
                it.reference_id,
                it.notes,
                it.logged_by,
                it.user_reported_at,
                it.created_at,
                it.previous_hash,
                it.hash
            FROM inventory_transactions it
            LEFT JOIN facilities f ON it.facility_id = f.id
            LEFT JOIN medicines m ON it.medicine_id = m.id
            ORDER BY it.id DESC
            LIMIT ?;
        """, (limit,))
        rows = cursor.fetchall()
        blocks = [dict(r) for r in rows]

        # Verify chain integrity
        integrity = verify_dscsa_ledger_integrity()

        return {
            "status": integrity.get("status", "VERIFIED"),
            "total_blocks": integrity.get("total_transactions", len(blocks)),
            "chain_valid": integrity.get("chain_valid", True),
            "latest_hash": integrity.get("latest_hash"),
            "blocks": blocks
        }
    finally:
        conn.close()

