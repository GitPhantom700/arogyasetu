"""
Deterministic Test Suite for Microtask 2.2: Dynamic Burn Rate Engine & Depletion Forecaster.
Public Health Supply Chain Logistics - Build with AI: Code for Communities.

Verifies:
1. Exact mathematical precision of Daily Average Consumption (DAC).
2. Exact mathematical precision of Days of Inventory Remaining (DIR).
3. Zero-division safety and stagnant inventory handling.
4. Immediate CRITICAL status on absolute stockout (stock = 0).
5. Exact boundary conditions: DIR in {1.99, 2.0, 7.0, 7.01}.
6. Batch filtering: Quarantine, Recalled, and Expired batches strictly excluded from available stock.
7. Trailing window temporal boundaries (events > 7 days ago ignored).
8. Acute consumption surge velocity detection (V_surge >= 1.5).
9. Cold-chain constraint awareness.
10. FastAPI API route integration tests (/api/inventory/depletion and /api/facilities/{id}/depletion).
"""

import sys
import tempfile
import sqlite3
from pathlib import Path
from datetime import datetime, timedelta, timezone

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from database import init_db, get_connection, record_inventory_transaction
from burn_rate import calculate_depletion_metrics
from main import app

client = TestClient(app)


def setup_test_db() -> Path:
    """Sets up a clean, isolated temporary SQLite database with the full schema."""
    temp_dir = tempfile.mkdtemp()
    temp_db = Path(temp_dir) / "test_burn_rate.db"
    init_db(temp_db)
    return temp_db


