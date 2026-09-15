from typing import Dict, Any, Optional, List
import uuid
import re
import asyncio

# ---------------------------------------------------------
# Mock ABDM Registries (Encapsulated)
# ---------------------------------------------------------
_MOCK_HFR_DB = {
    "IN-MH-PUN-00421": {"facility_code": "DH-PUN-01", "name": "District Hospital Aundh", "status": "ACTIVE", "tier": "DH"},
    "IN-MH-PUN-00108": {"facility_code": "SDH-PUN-01", "name": "Sub-District Hospital Shirur", "status": "ACTIVE", "tier": "SDH"},
    "IN-MH-PUN-00302": {"facility_code": "CHC-PUN-01", "name": "Community Health Centre Khed", "status": "ACTIVE", "tier": "CHC"},
    "IN-MH-PUN-00215": {"facility_code": "CHC-PUN-02", "name": "Community Health Centre Junnar", "status": "ACTIVE", "tier": "CHC"},
    "IN-MH-PUN-00143": {"facility_code": "PHC-PUN-01", "name": "Primary Health Centre Kalyanpur", "status": "ACTIVE", "tier": "PHC"},
    "IN-MH-PUN-00088": {"facility_code": "PHC-PUN-02", "name": "Primary Health Centre Paud", "status": "ACTIVE", "tier": "PHC"},
    "IN-MH-PUN-00192": {"facility_code": "PHC-PUN-03", "name": "Primary Health Centre Yavat", "status": "ACTIVE", "tier": "PHC"},
    "IN-MH-PUN-00164": {"facility_code": "PHC-PUN-04", "name": "Primary Health Centre Wagholi", "status": "ACTIVE", "tier": "PHC"},
    "IN-MH-PUN-00012": {"facility_code": "SC-PUN-01", "name": "Sub-Centre Velhe", "status": "ACTIVE", "tier": "SC"},
    "IN-MH-SAT-00311": {"facility_code": "DH-SAT-01", "name": "District Hospital Satara", "status": "ACTIVE", "tier": "DH"},
    "IN-MH-SAT-00204": {"facility_code": "CHC-SAT-01", "name": "Community Health Centre Karad", "status": "ACTIVE", "tier": "CHC"},
    "IN-MH-SAT-00122": {"facility_code": "PHC-SAT-01", "name": "Primary Health Centre Wai", "status": "ACTIVE", "tier": "PHC"},
    "IN-MH-SAT-00155": {"facility_code": "PHC-SAT-02", "name": "Primary Health Centre Mahabaleshwar", "status": "ACTIVE", "tier": "PHC"},
    "IN-MH-SAT-00178": {"facility_code": "PHC-SAT-03", "name": "Primary Health Centre Koregaon", "status": "ACTIVE", "tier": "PHC"},
    "IN-MH-SAT-00009": {"facility_code": "SC-SAT-01", "name": "Sub-Centre Medha", "status": "ACTIVE", "tier": "SC"},
}

MOCK_HFR_DB = _MOCK_HFR_DB

_MOCK_HPR_DB = {
    "HPR-MH-104921": {"name": "Dr. Rajesh Gaikwad", "role": "Medical Officer", "status": "VERIFIED"},
    "HPR-MH-104922": {"name": "Dr. Sunita Deshmukh", "role": "Chief Medical Officer", "status": "VERIFIED"},
    "HPR-MH-104923": {"name": "Sanjay Patil", "role": "Pharmacist", "status": "VERIFIED"},
}

MOCK_HPR_DB = _MOCK_HPR_DB

class ABDMGatewayService:
    """Encapsulated ABDM Gateway service layer."""

    @staticmethod
    async def get_all_hfr_facilities() -> List[Dict[str, Any]]:
        await asyncio.sleep(0.05)
        return [
            {
                "hfr_id": hfr_id,
                "facility_code": data["facility_code"],
                "name": data["name"],
                "status": data["status"],
                "tier": data["tier"]
            }
            for hfr_id, data in _MOCK_HFR_DB.items()
        ]

    @staticmethod
    async def verify_hfr_facility(hfr_id: str, expected_facility_code: Optional[str] = None) -> Dict[str, Any]:
        await asyncio.sleep(0.05)
        clean_id = hfr_id.strip().upper()
        if clean_id not in _MOCK_HFR_DB:
            return {"verified": False, "reason": "HFR_ID_NOT_FOUND"}
        
        record = _MOCK_HFR_DB[clean_id]
        if record["status"] != "ACTIVE":
            return {"verified": False, "reason": "FACILITY_INACTIVE"}
            
        if expected_facility_code and record["facility_code"] != expected_facility_code.strip().upper():
            return {"verified": False, "reason": "FACILITY_MISMATCH"}
            
        return {"verified": True, "facility_name": record["name"], "tier": record["tier"], "hfr_id": clean_id}

    @staticmethod
    async def verify_hpr_professional(hpr_id: str) -> Dict[str, Any]:
        await asyncio.sleep(0.05)
        clean_id = hpr_id.strip().upper()
        if clean_id not in _MOCK_HPR_DB:
            return {"verified": False, "reason": "HPR_ID_NOT_FOUND"}
            
        record = _MOCK_HPR_DB[clean_id]
        if record["status"] != "VERIFIED":
            return {"verified": False, "reason": "PROFESSIONAL_NOT_VERIFIED"}
            
        return {"verified": True, "name": record["name"], "role": record["role"], "hpr_id": clean_id}

    @staticmethod
    async def link_abha_dispense(abha_id: str) -> Dict[str, Any]:
        await asyncio.sleep(0.05)
        clean_id = abha_id.strip()
        
        # Validate 14-digit ABHA (XX-XXXX-XXXX-XXXX), PHR Address (user@abdm), or valid hackathon mock token
        is_14_digit = bool(re.match(r"^\d{2}-\d{4}-\d{4}-\d{4}$", clean_id))
        is_phr_addr = bool(re.match(r"^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$", clean_id))
        is_mock = clean_id.startswith("ABHA-") and len(clean_id) == 22 and clean_id[5:].isalnum()

        if not (is_14_digit or is_phr_addr or is_mock):
            return {"linked": False, "reason": "INVALID_ABHA_FORMAT"}
            
        return {
            "linked": True,
            "consent_token": f"CONSENT-{uuid.uuid4().hex[:16].upper()}",
            "fhir_resource_type": "MedicationDispense",
            "abha_id": clean_id
        }
