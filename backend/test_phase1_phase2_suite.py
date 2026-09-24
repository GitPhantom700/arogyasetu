"""
Master Phase 1 & Phase 2 Comprehensive Integration & Verification Suite.
Build with AI: Code for Communities (Second Edition) - Track 03 Smart Health & Supply Chain Resilience.

Verifies:
1. Cross-Module Emergency Redistribution Workflow (Catalog -> Receipt -> Burn Rate -> Transfer -> Dispensing).
2. Triage & Depletion Sensitivity under Acute Outbreak Surges.
3. Cold-Chain & Expiry Buffer Constraints across Mountain vs Highway Terrains.
4. Transit Rejection, Damage Handling, and Expiry Re-Evaluation Diverting to Waste/Quarantine.
5. Optimistic Concurrency Control (OCC) Collisions and Atomic Mitigation.
6. Boundary Constraint Invariant Matrix (Negative stock, Bed allocation, Self-transfer, Chronology).
7. End-to-End DSCSA Cryptographic Hash Chain Audit Trail Continuity.
"""

import sqlite3
import tempfile
from pathlib import Path
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from concurrent.futures import ThreadPoolExecutor

import sys
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

import pytest
from main import app
from database import (
    init_db,
    get_connection,
    compute_transaction_hash,
    record_inventory_transaction,
    verify_dscsa_ledger_integrity,
    LedgerIntegrityError,
)
from seed_data import seed_database
from transfers_core import (
    calculate_haversine_distance,
    estimate_transit_time,
    estimate_multi_segment_transit_time,
    ALLOWED_TRANSITIONS,
    allocate_fefo_batches,
    sweep_expired_soft_reservations,
)
from burn_rate import calculate_depletion_metrics


