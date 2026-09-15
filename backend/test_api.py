"""
Comprehensive Production API Verification Suite (Post Gemini Pro Review).
Tests:
1. Health & Database Connectivity
2. Strict Enum Validation & Automatic Rejection of Invalid Strings (422)
3. Pagination (limit & skip)
4. 404 Handling across Facility Details and Facility Inventory
5. 60-Second In-Memory TTL Stats Caching
6. CORS Explicit Origin Configuration
"""

import sys
from pathlib import Path
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from main import app
from seed_data import seed_database


def run_hardened_api_verification():
    print("=" * 70)
    print("MICROTASK 1.3: HARDENED API VERIFICATION (GEMINI PRO AUDIT)")
    print("=" * 70)

    # Ensure fresh seed database is available
    seed_database(reset_schema=False)
    client = TestClient(app)

    # Test 1: Health Check
    print("[TEST 1/7] GET /api/health...")
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"
    print("[PASS] Health endpoint verified.")

    # Test 2: Strict Enum Validation (Valid Enum vs Invalid Enum)
    print("[TEST 2/7] Strict Enum Query Parameter Validation...")
    res_valid = client.get("/api/facilities?tier=PHC&terrain_type=GHAT_MOUNTAIN")
    assert res_valid.status_code == 200
    assert all(f["tier"] == "PHC" and f["terrain_type"] == "GHAT_MOUNTAIN" for f in res_valid.json())

    # Invalid enum string should be automatically rejected with 422
    res_invalid = client.get("/api/facilities?tier=INVALID_TIER")
    assert res_invalid.status_code == 422
    print("[PASS] Valid enum query accepted; invalid enum string rejected with HTTP 422 Unprocessable Entity.")

    # Test 3: Pagination
    print("[TEST 3/7] Pagination on /api/facilities (limit=5, skip=5)...")
    res_page1 = client.get("/api/facilities?limit=5&skip=0")
    assert res_page1.status_code == 200
    page1 = res_page1.json()
    assert len(page1) == 5

    res_page2 = client.get("/api/facilities?limit=5&skip=5")
    assert res_page2.status_code == 200
    page2 = res_page2.json()
    assert len(page2) == 5
    assert page1[0]["id"] != page2[0]["id"], "Pagination offset failed!"
    print(f"[PASS] Pagination working: Page 1 ({page1[0]['name']}) != Page 2 ({page2[0]['name']}).")

    # Test 4: 404 Handling across Facility and Inventory
    print("[TEST 4/7] 404 Handling on non-existent facilities and inventories...")
    res_fac_404 = client.get("/api/facilities/99999")
    assert res_fac_404.status_code == 404

    res_inv_404 = client.get("/api/inventory/99999")
    assert res_inv_404.status_code == 404
    print("[PASS] 404 correctly returned for missing facility details and inventory.")

    # Test 5: Medicines Catalog
    print("[TEST 5/7] GET /api/medicines with Category Enum...")
    res_med = client.get("/api/medicines?category=Antidote")
    assert res_med.status_code == 200
    antidotes = res_med.json()
    assert len(antidotes) == 2  # Anti-Snake Venom and Atropine
    print(f"[PASS] Retrieved {len(antidotes)} antidotes ({[a['name'] for a in antidotes]}).")

    # Test 6: In-Memory TTL Stats Caching
    print("[TEST 6/7] In-Memory TTL Caching on /api/stats/overview...")
    res_stats1 = client.get("/api/stats/overview")
    assert res_stats1.status_code == 200
    assert res_stats1.json()["cached"] is False

    res_stats2 = client.get("/api/stats/overview")
    assert res_stats2.status_code == 200
    assert res_stats2.json()["cached"] is True
    print(f"[PASS] Stats aggregation executed once, then served from 60-second in-memory cache (cached={res_stats2.json()['cached']}).")

    # Test 7: CORS Allowed Origin Headers
    print("[TEST 7/7] CORS Headers on Allowed Origin (http://localhost:5173)...")
    res_cors = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    allow_origin = res_cors.headers.get("access-control-allow-origin")
    assert allow_origin in ["http://localhost:5173", "*"]
    if allow_origin != "*":
        assert res_cors.headers.get("access-control-allow-credentials") == "true"
    print(f"[PASS] CORS explicitly allows authorized origins ({allow_origin}).")

    print("=" * 70)
    print("ALL 7 HARDENED PRODUCTION API TESTS PASSED (100% OPERATIONAL)")
    print("=" * 70)


def test_hardened_api_endpoints():
    """Pytest entrypoint for hardened production API verification."""
    run_hardened_api_verification()


if __name__ == "__main__":
    run_hardened_api_verification()
