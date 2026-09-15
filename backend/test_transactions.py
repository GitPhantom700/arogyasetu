"""
Comprehensive Production Verification Suite for Microtask 2.1:
Transactional Stock Operations & Concurrency Control (Double Gemini Hardened).

Tests:
1. Successful Stock Consumption (Atomic Balance Decrement, OCC Version Bump, Cryptographic Ledger Seal)
2. Negative Stock Invariant (Consuming Q > Available strictly returns RFC 9110 HTTP 422)
3. Optimistic Concurrency Control (OCC Stale Version Conflict strictly returns HTTP 409)
4. Depletion Lifecycle (Status transitions to depleted; balance 0 consumption returns HTTP 422)
5. Stock Receipt (New Batch Creation with Future Expiry)
6. Stock Receipt (Augment Existing Batch Balance)
7. Rejection of Expired Supplies on Receipt (RFC 9110 HTTP 422)
8. Stock Write-off & Cold-Chain Quarantine (HTTP 422 on excessive write-off)
9. Batch Audit Ledger Chronology with Denormalized Batch Metadata & SHA-256 Seals
10. Background Telemetry Cache Invalidation & Synchronization (FastAPI BackgroundTasks)
11. DSCSA / NHM Cryptographic Hash Chain Continuity & Tamper-Evidence Verification
12. High-Frequency Atomic Decrement (Zero 409 Retry Storms under Unversioned Deductions)
"""

import sys
from pathlib import Path
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from main import app
from seed_data import seed_database
from database import get_connection, compute_transaction_hash