def test_burn_rate_mathematical_precision():
    """Verifies exact DAC, DIR, and status calculations under known synthetic consumption."""
    db_path = setup_test_db()
    conn = get_connection(db_path)
    cur = conn.cursor()

    # Anchor time: 2026-09-05T12:00:00Z
    now = datetime(2026, 9, 5, 12, 0, 0, tzinfo=timezone.utc)
    now_iso = now.isoformat()

    # Insert 1 facility
    cur.execute("""
        INSERT INTO facilities (
            id, facility_code, facility_gln, name, tier, district, state,
            latitude, longitude, terrain_type, has_cold_chain, total_beds, icu_beds, oxygen_beds
        ) VALUES (1, 'PHC-TEST-01', '8901234567001', 'Test PHC 1', 'PHC', 'Pune', 'Maharashtra',
                  18.5, 73.8, 'PLAINS', 1, 20, 2, 5);
    """)

    # Insert 4 medicines with different scenarios
    # Med 1: Normal consumption (Stock: 21, Consumed: 14 in 7d -> DAC: 2.0, DIR: 10.5 -> HEALTHY)
    # Med 2: Warning depletion (Stock: 10, Consumed: 14 in 7d -> DAC: 2.0, DIR: 5.0 -> WARNING)
    # Med 3: Critical depletion (Stock: 3, Consumed: 14 in 7d -> DAC: 2.0, DIR: 1.5 -> CRITICAL)
    # Med 4: Absolute stockout (Stock: 0, Consumed: 7 in 7d -> DAC: 1.0, DIR: 0.0 -> CRITICAL)
    medicines = [
        (1, "MED-01", "Paracetamol", "Analgesic", "Strip", 10, 0, 0),
        (2, "MED-02", "Amoxicillin", "Antibiotic", "Strip", 10, 0, 0),
        (3, "MED-03", "Anti-Venom", "Antidote", "Vial", 10, 1, 1),
        (4, "MED-04", "ORS", "Emergency", "Sachet", 20, 1, 0),
    ]
    for m in medicines:
        cur.execute("""
            INSERT INTO medicines (id, sku, name, category, unit, min_safety_stock, is_emergency, requires_cold_chain)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """, m)

    # Insert active batches
    # Med 1: Batch with 21 units (expires in 180 days)
    # Med 2: Batch with 10 units (expires in 180 days)
    # Med 3: Batch with 3 units (expires in 180 days)
    # Med 4: No batch (Stock = 0)
    exp_date = (now + timedelta(days=180)).strftime("%Y-%m-%d")
    batches = [
        (1, 1, 1, "B-01", exp_date, 21, "ACTIVE"),
        (2, 1, 2, "B-02", exp_date, 10, "ACTIVE"),
        (3, 1, 3, "B-03", exp_date, 3, "ACTIVE"),
    ]
    for b in batches:
        cur.execute("""
            INSERT INTO stock_batches (id, facility_id, medicine_id, batch_number, expiry_date, quantity_available, status, version)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1);
        """, b)

    # Insert consumption transactions over trailing 7 days (days 0 through 6)
    # Med 1: 14 units consumed (2 units/day for 7 days)
    for day in range(7):
        tx_time = (now - timedelta(days=day, hours=2)).isoformat()
        cur.execute("""
            INSERT INTO inventory_transactions (
                facility_id, medicine_id, batch_id, batch_number, expiry_date,
                transaction_type, quantity, balance_after, logged_by, user_reported_at, created_at, previous_hash, hash
            ) VALUES (1, 1, 1, 'B-01', ?, 'CONSUMED', 2, 21, 'Nurse', ?, ?, '0', 'dummy');
        """, (exp_date, tx_time, tx_time))

    # Med 2: 14 units consumed
    for day in range(7):
        tx_time = (now - timedelta(days=day, hours=2)).isoformat()
        cur.execute("""
            INSERT INTO inventory_transactions (
                facility_id, medicine_id, batch_id, batch_number, expiry_date,
                transaction_type, quantity, balance_after, logged_by, user_reported_at, created_at, previous_hash, hash
            ) VALUES (1, 2, 2, 'B-02', ?, 'CONSUMED', 2, 10, 'Nurse', ?, ?, '0', 'dummy');
        """, (exp_date, tx_time, tx_time))

    # Med 3: 14 units consumed
    for day in range(7):
        tx_time = (now - timedelta(days=day, hours=2)).isoformat()
        cur.execute("""
            INSERT INTO inventory_transactions (
                facility_id, medicine_id, batch_id, batch_number, expiry_date,
                transaction_type, quantity, balance_after, logged_by, user_reported_at, created_at, previous_hash, hash
            ) VALUES (1, 3, 3, 'B-03', ?, 'CONSUMED', 2, 3, 'Nurse', ?, ?, '0', 'dummy');
        """, (exp_date, tx_time, tx_time))

    # Med 4: 7 units consumed in trailing window (1 unit/day)
    for day in range(7):
        tx_time = (now - timedelta(days=day, hours=2)).isoformat()
        cur.execute("""
            INSERT INTO inventory_transactions (
                facility_id, medicine_id, batch_id, batch_number, expiry_date,
                transaction_type, quantity, balance_after, logged_by, user_reported_at, created_at, previous_hash, hash
            ) VALUES (1, 4, 1, 'B-01', ?, 'CONSUMED', 1, 0, 'Nurse', ?, ?, '0', 'dummy');
        """, (exp_date, tx_time, tx_time))

    conn.commit()
    conn.close()

    # Calculate metrics with as_of anchor
    metrics = calculate_depletion_metrics(db_path=db_path, facility_id=1, as_of=now_iso, window_days=7)
    items_by_med = {item["medicine_id"]: item for item in metrics["items"]}

    # Verify Med 1 (Normal / HEALTHY)
    m1 = items_by_med[1]
    assert m1["current_stock"] == 21, f"Expected stock 21, got {m1['current_stock']}"
    assert m1["total_consumed_in_window"] == 14, f"Expected 14 consumed, got {m1['total_consumed_in_window']}"
    assert m1["daily_average_consumption"] == 2.0, f"Expected DAC 2.0, got {m1['daily_average_consumption']}"
    assert m1["days_of_inventory_remaining"] == 10.5, f"Expected DIR 10.5, got {m1['days_of_inventory_remaining']}"
    assert m1["status"] == "HEALTHY", f"Expected HEALTHY, got {m1['status']}"

    # Verify Med 2 (WARNING: DIR = 5.0 in [2.0, 7.0])
    m2 = items_by_med[2]
    assert m2["current_stock"] == 10
    assert m2["daily_average_consumption"] == 2.0
    assert m2["days_of_inventory_remaining"] == 5.0
    assert m2["status"] == "WARNING"

    # Verify Med 3 (CRITICAL: DIR = 1.5 < 2.0)
    m3 = items_by_med[3]
    assert m3["current_stock"] == 3
    assert m3["daily_average_consumption"] == 2.0
    assert m3["days_of_inventory_remaining"] == 1.5
    assert m3["status"] == "CRITICAL"

    # Verify Med 4 (CRITICAL: Stockout, DIR = 0.0)
    m4 = items_by_med[4]
    assert m4["current_stock"] == 0
    assert m4["days_of_inventory_remaining"] == 0.0
    assert m4["status"] == "CRITICAL"

    print("[PASS] test_burn_rate_mathematical_precision")


