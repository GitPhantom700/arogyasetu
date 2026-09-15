"""
Automated Test Suite for Microtask 3.2: Multimodal Paper Register Ingestion (Gemini Vision OCR).
Validates:
1. Sample test register generation & GET /api/inventory/scan-register/sample-image endpoint.
2. Multipart image upload handling & content-type validation (rejecting non-images & 0-byte files).
3. Structured Pydantic schema extraction (medicine_name, batch, qty, expiry, confidence).
4. Catalog fuzzy matching of colloquial / handwritten drug names to official database IDs.
5. Transactional commit into SQLite stock_batches and audit_transactions with DSCSA ledger signatures.
6. Error handling, non-existent facility/medicine rejection, and zero inventory leakage.
"""

import sys
from pathlib import Path
from io import BytesIO
from PIL import Image
import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from main import app
from database import get_connection
from seed_data import seed_database
from ledger_vision import generate_sample_ledger_image, match_medicine_to_catalog, normalize_expiry_date, get_active_medicines_catalog


@pytest.fixture(autouse=True)
def setup_test_db():
    """Ensures a clean seeded database state before each test."""
    seed_database(reset_schema=False)
    yield


def test_sample_register_image_endpoint():
    """
    Test 1: Sample Register Image Endpoint & Generator
    Verifies that GET /api/inventory/scan-register/sample-image generates
    a valid, high-resolution PNG image with proper dimensions and headers.
    """
    client = TestClient(app)
    res = client.get("/api/inventory/scan-register/sample-image")
    assert res.status_code == 200
    assert res.headers.get("content-type") == "image/png"
    assert len(res.content) > 1000

    # Verify PIL can open and parse it as a valid image
    img = Image.open(BytesIO(res.content))
    assert img.format == "PNG"
    assert img.width == 900
    assert img.height == 620


def test_scan_register_success_with_sample_image():
    """
    Test 2: Scan Register Multipart Upload & Structured Extraction
    Verifies uploading an image to POST /api/inventory/scan-register returns
    a strictly typed RegisterScanResponse with extracted medication items.
    """
    client = TestClient(app)
    image_bytes = generate_sample_ledger_image()

    files = {
        "file": ("test_register.png", image_bytes, "image/png")
    }
    data = {"facility_id": 1}

    res = client.post("/api/inventory/scan-register", files=files, data=data)
    assert res.status_code == 200
    payload = res.json()

    assert payload["scan_id"].startswith("SCAN-")
    assert payload["facility_id"] == 1
    assert payload["facility_name"] is not None
    assert payload["total_items_detected"] >= 3
    assert len(payload["extracted_items"]) == payload["total_items_detected"]
    assert payload["processing_time_ms"] > 0
    assert payload["model_used"] is not None

    for item in payload["extracted_items"]:
        assert item["medicine_name"]
        assert item["batch_number"]
        assert item["quantity"] >= 1
        # Expiry format YYYY-MM-DD
        assert len(item["expiry_date"].split("-")) == 3
        assert 0.0 <= item["confidence_score"] <= 1.0


def test_scan_register_fuzzy_catalog_matching():
    """
    Test 3: Catalog Fuzzy Matching for Colloquial Drug Names
    Verifies that clinical abbreviations and colloquial labels accurately
    resolve to real catalog IDs in the database.
    """
    catalog = get_active_medicines_catalog()
    assert len(catalog) == 10

    test_cases = [
        ("Inj Anti-Snake Venom 10ml (Polyvalent)", "Anti-Snake Venom (ASV) Polyvalent"),
        ("ASV Vials", "Anti-Snake Venom (ASV) Polyvalent"),
        ("Anti-Rabies Vaccine (ARV) 0.5ml", "Anti-Rabies Vaccine (ARV) Purified Vero Cell"),
        ("Oral Rehydration Salts (ORS) Sachets", "Oral Rehydration Salts (ORS) WHO Formula"),
        ("ORS pkts", "Oral Rehydration Salts (ORS) WHO Formula"),
        ("Amoxicillin Caps 500mg", "Amoxicillin 500mg Capsules"),
        ("Tab Paracetamol 500", "Paracetamol 500mg Tablets"),
        ("Regular Human Insulin 40 IU", "Regular Human Insulin 40 IU/ml"),
        ("Ringer Lactate Infusion", "Ringer Lactate (RL) 500ml Infusion"),
        ("Oxytocin Injection", "Oxytocin Injection 5 IU/ml"),
    ]

    for raw, expected_official in test_cases:
        matched_id, matched_name, score, needs_review = match_medicine_to_catalog(raw, catalog)
        assert matched_id is not None, f"Failed to match: {raw}"
        assert matched_name == expected_official, f"Expected {expected_official}, got {matched_name} for '{raw}'"
        assert needs_review is False, f"Expected confident auto-match for standard label '{raw}', got needs_review=True"


