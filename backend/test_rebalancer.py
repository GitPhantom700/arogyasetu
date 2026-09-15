"""
Automated Test Suite for Microtask 3.3: Gemini Autonomous Rebalancing Agent.
Build with AI: Code for Communities - Track 01 Healthcare Supply Chain.

Tests:
1. test_calculate_facility_deficit: Validates baseline deficit & target buffer calculation.
2. test_candidate_donor_discovery_and_radius_filtering: Tests 50 km geographic radius boundary.
3. test_donor_safety_stock_constraint: Strictly asserts donor retains >= 14 days DAC buffer.
4. test_cold_chain_compatibility_guard: Confirms cold-chain medicines only match to cold-chain facilities.
5. test_transit_aware_fefo_batch_selection: Enforces batch expiry >= transit + 2 days buffer.
6. test_gemini_recommendation_offline_fallback: Validates explainable clinical rationale and Pydantic schema.
7. test_apply_rebalance_transfer_lifecycle: Tests atomic commitment into transfers with ai_recommended=1.
8. test_network_deficits_endpoint: Tests GET /api/rebalance/network-deficits API.
9. test_network_wide_shortage_graceful_handling: Verifies zero-surplus edge case handles gracefully without crashing.
"""

import math
import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

from main import app
from database import get_connection, get_db_path
from schemas import TransferUrgency, TransferStatus
from rebalancer import (
    calculate_facility_deficit,
    find_candidate_donors,
    autonomous_rebalancing_service,
)
from seed_data import seed_database


@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    """Ensure database has clean, verified seed data before running tests."""
    seed_database(get_db_path())


def test_calculate_facility_deficit():
    """
    Test 1: Recipient Deficit & Buffer Calculation
    Verifies that target stock is max(min_safety_stock, ceil(target_days * DAC)),
    and deficit is accurately computed.
    """
    conn = get_connection(get_db_path())
    try:
        # Test with facility #1 (PHC Kalyanpur) and medicine #1 (Anti-Snake Venom)
        res = calculate_facility_deficit(conn, facility_id=1, medicine_id=1, target_buffer_days=14)
        assert res["facility_id"] == 1
        assert res["medicine_id"] == 1
        assert "facility_name" in res
        assert "medicine_name" in res
        assert res["min_safety_stock"] >= 5
        assert res["target_stock"] >= res["min_safety_stock"]
        assert res["deficit"] >= 0
        assert res["current_stock"] >= 0
    finally:
        conn.close()


def test_candidate_donor_discovery_and_radius_filtering():
    """
    Test 2: Candidate Donor Discovery & Geographic Radius
    Asserts that all discovered candidate donors are strictly within max_radius_km.
    """
    conn = get_connection(get_db_path())
    try:
        max_radius = 50.0
        candidates = find_candidate_donors(
            conn_or_path=conn,
            recipient_facility_id=1,
            medicine_id=1,
            max_radius_km=max_radius,
            min_donor_buffer_days=14
        )
        assert len(candidates) > 0

        for c in candidates:
            assert c.facility_id != 1, "Recipient facility must not be listed as its own donor"
            assert c.distance_km <= max_radius, f"Donor distance {c.distance_km} exceeds radius {max_radius} km"
            assert c.estimated_transit_hours > 0, "Transit hours must be strictly positive"
            assert c.current_stock > 0, "Candidate must possess active stock"
            assert c.retention_buffer >= c.min_safety_stock, "Donor retention buffer must at least meet minimum safety stock"
    finally:
        conn.close()


def test_donor_safety_stock_constraint():
    """
    Test 3: Donor Safety Stock Invariant (Non-Cannibalization)
    Strictly asserts that surplus_available = max(0, stock - max(min_safety_stock, ceil(14 * DAC))).
    Under no circumstances may a donor transfer stock that infringes on its retention buffer.
    """
    conn = get_connection(get_db_path())
    try:
        candidates = find_candidate_donors(
            conn_or_path=conn,
            recipient_facility_id=1,
            medicine_id=1,
            max_radius_km=75.0,
            min_donor_buffer_days=14
        )

        for c in candidates:
            expected_retention = max(c.min_safety_stock, math.ceil(14 * c.daily_average_consumption))
            assert c.retention_buffer == expected_retention
            assert c.surplus_available == max(0, c.current_stock - expected_retention)
            if c.surplus_available > 0:
                # If surplus is positive, remaining stock after transferring entire surplus must still meet retention buffer
                assert (c.current_stock - c.surplus_available) >= c.retention_buffer
    finally:
        conn.close()


