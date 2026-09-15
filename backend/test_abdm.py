import pytest
from fastapi.testclient import TestClient
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from main import app
from abdm_gateway import _MOCK_HFR_DB, _MOCK_HPR_DB

client = TestClient(app)

class TestABDMSovereignStack:

    def test_hfr_facilities_directory(self):
        """Test Milestone 2: Fetching HFR Directory"""
        response = client.get("/api/abdm/hfr/facilities")
        assert response.status_code == 200
        data = response.json()
        assert "facilities" in data
        assert len(data["facilities"]) == len(_MOCK_HFR_DB)
        
        # Verify a specific facility is present
        aun_dh = next((f for f in data["facilities"] if f["hfr_id"] == "IN-MH-PUN-00421"), None)
        assert aun_dh is not None
        assert aun_dh["facility_code"] == "DH-PUN-01"
        assert aun_dh["tier"] == "DH"

    def test_hpr_verification_success(self):
        """Test Milestone 1: Successful doctor verification"""
        valid_hpr = list(_MOCK_HPR_DB.keys())[0]
        response = client.post("/api/abdm/hpr/verify", json={"hpr_id": valid_hpr})
        assert response.status_code == 200
        data = response.json()
        assert data["verified"] is True
        assert "name" in data
        assert "role" in data

    def test_hpr_verification_failure(self):
        """Test Milestone 1: Failed doctor verification (invalid ID)"""
        response = client.post("/api/abdm/hpr/verify", json={"hpr_id": "INVALID-HPR"})
        assert response.status_code == 404
        data = response.json()
        assert data["detail"]["code"] == "HPR_ID_NOT_FOUND"

    def test_abha_validation_success(self):
        """Test Milestone 3: Successful ABHA patient linkage"""
        valid_abha = "12-3456-7890-1234"
        response = client.post("/api/abdm/abha/validate", json={"abha_id": valid_abha})
        assert response.status_code == 200
        data = response.json()
        assert data["linked"] is True
        assert "consent_token" in data
        assert data["abha_id"] == valid_abha
        assert data["fhir_resource_type"] == "MedicationDispense"

    def test_abha_validation_failure(self):
        """Test Milestone 3: Failed ABHA patient linkage (invalid format)"""
        invalid_abha = "1234567890"
        response = client.post("/api/abdm/abha/validate", json={"abha_id": invalid_abha})
        assert response.status_code == 422
        data = response.json()
        assert data["detail"]["code"] == "INVALID_ABHA_FORMAT"
