from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from abdm_gateway import ABDMGatewayService

router = APIRouter(prefix="/api/abdm", tags=["ABDM Sovereign Stack"])

# ---------------------------------------------------------
# Robust Pydantic Schemas with Field Validation
# ---------------------------------------------------------
class HfrVerifyRequest(BaseModel):
    hfr_id: str = Field(..., min_length=5, max_length=30, example="IN-MH-PUN-00421")
    expected_facility_code: Optional[str] = Field(None, example="DH-PUN-01")

    @field_validator("hfr_id")
    def validate_hfr(cls, v: str) -> str:
        v = v.strip().upper()
        if not v:
            raise ValueError("HFR ID cannot be empty")
        return v

class HprVerifyRequest(BaseModel):
    hpr_id: str = Field(..., min_length=5, max_length=30, example="HPR-MH-104921")

    @field_validator("hpr_id")
    def validate_hpr(cls, v: str) -> str:
        v = v.strip().upper()
        if not v:
            raise ValueError("HPR ID cannot be empty")
        return v

class AbhaValidateRequest(BaseModel):
    abha_id: str = Field(..., min_length=5, max_length=50, example="12-3456-7890-1234")

    @field_validator("abha_id")
    def validate_abha(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("ABHA ID cannot be empty")
        return v

# Output Schemas for OpenAPI Documentation
class FacilityItem(BaseModel):
    hfr_id: str
    facility_code: str
    name: str
    status: str
    tier: str

class HfrFacilitiesResponse(BaseModel):
    facilities: List[FacilityItem]

class HfrVerifyResponse(BaseModel):
    verified: bool
    facility_name: Optional[str] = None
    tier: Optional[str] = None
    hfr_id: str

class HprVerifyResponse(BaseModel):
    verified: bool
    name: str
    role: str
    hpr_id: str

class AbhaLinkResponse(BaseModel):
    linked: bool
    consent_token: str
    fhir_resource_type: str
    abha_id: str

# ---------------------------------------------------------
# Endpoint Routes
# ---------------------------------------------------------
@router.get("/hfr/facilities", response_model=HfrFacilitiesResponse)
async def get_hfr_facilities():
    facilities = await ABDMGatewayService.get_all_hfr_facilities()
    return {"facilities": facilities}

@router.post("/hfr/verify", response_model=HfrVerifyResponse)
async def verify_hfr(request: HfrVerifyRequest):
    result = await ABDMGatewayService.verify_hfr_facility(request.hfr_id, request.expected_facility_code)
    if not result["verified"]:
        status_map = {
            "HFR_ID_NOT_FOUND": status.HTTP_404_NOT_FOUND,
            "FACILITY_MISMATCH": status.HTTP_409_CONFLICT,
            "FACILITY_INACTIVE": status.HTTP_400_BAD_REQUEST
        }
        mapped_status = status_map.get(result["reason"], status.HTTP_400_BAD_REQUEST)
        raise HTTPException(
            status_code=mapped_status,
            detail={"code": result["reason"], "message": f"HFR Verification failed: {result['reason']}"}
        )
    return result

@router.post("/hpr/verify", response_model=HprVerifyResponse)
async def verify_hpr(request: HprVerifyRequest):
    result = await ABDMGatewayService.verify_hpr_professional(request.hpr_id)
    if not result["verified"]:
        status_map = {
            "HPR_ID_NOT_FOUND": status.HTTP_404_NOT_FOUND,
            "PROFESSIONAL_NOT_VERIFIED": status.HTTP_400_BAD_REQUEST
        }
        mapped_status = status_map.get(result["reason"], status.HTTP_400_BAD_REQUEST)
        raise HTTPException(
            status_code=mapped_status,
            detail={"code": result["reason"], "message": f"HPR Verification failed: {result['reason']}"}
        )
    return result

@router.post("/abha/validate", response_model=AbhaLinkResponse)
async def validate_abha(request: AbhaValidateRequest):
    result = await ABDMGatewayService.link_abha_dispense(request.abha_id)
    if not result["linked"]:
        # Only one reason right now: INVALID_ABHA_FORMAT
        mapped_status = status.HTTP_422_UNPROCESSABLE_ENTITY
        raise HTTPException(
            status_code=mapped_status,
            detail={"code": result["reason"], "message": f"ABHA linking failed: {result['reason']}"}
        )
    return result
