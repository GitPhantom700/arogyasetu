"""
Crisis Simulation Engine REST API Routes.
Build with AI: Code for Communities (Second Edition) - Track 03 Smart Health & Supply Chain Resilience.
Day 16: Microtask 5.1 — Crisis & Outbreak Simulation Engine.

Endpoints:
1. GET  /api/crisis/scenarios: Lists all available authentic disaster/epidemic scenarios.
2. POST /api/crisis/trigger: Injects crisis surge, triggers SSE events, and generates multi-facility rebalance plans.
3. POST /api/crisis/reset: Restores baseline inventory from atomic snapshot and clears simulation state.
4. GET  /api/crisis/status: Retrieves live simulation telemetry and affected nodes count.
5. POST /api/crisis/swarm-dispatch: Batch-authorizes all auto-generated crisis rebalancing transfers.
"""

from typing import List, Dict, Any, Optional
import logging
from fastapi import APIRouter, HTTPException, status, BackgroundTasks, Query
from pydantic import BaseModel, ConfigDict, model_validator

from database import get_db_path
from schemas import (
    CrisisScenarioResponse,
    TriggerCrisisRequest,
    TriggerCrisisResponse,
    CrisisStatusResponse,
    ResetCrisisResponse,
    ApplyRebalanceRequest,
)
from crisis_simulator import crisis_simulator_service
from rebalancer import autonomous_rebalancing_service
from routes.stats import invalidate_stats_cache
from alerts import broadcast_transfer_event

logger = logging.getLogger("pranavahini.routes.crisis")
router = APIRouter(prefix="/api/crisis", tags=["Crisis Simulation Engine"])


@router.get(
    "/scenarios",
    response_model=List[CrisisScenarioResponse],
    summary="List all available public health emergency and outbreak simulation scenarios"
)
def get_crisis_scenarios(lang: str = Query("en", description="Locale code: en, mr, or hi")):
    """Returns available pre-configured emergency scenarios with clinical context and multipliers."""
    return crisis_simulator_service.get_scenarios(lang=lang)


@router.get(
    "/status",
    response_model=CrisisStatusResponse,
    summary="Get the current simulation status and active scenario telemetry"
)
def get_crisis_status():
    """Returns whether a crisis simulation is active, duration, and impacted facilities."""
    return crisis_simulator_service.get_status(get_db_path())


@router.post(
    "/trigger",
    response_model=TriggerCrisisResponse,
    summary="Trigger a simulated public health emergency shock (e.g. Monsoon Flooding & Snakebite Spike)"
)
async def trigger_crisis_simulation(req: TriggerCrisisRequest):
    """
    Executes an acute outbreak or natural disaster surge on the regional supply chain:
    - Feeds acute emergency consumption into targeted facilities and medicines.
    - Emits high-priority Server-Sent Events (SSE) across the network.
    - Evaluates deficits and automatically generates multi-facility peer-to-peer rebalancing plans.
    """
    try:
        res = await crisis_simulator_service.trigger_crisis(
            scenario_id=req.scenario_id,
            intensity=req.intensity,
            auto_generate_rebalance=req.auto_generate_rebalance,
            db_path=get_db_path()
        )
        return res
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(ve)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to execute crisis simulation: {str(e)}"
        )


@router.post(
    "/reset",
    response_model=ResetCrisisResponse,
    summary="Reset active crisis simulation and restore pre-crisis baseline inventory"
)
async def reset_crisis_simulation():
    """
    Rolls back simulated emergency depletions using the pre-crisis baseline snapshot:
    - Restores exact stock batch quantities.
    - Broadcasts system recovery SSE event.
    - Returns network to nominal operational state.
    """
    try:
        res = await crisis_simulator_service.reset_simulation(get_db_path())
        return res
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reset crisis simulation: {str(e)}"
        )


class SwarmDispatchItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    recommendation_id: Optional[str] = None
    recipient_facility_id: int
    donor_facility_id: int
    medicine_id: int
    quantity: Optional[int] = None
    recommended_quantity: Optional[int] = None
    reason: Optional[str] = "Emergency Swarm Rebalancing"

    @model_validator(mode="after")
    def populate_quantity(self):
        if self.quantity is None:
            if self.recommended_quantity is not None:
                self.quantity = self.recommended_quantity
            else:
                self.quantity = 1
        return self


class SwarmDispatchResponse(BaseModel):
    dispatched_count: int
    transfers: List[Dict[str, Any]]
    skipped_count: int = 0
    skipped: List[Dict[str, Any]] = []
    message: str


