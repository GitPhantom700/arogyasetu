from fastapi import APIRouter, HTTPException, Header, status
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional

from brics_federated import brics_fl_service, BRICS_NODES, MedicineCategory

VALID_TOKENS = {
    "IN-DEL-01": "token-del",
    "BR-SP-02": "token-sp",
    "RU-MOW-03": "token-ru",
    "CN-BJ-04": "token-cn",
    "ZA-JNB-05": "token-za"
}

router = APIRouter(
    prefix="/api/brics",
    tags=["BRICS+ Federated Learning"]
)

class MetricsSummary(BaseModel):
    acute_surge_events: int = Field(..., ge=0, le=100, description="Count of acute surge events")
    average_burn_rate_shift: float = Field(..., ge=-5.0, le=5.0, description="Normalized burn rate shift")

class GradientSubmitRequest(BaseModel):
    node_id: str = Field(..., example="IN-DEL-01", description="Registered BRICS+ Node Identifier")
    metrics_summary: MetricsSummary

@router.get("/model/weights")
async def get_model_weights(
    category: Optional[str] = None,
    medicine_category: Optional[str] = None
):
    selected = category or medicine_category or "Antidote"
    weights = await brics_fl_service.get_global_anomaly_weights(selected)
    return weights

@router.post("/model/gradients")
async def submit_gradients(
    request: GradientSubmitRequest,
    x_brics_node_token: Optional[str] = Header(None, alias="X-BRICS-Node-Token")
):
    if request.node_id not in BRICS_NODES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Node '{request.node_id}' is not an authorized BRICS+ network member."
        )
        
    if not x_brics_node_token or VALID_TOKENS.get(request.node_id) != x_brics_node_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing node token."
        )
        
    try:
        result = await brics_fl_service.submit_local_gradients(
            node_id=request.node_id,
            local_metrics=request.metrics_summary.model_dump()
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Federated learning service temporarily unavailable."
        )
