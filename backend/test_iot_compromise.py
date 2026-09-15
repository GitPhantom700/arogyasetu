import pytest
from fastapi.testclient import TestClient
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from main import app
from database import get_connection

client = TestClient(app)

class TestIoTCompromise:
    
    def test_flag_compromised_success(self):
        """Test flagging an active batch as compromised transitions it to QUARANTINED."""
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, status, version, quantity_available FROM stock_batches WHERE status = 'ACTIVE' AND quantity_available > 0 LIMIT 1")
        batch = cursor.fetchone()
        conn.close()
        
        if not batch:
            pytest.skip("No active batches with stock available")
            
        batch_id = batch["id"]
        current_version = batch["version"]
        
        payload = {
            "temperature_celsius": 12.5,
            "duration_minutes": 45,
            "sensor_id": "SNS-THERMAL-01",
            "expected_version": current_version
        }
        
        response = client.post(f"/api/inventory/batches/{batch_id}/flag-compromised", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["batch_status_after"] == "QUARANTINED"
        assert data["transaction_type"] == "QUARANTINED"
        assert data["batch_version_after"] == current_version + 1
        assert "12.5" in data["notes"]
        assert "SNS-THERMAL-01" in data["reference_id"]
        assert data["hash"] is not None

    def test_flag_compromised_zero_quantity_400(self):
        """Test that attempting to quarantine an exhausted (0 stock) batch returns HTTP 400."""
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM stock_batches WHERE quantity_available = 0 LIMIT 1")
        batch = cursor.fetchone()
        conn.close()
        
        if not batch:
            pytest.skip("No zero-quantity batches available")
            
        payload = {
            "temperature_celsius": 14.0,
            "duration_minutes": 20,
            "sensor_id": "SNS-THERMAL-ZERO"
        }
        response = client.post(f"/api/inventory/batches/{batch['id']}/flag-compromised", json=payload)
        assert response.status_code == 400
        assert "zero available stock" in response.json()["detail"].lower()

    def test_flag_compromised_already_quarantined_400(self):
        """Test flagging an already quarantined batch returns HTTP 400 Bad Request."""
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM stock_batches WHERE status = 'QUARANTINED' LIMIT 1")
        batch = cursor.fetchone()
        conn.close()
        
        if not batch:
            pytest.skip("No quarantined batches available")
            
        batch_id = batch["id"]
        payload = {
            "temperature_celsius": 15.0,
            "duration_minutes": 30,
            "sensor_id": "SNS-THERMAL-02"
        }
        response = client.post(f"/api/inventory/batches/{batch_id}/flag-compromised", json=payload)
        assert response.status_code == 400
        assert "already quarantined" in response.json()["detail"].lower()

    def test_flag_compromised_nonexistent_batch_404(self):
        """Test flagging a non-existent batch returns HTTP 404 Not Found."""
        payload = {
            "temperature_celsius": 10.0,
            "duration_minutes": 20,
            "sensor_id": "SNS-THERMAL-03"
        }
        response = client.post("/api/inventory/batches/9999999/flag-compromised", json=payload)
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_flag_compromised_invalid_temperature_422(self):
        """Test temperatures outside acceptable limits (-50 to 100) return 422."""
        payload = {
            "temperature_celsius": 150.0,
            "duration_minutes": 30,
            "sensor_id": "SNS-THERMAL-04"
        }
        response = client.post("/api/inventory/batches/1/flag-compromised", json=payload)
        assert response.status_code == 422

    def test_flag_compromised_invalid_duration_422(self):
        """Test duration <= 0 returns 422."""
        payload = {
            "temperature_celsius": 12.0,
            "duration_minutes": 0,
            "sensor_id": "SNS-THERMAL-05"
        }
        response = client.post("/api/inventory/batches/1/flag-compromised", json=payload)
        assert response.status_code == 422

    def test_flag_compromised_invalid_sensor_id_whitespace_422(self):
        """Test whitespace-only sensor_id triggers field validator and returns 422."""
        payload = {
            "temperature_celsius": 12.0,
            "duration_minutes": 15,
            "sensor_id": "    "
        }
        response = client.post("/api/inventory/batches/1/flag-compromised", json=payload)
        assert response.status_code == 422

    def test_flag_compromised_invalid_sensor_id_characters_422(self):
        """Test non-alphanumeric/unsupported characters in sensor_id returns 422."""
        payload = {
            "temperature_celsius": 12.0,
            "duration_minutes": 15,
            "sensor_id": "SNS$ALERT#@!"
        }
        response = client.post("/api/inventory/batches/1/flag-compromised", json=payload)
        assert response.status_code == 422

    def test_flag_compromised_concurrency_conflict_409(self):
        """Test expected_version mismatch triggers HTTP 409 Conflict."""
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, version FROM stock_batches WHERE status = 'ACTIVE' AND quantity_available > 0 LIMIT 1")
        batch = cursor.fetchone()
        conn.close()
        
        if not batch:
            pytest.skip("No active batches available")
            
        batch_id = batch["id"]
        wrong_version = batch["version"] + 999
        
        payload = {
            "temperature_celsius": 14.0,
            "duration_minutes": 25,
            "sensor_id": "SNS-THERMAL-06",
            "expected_version": wrong_version
        }
        response = client.post(f"/api/inventory/batches/{batch_id}/flag-compromised", json=payload)
        assert response.status_code == 409
        assert "concurrency conflict" in response.json()["detail"].lower()

    def test_flag_compromised_invalid_expected_version_422(self):
        """Test non-positive expected_version (< 1) returns HTTP 422."""
        payload = {
            "temperature_celsius": 12.0,
            "duration_minutes": 15,
            "sensor_id": "SNS-THERMAL-07",
            "expected_version": 0
        }
        response = client.post("/api/inventory/batches/1/flag-compromised", json=payload)
        assert response.status_code == 422

    def test_audit_ledger_continuity_after_quarantine(self):
        """Test that the DSCSA audit ledger remains unbroken after quarantine transactions."""
        response = client.get("/api/inventory/ledger/verify")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "VERIFIED"
        assert data["chain_valid"] is True
        assert data["total_transactions"] > 0