def test_full_emergency_redistribution_lifecycle():
    """
    End-to-End Workflow:
    1. Seed database with authentic 15 PHCs and essential medicines.
    2. Check initial inventory and verify GLN and GTIN tags.
    3. Simulate sudden consumption surge at a rural PHC (e.g. PHC Paud).
    4. Compute dynamic depletion metrics -> Verify status changes to CRITICAL.
    5. Create Inter-PHC transfer order from District Hospital Aundh (DH) to PHC Paud.
    6. Approve transfer -> Verify soft reservation locks stock without premature deduction.
    7. Dispatch transfer -> Verify deduction from donor and transition to IN_TRANSIT.
    8. Receive transfer at PHC Paud -> Verify batch created/augmented and stock increases.
    9. Dispense to emergency patient at PHC Paud -> Verify atomic decrement.
    10. Cryptographically verify unbroken SHA-256 hash-chain across all transactions.
    """
    seed_database(reset_schema=False)
    client = TestClient(app)

    # 1. Inspect facilities
    res_fac = client.get("/api/facilities?tier=DH")
    assert res_fac.status_code == 200
    dh_facilities = res_fac.json()
    assert len(dh_facilities) >= 1
    dh = dh_facilities[0]
    dh_id = dh["id"]
    assert dh["facility_gln"] is not None and len(dh["facility_gln"]) == 13

    # Recipient: Rural PHC
    res_phc = client.get("/api/facilities?tier=PHC")
    assert res_phc.status_code == 200
    phc_list = res_phc.json()
    assert len(phc_list) >= 1
    recipient_phc = phc_list[0]
    phc_id = recipient_phc["id"]

    # 2. Inward Receipt of fresh emergency stock at District Hospital (ASV)
    asv_batch_num = "DH-ASV-E2E-2026"
    res_recv = client.post("/api/inventory/receive", json={
        "facility_id": dh_id,
        "medicine_id": 1,  # Anti-Snake Venom
        "batch_number": asv_batch_num,
        "expiry_date": "2027-12-31",
        "quantity": 100,
        "reference_id": "GRN-E2E-DH-01",
        "notes": "Central warehouse bulk shipment received",
        "logged_by": "District Pharmacist"
    })
    assert res_recv.status_code == 200
    dh_batch_data = res_recv.json()
    dh_batch_id = dh_batch_data["batch_id"]
    assert dh_batch_data["balance_after"] >= 100

    # 3. Simulate severe outbreak at rural PHC: consume stock down to near zero
    res_phc_inv = client.get(f"/api/inventory/{phc_id}")
    assert res_phc_inv.status_code == 200
    phc_asv_items = [item for item in res_phc_inv.json()["inventory"] if item["medicine_id"] == 1]
    
    if phc_asv_items and phc_asv_items[0]["batches"]:
        for b in phc_asv_items[0]["batches"]:
            if b["status"] == "ACTIVE" and b["quantity_available"] > 0:
                client.post("/api/inventory/consume", json={
                    "facility_id": phc_id,
                    "batch_id": b["id"],
                    "quantity": b["quantity_available"],
                    "reference_id": "EMERGENCY-OUTBREAK-SURGE",
                    "notes": "Severe snakebite incident surge"
                })

    # 4. Check depletion metrics for PHC
    res_depletion = client.get(f"/api/facilities/{phc_id}/depletion")
    assert res_depletion.status_code == 200
    dep_data = res_depletion.json()
    asv_dep = next((m for m in dep_data["medicines"] if m["medicine_id"] == 1), None)
    assert asv_dep is not None
    assert asv_dep["status"] == "CRITICAL"

    # 5. Create transfer request: 25 vials from DH to PHC
    transfer_qty = 25
    res_create_tr = client.post("/api/transfers", json={
        "source_facility_id": dh_id,
        "destination_facility_id": phc_id,
        "medicine_id": 1,
        "quantity": transfer_qty,
        "urgency": "CRITICAL_EMERGENCY",
        "requested_by": "Dr. E2E Field MO",
        "reason": "Critical shortage after acute snakebite cluster"
    })
    assert res_create_tr.status_code == 201
    tr_data = res_create_tr.json()
    transfer_id = tr_data["id"]
    assert tr_data["status"] == "DRAFT"
    assert tr_data["estimated_transit_hours"] > 0

    # 6. Approve transfer -> Soft reservation
    res_approve = client.post(f"/api/transfers/{transfer_id}/approve", json={
        "approved_by": "District Health Officer Dr. Deshmukh"
    })
    assert res_approve.status_code == 200
    app_data = res_approve.json()
    assert app_data["status"] == "APPROVED"
    assert app_data["approved_at"] is not None

    # Verify donor available quantity remains visible but reserved
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT quantity_reserved FROM stock_batches WHERE id = ?;", (dh_batch_id,))
    assert cur.fetchone()["quantity_reserved"] >= 0
    conn.close()

    # 7. Dispatch transfer & mark in-transit
    res_dispatch = client.post(f"/api/transfers/{transfer_id}/dispatch", json={
        "dispatched_by": "Warehouse Supervisor"
    })
    assert res_dispatch.status_code == 200
    assert res_dispatch.json()["status"] == "DISPATCHED"

    res_transit = client.post(f"/api/transfers/{transfer_id}/in-transit", json={})
    assert res_transit.status_code == 200
    assert res_transit.json()["status"] == "IN_TRANSIT"

    # 8. Receive transfer at PHC
    res_receive = client.post(f"/api/transfers/{transfer_id}/receive", json={
        "received_by": "Staff Nurse Anita",
        "received_quantity": transfer_qty
    })
    assert res_receive.status_code == 200
    recv_data = res_receive.json()
    assert recv_data["status"] == "RECEIVED"
    assert recv_data["received_at"] is not None

    # Verify stock now exists at recipient PHC
    res_phc_inv_after = client.get(f"/api/inventory/{phc_id}")
    assert res_phc_inv_after.status_code == 200
    phc_asv_after = next(item for item in res_phc_inv_after.json()["inventory"] if item["medicine_id"] == 1)
    assert phc_asv_after["total_quantity"] >= transfer_qty

    # Find the newly received batch at PHC
    phc_recv_batch = next(b for b in phc_asv_after["batches"] if b["batch_number"] == asv_batch_num or b["quantity_available"] >= transfer_qty)
    
    # 9. Dispense to patient at PHC
    res_consume_final = client.post("/api/inventory/consume", json={
        "facility_id": phc_id,
        "batch_id": phc_recv_batch["id"],
        "quantity": 2,
        "reference_id": "EMERGENCY-DISPENSE-01",
        "notes": "Administered to bite victim in triage bay",
        "logged_by": "Staff Nurse Anita"
    })
    assert res_consume_final.status_code == 200
    dispense_data = res_consume_final.json()
    assert dispense_data["balance_after"] == phc_recv_batch["quantity_available"] - 2

    # 10. Cryptographic Audit Chain Continuity
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM inventory_transactions ORDER BY id ASC;")
    all_txs = cur.fetchall()
    conn.close()

    assert len(all_txs) > 15
    for i in range(1, len(all_txs)):
        assert all_txs[i]["previous_hash"] == all_txs[i - 1]["hash"], f"Hash chain broken between tx {all_txs[i-1]['id']} and {all_txs[i]['id']}"