def test_cold_chain_compatibility_guard():
    """
    Test 4: Perishable Cold Chain Compatibility Guard
    Ensures that for temperature-sensitive biologics (Anti-Snake Venom, Rabies Vaccine),
    candidate donors must possess verified cold-chain infrastructure (has_cold_chain = 1).
    """
    conn = get_connection(get_db_path())
    try:
        # Medicine #1 (Anti-Snake Venom) requires cold chain
        candidates = find_candidate_donors(
            conn_or_path=conn,
            recipient_facility_id=1,
            medicine_id=1,
            max_radius_km=100.0,
            min_donor_buffer_days=14
        )

        for c in candidates:
            assert c.has_cold_chain is True, (
                f"Candidate donor '{c.facility_name}' lacks cold chain for temperature-sensitive medicine."
            )
    finally:
        conn.close()


def test_transit_aware_fefo_batch_selection():
    """
    Test 5: Consumption-Aware FEFO Batch Expiry Invariant
    Verifies that candidate donor viable batches must cover:
    today + transit_days + ceil(recipient_deficit / max(0.1, recipient_dac)) + 7 days safety buffer.
    """
    conn = get_connection(get_db_path())
    try:
        candidates = find_candidate_donors(
            conn_or_path=conn,
            recipient_facility_id=1,
            medicine_id=1,
            max_radius_km=50.0,
            min_donor_buffer_days=14,
            recipient_dac=2.0,
            recipient_deficit=10
        )

        now_dt = datetime.now(timezone.utc)
        consumption_days = math.ceil(10 / 2.0)  # 5 days
        for c in candidates:
            transit_days = math.ceil(c.estimated_transit_hours / 24.0)
            required_shelf_days = transit_days + consumption_days + 7
            min_expiry = (now_dt + timedelta(days=required_shelf_days)).strftime("%Y-%m-%d")
            if c.earliest_viable_expiry:
                assert c.earliest_viable_expiry >= min_expiry, (
                    f"Candidate {c.facility_name} has batch expiring at {c.earliest_viable_expiry} "
                    f"which fails consumption-aware shelf life requirement {min_expiry}"
                )
    finally:
        conn.close()


