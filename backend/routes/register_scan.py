"""
Multimodal Paper Register Ingestion API Routes.
Build with AI: Code for Communities (Second Edition) - Track 01 Healthcare Supply Chain.
Microtask 3.2: Multimodal Register Ingestion (Gemini Flash Vision OCR).

Endpoints:
1. POST /api/inventory/scan-register: Accepts image upload of physical paper registers/chalans and returns structured Pydantic extraction.
2. POST /api/inventory/scan-register/commit: Transactionally commits reviewed/edited ledger items into SQLite stock batches and audit trail.
3. GET  /api/inventory/scan-register/sample-image: Serves a high-resolution authentic NHM stock register image for testing.
"""

import io
import asyncio
import hashlib
import sqlite3
from datetime import datetime, timezone, date
from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status, Response
from PIL import Image

from database import get_connection, get_db_path, execute_write_transaction_async, record_inventory_transaction
from schemas import (
    RegisterScanResponse,
    RegisterCommitRequest,
    RegisterCommitResponse,
)
from ledger_vision import ledger_vision_service, generate_sample_ledger_image
from ai_safety import AISafetyGuard

router = APIRouter(prefix="/api/inventory", tags=["Multimodal Register Ingestion (AI Vision)"])

MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB limit


def validate_image_bytes(image_bytes: bytes) -> str:
    """
    Validates uploaded image bytes using magic byte file signatures and structural verification.
    Rejects spoofed content-types, disguised executable binaries, and corrupted image payloads.
    Returns the detected canonical MIME type string.
    """
    if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image size exceeds 10MB limit (size: {len(image_bytes)} bytes)."
        )

    if len(image_bytes) < 12:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="File too small or corrupted to be a valid image."
        )

    # Set Pillow Decompression Bomb protection limit
    Image.MAX_IMAGE_PIXELS = 25_000_000

    # 1. Magic byte signature verification
    is_jpeg = image_bytes.startswith(b"\xff\xd8\xff")
    is_png = image_bytes.startswith(b"\x89PNG\r\n\x1a\n")
    is_webp = image_bytes.startswith(b"RIFF") and image_bytes[8:12] == b"WEBP"

    if not (is_jpeg or is_png or is_webp):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported image format. Magic bytes do not match valid JPEG, PNG, or WebP signatures."
        )

    # 2. Structural integrity verification via Pillow
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img.verify()
            fmt = (img.format or "").lower()
            if fmt in ("jpeg", "jpg"):
                return "image/jpeg"
            elif fmt == "png":
                return "image/png"
            elif fmt == "webp":
                return "image/webp"
            else:
                raise HTTPException(
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                    detail=f"Unsupported image format '{fmt}'. Only JPEG, PNG, and WebP are allowed."
                )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Corrupted image payload failed structural validation: {str(e)}"
        )


@router.post(
    "/scan-register",
    response_model=RegisterScanResponse,
    summary="Scan and parse physical paper registers or chalans with Gemini Vision"
)
async def scan_paper_register(
    file: UploadFile = File(..., description="Photograph or scan of the physical medicine ledger, voucher, or chalan"),
    facility_id: Optional[int] = Form(None, description="Optional Primary Health Centre facility ID")
):
    """
    Multimodal paper register OCR ingestion endpoint.
    Accepts photos of physical paper ledgers and utilizes Google Gemini 3.6 Flash Vision
    to extract medication names, lot/batch numbers, expiration dates, and received quantities into
    strictly typed JSON. Falls back to deterministic clinical OCR emulation if offline.
    """
    image_bytes = await file.read()
    if not image_bytes or len(image_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The uploaded image file is empty (0 bytes)."
        )

    if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image size exceeds 10MB limit (size: {len(image_bytes)} bytes)."
        )

    # Validate true magic bytes and structural integrity (prevent MIME spoofing)
    detected_mime = validate_image_bytes(image_bytes)

    # Offload AI vision call to worker thread to prevent event-loop blocking
    scan_result = await asyncio.to_thread(
        ledger_vision_service.parse_ledger_image,
        image_bytes=image_bytes,
        mime_type=detected_mime,
        facility_id=facility_id
    )

    return scan_result