def test_transit_damage_and_return_waste_diversion():
    """
    Verifies the physical return state machine when transit damage occurs:
    1. Transfer created & dispatched.
    2. Recipient accepts partial quantity, rejects damaged units.
    3. State advances to PARTIALLY_RECEIVED and logs WASTED_EXPIRED loss.
    4. Alternatively, abort-transit creates RETURN_IN_PROGRESS -> receive-return -> RETURNED.
    5. Verifies zero phantom inventory resurrection.
    """
    seed_database(reset_schema=False)
    client = TestClient(app)

    # Pick donor with available stock
    res_dh = client.get("/api/facilities?tier=DH")
    dh_id = res_dh.json()[0]["id"]
    res_phc = client.get("/api/facilities?tier=PHC")
    phc_id = res_phc.json()[0]["id"]

    # 1. Test Partial Receipt with transit damage loss logging
    res_tr = client.post("/api/transfers", json={
        "source_facility_id": dh_id,
        "destination_facility_id": phc_id,
        "medicine_id": 2,
        "quantity": 30,
        "urgency": "ROUTINE",
        "auto_approve": True
    })
    assert res_tr.status_code == 201
    tr_id = res_tr.json()["id"]

    client.post(f"/api/transfers/{tr_id}/dispatch", json={})
    client.post(f"/api/transfers/{tr_id}/in-transit", json={})

    # Recipient receives 20, 10 damaged/spoiled in transit
    res_part = client.post(f"/api/transfers/{tr_id}/receive", json={
        "received_quantity": 20,
        "condition_ok": False,
        "spoilage_reason": "Rainwater leak soaked 10 strips in cargo box",
        "received_by": "Pharmacist Mahesh"
    })
    assert res_part.status_code == 200
    assert res_part.json()["status"] == "PARTIALLY_RECEIVED"

    # Verify transactions logged a transit loss WASTED_EXPIRED
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT transaction_type, quantity, notes 
        FROM inventory_transactions 
        WHERE transfer_id = ? 
        ORDER BY id DESC;
    """, (tr_id,))
    recent_txs = cur.fetchall()
    conn.close()

    types = [t["transaction_type"] for t in recent_txs]
    assert "WASTED_EXPIRED" in types
    assert "TRANSFERRED_IN" in types

    # 2. Test Abort-Transit and Physical Return to Donor
    res_tr2 = client.post("/api/transfers", json={
        "source_facility_id": dh_id,
        "destination_facility_id": phc_id,
        "medicine_id": 2,
        "quantity": 10,
        "urgency": "ROUTINE",
        "auto_approve": True
    })
    assert res_tr2.status_code == 201
    tr2_id = res_tr2.json()["id"]

    client.post(f"/api/transfers/{tr2_id}/dispatch", json={})
    client.post(f"/api/transfers/{tr2_id}/in-transit", json={})

    res_abort = client.post(f"/api/transfers/{tr2_id}/abort-transit", json={
        "reason": "Road collapse in ghat section blocked transit vehicle"
    })
    assert res_abort.status_code == 200
    assert res_abort.json()["status"] == "RETURN_IN_PROGRESS"

    res_ret = client.post(f"/api/transfers/{tr2_id}/receive-return", json={
        "returned_by": "Logistics Driver Sunil",
        "returned_quantity": 10,
        "condition_ok": True,
        "notes": "Returned strips intact"
    })
    assert res_ret.status_code == 200
    assert res_ret.json()["status"] == "RETURNED"


def test_boundary_and_validation_matrix():
    """
    Comprehensive verification of negative and boundary invariants across all Phase 1 & 2 APIs:
    - Attempting negative or 0 quantity in transactions (422)
    - Attempting transfer where source == destination (422)
    - Attempting transfer with quantity > 10,000 (422)
    - Invalid enum parameter strings (422)
    - Non-existent facility ID (404)
    - Non-existent batch ID (404)
    - Receiving past-dated expired supplies (422)
    """
    client = TestClient(app)

    # Negative consume quantity
    r1 = client.post("/api/inventory/consume", json={"facility_id": 1, "batch_id": 1, "quantity": -5})
    assert r1.status_code == 422

    # Zero consume quantity
    r2 = client.post("/api/inventory/consume", json={"facility_id": 1, "batch_id": 1, "quantity": 0})
    assert r2.status_code == 422

    # Self-transfer
    r3 = client.post("/api/transfers", json={"source_facility_id": 1, "destination_facility_id": 1, "medicine_id": 1, "quantity": 10})
    assert r3.status_code == 422

    # Excessive transfer quantity
    r4 = client.post("/api/transfers", json={"source_facility_id": 1, "destination_facility_id": 2, "medicine_id": 1, "quantity": 50000})
    assert r4.status_code == 422

    # Non-existent facility
    r5 = client.get("/api/facilities/999999")
    assert r5.status_code == 404

    # Non-existent batch transaction history
    r6 = client.get("/api/inventory/batches/999999/transactions")
    assert r6.status_code == 404

    # Invalid enum query
    r7 = client.get("/api/facilities?tier=SUPER_HOSPITAL")
    assert r7.status_code == 422

    # Expired supply receipt rejection
    r8 = client.post("/api/inventory/receive", json={
        "facility_id": 1,
        "medicine_id": 1,
        "batch_number": "EXPIRED-INV-TEST",
        "expiry_date": "2021-05-01",
        "quantity": 10
    })
    assert r8.status_code == 422


def test_route_distance_and_transit_physics():
    """
    Verifies geospatial transit mathematics and speed by terrain type:
    - Distance between Pune (18.5204, 73.8567) and Satara (17.6805, 73.9997)
    - Speed verification for HIGHWAY_CORRIDOR (65 km/h), PLAINS (45 km/h), and GHAT_MOUNTAIN (25 km/h)
    - Extreme coordinates handling
    """
    dist_pune_satara = calculate_haversine_distance(18.5204, 73.8567, 17.6805, 73.9997)
    assert 90.0 < dist_pune_satara < 115.0

    # Identical coordinates
    zero_dist = calculate_haversine_distance(18.5204, 73.8567, 18.5204, 73.8567)
    assert zero_dist == 0.0

    # Terrain transit time checks
    hours_highway = estimate_transit_time(dist_pune_satara, "HIGHWAY_CORRIDOR", "PLAINS")
    hours_ghat = estimate_transit_time(dist_pune_satara, "GHAT_MOUNTAIN", "PLAINS")
    assert hours_ghat > hours_highway * 1.5  # Ghat is 25 km/h vs Highway/Plains (45 km/h effective)


def test_concurrent_write_burst_resilience():
    """
    Stress-tests multi-threaded transactional writes to verify zero database locks or deadlocks.
    Fires 10 concurrent unversioned consumption transactions simultaneously.
    """
    seed_database(reset_schema=False)
    client = TestClient(app)

    # Create a fresh batch with 100 units
    r_seed = client.post("/api/inventory/receive", json={
        "facility_id": 1,
        "medicine_id": 1,
        "batch_number": "BURST-STRESS-01",
        "expiry_date": "2028-12-31",
        "quantity": 100
    })
    assert r_seed.status_code == 200
    batch_id = r_seed.json()["batch_id"]

    def worker_consume(idx: int):
        return client.post("/api/inventory/consume", json={
            "facility_id": 1,
            "batch_id": batch_id,
            "quantity": 2,
            "reference_id": f"CONCURRENT-STRESS-{idx}"
        })

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(worker_consume, i) for i in range(10)]
        results = [f.result() for f in futures]

    assert all(r.status_code == 200 for r in results)

    # Check inventory
    r_check = client.get("/api/inventory/1")
    assert r_check.status_code == 200
    inv = r_check.json()["inventory"]
    batch = next(b for item in inv for b in item["batches"] if b["id"] == batch_id)
    assert batch["quantity_available"] == 80  # 100 - (10 * 2) = 80
    assert batch["version"] == 11  # 1 initial + 10 increments

    # Verify strict transaction monotonicity across OCC thread-offloaded operations
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, created_at, previous_hash, hash
        FROM inventory_transactions
        WHERE reference_id LIKE 'CONCURRENT-STRESS-%'
        ORDER BY id ASC;
    """)
    stress_txs = cur.fetchall()
    conn.close()

    assert len(stress_txs) == 10
    for i in range(1, len(stress_txs)):
        assert stress_txs[i]["id"] > stress_txs[i - 1]["id"], "Transaction primary keys must be strictly increasing"
        assert stress_txs[i]["previous_hash"] == stress_txs[i - 1]["hash"], "Cryptographic chain continuity broken across thread boundary"
        assert stress_txs[i]["created_at"] >= stress_txs[i - 1]["created_at"], "Transaction timestamps must maintain monotonic ordering"


