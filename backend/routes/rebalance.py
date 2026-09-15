"""
Autonomous Rebalancing Agent REST API Routes.
Build with AI: Code for Communities (Second Edition) - Track 01 Healthcare Supply Chain.
Microtask 3.3: Gemini Autonomous Rebalancing Agent.

Endpoints:
1. POST /api/rebalance/recommend: Evaluates deficit and generates explainable transfer recommendations with Gemini AI.
2. POST /api/rebalance/apply: Applies a rebalancing proposal into the transfer state machine (SQLite transfers table).
3. GET  /api/rebalance/network-deficits: Scans all 15 facilities for deficits and surfaces ranked peer-to-peer rebalancing options.
"""

from typing import Optional, List
from fastapi import APIRouter, HTTPException, status, Query, BackgroundTasks

from database import get_db_path, execute_write_transaction_async
from schemas import (
    RebalanceRecommendationRequest,
    RebalanceRecommendationResponse,
    ApplyRebalanceRequest,
    ApplyRebalanceResponse,
    NetworkDeficitItem,
)
from rebalancer import autonomous_rebalancing_service, TOCTOUConflictError
from routes.stats import invalidate_stats_cache
from alerts import broadcast_transfer_event

router = APIRouter(prefix="/api/rebalance", tags=["Autonomous Rebalancing (Gemini AI)"])


@router.post(
    "/recommend",
    response_model=RebalanceRecommendationResponse,
    summary="Generate an autonomous AI rebalancing recommendation with explainable clinical rationale"
)
async def get_rebalance_recommendation(req: RebalanceRecommendationRequest):
    """
    Evaluates a specific facility and medicine deficit against all candidate donors within radius.
    Enforces that donor must retain at least min_donor_buffer_days (default: 14 days) buffer.
    Supports Monsoon Multiplier (1.5x buffer) for Sahyadri Ghats mountain facilities.
    Generates explainable clinical and logistical reasoning via Google Gemini 3.6 Flash in medical SOAP format.
    """
    try:
        recommendation = autonomous_rebalancing_service.recommend_rebalance(
            recipient_facility_id=req.destination_facility_id,
            medicine_id=req.medicine_id,
            target_buffer_days=req.target_buffer_days,
            min_donor_buffer_days=req.min_donor_buffer_days,
            max_radius_km=req.max_radius_km,
            forced_urgency=req.urgency,
            monsoon_mode=req.monsoon_mode,
            db_path=get_db_path()
        )
        return recommendation
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(ve)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Rebalancing evaluation failed: {str(e)}"
        )


@router.post(
    "/apply",
    response_model=ApplyRebalanceResponse,
    summary="Accept and create an official transfer order from an AI rebalance recommendation"
)
async def apply_rebalance_recommendation(
    req: ApplyRebalanceRequest,
    background_tasks: BackgroundTasks
):
    """
    Transactionally commits the rebalancing transfer into the SQLite transfers table with ai_recommended=1.
    Guarded with an atomic TOCTOU verification that ensures donor surplus hasn't diminished.
    If auto_approve=True, executes immediate soft-reservation batch allocation.
    """
    def _apply_tx(conn):
        return autonomous_rebalancing_service.apply_recommendation(conn, req)

    try:
        res = await execute_write_transaction_async(get_db_path(), _apply_tx)

        # Invalidate dashboard stats cache
        background_tasks.add_task(invalidate_stats_cache)

        # Broadcast real-time SSE transfer alert
        background_tasks.add_task(
            broadcast_transfer_event,
            transfer_id=res.transfer_id,
            transfer_code=res.transfer_code,
            old_status="NONE",
            new_status=res.status,
            source_facility_id=req.source_facility_id,
            destination_facility_id=req.destination_facility_id,
            medicine_id=req.medicine_id,
            quantity=req.quantity,
            reason=f"AI Rebalance: {req.ai_rationale[:100] if req.ai_rationale else 'Peer Transfer'}"
        )

        return res
    except TOCTOUConflictError as tce:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(tce)
        )
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(ve)
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to apply rebalance transfer: {str(e)}"
        )


@router.get(
    "/network-deficits",
    response_model=List[NetworkDeficitItem],
    summary="Scan entire network for active deficits and ranked peer-to-peer rebalancing opportunities"
)
def get_network_deficits(
    max_radius_km: float = Query(50.0, ge=5.0, le=200.0, description="Maximum search radius in km"),
    min_donor_buffer_days: int = Query(14, ge=7, le=60, description="Mandatory donor retention buffer in days")
):
    """
    Scans all facilities across Pune and Satara districts for inventory deficits (WARNING or CRITICAL status).
    Returns list of items needing replenishment along with top viable donor facility and transit metrics.
    """
    try:
        deficits = autonomous_rebalancing_service.scan_network_deficits(
            db_path=get_db_path(),
            max_radius_km=max_radius_km,
            min_donor_buffer_days=min_donor_buffer_days
        )
        return deficits
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to scan network deficits: {str(e)}"
        )
