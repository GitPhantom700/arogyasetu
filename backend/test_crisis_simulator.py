"""
Automated Test Suite for Crisis & Outbreak Simulation Engine.
Build with AI: Code for Communities (Second Edition) - Track 03 Smart Health & Supply Chain Resilience.
Day 16: Microtask 5.1 — Crisis & Outbreak Simulation Engine.
"""

import pytest
import sqlite3
from pathlib import Path
from fastapi.testclient import TestClient

from main import app
from database import get_db_path, get_connection, verify_dscsa_ledger_integrity
from crisis_simulator import crisis_simulator_service, PRESET_SCENARIOS

client = TestClient(app)


def test_get_crisis_scenarios():
    """Verify that all authentic crisis scenarios are surfaced with complete metadata."""
    response = client.get("/api/crisis/scenarios")
    assert response.status_code == 200
    scenarios = response.json()
    assert len(scenarios) == 4

    scenario_ids = [s["scenario_id"] for s in scenarios]
    assert "MONSOON_FLOOD_SOUTH_SATARA" in scenario_ids
    assert "LEPTOSPIROSIS_PUNE_GHATS" in scenario_ids
    assert "HEATWAVE_PLAINS_SHIRUR" in scenario_ids
    assert "RABIES_CANINE_CLUSTER" in scenario_ids

    monsoon = next(s for s in scenarios if s["scenario_id"] == "MONSOON_FLOOD_SOUTH_SATARA")
    assert monsoon["monsoon_mode"] is True
    assert monsoon["severity"] == "EMERGENCY"
    assert "MED-ASV-01" in monsoon["medicine_spikes"]


def test_initial_crisis_status():
    """Verify that initially or after reset, no crisis simulation is active."""
    # Ensure clean slate
    client.post("/api/crisis/reset")
    response = client.get("/api/crisis/status")
    assert response.status_code == 200
    data = response.json()
    assert data["is_active"] is False
    assert data["active_scenario_id"] is None