@router.post(
    "/swarm-dispatch",
    response_model=SwarmDispatchResponse,
    summary="Batch-authorize and dispatch all crisis rebalancing proposals in a single click"
)
async def swarm_dispatch_crisis_transfers(
    plans: List[SwarmDispatchItem],
    background_tasks: BackgroundTasks
):
    """
    Automates immediate swarm dispatch for all multi-facility emergency redistribution proposals.
    Applies live anti-cannibalization validation between sequential transfers to ensure donors
    are never starved below their mandatory 14-day (21-day in Monsoon) safety floor.
    """
    dispatched = []
    skipped = []
    from database import execute_write_transaction_sync, get_connection

    for plan in plans:
        # Re-check live donor stock and retention buffer before dispatching
        conn = get_connection(get_db_path())
        cursor = conn.cursor()
        try:
            cursor.execute("""
                SELECT COALESCE(SUM(quantity_available), 0) AS live_stock
                FROM stock_batches
                WHERE facility_id = ? AND medicine_id = ? AND status = 'ACTIVE';
            """, (plan.donor_facility_id, plan.medicine_id))
            live_donor_stock = cursor.fetchone()["live_stock"]

            cursor.execute("""
                SELECT min_safety_stock, name
                FROM medicines WHERE id = ?;
            """, (plan.medicine_id,))
            med_row = cursor.fetchone()
            min_safety = med_row["min_safety_stock"] if med_row and med_row["min_safety_stock"] else 20
            med_name = med_row["name"] if med_row else "Medicine"

            daily_burn = 2.0
            try:
                from burn_rate import calculate_depletion_metrics
                burn_res = calculate_depletion_metrics(
                    facility_id=plan.donor_facility_id,
                    medicine_id=plan.medicine_id,
                    window_days=7
                )
                item = burn_res["items"][0] if burn_res and burn_res.get("items") else None
                if item and item.get("daily_average_consumption"):
                    daily_burn = max(0.5, float(item["daily_average_consumption"]))
            except Exception:
                daily_burn = 2.0

            cursor.execute("SELECT name, terrain_type FROM facilities WHERE id = ?;", (plan.donor_facility_id,))
            donor_fac = cursor.fetchone()
            donor_name = donor_fac["name"] if donor_fac else f"Facility #{plan.donor_facility_id}"

            is_monsoon = "MONSOON" in (plan.reason or "").upper() or (donor_fac and donor_fac["terrain_type"] == "GHAT_MOUNTAIN")
            min_required_days = 21 if is_monsoon else 14

            remaining_stock = live_donor_stock - plan.quantity
            retained_buffer_days = remaining_stock / daily_burn if daily_burn > 0 else 999.0

            if remaining_stock < min_safety or retained_buffer_days < min_required_days:
                # Anti-cannibalization guard: calculate safe surplus
                safe_surplus = max(0, int(live_donor_stock - max(min_safety, daily_burn * min_required_days)))
                if safe_surplus <= 0:
                    logger.warning(
                        f"[SwarmDispatch] Skipping transfer: Donor {donor_name} buffer would drop to "
                        f"{retained_buffer_days:.1f} days (minimum {min_required_days} required, min safety: {min_safety}). Cannibalization prevented."
                    )
                    skipped.append({
                        "donor_facility_id": plan.donor_facility_id,
                        "recipient_facility_id": plan.recipient_facility_id,
                        "medicine_id": plan.medicine_id,
                        "reason": f"Donor {donor_name} retention buffer violation ({retained_buffer_days:.1f}d < {min_required_days}d threshold). Cannibalization prevented."
                    })
                    continue
                else:
                    # Clamp transfer to safe surplus
                    logger.info(f"[SwarmDispatch] Clamping swarm transfer quantity from {plan.quantity} to safe surplus {safe_surplus} for {donor_name}")
                    plan.quantity = safe_surplus

        finally:
            conn.close()

        req = ApplyRebalanceRequest(
            source_facility_id=plan.donor_facility_id,
            destination_facility_id=plan.recipient_facility_id,
            medicine_id=plan.medicine_id,
            quantity=plan.quantity,
            auto_approve=True,
            ai_rationale=plan.reason or "Emergency Crisis Swarm Redistribution",
            requested_by="Emergency Crisis Operations Coordinator"
        )
        try:
            res = execute_write_transaction_sync(
                get_db_path(),
                lambda c: autonomous_rebalancing_service.apply_recommendation(c, req)
            )
            dispatched.append({
                "transfer_id": res.transfer_id,
                "transfer_code": res.transfer_code,
                "status": res.status,
                "medicine_name": res.medicine_name,
                "quantity": res.quantity,
            })
            background_tasks.add_task(
                broadcast_transfer_event,
                transfer_id=res.transfer_id,
                transfer_code=res.transfer_code,
                old_status="NONE",
                new_status=res.status,
                source_facility_id=plan.donor_facility_id,
                destination_facility_id=plan.recipient_facility_id,
                medicine_id=plan.medicine_id,
                quantity=plan.quantity,
                reason=plan.reason
            )
        except Exception as err:
            logger.warning(f"[SwarmDispatch] Failed to dispatch transfer for plan {plan}: {err}")
            skipped.append({
                "donor_facility_id": plan.donor_facility_id,
                "recipient_facility_id": plan.recipient_facility_id,
                "medicine_id": plan.medicine_id,
                "reason": str(err)
            })

    background_tasks.add_task(invalidate_stats_cache)

    return {
        "dispatched_count": len(dispatched),
        "transfers": dispatched,
        "skipped_count": len(skipped),
        "skipped": skipped,
        "message": f"Successfully authorized & dispatched {len(dispatched)} emergency redistribution corridors ({len(skipped)} skipped to prevent donor cannibalization)."
    }