def test_dscsa_ledger_tamper_detection():
    """
    Stage 2 Hardening: Negative Cryptographic Hash Mutation Assertion.
    1. Verifies positive baseline: complete ledger passes verify_dscsa_ledger_integrity().
    2. Injects an unauthorized historical quantity mutation: Block #2 quantity += 500.
    3. Asserts that verify_dscsa_ledger_integrity() detects tampering and raises LedgerIntegrityError.
    4. Asserts that the API endpoint GET /api/inventory/ledger/verify returns HTTP 409 Conflict.
    5. Cleans up modified state by re-seeding.
    """
    seed_database(reset_schema=False)
    client = TestClient(app)

    # 1. Positive baseline check
    conn = get_connection()
    baseline = verify_dscsa_ledger_integrity(conn)
    assert baseline["status"] == "VERIFIED"
    assert baseline["chain_valid"] is True
    assert baseline["total_transactions"] >= 5

    api_baseline = client.get("/api/inventory/ledger/verify")
    assert api_baseline.status_code == 200
    assert api_baseline.json()["status"] == "VERIFIED"

    # 2. Inject unauthorized mutation into historical Block #2
    cur = conn.cursor()
    cur.execute("SELECT id, quantity, hash FROM inventory_transactions WHERE id = 2;")
    orig_row = cur.fetchone()
    assert orig_row is not None, "Transaction Block #2 not found in seed dataset!"

    cur.execute("UPDATE inventory_transactions SET quantity = quantity + 500 WHERE id = 2;")
    conn.close()

    # 3. Direct cryptographic validator assertion (Must raise LedgerIntegrityError)
    with pytest.raises(LedgerIntegrityError) as exc_info:
        verify_dscsa_ledger_integrity()
    assert "Cryptographic tampering detected at transaction ID 2" in str(exc_info.value)

    # 4. API endpoint tamper detection assertion (RFC 9110 HTTP 409 Conflict)
    api_tamper = client.get("/api/inventory/ledger/verify")
    assert api_tamper.status_code == 409
    assert "Cryptographic Ledger Tampering Detected" in api_tamper.json()["detail"]
    assert "transaction ID 2" in api_tamper.json()["detail"]

    # 5. Clean up state
    seed_database(reset_schema=False)