def test_normalize_expiry_date_formats():
    """
    Test 4: Expiration Date Normalization
    Verifies irregular date formats (MM/YY, DD/MM/YYYY, YYYY-MM-DD)
    are standardized into ISO-8601 YYYY-MM-DD.
    """
    assert normalize_expiry_date("2027-08-31") == "2027-08-31"
    assert normalize_expiry_date("08/27") == "2027-08-31"
    assert normalize_expiry_date("06/2028") == "2028-06-30"
    assert normalize_expiry_date("15/04/2027") == "2027-04-15"
    assert normalize_expiry_date("31-12-2027") == "2027-12-31"


def test_scan_register_validation_errors():
    """
    Test 5: Edge Cases & Upload Validation Errors
    Verifies HTTP 422 for empty files and HTTP 415 for unsupported media types.
    """
    client = TestClient(app)

    # 1. Zero-byte empty file -> HTTP 422
    files_empty = {"file": ("empty.png", b"", "image/png")}
    res_empty = client.post("/api/inventory/scan-register", files=files_empty)
    assert res_empty.status_code == 422
    assert "empty" in res_empty.json()["detail"].lower()

    # 2. Unsupported media type (e.g. text or video) -> HTTP 415
    files_bad_mime = {"file": ("log.txt", b"plain text content", "text/plain")}
    res_bad_mime = client.post("/api/inventory/scan-register", files=files_bad_mime)
    assert res_bad_mime.status_code == 415
    assert "unsupported" in res_bad_mime.json()["detail"].lower()


def test_commit_scanned_register_lifecycle():
    """
    Test 6: Transactional Commit into SQLite Stock Batches & Audit Trail
    Verifies that committing verified OCR items updates stock_batches,
    increments inventory balances, and logs DSCSA inventory_transactions.
    """
    client = TestClient(app)

    # 1. First scan sample register
    image_bytes = generate_sample_ledger_image()
    scan_res = client.post("/api/inventory/scan-register", files={"file": ("register.png", image_bytes, "image/png")}, data={"facility_id": 2})
    assert scan_res.status_code == 200
    scan_data = scan_res.json()

    # Prepare commit items
    commit_items = []
    for item in scan_data["extracted_items"]:
        if item["matched_medicine_id"]:
            commit_items.append({
                "medicine_id": item["matched_medicine_id"],
                "batch_number": item["batch_number"],
                "quantity": item["quantity"],
                "expiry_date": item["expiry_date"],
                "unit_price": item.get("unit_price", 100.0)
            })

    assert len(commit_items) >= 2

    # 2. Commit items into Facility 2
    commit_payload = {
        "facility_id": 2,
        "items": commit_items,
        "notes": "Automated physical register audit commit"
    }

    commit_res = client.post("/api/inventory/scan-register/commit", json=commit_payload)
    assert commit_res.status_code == 200
    res_data = commit_res.json()

    assert res_data["facility_id"] == 2
    assert res_data["committed_batches"] == len(commit_items)
    assert res_data["total_quantity_added"] == sum(i["quantity"] for i in commit_items)
    assert len(res_data["batch_ids"]) == len(commit_items)
    assert len(res_data["transaction_ids"]) == len(commit_items)

    # 3. Verify in SQLite database
    conn = get_connection()
    try:
        cur = conn.cursor()
        # Verify batch presence
        for batch_id in res_data["batch_ids"]:
            cur.execute("SELECT * FROM stock_batches WHERE id = ?;", (batch_id,))
            b = cur.fetchone()
            assert b is not None
            assert b["facility_id"] == 2
            assert b["quantity_available"] >= 1

        # Verify audit transaction presence in inventory_transactions
        for tx_id in res_data["transaction_ids"]:
            cur.execute("SELECT * FROM inventory_transactions WHERE id = ?;", (tx_id,))
            tx = cur.fetchone()
            assert tx is not None
            assert tx["transaction_type"] == "RECEIVED"
            assert "Optical register" in tx["notes"]
            assert len(tx["hash"]) == 64  # SHA-256 hash length
    finally:
        conn.close()


def test_commit_scanned_register_rejects_nonexistent_facility_or_medicine():
    """
    Test 7: Zero Leakage Validation on Invalid Commit Targets
    Verifies that attempting to commit to a non-existent facility or with
    an invalid medicine ID aborts transactionally with HTTP 404.
    """
    client = TestClient(app)

    # 1. Invalid facility
    res_bad_fac = client.post("/api/inventory/scan-register/commit", json={
        "facility_id": 99999,
        "items": [{"medicine_id": 1, "batch_number": "B-TEST", "quantity": 10, "expiry_date": "2027-12-31"}]
    })
    assert res_bad_fac.status_code == 404
    assert "facility #99999" in res_bad_fac.json()["detail"].lower()

    # 2. Invalid medicine
    res_bad_med = client.post("/api/inventory/scan-register/commit", json={
        "facility_id": 1,
        "items": [{"medicine_id": 99999, "batch_number": "B-TEST", "quantity": 10, "expiry_date": "2027-12-31"}]
    })
    assert res_bad_med.status_code == 404
    assert "medicine #99999" in res_bad_med.json()["detail"].lower()

    # 3. Empty items array
    res_empty_items = client.post("/api/inventory/scan-register/commit", json={
        "facility_id": 1,
        "items": []
    })
    assert res_empty_items.status_code == 422