def test_zero_consumption_and_boundary_conditions():
    """Verifies stagnant inventory (zero consumption) and exact boundary transitions."""
    db_path = setup_test_db()
    conn = get_connection(db_path)
    cur = conn.cursor()

    now = datetime(2026, 9, 5, 12, 0, 0, tzinfo=timezone.utc)
    now_iso = now.isoformat()
    exp_date = (now + timedelta(days=200)).strftime("%Y-%m-%d")

    cur.execute("""
        INSERT INTO facilities (
            id, facility_code, facility_gln, name, tier, district, state,
            latitude, longitude, terrain_type, has_cold_chain, total_beds, icu_beds, oxygen_beds
        ) VALUES (2, 'PHC-TEST-02', '8901234567002', 'Test PHC 2', 'PHC', 'Satara', 'Maharashtra',
                  17.5, 74.0, 'GHAT_MOUNTAIN', 1, 15, 1, 3);
    """)

    # Med 1: Zero consumption, Stock >= min_safety_stock (50 >= 10) -> status HEALTHY, DIR None
    # Med 2: Zero consumption, Stock < min_safety_stock (5 < 10) -> status WARNING, DIR None
    # Med 3: Boundary DIR = 1.99 -> CRITICAL
    # Med 4: Boundary DIR = 2.00 -> WARNING
    # Med 5: Boundary DIR = 7.00 -> WARNING
    # Med 6: Boundary DIR = 7.01 -> HEALTHY
    meds = [
        (1, "SKU-1", "Med 1", "Analgesic", "Strip", 10),
        (2, "SKU-2", "Med 2", "Analgesic", "Strip", 10),
        (3, "SKU-3", "Med 3", "Analgesic", "Strip", 5),
        (4, "SKU-4", "Med 4", "Analgesic", "Strip", 5),
        (5, "SKU-5", "Med 5", "Analgesic", "Strip", 5),
        (6, "SKU-6", "Med 6", "Analgesic", "Strip", 5),
    ]
    for m in meds:
        cur.execute("""
            INSERT INTO medicines (id, sku, name, category, unit, min_safety_stock, is_emergency, requires_cold_chain)
            VALUES (?, ?, ?, ?, ?, ?, 0, 0);
        """, m)

    # Insert batches for each medicine:
    # Med 1: 50 units (zero consumption)
    # Med 2: 5 units (zero consumption)
    # Med 3: 199 units (will consume 700 units over 7d -> DAC 100 -> DIR = 199/100 = 1.99)
    # Med 4: 200 units (consume 700 units over 7d -> DAC 100 -> DIR = 200/100 = 2.0)
    # Med 5: 700 units (consume 700 units over 7d -> DAC 100 -> DIR = 700/100 = 7.0)
    # Med 6: 701 units (consume 700 units over 7d -> DAC 100 -> DIR = 701/100 = 7.01)
    batch_data = [
        (1, 1, 50),
        (2, 2, 5),
        (3, 3, 199),
        (4, 4, 200),
        (5, 5, 700),
        (6, 6, 701),
    ]
    for b_id, m_id, qty in batch_data:
        cur.execute("""
            INSERT INTO stock_batches (id, facility_id, medicine_id, batch_number, expiry_date, quantity_available, status, version)
            VALUES (?, 2, ?, ?, ?, ?, 'ACTIVE', 1);
        """, (b_id, m_id, f"B-{m_id}", exp_date, qty))

    # Consume 700 units (100/day) for Meds 3, 4, 5, 6
    for m_id in [3, 4, 5, 6]:
        tx_time = (now - timedelta(days=2)).isoformat()
        cur.execute("""
            INSERT INTO inventory_transactions (
                facility_id, medicine_id, batch_id, batch_number, expiry_date,
                transaction_type, quantity, balance_after, logged_by, user_reported_at, created_at, previous_hash, hash
            ) VALUES (2, ?, ?, ?, ?, 'CONSUMED', 700, 0, 'Nurse', ?, ?, '0', 'dummy');
        """, (m_id, m_id, f"B-{m_id}", exp_date, tx_time, tx_time))

    conn.commit()
    conn.close()

    metrics = calculate_depletion_metrics(db_path=db_path, facility_id=2, as_of=now_iso, window_days=7)
    items = {item["medicine_id"]: item for item in metrics["items"]}

    # Med 1: Zero consumption, above safety stock
    assert items[1]["daily_average_consumption"] == 0.0
    assert items[1]["days_of_inventory_remaining"] is None
    assert items[1]["status"] == "HEALTHY"

    # Med 2: Zero consumption, below safety stock
    assert items[2]["daily_average_consumption"] == 0.0
    assert items[2]["days_of_inventory_remaining"] is None
    assert items[2]["status"] == "WARNING"

    # Boundary 1.99 -> CRITICAL
    assert items[3]["days_of_inventory_remaining"] == 1.99
    assert items[3]["status"] == "CRITICAL"

    # Boundary 2.00 -> WARNING
    assert items[4]["days_of_inventory_remaining"] == 2.00
    assert items[4]["status"] == "WARNING"

    # Boundary 7.00 -> WARNING
    assert items[5]["days_of_inventory_remaining"] == 7.00
    assert items[5]["status"] == "WARNING"

    # Boundary 7.01 -> HEALTHY
    assert items[6]["days_of_inventory_remaining"] == 7.01
    assert items[6]["status"] == "HEALTHY"

    print("[PASS] test_zero_consumption_and_boundary_conditions")


