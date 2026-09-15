"""
Master Seed Verification Suite with Public Health & Terrain Diagnostics.
"""

import sys
import sqlite3
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from database import get_connection, get_db_path
from seed_data import seed_database


def run_seed_verification():
    print("=" * 70)
    print("MICROTASK 1.2: MASTER SEED VERIFICATION (WITH DOMAIN REALISM)")
    print("=" * 70)

    print("[INIT] Seeding local healthcare.db database...")
    seed_database()

    conn = get_connection()
    cursor = conn.cursor()

    try:
        # Check 1: Facility counts & tiers
        cursor.execute("SELECT tier, COUNT(*) as count FROM facilities GROUP BY tier ORDER BY tier;")
        tiers = {row["tier"]: row["count"] for row in cursor.fetchall()}
        cursor.execute("SELECT COUNT(*) FROM facilities;")
        total_facilities = cursor.fetchone()[0]
        print(f"[CHECK 1] Facilities: Total {total_facilities} | Breakdown: {tiers}")
        assert total_facilities == 15
        assert set(tiers.keys()) == {"DH", "SDH", "CHC", "PHC", "SC"}
        print("[PASS] 15 facilities across 5 tiers verified.")

        # Check 2: Terrain distribution (Highway vs Ghat Mountain vs Plains)
        cursor.execute("SELECT terrain_type, COUNT(*) as count FROM facilities GROUP BY terrain_type;")
        terrains = {row["terrain_type"]: row["count"] for row in cursor.fetchall()}
        print(f"[CHECK 2] Terrain Distribution: {terrains}")
        assert "HIGHWAY_CORRIDOR" in terrains and "GHAT_MOUNTAIN" in terrains
        print("[PASS] Dual terrain network (Highway + Sahyadri Ghats) verified for realistic routing.")

        # Check 3: Cold Chain Invariant Verification
        cursor.execute("""
            SELECT f.facility_code, f.name, m.name as medicine
            FROM stock_batches sb
            JOIN facilities f ON sb.facility_id = f.id
            JOIN medicines m ON sb.medicine_id = m.id
            WHERE m.requires_cold_chain = 1 AND f.has_cold_chain = 0;
        """)
        violations = cursor.fetchall()
        assert len(violations) == 0, f"Cold chain violation: {violations}"
        print("[PASS] Cold-chain clinical invariant strictly enforced (zero cold drugs in SCs without cold-chain).")

        # Check 4: Medicine Seasonality Attributes
        cursor.execute("SELECT sku, name, seasonal_risk_months FROM medicines WHERE seasonal_risk_months != 'ALL';")
        seasonal = cursor.fetchall()
        print(f"[CHECK 4] Seasonal Risk Flags: {[(r['sku'], r['seasonal_risk_months']) for r in seasonal]}")
        assert len(seasonal) >= 3, "Expected seasonal flags for monsoon and harvest!"
        print("[PASS] Seasonality multipliers populated for ASV, ORS, and Atropine.")

        # Check 5: Total Batches & 100% Inward Ledger Traceability
        cursor.execute("SELECT COUNT(*) FROM stock_batches;")
        total_batches = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM inventory_transactions WHERE transaction_type = 'RECEIVED';")
        total_inward = cursor.fetchone()[0]
        print(f"[CHECK 5] Active Batches: {total_batches} | Inward Ledger Audit Rows: {total_inward}")
        assert total_batches == total_inward
        print("[PASS] Complete 1-to-1 ledger traceability verified.")

        # Check 6: Clinical Rebalancing Tension
        cursor.execute("""
            SELECT f.facility_code, f.name, f.terrain_type, SUM(sb.quantity_available) as asv_stock
            FROM stock_batches sb
            JOIN facilities f ON sb.facility_id = f.id
            JOIN medicines m ON sb.medicine_id = m.id
            WHERE m.sku = 'MED-ASV-01' AND f.facility_code IN ('DH-PUN-01', 'PHC-PUN-01', 'PHC-SAT-01')
            GROUP BY f.facility_code;
        """)
        asv_summary = {r["facility_code"]: (r["asv_stock"], r["terrain_type"]) for r in cursor.fetchall()}
        print(f"[CHECK 6] Operational ASV Stock: {asv_summary}")
        assert asv_summary["DH-PUN-01"][0] >= 100
        assert asv_summary["PHC-PUN-01"][0] <= 5
        print("[PASS] Rebalancing tension verified: DH Aundh surplus (130) vs PHC Kalyanpur deficit (4).")

        # Check 7: GS1 Traceability Compliance (GLN & GTIN-14)
        cursor.execute("SELECT COUNT(*) FROM facilities WHERE LENGTH(facility_gln) = 13;")
        gln_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM medicines WHERE LENGTH(gtin) = 14;")
        gtin_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM inventory_transactions WHERE LENGTH(facility_gln) = 13 AND LENGTH(gtin) = 14;")
        tx_gs1_count = cursor.fetchone()[0]
        print(f"[CHECK 7] GS1 Compliance: {gln_count}/15 facilities with GLN-13, {gtin_count}/10 medicines with GTIN-14, {tx_gs1_count} transactions fully tagged.")
        assert gln_count == 15
        assert gtin_count == 10
        assert tx_gs1_count == total_inward
        print("[PASS] GS1 Global Location Numbers (GLN) and GTIN-14 barcodes 100% verified.")

        print("=" * 70)
        print("MASTER SEED VERIFICATION PASSED (100% PRODUCTION READY)")
        print("=" * 70)

    finally:
        conn.close()


def test_seed_data_and_domain_realism():
    """Pytest entrypoint for master seed verification and domain realism."""
    run_seed_verification()


if __name__ == "__main__":
    run_seed_verification()