def run_transactional_verification_suite():
    print("=" * 80)
    print("MICROTASK 2.1: TRANSACTIONAL STOCK OPERATIONS & CONCURRENCY CONTROL")
    print("=" * 80)

    # 1. Ensure clean, deterministic database state
    seed_database(reset_schema=False)
    client = TestClient(app)

    conn = get_connection()
    cursor = conn.cursor()

    # Find an active batch to test with (e.g. at DH Aundh, facility 1)
    cursor.execute("""
        SELECT id, facility_id, medicine_id, batch_number, expiry_date, quantity_available, version 
        FROM stock_batches 
        WHERE facility_id = 1 AND status = 'ACTIVE' AND quantity_available > 20
        LIMIT 1;
    """)
    test_batch = cursor.fetchone()
    assert test_batch is not None, "No test batch found in seeded database!"
    batch_id = test_batch["id"]
    facility_id = test_batch["facility_id"]
    medicine_id = test_batch["medicine_id"]
    batch_number = test_batch["batch_number"]
    expiry_date = test_batch["expiry_date"]
    original_qty = test_batch["quantity_available"]
    original_version = test_batch["version"]
    conn.close()

    print(f"[SETUP] Selected Batch ID {batch_id} ('{batch_number}') at Facility {facility_id} with {original_qty} units (Version: {original_version}).")

    # -------------------------------------------------------------
    # TEST 1: Successful Stock Consumption
    # -------------------------------------------------------------
    print("\n[TEST 1/12] POST /api/inventory/consume (Normal Consumption)...")
    consume_qty = 5
    res = client.post("/api/inventory/consume", json={
        "facility_id": facility_id,
        "batch_id": batch_id,
        "quantity": consume_qty,
        "expected_version": original_version,
        "reference_id": "OPD-2026-0905-001",
        "notes": "Dispensed to snakebite patient in emergency ward",
        "logged_by": "Nurse Sunita",
        "user_reported_at": "2026-09-05 10:15:00"
    })
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert data["balance_after"] == original_qty - consume_qty
    assert data["batch_version_after"] == original_version + 1
    assert data["transaction_type"] == "CONSUMED"
    assert data["batch_number"] == batch_number
    assert data["expiry_date"] == expiry_date
    assert data["facility_gln"] is not None and len(data["facility_gln"]) == 13
    assert data["gtin"] is not None and len(data["gtin"]) == 14
    assert data["hash"] is not None and len(data["hash"]) == 64
    assert data["previous_hash"] is not None
    assert data["user_reported_at"] == "2026-09-05 10:15:00"
    print(f"[PASS] Successfully consumed {consume_qty} units. Balance: {data['balance_after']} (Version: {data['batch_version_after']}). Cryptographic Seal: {data['hash'][:16]}...")

    # -------------------------------------------------------------
    # TEST 2: Negative Stock Prevention (RFC 9110 HTTP 422)
    # -------------------------------------------------------------
    print("\n[TEST 2/12] Invariant Check: Attempting to Consume More Than Available (HTTP 422)...")
    res_neg = client.post("/api/inventory/consume", json={
        "facility_id": facility_id,
        "batch_id": batch_id,
        "quantity": 999999,
        "expected_version": data["batch_version_after"]
    })
    assert res_neg.status_code == 422, f"Expected 422, got {res_neg.status_code}: {res_neg.text}"
    assert "Insufficient stock" in res_neg.json()["detail"]
    print(f"[PASS] Excessive consumption rejected with RFC 9110 HTTP 422 Unprocessable Content: '{res_neg.json()['detail']}'.")

    # -------------------------------------------------------------
    # TEST 3: Optimistic Concurrency Control (OCC) Stale Version Check
    # -------------------------------------------------------------
    print("\n[TEST 3/12] Concurrency Control: Stale Version Collision (HTTP 409)...")
    res_occ = client.post("/api/inventory/consume", json={
        "facility_id": facility_id,
        "batch_id": batch_id,
        "quantity": 1,
        "expected_version": original_version  # Stale version! Current version is original_version + 1
    })
    assert res_occ.status_code == 409, f"Expected 409, got {res_occ.status_code}"
    assert "Concurrency Conflict" in res_occ.json()["detail"]
    print(f"[PASS] Stale OCC version strictly rejected with HTTP 409 Conflict: '{res_occ.json()['detail']}'.")

    # -------------------------------------------------------------
    # TEST 4: Depletion to Zero & Depleted Rejection (RFC 9110 HTTP 422)
    # -------------------------------------------------------------
    print("\n[TEST 4/12] Depletion Lifecycle: Consuming Entire Remaining Balance...")
    current_balance = data["balance_after"]
    current_ver = data["batch_version_after"]

    res_deplete = client.post("/api/inventory/consume", json={
        "facility_id": facility_id,
        "batch_id": batch_id,
        "quantity": current_balance,
        "expected_version": current_ver,
        "reference_id": "OPD-FINAL-DEPLETE",
        "notes": "Consuming last remaining units"
    })
    assert res_deplete.status_code == 200
    depleted_data = res_deplete.json()
    assert depleted_data["balance_after"] == 0
    print(f"[PASS] Balance safely reached 0 without violating constraints.")

    # Attempting to consume from batch with zero balance must fail with HTTP 422
    res_dep_consume = client.post("/api/inventory/consume", json={
        "facility_id": facility_id,
        "batch_id": batch_id,
        "quantity": 1
    })
    assert res_dep_consume.status_code == 422
    assert "depleted" in res_dep_consume.json()["detail"].lower()
    print(f"[PASS] Consumption from depleted batch (balance 0) safely rejected with RFC 9110 HTTP 422: '{res_dep_consume.json()['detail']}'.")

    # -------------------------------------------------------------
    # TEST 5: Stock Receipt (New Batch Creation)
    # -------------------------------------------------------------
    print("\n[TEST 5/12] POST /api/inventory/receive (Brand New Batch)...")
    new_batch_num = "TEST-BATCH-2026-X1"
    res_recv_new = client.post("/api/inventory/receive", json={
        "facility_id": facility_id,
        "medicine_id": 1,
        "batch_number": new_batch_num,
        "expiry_date": "2027-12-31",
        "quantity": 100,
        "reference_id": "GRN-2026-PUN-099",
        "notes": "Emergency consignment received from Pune District Warehouse",
        "logged_by": "Pharmacist Anand"
    })
    assert res_recv_new.status_code == 200
    new_batch_data = res_recv_new.json()
    assert new_batch_data["balance_after"] == 100
    assert new_batch_data["batch_version_after"] == 1
    assert new_batch_data["batch_status_after"] == "ACTIVE"
    assert new_batch_data["batch_number"] == new_batch_num
    assert new_batch_data["expiry_date"] == "2027-12-31"
    assert new_batch_data["hash"] is not None and len(new_batch_data["hash"]) == 64
    created_new_batch_id = new_batch_data["batch_id"]
    print(f"[PASS] Created new batch ID {created_new_batch_id} with 100 units (Status: ACTIVE, Version: 1, Hash: {new_batch_data['hash'][:16]}...).")

    # -------------------------------------------------------------
    # TEST 6: Stock Receipt (Augment Existing Batch)
    # -------------------------------------------------------------
    print("\n[TEST 6/12] POST /api/inventory/receive (Augment Existing Batch)...")
    res_recv_aug = client.post("/api/inventory/receive", json={
        "facility_id": facility_id,
        "medicine_id": 1,
        "batch_number": new_batch_num,  # Same batch number!
        "expiry_date": "2027-12-31",
        "quantity": 50,
        "reference_id": "GRN-2026-PUN-100",
        "notes": "Secondary top-up delivery",
        "logged_by": "Pharmacist Anand"
    })
    assert res_recv_aug.status_code == 200
    aug_data = res_recv_aug.json()
    assert aug_data["batch_id"] == created_new_batch_id
    assert aug_data["balance_after"] == 150
    assert aug_data["batch_version_after"] == 2
    assert aug_data["previous_hash"] == new_batch_data["hash"]
    print(f"[PASS] Existing batch {new_batch_num} augmented from 100 to 150 units (Version: 2). Hash-chain linked.")

    # -------------------------------------------------------------
    # TEST 7: Rejection of Expired Supplies on Receipt (RFC 9110 HTTP 422)
    # -------------------------------------------------------------
    print("\n[TEST 7/12] Invariant Check: Rejecting Expired Supplies on Receipt (HTTP 422)...")
    res_recv_exp = client.post("/api/inventory/receive", json={
        "facility_id": facility_id,
        "medicine_id": 1,
        "batch_number": "EXPIRED-BATCH-00",
        "expiry_date": "2020-01-01",  # Past date!
        "quantity": 20
    })
    assert res_recv_exp.status_code == 422, f"Expected 422, got {res_recv_exp.status_code}"
    assert "Cannot receive expired supplies" in res_recv_exp.json()["detail"]
    print(f"[PASS] Expired supplies rejected with RFC 9110 HTTP 422: '{res_recv_exp.json()['detail']}'.")

    # -------------------------------------------------------------
    # TEST 8: Stock Write-Off & Cold-Chain Quarantine
    # -------------------------------------------------------------
    print("\n[TEST 8/12] POST /api/inventory/write-off (Cold Chain Quarantine)...")
    res_writeoff = client.post("/api/inventory/write-off", json={
        "facility_id": facility_id,
        "batch_id": created_new_batch_id,
        "quantity": 25,
        "reason": "COLD_CHAIN_BREACH",
        "expected_version": 2,
        "reference_id": "INCIDENT-CC-404",
        "notes": "Refrigerator failure during power outage exceeding backup duration",
        "logged_by": "Dr. Ramesh Patil"
    })
    assert res_writeoff.status_code == 200
    wo_data = res_writeoff.json()
    assert wo_data["balance_after"] == 125
    assert wo_data["transaction_type"] == "QUARANTINED"
    assert wo_data["batch_status_after"] == "QUARANTINED"
    assert wo_data["batch_version_after"] == 3
    assert wo_data["previous_hash"] == aug_data["hash"]
    print(f"[PASS] 25 units quarantined. Remaining balance: {wo_data['balance_after']} (Status: QUARANTINED).")

    # Invariant: Writing off more than available returns HTTP 422
    res_wo_neg = client.post("/api/inventory/write-off", json={
        "facility_id": facility_id,
        "batch_id": created_new_batch_id,
        "quantity": 9999,
        "reason": "DAMAGED"
    })
    assert res_wo_neg.status_code == 422
    assert "Cannot write off" in res_wo_neg.json()["detail"]
    print(f"[PASS] Excessive write-off rejected with RFC 9110 HTTP 422: '{res_wo_neg.json()['detail']}'.")

    # Invariant: Attempting to consume from QUARANTINED batch strictly returns RFC 9110 HTTP 422 (not 409)
    res_quarantine_consume = client.post("/api/inventory/consume", json={
        "facility_id": facility_id,
        "batch_id": created_new_batch_id,
        "quantity": 5
    })
    assert res_quarantine_consume.status_code == 422, f"Expected 422, got {res_quarantine_consume.status_code}"
    assert "non-active batch" in res_quarantine_consume.json()["detail"]
    print(f"[PASS] Consumption from QUARANTINED batch correctly returned RFC 9110 HTTP 422 Unprocessable Content: '{res_quarantine_consume.json()['detail']}'.")

    # -------------------------------------------------------------
    # TEST 9: Batch Audit Ledger Chronology with DSCSA Metadata
    # -------------------------------------------------------------
    print("\n[TEST 9/12] GET /api/inventory/batches/{id}/transactions (Immutable Audit Trail)...")
    res_history = client.get(f"/api/inventory/batches/{created_new_batch_id}/transactions")
    assert res_history.status_code == 200
    history = res_history.json()
    assert history["batch_number"] == new_batch_num
    assert history["current_quantity"] == 125
    assert len(history["transactions"]) == 3  # Initial Receipt (100), Augmentation (50), Quarantine (25)

    tx_types = [t["transaction_type"] for t in history["transactions"]]
    assert tx_types == ["RECEIVED", "RECEIVED", "QUARANTINED"], f"Unexpected transaction history: {tx_types}"

    # Verify denormalized batch_number, expiry_date, and GS1 fields are preserved in ledger entries
    for entry in history["transactions"]:
        assert entry["batch_number"] == new_batch_num
        assert entry["expiry_date"] == "2027-12-31"
        assert entry["facility_gln"] is not None and len(entry["facility_gln"]) == 13
        assert entry["gtin"] is not None and len(entry["gtin"]) == 14
        assert len(entry["hash"]) == 64
        assert entry["previous_hash"] is not None
    print(f"[PASS] Chronological ledger verified across {len(history['transactions'])} events: {tx_types}.")
    print("[PASS] Denormalized batch_number, expiry_date, GS1 GLN/GTIN, and SHA-256 seals present in every ledger row.")

    # -------------------------------------------------------------
    # TEST 10: Overview Stats Cache Invalidation & Synchronization
    # -------------------------------------------------------------
    print("\n[TEST 10/12] Overview Stats Cache Invalidation on Transaction (FastAPI BackgroundTasks)...")
    # First fetch: computes stats
    res_s1 = client.get("/api/stats/overview")
    assert res_s1.status_code == 200
    assert res_s1.json()["cached"] is False

    # Second fetch: served from in-memory cache
    res_s2 = client.get("/api/stats/overview")
    assert res_s2.json()["cached"] is True

    # Perform a valid transaction (receive 10 units of a medicine)
    res_tx = client.post("/api/inventory/receive", json={
        "facility_id": facility_id,
        "medicine_id": 2,
        "batch_number": "TELEMETRY-SYNC-BATCH",
        "expiry_date": "2027-06-30",
        "quantity": 10
    })
    assert res_tx.status_code == 200, f"Transaction failed: {res_tx.text}"

    # Third fetch: cache should have been invalidated and recomputed (cached = False)
    res_s3 = client.get("/api/stats/overview")
    assert res_s3.json()["cached"] is False
    print(f"[PASS] Stats cache invalidated after transaction via BackgroundTasks (cached={res_s3.json()['cached']}). Telemetry synchronized.")

    # -------------------------------------------------------------
    # TEST 11: DSCSA / NHM Cryptographic Hash Chain Continuity & Tamper-Evidence
    # -------------------------------------------------------------
    print("\n[TEST 11/12] Cryptographic Ledger Integrity Verification (Tamper-Evidence Check)...")
    db_conn = get_connection()
    db_cursor = db_conn.cursor()
    db_cursor.execute("SELECT * FROM inventory_transactions ORDER BY id ASC;")
    all_txs = db_cursor.fetchall()
    db_conn.close()

    assert len(all_txs) > 10, "Expected at least 10 transactions in ledger!"
    for i in range(1, len(all_txs)):
        curr_tx = all_txs[i]
        prev_tx = all_txs[i - 1]
        assert curr_tx["previous_hash"] == prev_tx["hash"], (
            f"Hash-chain broken at transaction ID {curr_tx['id']}! "
            f"Expected previous_hash {prev_tx['hash'][:16]}..., got {curr_tx['previous_hash'][:16]}..."
        )

        # Recalculate hash to verify integrity
        expected_hash = compute_transaction_hash(
            previous_hash=curr_tx["previous_hash"],
            facility_gln=curr_tx["facility_gln"],
            gtin=curr_tx["gtin"],
            batch_number=curr_tx["batch_number"],
            expiry_date=curr_tx["expiry_date"],
            transaction_type=curr_tx["transaction_type"],
            quantity=curr_tx["quantity"],
            balance_after=curr_tx["balance_after"],
            reference_id=curr_tx["reference_id"],
            logged_by=curr_tx["logged_by"],
            created_at_iso=str(curr_tx["created_at"]),
            user_reported_at_iso=str(curr_tx["user_reported_at"]) if curr_tx["user_reported_at"] else str(curr_tx["created_at"])
        )
        assert curr_tx["hash"] == expected_hash, (
            f"Cryptographic tampering detected at transaction ID {curr_tx['id']}! "
            f"Stored: {curr_tx['hash']}, Expected: {expected_hash}"
        )
    print(f"[PASS] Cryptographic hash-chain verified across all {len(all_txs)} transactions: 100% tamper-evident.")

    # -------------------------------------------------------------
    # TEST 12: High-Frequency Atomic Decrement (Thundering Herd Mitigation)
    # -------------------------------------------------------------
    print("\n[TEST 12/12] High-Frequency Atomic Decrement (Zero 409 Retry Storms)...")
    # Receive a fresh batch with 100 units
    res_bulk = client.post("/api/inventory/receive", json={
        "facility_id": 2,
        "medicine_id": 1,
        "batch_number": "SURGE-CASUALTY-BATCH-99",
        "expiry_date": "2027-10-31",
        "quantity": 100
    })
    assert res_bulk.status_code == 200
    surge_batch_id = res_bulk.json()["batch_id"]

    # Execute 5 rapid sequential unversioned consumption requests simulating mass-casualty surge
    # With pure OCC, unversioned requests or version bumping would cause collisions.
    # With atomic decrement, all 5 must succeed smoothly.
    for i in range(5):
        res_surge = client.post("/api/inventory/consume", json={
            "facility_id": 2,
            "batch_id": surge_batch_id,
            "quantity": 10,
            # No expected_version specified -> atomic decrement mode
            "reference_id": f"SURGE-PATIENT-{i+1}"
        })
        assert res_surge.status_code == 200, f"Surge consumption {i+1} failed: {res_surge.text}"

    # Verify final balance: 100 - (5 * 10) = 50
    res_final_check = client.get("/api/inventory/2")
    assert res_final_check.status_code == 200
    inventory_items = res_final_check.json()["inventory"]
    surge_item = next(item for item in inventory_items if any(b["id"] == surge_batch_id for b in item["batches"]))
    surge_batch = next(b for b in surge_item["batches"] if b["id"] == surge_batch_id)
    assert surge_batch["quantity_available"] == 50
    assert surge_batch["version"] == 6  # Initial 1 + 5 increments
    print(f"[PASS] 5 consecutive rapid surge deductions succeeded with 0 conflicts. Final stock: {surge_batch['quantity_available']} (Version: {surge_batch['version']}).")

    # -------------------------------------------------------------
    # TEST 13: Multi-Threaded Concurrency & Lock Escalation Stress Test
    # -------------------------------------------------------------
    print("\n[TEST 13/13] Concurrent ThreadPool Burst Test (10 Concurrent Write Threads)...")
    from concurrent.futures import ThreadPoolExecutor

    def fire_concurrent_consume(index: int):
        return client.post("/api/inventory/consume", json={
            "facility_id": 2,
            "batch_id": surge_batch_id,
            "quantity": 2,
            "reference_id": f"CONCURRENT-TX-{index}"
        })

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(fire_concurrent_consume, i) for i in range(10)]
        results = [f.result() for f in futures]

    assert all(r.status_code == 200 for r in results), f"Some concurrent requests failed: {[r.status_code for r in results]}"
    
    # Verify final balance: 50 - (10 * 2) = 30
    res_thread_check = client.get("/api/inventory/2")
    assert res_thread_check.status_code == 200
    inv_items = res_thread_check.json()["inventory"]
    batch_item = next(item for item in inv_items if any(b["id"] == surge_batch_id for b in item["batches"]))
    final_batch = next(b for b in batch_item["batches"] if b["id"] == surge_batch_id)
    assert final_batch["quantity_available"] == 30
    assert final_batch["version"] == 16  # 6 + 10 = 16
    print(f"[PASS] 10 concurrent threads executed simultaneously with ZERO SQLITE_BUSY deadlocks! Final stock: {final_batch['quantity_available']} (Version: {final_batch['version']}).")

    # Final Hash-Chain verification including the concurrent transactions
    db_conn = get_connection()
    db_cursor = db_conn.cursor()
    db_cursor.execute("SELECT * FROM inventory_transactions ORDER BY id ASC;")
    final_txs = db_cursor.fetchall()
    db_conn.close()

    for i in range(1, len(final_txs)):
        assert final_txs[i]["previous_hash"] == final_txs[i - 1]["hash"], f"Chain broken at index {i} after concurrency test!"
    print(f"[PASS] Hash chain perfectly intact across all {len(final_txs)} transactions after concurrent burst.")

    print("\n" + "=" * 80)
    print("ALL 13 TRANSACTIONAL CORE & CONCURRENCY TESTS PASSED (100% RELIABILITY)")
    print("=" * 80)


def test_transactional_stock_operations_and_concurrency():
    """Pytest entrypoint for transactional stock operations and concurrency stress tests."""
    run_transactional_verification_suite()


if __name__ == "__main__":
    run_transactional_verification_suite()