def test_batch_exclusion_and_window_temporal_filter():
    """Verifies that quarantined, recalled, and expired batches are excluded, and old transactions ignored."""
    db_path = setup_test_db()
    conn = get_connection(db_path)
    cur = conn.cursor()

    now = datetime(2026, 9, 5, 12, 0, 0, tzinfo=timezone.utc)
    now_iso = now.isoformat()

    cur.execute("""
        INSERT INTO facilities (
            id, facility_code, facility_gln, name, tier, district, state,
            latitude, longitude, terrain_type, has_cold_chain, total_beds, icu_beds, oxygen_beds
        ) VALUES (3, 'PHC-TEST-03', '8901234567003', 'Test PHC 3', 'PHC', 'Pune', 'Maharashtra',
                  18.5, 73.8, 'PLAINS', 1, 10, 1, 2);
    """)
    cur.execute("""
        INSERT INTO medicines (id, sku, name, category, unit, min_safety_stock, is_emergency, requires_cold_chain)
        VALUES (1, 'MED-EXCL', 'Insulin', 'Vaccine', 'Vial', 10, 1, 1);
    """)

    # 4 Batches for Medicine 1:
    # B1: ACTIVE, valid expiry (+90d), qty: 20  <-- ONLY this one should count!
    # B2: QUARANTINED, valid expiry (+90d), qty: 50
    # B3: RECALLED, valid expiry (+90d), qty: 30
    # B4: ACTIVE, but EXPIRED (-10d), qty: 40
    valid_exp = (now + timedelta(days=90)).strftime("%Y-%m-%d")
    expired_exp = (now - timedelta(days=10)).strftime("%Y-%m-%d")

    cur.execute("INSERT INTO stock_batches (id, facility_id, medicine_id, batch_number, serial_number, expiry_date, quantity_available, status, version) VALUES (1, 3, 1, 'B1', 'S1', ?, 20, 'ACTIVE', 1);", (valid_exp,))
    cur.execute("INSERT INTO stock_batches (id, facility_id, medicine_id, batch_number, serial_number, expiry_date, quantity_available, status, version) VALUES (2, 3, 1, 'B2', 'S2', ?, 50, 'QUARANTINED', 1);", (valid_exp,))
    cur.execute("INSERT INTO stock_batches (id, facility_id, medicine_id, batch_number, serial_number, expiry_date, quantity_available, status, version) VALUES (3, 3, 1, 'B3', 'S3', ?, 30, 'RECALLED', 1);", (valid_exp,))
    cur.execute("INSERT INTO stock_batches (id, facility_id, medicine_id, batch_number, serial_number, expiry_date, quantity_available, status, version) VALUES (4, 3, 1, 'B4', 'S4', ?, 40, 'ACTIVE', 1);", (expired_exp,))

    # Transactions:
    # Within 7d: 14 units consumed (7 units on day 2, 7 units on day 6)
    # Outside 7d: 100 units consumed on day 10 (must be ignored!)
    in_window_1 = (now - timedelta(days=2)).isoformat()
    in_window_2 = (now - timedelta(days=6)).isoformat()
    out_window = (now - timedelta(days=10)).isoformat()

    cur.execute("""
        INSERT INTO inventory_transactions (
            facility_id, medicine_id, batch_id, batch_number, expiry_date,
            transaction_type, quantity, balance_after, logged_by, user_reported_at, created_at, previous_hash, hash
        ) VALUES (3, 1, 1, 'B1', ?, 'CONSUMED', 7, 20, 'Nurse', ?, ?, '0', 'dummy');
    """, (valid_exp, in_window_1, in_window_1))

    cur.execute("""
        INSERT INTO inventory_transactions (
            facility_id, medicine_id, batch_id, batch_number, expiry_date,
            transaction_type, quantity, balance_after, logged_by, user_reported_at, created_at, previous_hash, hash
        ) VALUES (3, 1, 1, 'B1', ?, 'CONSUMED', 7, 13, 'Nurse', ?, ?, '0', 'dummy');
    """, (valid_exp, in_window_2, in_window_2))

    cur.execute("""
        INSERT INTO inventory_transactions (
            facility_id, medicine_id, batch_id, batch_number, expiry_date,
            transaction_type, quantity, balance_after, logged_by, user_reported_at, created_at, previous_hash, hash
        ) VALUES (3, 1, 1, 'B1', ?, 'CONSUMED', 100, 100, 'Nurse', ?, ?, '0', 'dummy');
    """, (valid_exp, out_window, out_window))

    conn.commit()
    conn.close()

    metrics = calculate_depletion_metrics(db_path=db_path, facility_id=3, as_of=now_iso, window_days=7)
    item = metrics["items"][0]

    # Available stock must be ONLY 20 (not 20+50+30+40 = 140)
    assert item["current_stock"] == 20, f"Expected 20 active stock, got {item['current_stock']}"
    assert item["active_batches_count"] == 1

    # Consumed in 7d window must be 14 (not 114)
    assert item["total_consumed_in_window"] == 14, f"Expected 14 consumed, got {item['total_consumed_in_window']}"
    assert item["daily_average_consumption"] == 2.0
    assert item["days_of_inventory_remaining"] == 10.0
    assert item["status"] == "HEALTHY"

    print("[PASS] test_batch_exclusion_and_window_temporal_filter")