def test_trigger_monsoon_crisis_lifecycle():
    """
    Test complete lifecycle of Monsoon Flooding crisis:
    1. Check initial baseline stock for target facilities.
    2. Trigger crisis simulation.
    3. Verify acute FEFO depletion occurred and status is ACTIVE.
    4. Verify DSCSA cryptographic hash chain remains 100% valid.
    5. Verify crisis status reports active.
    6. Reset simulation and verify stock is accurately restored to baseline.
    7. Verify DSCSA hash chain remains 100% valid after reset.
    """
    db_path = get_db_path()

    # 1. Inspect pre-crisis stock for South Satara Anti-Snake Venom (MED-ASV-01)
    conn = get_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT COALESCE(SUM(sb.quantity_available), 0) AS total_asv
        FROM stock_batches sb
        JOIN facilities f ON f.id = sb.facility_id
        JOIN medicines m ON m.id = sb.medicine_id
        WHERE f.facility_code = 'PHC-SAT-01' AND m.sku = 'MED-ASV-01' AND sb.status = 'ACTIVE';
    """)
    initial_asv_stock = cursor.fetchone()["total_asv"]
    conn.close()

    # 2. Trigger crisis
    trigger_resp = client.post("/api/crisis/trigger", json={
        "scenario_id": "MONSOON_FLOOD_SOUTH_SATARA",
        "intensity": 1.0,
        "auto_generate_rebalance": True
    })
    assert trigger_resp.status_code == 200
    res_data = trigger_resp.json()
    assert res_data["status"] == "ACTIVE"
    assert res_data["scenario_id"] == "MONSOON_FLOOD_SOUTH_SATARA"
    assert res_data["affected_facilities_count"] > 0
    assert res_data["total_units_consumed"] > 0
    assert res_data["alerts_broadcast"] > 0
    assert res_data["monsoon_multiplier_active"] is True

    # 3. Verify stock was depleted
    conn = get_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT COALESCE(SUM(sb.quantity_available), 0) AS total_asv
        FROM stock_batches sb
        JOIN facilities f ON f.id = sb.facility_id
        JOIN medicines m ON m.id = sb.medicine_id
        WHERE f.facility_code = 'PHC-SAT-01' AND m.sku = 'MED-ASV-01' AND sb.status = 'ACTIVE';
    """)
    post_crisis_asv = cursor.fetchone()["total_asv"]
    conn.close()
    assert post_crisis_asv < initial_asv_stock

    # 4. Verify DSCSA ledger cryptographic chain integrity
    integrity = verify_dscsa_ledger_integrity(db_path=db_path)
    assert integrity["chain_valid"] is True
    assert integrity["status"] == "VERIFIED"

    # 5. Check status endpoint
    status_resp = client.get("/api/crisis/status")
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    assert status_data["is_active"] is True
    assert status_data["active_scenario_id"] == "MONSOON_FLOOD_SOUTH_SATARA"

    # 6. Reset crisis simulation
    reset_resp = client.post("/api/crisis/reset")
    assert reset_resp.status_code == 200
    reset_data = reset_resp.json()
    assert reset_data["status"] == "RESET"
    assert reset_data["restored_batches_count"] > 0

    # 7. Verify stock restored to exact baseline
    conn = get_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT COALESCE(SUM(sb.quantity_available), 0) AS total_asv
        FROM stock_batches sb
        JOIN facilities f ON f.id = sb.facility_id
        JOIN medicines m ON m.id = sb.medicine_id
        WHERE f.facility_code = 'PHC-SAT-01' AND m.sku = 'MED-ASV-01' AND sb.status = 'ACTIVE';
    """)
    restored_asv_stock = cursor.fetchone()["total_asv"]
    conn.close()
    assert restored_asv_stock == initial_asv_stock

    # 8. Verify ledger integrity after reset
    integrity_after_reset = verify_dscsa_ledger_integrity(db_path=db_path)
    assert integrity_after_reset["chain_valid"] is True
    assert integrity_after_reset["status"] == "VERIFIED"


def test_trigger_invalid_scenario():
    """Verify 404 error when triggering a non-existent scenario."""
    response = client.post("/api/crisis/trigger", json={
        "scenario_id": "NON_EXISTENT_SCENARIO_XYZ",
        "intensity": 1.0
    })
    assert response.status_code == 404
    assert "Unknown crisis scenario" in response.json()["detail"]


def test_swarm_dispatch_crisis():
    """Verify batch authorization of crisis redistribution plans."""
    # Find active donor with stock
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT f.id, f.name FROM facilities f
        JOIN stock_batches sb ON sb.facility_id = f.id
        WHERE sb.quantity_available > 50
        LIMIT 1;
    """)
    donor = cursor.fetchone()
    donor_id = donor["id"] if donor else 1

    cursor.execute("SELECT id FROM facilities WHERE id != ? LIMIT 1;", (donor_id,))
    recipient_id = cursor.fetchone()["id"]

    cursor.execute("SELECT id FROM medicines LIMIT 1;")
    med_id = cursor.fetchone()["id"]
    conn.close()

    plans = [{
        "recommendation_id": "REC-TEST-SWARM-01",
        "recipient_facility_id": recipient_id,
        "donor_facility_id": donor_id,
        "medicine_id": med_id,
        "quantity": 5,
        "reason": "Emergency Swarm Rebalancing Test"
    }]

    response = client.post("/api/crisis/swarm-dispatch", json=plans)
    assert response.status_code == 200
    data = response.json()
    assert data["dispatched_count"] >= 0


def test_durable_sqlite_snapshot_persistence_across_process_restart():
    """
    Remediation 1 Verification:
    Verify that pre-crisis baseline snapshot is durably stored in SQLite crisis_snapshots,
    and survives in-memory state wiping (simulating container restart/process recycling).
    """
    # 1. Trigger a crisis
    trigger_resp = client.post("/api/crisis/trigger", json={
        "scenario_id": "HEATWAVE_PLAINS_SHIRUR",
        "intensity": 1.0,
        "auto_generate_rebalance": False
    })
    assert trigger_resp.status_code == 200

    # 2. Simulate complete Python worker restart by clearing in-memory singleton caches
    crisis_simulator_service._active_simulation = None
    crisis_simulator_service._snapshot_batches = None
    crisis_simulator_service._cached_rebalance_plans = []

    # 3. GET /status must recover active scenario from SQLite crisis_snapshots
    status_resp = client.get("/api/crisis/status")
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    assert status_data["is_active"] is True
    assert status_data["active_scenario_id"] == "HEATWAVE_PLAINS_SHIRUR"

    # 4. POST /reset must recover snapshot from SQLite and restore all batches
    reset_resp = client.post("/api/crisis/reset")
    assert reset_resp.status_code == 200
    reset_data = reset_resp.json()
    assert reset_data["status"] == "RESET"
    assert reset_data["restored_batches_count"] > 0
    assert reset_data.get("audit_corrections_recorded", 0) > 0

    # 5. Status must now report inactive
    status_after = client.get("/api/crisis/status").json()
    assert status_after["is_active"] is False


