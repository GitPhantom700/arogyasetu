import pytest
from fastapi.testclient import TestClient
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))
from main import app

client = TestClient(app)

class TestBRICSFederatedLearning:
    def test_get_model_weights_success(self):
        response = client.get("/api/brics/model/weights?category=Antidote")
        assert response.status_code == 200
        data = response.json()
        assert data["model_version"] == "v1.2.4-brics"
        assert "active_nodes" in data
        assert "privacy_guarantee" in data
        assert data["privacy_guarantee"]["epsilon_privacy_budget"] == 0.5

    def test_get_model_weights_dp_noise_bounded(self):
        for _ in range(10):
            res = client.get("/api/brics/model/weights?category=Vaccine")
            assert res.status_code == 200
            val = res.json()["anomaly_threshold_multiplier"]
            assert 1.0 <= val <= 10.0

    def test_submit_local_gradients_success(self):
        payload = {
            "node_id": "IN-DEL-01",
            "metrics_summary": {
                "acute_surge_events": 12,
                "average_burn_rate_shift": 1.4
            }
        }
        headers = {"X-BRICS-Node-Token": "token-del"}
        response = client.post("/api/brics/model/gradients", json=payload, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "SUCCESS"
        assert data["federation_status"] == "GRADIENTS_MERGED"

    def test_submit_gradients_unauthorized_node(self):
        payload = {
            "node_id": "UNKNOWN-ROGUE-NODE",
            "metrics_summary": {
                "acute_surge_events": 50,
                "average_burn_rate_shift": 2.0
            }
        }
        response = client.post("/api/brics/model/gradients", json=payload)
        # It should fail on node ID not in BRICS_NODES first
        assert response.status_code == 403
        
    def test_submit_gradients_invalid_token(self):
        payload = {
            "node_id": "IN-DEL-01",
            "metrics_summary": {
                "acute_surge_events": 50,
                "average_burn_rate_shift": 2.0
            }
        }
        headers = {"X-BRICS-Node-Token": "wrong-token"}
        response = client.post("/api/brics/model/gradients", json=payload, headers=headers)
        assert response.status_code == 401

    def test_submit_gradients_invalid_metrics_schema(self):
        payload = {
            "node_id": "IN-DEL-01",
            "metrics_summary": {
                "acute_surge_events": -50,
                "average_burn_rate_shift": 999.0
            }
        }
        headers = {"X-BRICS-Node-Token": "token-del"}
        response = client.post("/api/brics/model/gradients", json=payload, headers=headers)
        assert response.status_code == 422