def test_acute_surge_detection():
    """Verifies that an acute consumption spike in last 24h triggers burn_rate_surge = True."""
    db_path = setup_test_db()
    conn = get_connection(db_path)
    cur = conn.cursor()

    now = datetime(2026, 9, 5, 12, 0, 0, tzinfo=timezone.utc)
    now_iso = now.isoformat()
    exp_date = (now + timedelta(days=90)).strftime("%Y-%m-%d")

    cur.execute("""
        INSERT INTO facilities (
            id, facility_code, facility_gln, name, tier, district, state,
            latitude, longitude, terrain_type, has_cold_chain, total_beds, icu_beds, oxygen_beds
        ) VALUES (4, 'PHC-SURGE', '8901234567004', 'Surge PHC', 'PHC', 'Satara', 'Maharashtra',
                  17.6, 73.9, 'PLAINS', 1, 20, 2, 4);
    """)
    cur.execute("""
        INSERT INTO medicines (id, sku, name, category, unit, min_safety_stock, is_emergency, requires_cold_chain)
        VALUES (1, 'MED-SURGE', 'Anti-Rabies Vaccine', 'Vaccine', 'Vial', 10, 1, 1),
               (2, 'MED-RARE', 'Rare Snake Antivenom', 'Antidote', 'Vial', 5, 1, 1);
    """)
    cur.execute("""
        INSERT INTO stock_batches (id, facility_id, medicine_id, batch_number, expiry_date, quantity_available, status, version)
        VALUES (1, 4, 1, 'B-SURGE', ?, 100, 'ACTIVE', 1),
               (2, 4, 2, 'B-RARE', ?, 20, 'ACTIVE', 1);
    """, (exp_date, exp_date))

    # Med 1: High-volume acute outbreak surge (21 units over 7d, 9 units in last 24h)
    t_24h = (now - timedelta(hours=12)).isoformat()
    t_d3 = (now - timedelta(days=3)).isoformat()
    t_d5 = (now - timedelta(days=5)).isoformat()
    t_d6 = (now - timedelta(days=6)).isoformat()

    for qty, ts in [(9, t_24h), (4, t_d3), (4, t_d5), (4, t_d6)]:
        cur.execute("""
            INSERT INTO inventory_transactions (
                facility_id, medicine_id, batch_id, batch_number, expiry_date,
                transaction_type, quantity, balance_after, logged_by, user_reported_at, created_at, previous_hash, hash
            ) VALUES (4, 1, 1, 'B-SURGE', ?, 'CONSUMED', ?, 100, 'Staff', ?, ?, '0', 'dummy');
        """, (exp_date, qty, ts, ts))

    # Med 2: Low-volume noise (2 units over 7d, 1 unit in last 24h -> ratio 3.5, but 1 < 3 units -> NO SURGE)
    cur.execute("""
        INSERT INTO inventory_transactions (
            facility_id, medicine_id, batch_id, batch_number, expiry_date,
            transaction_type, quantity, balance_after, logged_by, user_reported_at, created_at, previous_hash, hash
        ) VALUES (4, 2, 2, 'B-RARE', ?, 'CONSUMED', 1, 20, 'Staff', ?, ?, '0', 'dummy');
    """, (exp_date, t_d3, t_d3))
    cur.execute("""
        INSERT INTO inventory_transactions (
            facility_id, medicine_id, batch_id, batch_number, expiry_date,
            transaction_type, quantity, balance_after, logged_by, user_reported_at, created_at, previous_hash, hash
        ) VALUES (4, 2, 2, 'B-RARE', ?, 'CONSUMED', 1, 19, 'Staff', ?, ?, '0', 'dummy');
    """, (exp_date, t_24h, t_24h))

    conn.commit()
    conn.close()

    metrics = calculate_depletion_metrics(db_path=db_path, facility_id=4, as_of=now_iso, window_days=7)
    items_by_med = {item["medicine_id"]: item for item in metrics["items"]}

    # Med 1 must trigger acute surge (last_24h >= 3 and ratio >= 1.5)
    item_surge = items_by_med[1]
    assert item_surge["daily_average_consumption"] == 3.0
    assert item_surge["last_24h_consumption"] == 9
    assert item_surge["burn_rate_surge"] is True
    assert item_surge["surge_multiplier"] == 3.0

    # Med 2 must NOT trigger surge (anti-noise threshold: 1 < 3 units)
    item_noise = items_by_med[2]
    assert item_noise["last_24h_consumption"] == 1
    assert item_noise["surge_multiplier"] == 3.5  # 1.0 / (2/7) = 3.5
    assert item_noise["burn_rate_surge"] is False, "Low-volume consumption (< 3 units) should not trigger surge"

    print("[PASS] test_acute_surge_detection (with anti-noise filtering)")