@router.post(
    "/scan-register/commit",
    response_model=RegisterCommitResponse,
    summary="Commit reviewed and verified scanned ledger items into SQLite inventory"
)
async def commit_scanned_register(req: RegisterCommitRequest):
    """
    Commits reviewed extracted register items into active facility inventory.
    Executes an atomic ACID write transaction:
    1. Validates facility and medicine presence.
    2. Atomic SQLite UPSERT with RETURNING (eliminates check-then-act race conditions).
    3. Records immutable audit transactions with DSCSA cryptographic verification.
    """
    if not req.items or len(req.items) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No items provided in commit request."
        )

    def _commit_db_transaction(conn: sqlite3.Connection) -> RegisterCommitResponse:
        cur = conn.cursor()

        # 1. Verify facility
        cur.execute("SELECT id, name, facility_gln FROM facilities WHERE id = ?;", (req.facility_id,))
        fac_row = cur.fetchone()
        if not fac_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Facility #{req.facility_id} does not exist."
            )
        facility_name = fac_row["name"]
        facility_gln = fac_row["facility_gln"]

        batch_ids: List[int] = []
        tx_ids: List[int] = []
        total_qty = 0
        now_ts = datetime.now(timezone.utc).isoformat(timespec="microseconds")

        for item in req.items:
            # Verify medicine
            cur.execute("SELECT id, name, unit, gtin FROM medicines WHERE id = ?;", (item.medicine_id,))
            med_row = cur.fetchone()
            if not med_row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Medicine #{item.medicine_id} does not exist in the catalog."
                )
            med_gtin = med_row["gtin"]

            # Enforce clinical safety guardrail: Block expired batch commitment
            try:
                exp_d = date.fromisoformat(item.expiry_date)
                if exp_d <= date.today():
                    AISafetyGuard.record_violation(
                        component="ledger_vision",
                        violation_type="EXPIRED_BATCH_INGESTION",
                        severity="CRITICAL",
                        details=f"Blocked attempt to commit expired batch {item.batch_number} (Expiry: {item.expiry_date}) into active inventory.",
                        raw_input_snippet=f"batch={item.batch_number}, expiry={item.expiry_date}",
                        remediation_applied="Rejected commit transaction with HTTP 400",
                        conn=conn
                    )
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Safety Guardrail: Cannot ingest expired batch '{item.batch_number}' (expired on {item.expiry_date}) into active healthcare inventory."
                    )
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid expiry date format '{item.expiry_date}'. Expected ISO YYYY-MM-DD."
                )

            # Atomic SQLite UPSERT with RETURNING clause
            # Eliminates check-then-act race conditions across concurrent ledger commits
            cur.execute("""
                INSERT INTO stock_batches (
                    facility_id, medicine_id, gtin, batch_number, expiry_date,
                    quantity_available, quantity_reserved, status, version, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, 0, 'ACTIVE', 1, ?, ?)
                ON CONFLICT(facility_id, medicine_id, batch_number)
                DO UPDATE SET
                    quantity_available = stock_batches.quantity_available + excluded.quantity_available,
                    version = stock_batches.version + 1,
                    updated_at = excluded.updated_at
                RETURNING id, quantity_available;
            """, (
                req.facility_id, item.medicine_id, med_gtin, item.batch_number, item.expiry_date,
                item.quantity, now_ts, now_ts
            ))
            upsert_row = cur.fetchone()
            target_batch_id = upsert_row["id"]

            batch_ids.append(target_batch_id)
            total_qty += item.quantity

            # Calculate total balance after receipt for this medicine at this facility
            cur.execute("""
                SELECT COALESCE(SUM(quantity_available), 0) AS total_balance
                FROM stock_batches
                WHERE facility_id = ? AND medicine_id = ? AND status = 'ACTIVE';
            """, (req.facility_id, item.medicine_id))
            balance_after = cur.fetchone()["total_balance"]

            # Record DSCSA append-only cryptographically chained transaction
            notes_text = f"Optical register ingestion: Batch {item.batch_number} (+{item.quantity} {med_row['unit']}). {req.notes or ''}".strip()
            tx_res = record_inventory_transaction(
                cursor=cur,
                facility_id=req.facility_id,
                medicine_id=item.medicine_id,
                batch_id=target_batch_id,
                batch_number=item.batch_number,
                expiry_date=item.expiry_date,
                transaction_type="RECEIVED",
                quantity=item.quantity,
                balance_after=balance_after,
                facility_gln=facility_gln,
                gtin=med_gtin,
                notes=notes_text,
                logged_by="Nurse/Pharmacist (AI OCR Scan)"
            )
            tx_ids.append(tx_res["id"])

        return RegisterCommitResponse(
            facility_id=req.facility_id,
            facility_name=facility_name,
            committed_batches=len(batch_ids),
            total_quantity_added=total_qty,
            batch_ids=batch_ids,
            transaction_ids=tx_ids,
            message=f"Successfully ingested {len(batch_ids)} batches ({total_qty} total units) for {facility_name}."
        )

    res = await execute_write_transaction_async(get_db_path(), _commit_db_transaction)
    return res


@router.get(
    "/scan-register/sample-image",
    summary="Download a high-resolution authentic NHM stock arrival register image for testing"
)
def get_sample_register_image():
    """
    Generates and returns an authentic, high-resolution synthetic paper register image (PNG).
    Provides instant 1-click testability for field staff and developers without requiring local photos.
    """
    image_bytes = generate_sample_ledger_image()
    return Response(content=image_bytes, media_type="image/png")