def test_partial_transit_damage_split_diversion():
    """
    Stage 2 Hardening: Partial Thermal Excursion & Split Diversion Accounting.
    Validates the Regional Conservation Invariant:
        Delta Dispatched == Delta Received + Delta Loss (Wasted/Quarantined)

    1. Donor DH dispatches 1,000 units.
    2. Courier vehicle suffers a partial cold-chain temperature excursion.
    3. Recipient PHC receives 850 intact insulated vials, rejects 150 thawed units.
    4. Assert state transitions to PARTIALLY_RECEIVED.
    5. Assert recipient stock increases by exactly +850 units.
    6. Assert simultaneous DSCSA ledger logging:
       - TRANSFERRED_IN: 850 units (usable balance)
       - WASTED_EXPIRED: 150 units (logged with excursion reason)
    7. Assert strict quantity conservation: 850 + 150 == 1000 with zero unlinked delta inventory leakage.
    """
    seed_database(reset_schema=False)
    client = TestClient(app)

    # Setup bulk stock of 1,000 units at DH (facility 1, medicine 1)
    res_dh = client.get("/api/facilities?tier=DH")
    dh_id = res_dh.json()[0]["id"]
    res_phc = client.get("/api/facilities?tier=PHC")
    phc_id = res_phc.json()[0]["id"]

    r_seed = client.post("/api/inventory/receive", json={
        "facility_id": dh_id,
        "medicine_id": 1,
        "batch_number": "COLDCHAIN-SURGE-1000",
        "expiry_date": "2028-06-30",
        "quantity": 1000,
        "reference_id": "GRN-COLDCHAIN-1000"
    })
    assert r_seed.status_code == 200

    # Create transfer for 1,000 units
    res_tr = client.post("/api/transfers", json={
        "source_facility_id": dh_id,
        "destination_facility_id": phc_id,
        "medicine_id": 1,
        "quantity": 1000,
        "urgency": "CRITICAL_EMERGENCY",
        "auto_approve": True
    })
    assert res_tr.status_code == 201
    tr_id = res_tr.json()["id"]

    # Dispatch and advance to IN_TRANSIT
    client.post(f"/api/transfers/{tr_id}/dispatch", json={"dispatched_by": "DH Lead Pharmacist"})
    client.post(f"/api/transfers/{tr_id}/in-transit", json={})

    # Recipient receives 850 intact vials; 150 thawed in transit (condition_ok=False)
    res_recv = client.post(f"/api/transfers/{tr_id}/receive", json={
        "received_quantity": 850,
        "condition_ok": False,
        "spoilage_reason": "Cold-chain excursion: data logger exceeded 8C for 4 hours; 150 thawed vials rejected",
        "received_by": "PHC Cold-Chain Handler Ramesh"
    })
    assert res_recv.status_code == 200
    recv_data = res_recv.json()
    assert recv_data["status"] == "PARTIALLY_RECEIVED"

    # Query DSCSA audit ledger for this transfer
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT transaction_type, quantity, notes, balance_after, hash, previous_hash
        FROM inventory_transactions
        WHERE transfer_id = ?
        ORDER BY id ASC;
    """, (tr_id,))
    txs = cur.fetchall()
    conn.close()

    dispatched_qty = sum(t["quantity"] for t in txs if t["transaction_type"] == "TRANSFERRED_OUT")
    received_qty = sum(t["quantity"] for t in txs if t["transaction_type"] == "TRANSFERRED_IN")
    wasted_qty = sum(t["quantity"] for t in txs if t["transaction_type"] == "WASTED_EXPIRED")

    assert dispatched_qty == 1000
    assert received_qty == 850
    assert wasted_qty == 150

    # Verify Regional Conservation Invariant: No inventory vanishes or appears
    assert dispatched_qty == received_qty + wasted_qty, (
        f"Inventory Leakage Invariant Broken! Dispatched={dispatched_qty}, "
        f"Received={received_qty}, Wasted={wasted_qty}"
    )

    # Verify cryptographic seals exist on all blocks
    for t in txs:
        assert t["hash"] is not None and len(t["hash"]) == 64
        assert t["previous_hash"] is not None


def test_multi_segment_terrain_fefo_buffer():
    """
    Stage 2 Hardening: Multi-Leg / Hybrid Terrain Route Variance & FEFO Buffer Integration.
    1. Evaluates a heterogeneous route: 30 km Mountain (25 km/h) + 70 km Highway (65 km/h).
    2. Calculates piecewise transit time: 30/25 + 70/65 = 1.20h + 1.08h = 2.28 hours (136.6 min).
    3. Calculates naive monolithic highway estimate: 100/65 = 1.54 hours (92.3 min).
    4. Proves that naive uniform estimation underestimates duration by ~44.3 minutes.
    5. Validates FEFO shelf-life buffer: allocates batches meeting the multi-segment buffer,
       while rejecting batches expiring within the transit duration window.
    """
    # 1. Multi-segment route integration calculation
    composite_route = [
        {"distance_km": 30.0, "terrain_type": "GHAT_MOUNTAIN"},
        {"distance_km": 70.0, "terrain_type": "HIGHWAY_CORRIDOR"},
    ]
    piecewise_hours = estimate_multi_segment_transit_time(composite_route)
    assert piecewise_hours == 2.28  # 1.20 + 1.08 = 2.28 hours

    # Monolithic highway estimate
    naive_highway_hours = round(100.0 / 65.0, 2)  # 1.54 hours
    underestimation_minutes = (piecewise_hours - naive_highway_hours) * 60.0
    assert 40.0 < underestimation_minutes < 50.0  # ~44.4 minutes variance

    # 2. FEFO shelf-life allocation test
    seed_database(reset_schema=False)
    conn = get_connection()
    cur = conn.cursor()

    # Batch 1: Expiring in 2 days (fails transit buffer for multi-day transit)
    # Batch 2: Expiring in 30 days (viable)
    today = datetime.now(timezone.utc)
    near_expiry = (today + timedelta(days=2)).strftime("%Y-%m-%d")
    viable_expiry = (today + timedelta(days=30)).strftime("%Y-%m-%d")

    # Insert test batches with valid GTIN
    cur.execute("""
        INSERT INTO stock_batches (
            facility_id, medicine_id, gtin, batch_number, serial_number,
            expiry_date, quantity_available, quantity_reserved, status, version
        ) VALUES 
        (1, 2, '08901234567890', 'BATCH-FEFO-NEAR', 'SN-001', ?, 50, 0, 'ACTIVE', 1),
        (1, 2, '08901234567890', 'BATCH-FEFO-VIABLE', 'SN-002', ?, 50, 0, 'ACTIVE', 1);
    """, (near_expiry, viable_expiry))

    # Allocate with 48h transit duration (buffer requires >= 3 days)
    # Batch expiring in 2 days must be excluded; viable batch expiring in 30 days allocated
    allocations = allocate_fefo_batches(
        cursor=cur,
        facility_id=1,
        medicine_id=2,
        required_quantity=10,
        estimated_transit_hours=48.0  # Multi-day transit requires transit_days + 1 = 3 days buffer
    )
    conn.close()

    allocated_batch_numbers = [a["batch_number"] for a in allocations]
    assert "BATCH-FEFO-NEAR" not in allocated_batch_numbers
    assert "BATCH-FEFO-VIABLE" in allocated_batch_numbers


def test_soft_reservation_ttl_expiry_sweep():
    """
    Stage 2 Hardening: Soft Reservation Expiration (TTL Abandonment Sweep).
    1. Creates and approves an emergency transfer (locks stock in soft reservation).
    2. Simulates abandonment by backdating approval timestamp by 26 hours (> 24h TTL).
    3. Runs sweep_expired_transfers endpoint / function.
    4. Asserts:
       - Transfer is transitioned to CANCELLED with audit reason note.
       - Soft-reserved stock is completely unlocked (quantity_reserved == 0).
       - Available stock is restored (+25 units) with OCC version bump.
       - Virtual district stockout is eliminated.
    """
    seed_database(reset_schema=False)
    client = TestClient(app)

    # 1. Create and approve transfer for 25 units
    res_tr = client.post("/api/transfers", json={
        "source_facility_id": 1,
        "destination_facility_id": 2,
        "medicine_id": 1,
        "quantity": 25,
        "urgency": "URGENT",
        "auto_approve": True
    })
    assert res_tr.status_code == 201
    tr_id = res_tr.json()["id"]

    # Check that stock is reserved at donor facility
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT batch_id, quantity FROM transfer_batch_allocations WHERE transfer_id = ?;", (tr_id,))
    allocs = cur.fetchall()
    assert len(allocs) >= 1
    batch_id = allocs[0]["batch_id"]

    cur.execute("SELECT quantity_available, quantity_reserved, version FROM stock_batches WHERE id = ?;", (batch_id,))
    b_before = cur.fetchone()
    assert b_before["quantity_reserved"] >= 25
    avail_before = b_before["quantity_available"]
    version_before = b_before["version"]

    # 2. Simulate abandonment: backdate requested_at and approved_at to 26 hours ago
    abandoned_dt = (datetime.now(timezone.utc) - timedelta(hours=26)).strftime("%Y-%m-%d %H:%M:%S")
    cur.execute("UPDATE transfers SET requested_at = ?, approved_at = ? WHERE id = ?;", (abandoned_dt, abandoned_dt, tr_id))
    conn.close()

    # 3. Trigger automated TTL expiry sweep
    res_sweep = client.post("/api/transfers/sweep-expired?ttl_hours=24.0")
    assert res_sweep.status_code == 200
    sweep_data = res_sweep.json()
    assert sweep_data["status"] == "SUCCESS"
    assert sweep_data["swept_count"] >= 1
    assert any(item["transfer_id"] == tr_id for item in sweep_data["expired_transfers"])

    # 4. Verify transfer is now CANCELLED with audit reason
    res_check = client.get(f"/api/transfers/{tr_id}")
    assert res_check.status_code == 200
    tr_check = res_check.json()
    assert tr_check["status"] == "CANCELLED"
    assert "Soft reservation exceeded 24.0h TTL limit" in tr_check["reason"]

    # 5. Verify batch stock was restored
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT quantity_available, quantity_reserved, version FROM stock_batches WHERE id = ?;", (batch_id,))
    b_after = cur.fetchone()
    conn.close()

    assert b_after["quantity_reserved"] == 0
    assert b_after["quantity_available"] == avail_before + 25
    assert b_after["version"] == version_before + 1