def test_magic_byte_validation_rejects_spoofed_image():
    """
    Test 8: Spoofed MIME & Magic Byte Security Validation
    Verifies that files with fake 'image/png' or 'image/jpeg' content-types
    containing non-image content (text, scripts, or corrupt headers) are rejected with HTTP 415.
    """
    client = TestClient(app)

    # 1. Plain text disguised as image/png
    spoofed_file = {"file": ("malicious.png", b"<!DOCTYPE html><html><body>Spoofed</body></html>", "image/png")}
    res = client.post("/api/inventory/scan-register", files=spoofed_file)
    assert res.status_code == 415
    assert "magic bytes" in res.json()["detail"].lower() or "unsupported" in res.json()["detail"].lower()

    # 2. Corrupt bytes with JPEG header prefix but broken payload
    corrupt_jpeg = {"file": ("corrupt.jpg", b"\xff\xd8\xff\xe0\x00\x10JFIF\x00corrupt_payload_data_truncated", "image/jpeg")}
    res_corrupt = client.post("/api/inventory/scan-register", files=corrupt_jpeg)
    assert res_corrupt.status_code == 415
    assert "validation" in res_corrupt.json()["detail"].lower() or "corrupted" in res_corrupt.json()["detail"].lower()


def test_rapidfuzz_rejection_of_unrelated_drugs_and_text_dates():
    """
    Test 9: RapidFuzz Precision & False-Positive Immunity
    1. Verifies that non-catalog medications (e.g. Ibuprofen, Metformin, Ciprofloxacin)
       are strictly rejected (matched_id is None) and do NOT falsely match Paracetamol or Amoxicillin.
    2. Verifies text month parsing in normalize_expiry_date ('Oct 25', 'Aug 2027', 'End of 2024').
    """
    catalog = get_active_medicines_catalog()

    unrelated_drugs = [
        "Tab Ibuprofen 400",
        "Metformin 500mg Tablets",
        "Ciprofloxacin 500mg",
        "Azithromycin 250mg",
        "Ranitidine 150mg"
    ]

    for drug in unrelated_drugs:
        matched_id, matched_name, score, needs_review = match_medicine_to_catalog(drug, catalog)
        assert matched_id is None, f"Dangerous false positive match: '{drug}' matched '{matched_name}'!"

    # 2. Combination drug disambiguation: Amoxicillin + Clavulanate must route to Pharmacist Review Queue
    comb_id, comb_name, comb_score, comb_needs_review = match_medicine_to_catalog("Amoxicillin + Clavulanate", catalog)
    assert comb_id == 6
    assert comb_needs_review is True
    assert 0.60 <= comb_score < 0.82

    # 3. Date normalization for text dates
    assert normalize_expiry_date("Oct 25") == "2025-10-31"
    assert normalize_expiry_date("August 2027") == "2027-08-31"
    assert normalize_expiry_date("End of 2026") == "2026-12-31"


def test_atomic_upsert_increments_existing_batch():
    """
    Test 10: Atomic SQLite UPSERT with RETURNING Verification
    Verifies that committing an identical batch twice at the same facility
    atomically increments quantity_available, bumps OCC version, and preserves
    single-row uniqueness without check-then-act race conditions.
    """
    client = TestClient(app)
    batch_num = "UPSERT-TEST-B1"

    # First commit: +50 units
    payload1 = {
        "facility_id": 1,
        "items": [{
            "medicine_id": 1,
            "batch_number": batch_num,
            "quantity": 50,
            "expiry_date": "2027-10-31"
        }],
        "notes": "First UPSERT load"
    }
    res1 = client.post("/api/inventory/scan-register/commit", json=payload1)
    assert res1.status_code == 200
    batch_id_1 = res1.json()["batch_ids"][0]

    # Second commit: +30 units to the exact same batch
    payload2 = {
        "facility_id": 1,
        "items": [{
            "medicine_id": 1,
            "batch_number": batch_num,
            "quantity": 30,
            "expiry_date": "2027-10-31"
        }],
        "notes": "Second UPSERT increment"
    }
    res2 = client.post("/api/inventory/scan-register/commit", json=payload2)
    assert res2.status_code == 200
    batch_id_2 = res2.json()["batch_ids"][0]

    # Assert both operations targeted the exact same batch_id (UPSERT update)
    assert batch_id_1 == batch_id_2

    # Verify in DB that quantity is 80 and version is 2
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT quantity_available, version FROM stock_batches WHERE id = ?;", (batch_id_1,))
        row = cur.fetchone()
        assert row["quantity_available"] == 80
        assert row["version"] == 2
    finally:
        conn.close()