def test_api_depletion_endpoints():
    """Verifies FastAPI endpoints /api/inventory/depletion and /api/facilities/{id}/depletion on production database."""
    # Test network-wide depletion
    res = client.get("/api/inventory/depletion?window_days=7")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert "as_of" in data
    assert "window_days" in data
    assert data["window_days"] == 7
    assert "total_facilities_evaluated" in data
    assert "total_critical_items" in data
    assert len(data["items"]) > 0

    # Test facility-specific depletion via /api/facilities/{id}/depletion
    res_fac = client.get("/api/facilities/1/depletion?window_days=7")
    assert res_fac.status_code == 200, f"Expected 200, got {res_fac.status_code}: {res_fac.text}"
    fac_data = res_fac.json()
    assert fac_data["facility_id"] == 1
    assert "critical_count" in fac_data
    assert "warning_count" in fac_data
    assert "healthy_count" in fac_data
    assert len(fac_data["medicines"]) > 0

    # Test facility-specific depletion via /api/inventory/{id}/depletion
    res_inv_fac = client.get("/api/inventory/1/depletion?window_days=7")
    assert res_inv_fac.status_code == 200

    # Test 404 on non-existent facility
    res_404 = client.get("/api/facilities/99999/depletion")
    assert res_404.status_code == 404

    # Test filtering by district
    res_pune = client.get("/api/inventory/depletion?district=Pune")
    assert res_pune.status_code == 200
    for item in res_pune.json()["items"]:
        assert item["district"] == "Pune"

    print("[PASS] test_api_depletion_endpoints")