def test_reset_records_line_item_audit_corrections():
    """
    Remediation 2 Verification:
    Verify that simulation reset records line-item AUDIT_CORRECTION transactions
    for every altered batch, eliminating DSCSA ledger discrepancies.
    """
    db_path = get_db_path()

    # 1. Trigger crisis
    trigger_resp = client.post("/api/crisis/trigger", json={
        "scenario_id": "LEPTOSPIROSIS_PUNE_GHATS",
        "intensity": 1.0,
        "auto_generate_rebalance": False
    })
    assert trigger_resp.status_code == 200
    res_data = trigger_resp.json()
    assert res_data["total_units_consumed"] > 0

    # 2. Reset crisis
    reset_resp = client.post("/api/crisis/reset")
    assert reset_resp.status_code == 200
    reset_data = reset_resp.json()
    assert reset_data["audit_corrections_recorded"] > 0

    # 3. Verify line-item transactions in database
    conn = get_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT COUNT(*) AS c
        FROM inventory_transactions
        WHERE transaction_type = 'AUDIT_CORRECTION' AND reference_id LIKE 'CRISIS-RESET-%';
    """)
    audit_tx_count = cursor.fetchone()["c"]
    conn.close()
    assert audit_tx_count >= reset_data["audit_corrections_recorded"]

    # 4. Verify DSCSA cryptographic hash chain continuity
    integrity = verify_dscsa_ledger_integrity(db_path=db_path)
    assert integrity["chain_valid"] is True
    assert integrity["status"] == "VERIFIED"


def test_swarm_dispatch_anti_cannibalization_donor_protection():
    """
    Remediation 3 Verification:
    Verify that /api/crisis/swarm-dispatch checks live donor stock between sequential transfers
    and rejects plans that would breach the donor's 14-day / 21-day retention buffer.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Find a donor with known stock
    cursor.execute("""
        SELECT f.id as donor_id, f.name, sb.medicine_id, m.name as med_name,
               m.min_safety_stock,
               COALESCE(SUM(sb.quantity_available), 0) as total_stock
        FROM facilities f
        JOIN stock_batches sb ON sb.facility_id = f.id
        JOIN medicines m ON m.id = sb.medicine_id
        WHERE sb.status = 'ACTIVE'
        GROUP BY f.id, sb.medicine_id
        HAVING total_stock >= 30 AND total_stock <= 80
        LIMIT 1;
    """)
    row = cursor.fetchone()
    assert row is not None, "Need a donor with 30-80 units of stock for cannibalization test"
    donor_id = row["donor_id"]
    med_id = row["medicine_id"]
    total_stock = row["total_stock"]
    daily_burn = 2.0
    min_safety = row["min_safety_stock"] or 20

    # Find two distinct recipients
    cursor.execute("SELECT id FROM facilities WHERE id != ? LIMIT 2;", (donor_id,))
    recipients = cursor.fetchall()
    recip_1 = recipients[0]["id"]
    recip_2 = recipients[1]["id"]
    conn.close()

    # Propose two transfers that collectively exceed the donor's safe surplus
    # Safe buffer = max(min_safety, 14 * daily_burn)
    safe_reserve = max(min_safety, int(daily_burn * 14))
    safe_surplus = max(0, total_stock - safe_reserve)

    plan1_qty = max(1, safe_surplus)
    plan2_qty = max(5, int(total_stock * 0.5))  # This second transfer MUST be skipped to prevent starvation

    plans = [
        {
            "recommendation_id": "REC-SWARM-01",
            "recipient_facility_id": recip_1,
            "donor_facility_id": donor_id,
            "medicine_id": med_id,
            "quantity": plan1_qty,
            "reason": "Routine Swarm Transfer 1"
        },
        {
            "recommendation_id": "REC-SWARM-02",
            "recipient_facility_id": recip_2,
            "donor_facility_id": donor_id,
            "medicine_id": med_id,
            "quantity": plan2_qty,
            "reason": "Over-extending Swarm Transfer 2 (Should be Skipped)"
        }
    ]

    response = client.post("/api/crisis/swarm-dispatch", json=plans)
    assert response.status_code == 200
    data = response.json()

    # The second transfer must be skipped due to donor buffer protection
    assert data["skipped_count"] >= 1 or any("retention buffer violation" in str(s) for s in data.get("skipped", []))