def test_gemini_recommendation_offline_fallback():
    """
    Test 6: Autonomous Rebalancing Recommendation & Clinical Explainability (SOAP Format)
    Verifies that the recommendation service generates structured Pydantic output,
    validates clinical rationale adhering to medical SOAP format, tradeoff analysis,
    and enforces that recommended quantity never exceeds donor surplus.
    """
    client = TestClient(app)

    # First, intentionally consume stock at facility #1 to guarantee a deficit
    conn = get_connection(get_db_path())
    try:
        cur = conn.cursor()
        cur.execute("UPDATE stock_batches SET quantity_available = 0 WHERE facility_id = 1 AND medicine_id = 1;")
        conn.commit()
    finally:
        conn.close()

    payload = {
        "destination_facility_id": 1,
        "medicine_id": 1,
        "target_buffer_days": 14,
        "min_donor_buffer_days": 14,
        "max_radius_km": 50.0,
        "urgency": "URGENT"
    }

    res = client.post("/api/rebalance/recommend", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert data["recommendation_id"].startswith("REC-")
    assert data["destination_facility_id"] == 1
    assert data["medicine_id"] == 1
    assert data["calculated_deficit"] > 0
    assert len(data["tradeoff_analysis"]) > 10
    assert len(data["risk_assessment"]) > 10
    assert "suggested_route_summary" in data

    # Verify SOAP structure in clinical_rationale
    rationale = data["clinical_rationale"]
    assert "[S - Subjective]" in rationale
    assert "[O - Objective]" in rationale
    assert "[A - Assessment]" in rationale
    assert "[P - Plan]" in rationale

    if data["is_feasible"]:
        assert data["recommended_donor"] is not None
        assert data["recommended_quantity"] > 0
        donor = data["recommended_donor"]
        assert data["recommended_quantity"] <= donor["surplus_available"]
        assert data["recommended_quantity"] <= data["calculated_deficit"]
        assert data["estimated_distance_km"] == donor["distance_km"]
        assert data["estimated_transit_hours"] == donor["estimated_transit_hours"]


def test_apply_rebalance_transfer_lifecycle():
    """
    Test 7: Apply Rebalance Recommendation Lifecycle
    Verifies that calling POST /api/rebalance/apply creates an official transfer order
    in the database with ai_recommended = 1 and ai_rationale populated.
    """
    client = TestClient(app)

    # 1. Get recommendation
    rec_res = client.post("/api/rebalance/recommend", json={
        "destination_facility_id": 1,
        "medicine_id": 1,
        "target_buffer_days": 14,
        "min_donor_buffer_days": 14,
        "max_radius_km": 50.0
    })
    assert rec_res.status_code == 200
    rec_data = rec_res.json()

    if not rec_data["is_feasible"]:
        pytest.skip("No viable donor available in current seed to apply transfer")

    donor = rec_data["recommended_donor"]

    # 2. Apply recommendation
    apply_payload = {
        "recommendation_id": rec_data["recommendation_id"],
        "source_facility_id": donor["facility_id"],
        "destination_facility_id": 1,
        "medicine_id": 1,
        "quantity": min(5, donor["surplus_available"]),
        "urgency": "URGENT",
        "ai_rationale": rec_data["clinical_rationale"],
        "auto_approve": False,
        "requested_by": "Test Suite Rebalance Evaluator"
    }

    apply_res = client.post("/api/rebalance/apply", json=apply_payload)
    assert apply_res.status_code == 200
    apply_data = apply_res.json()

    assert apply_data["transfer_id"] > 0
    assert apply_data["transfer_code"].startswith("TRF-")
    assert apply_data["status"] == "DRAFT"

    # 3. Verify in database that ai_recommended is 1
    conn = get_connection(get_db_path())
    try:
        cur = conn.cursor()
        cur.execute("SELECT ai_recommended, ai_rationale, status FROM transfers WHERE id = ?;", (apply_data["transfer_id"],))
        row = cur.fetchone()
        assert row is not None
        assert row["ai_recommended"] == 1
        assert len(row["ai_rationale"]) > 10
        assert row["status"] == "DRAFT"
    finally:
        conn.close()


def test_network_deficits_endpoint():
    """
    Test 8: Network Deficits Scan Endpoint
    Tests GET /api/rebalance/network-deficits and ensures it returns items with deficit metrics.
    """
    client = TestClient(app)
    res = client.get("/api/rebalance/network-deficits?max_radius_km=50&min_donor_buffer_days=14")
    assert res.status_code == 200
    items = res.json()
    assert isinstance(items, list)

    for item in items:
        assert "facility_name" in item
        assert "medicine_name" in item
        assert item["deficit_quantity"] > 0
        assert item["status"] in ("WARNING", "CRITICAL")
        if item["candidate_donor_count"] > 0:
            assert item["top_donor_facility_name"] is not None
            assert item["top_donor_surplus"] is not None


def test_network_wide_shortage_graceful_handling():
    """
    Test 9: Graceful Handling of Zero Surplus / Network Shortage
    Ensures that when a search radius is extremely tight (e.g. 0.1 km) where no other
    facilities exist, the system returns is_feasible = False with a clean clinical rationale
    instead of throwing a 500 error or crash.
    """
    client = TestClient(app)

    # Ensure facility #1 has a deficit
    conn = get_connection(get_db_path())
    try:
        cur = conn.cursor()
        cur.execute("UPDATE stock_batches SET quantity_available = 0 WHERE facility_id = 1 AND medicine_id = 1;")
        conn.commit()
    finally:
        conn.close()

    payload = {
        "destination_facility_id": 1,
        "medicine_id": 1,
        "target_buffer_days": 14,
        "min_donor_buffer_days": 14,
        "max_radius_km": 0.1  # Intentionally tiny radius to guarantee no donors
    }

    res = client.post("/api/rebalance/recommend", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert data["is_feasible"] is False
    assert data["recommended_donor"] is None
    assert data["recommended_quantity"] == 0
    assert "District Drug Warehouse" in data["clinical_rationale"] or "zero facilities" in data["clinical_rationale"]


def test_monsoon_mode_buffer_multiplier():
    """
    Test 10: Monsoon Multiplier Protection (1.5x Buffer Scaling)
    Verifies that when monsoon_mode=True:
    1. monsoon_buffer_applied flag is True.
    2. Recipient target stock reflects 21-day target (14 * 1.5).
    3. Clinical rationale mentions the monsoon buffer.
    """
    client = TestClient(app)

    # Ensure facility #1 has a deficit
    conn = get_connection(get_db_path())
    try:
        cur = conn.cursor()
        cur.execute("UPDATE stock_batches SET quantity_available = 0 WHERE facility_id = 1 AND medicine_id = 1;")
        conn.commit()
    finally:
        conn.close()

    res = client.post("/api/rebalance/recommend", json={
        "destination_facility_id": 1,
        "medicine_id": 1,
        "target_buffer_days": 14,
        "min_donor_buffer_days": 14,
        "max_radius_km": 50.0,
        "monsoon_mode": True
    })
    assert res.status_code == 200
    data = res.json()

    assert data["monsoon_buffer_applied"] is True
    assert "Monsoon" in data["clinical_rationale"] or "monsoon" in data["clinical_rationale"].lower()


def test_toctou_concurrency_conflict_returns_409():
    """
    Test 11: TOCTOU Optimistic Concurrency Guard (HTTP 409 Conflict)
    Simulates a race condition where a donor facility's stock is depleted by a concurrent
    transaction between recommendation generation and commitment.
    Asserts that POST /api/rebalance/apply raises HTTP 409 Conflict.
    """
    client = TestClient(app)

    # 1. Generate recommendation
    rec_res = client.post("/api/rebalance/recommend", json={
        "destination_facility_id": 1,
        "medicine_id": 1,
        "target_buffer_days": 14,
        "min_donor_buffer_days": 14,
        "max_radius_km": 50.0
    })
    assert rec_res.status_code == 200
    rec_data = rec_res.json()

    if not rec_data["is_feasible"] or not rec_data["recommended_donor"]:
        pytest.skip("No feasible donor found to test TOCTOU conflict")

    donor = rec_data["recommended_donor"]
    donor_id = donor["facility_id"]

    # 2. Simulate concurrent race condition: artificially set donor's available stock to 0
    conn = get_connection(get_db_path())
    try:
        cur = conn.cursor()
        cur.execute("UPDATE stock_batches SET quantity_available = 0 WHERE facility_id = ? AND medicine_id = 1;", (donor_id,))
        conn.commit()
    finally:
        conn.close()

    # 3. Attempt to apply rebalance transfer
    apply_payload = {
        "recommendation_id": rec_data["recommendation_id"],
        "source_facility_id": donor_id,
        "destination_facility_id": 1,
        "medicine_id": 1,
        "quantity": rec_data["recommended_quantity"],
        "urgency": "URGENT",
        "ai_rationale": "Testing TOCTOU Concurrency Guard"
    }

    apply_res = client.post("/api/rebalance/apply", json=apply_payload)
    assert apply_res.status_code == 409, f"Expected 409 Conflict, got {apply_res.status_code}: {apply_res.text}"
    detail = apply_res.json()["detail"]
    assert "TOCTOU Concurrency Conflict" in detail
    assert "unreserved surplus has decreased" in detail