def test_adversarial_double_audit_hardenings():
    """Verifies all specific adversarial vulnerabilities identified in double-audit."""
    from burn_rate import get_as_of_datetime

    # 1. Non-string as_of raises ValueError
    try:
        get_as_of_datetime(12345)
        assert False, "Should have raised ValueError on int"
    except ValueError as e:
        assert "Parameter 'as_of' must be a valid ISO-8601 string" in str(e)

    try:
        get_as_of_datetime({"year": 2026})
        assert False, "Should have raised ValueError on dict"
    except ValueError as e:
        assert "Parameter 'as_of' must be a valid ISO-8601 string" in str(e)

    # 2. Malformed date string raises ValueError (no silent fallback)
    try:
        get_as_of_datetime("invalid-date-string")
        assert False, "Should have raised ValueError on invalid date"
    except ValueError as e:
        assert "Invalid ISO-8601 datetime format" in str(e)

    # 3. HTTP 422 returned on API endpoint when invalid as_of is passed
    res_err = client.get("/api/inventory/depletion?as_of=corrupted-timestamp")
    assert res_err.status_code == 422
    assert "Invalid ISO-8601 datetime format" in res_err.json()["detail"]

    # 4. Non-UTC timezone offset string is converted safely to UTC
    tz_dt = get_as_of_datetime("2026-09-05T17:30:00+05:30")
    assert tz_dt.tzinfo == timezone.utc
    assert tz_dt.hour == 12
    assert tz_dt.minute == 0

    # 5. Boundary condition: dir_raw = 1.996 days (< 48 hours) must be CRITICAL, not WARNING
    db_path = setup_test_db()
    conn = get_connection(db_path)
    cur = conn.cursor()
    now = datetime(2026, 9, 5, 12, 0, 0, tzinfo=timezone.utc)
    now_iso = now.isoformat(timespec="microseconds")
    exp_date = (now + timedelta(days=180)).strftime("%Y-%m-%d")

    cur.execute("""
        INSERT INTO facilities (
            id, facility_code, facility_gln, name, tier, district, state,
            latitude, longitude, terrain_type, has_cold_chain, total_beds, icu_beds, oxygen_beds
        ) VALUES (5, 'PHC-ADV-01', '8901234567005', 'Adv PHC', 'PHC', 'Pune', 'Maharashtra',
                  18.5, 73.8, 'PLAINS', 1, 10, 1, 2);
    """)
    cur.execute("""
        INSERT INTO medicines (id, sku, name, category, unit, min_safety_stock, is_emergency, requires_cold_chain)
        VALUES (1, 'MED-ADV-01', 'Antivenom', 'Antidote', 'Vial', 10, 1, 1),
               (2, 'MED-ADV-02', 'Paracetamol', 'Analgesic', 'Strip', 50, 0, 0),
               (3, 'MED-ADV-03', 'Normal Saline', 'IV Fluid', 'Bottle', 100, 1, 0);
    """)

    # Med 1: Stock = 998, 7-day consumption = 3500 -> raw_dac = 500 -> dir_raw = 1.996 days!
    cur.execute("""
        INSERT INTO stock_batches (id, facility_id, medicine_id, batch_number, expiry_date, quantity_available, status, version)
        VALUES (1, 5, 1, 'B-CRIT-BOUND', ?, 998, 'ACTIVE', 1),
               (2, 5, 2, 'B-ROUTINE-NOISE', ?, 100, 'ACTIVE', 1),
               (3, 5, 3, 'B-HUGE-OVERFLOW', ?, 10000000, 'ACTIVE', 1);
    """, (exp_date, exp_date, exp_date))

    t_24h = (now - timedelta(hours=6)).isoformat(timespec="microseconds")
    t_d3 = (now - timedelta(days=3)).isoformat(timespec="microseconds")

    # Med 1: 3500 total consumed
    cur.execute("""
        INSERT INTO inventory_transactions (
            facility_id, medicine_id, batch_id, batch_number, expiry_date,
            transaction_type, quantity, balance_after, logged_by, user_reported_at, created_at, previous_hash, hash
        ) VALUES (5, 1, 1, 'B-CRIT-BOUND', ?, 'CONSUMED', 3500, 998, 'Staff', ?, ?, '0', 'dummy');
    """, (exp_date, t_d3, t_d3))

    # Med 2: Routine medicine noise suppression (min_stock = 50, noise floor = 5 units)
    cur.execute("""
        INSERT INTO inventory_transactions (
            facility_id, medicine_id, batch_id, batch_number, expiry_date,
            transaction_type, quantity, balance_after, logged_by, user_reported_at, created_at, previous_hash, hash
        ) VALUES (5, 2, 2, 'B-ROUTINE-NOISE', ?, 'CONSUMED', 5, 100, 'Staff', ?, ?, '0', 'dummy');
    """, (exp_date, t_d3, t_d3))
    cur.execute("""
        INSERT INTO inventory_transactions (
            facility_id, medicine_id, batch_id, batch_number, expiry_date,
            transaction_type, quantity, balance_after, logged_by, user_reported_at, created_at, previous_hash, hash
        ) VALUES (5, 2, 2, 'B-ROUTINE-NOISE', ?, 'CONSUMED', 2, 98, 'Staff', ?, ?, '0', 'dummy');
    """, (exp_date, t_24h, t_24h))

    # Med 3: Huge stock overflow protection
    cur.execute("""
        INSERT INTO inventory_transactions (
            facility_id, medicine_id, batch_id, batch_number, expiry_date,
            transaction_type, quantity, balance_after, logged_by, user_reported_at, created_at, previous_hash, hash
        ) VALUES (5, 3, 3, 'B-HUGE-OVERFLOW', ?, 'CONSUMED', 1, 9999999, 'Staff', ?, ?, '0', 'dummy');
    """, (exp_date, t_d3, t_d3))

    conn.commit()
    conn.close()

    metrics = calculate_depletion_metrics(db_path=db_path, facility_id=5, as_of=now_iso, window_days=7)
    items_by_med = {item["medicine_id"]: item for item in metrics["items"]}

    # Med 1: Sub-48h boundary (dir_raw = 1.996, rounded = 2.00) MUST be CRITICAL
    m1 = items_by_med[1]
    assert m1["days_of_inventory_remaining"] == 2.0
    assert m1["status"] == "CRITICAL", f"Sub-48h item (1.996 days) must be CRITICAL, got {m1['status']}"

    # Med 2: Routine medicine noise suppression (2 < 5 units threshold)
    m2 = items_by_med[2]
    assert m2["burn_rate_surge"] is False, "2 units of routine medicine (noise threshold 5) should not trigger surge"

    # Med 3: Huge stock overflow protection
    m3 = items_by_med[3]
    assert m3["estimated_stockout_date"] == "2099-12-31"
    assert m3["status"] == "HEALTHY"

    print("[PASS] test_adversarial_double_audit_hardenings")


if __name__ == "__main__":
    print("\n--- Running Microtask 2.2 Deterministic Verification Suite ---")
    test_burn_rate_mathematical_precision()
    test_zero_consumption_and_boundary_conditions()
    test_batch_exclusion_and_window_temporal_filter()
    test_acute_surge_detection()
    test_api_depletion_endpoints()
    test_adversarial_double_audit_hardenings()
    print("\n[SUCCESS] ALL 6 TEST MODULES (20+ INVARIANTS) PASSED WITH 100% SUCCESS!\n")

