"""
AI Safety, Guardrails & Audit API Routes.
Build with AI: Code for Communities (Second Edition) - Track 01 Healthcare Supply Chain.
Microtask 3.4: AI Safety, Guardrails & Fallback Audit.

Endpoints:
1. GET  /api/safety/status: Circuit breaker operational states and safety metrics.
2. GET  /api/safety/violations: Historical audit log of AI safety violations and remediations.
3. POST /api/safety/circuit-breaker/reset: Reset tripped circuit breaker to CLOSED.
"""

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Query, HTTPException, status
from pydantic import BaseModel, Field

from ai_safety import (
    AISafetyGuard,
    rebalance_circuit_breaker,
    vision_circuit_breaker
)

router = APIRouter(prefix="/api/safety", tags=["AI Safety & Audit"])


class CircuitBreakerResetRequest(BaseModel):
    component: str = Field(..., description="Target circuit breaker to reset ('rebalance' or 'vision')")


@router.get(
    "/status",
    summary="Get real-time operational status of AI safety guardrails and circuit breakers"
)
async def get_safety_status() -> Dict[str, Any]:
    """
    Returns live health telemetry for all AI services:
    - Circuit Breakers: State (CLOSED / OPEN / HALF_OPEN), failure counts, trip thresholds.
    - Violation Counters: Cumulative safety intercepts partitioned by severity.
    """
    return AISafetyGuard.get_safety_status()


@router.get(
    "/violations",
    summary="Retrieve audit trail of intercepted AI safety anomalies and invariants"
)
async def list_safety_violations(
    limit: int = Query(50, ge=1, le=500, description="Max violations to return"),
    offset: int = Query(0, ge=0, description="Offset pagination index"),
    component: Optional[str] = Query(None, description="Filter by component ('rebalance_agent', 'ledger_vision', etc.)"),
    severity: Optional[str] = Query(None, description="Filter by severity ('CRITICAL', 'HIGH', 'WARNING', 'INFO')")
) -> Dict[str, Any]:
    """
    Audit endpoint querying immutable records from `ai_safety_violations`.
    Enables administrative compliance audits against attempted prompt injections,
    hallucinated entities, out-of-bounds quantities, and donor starvation maneuvers.
    """
    violations, total = AISafetyGuard.get_violations(
        limit=limit,
        offset=offset,
        component=component,
        severity=severity
    )
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "violations": violations
    }


@router.post(
    "/circuit-breaker/reset",
    summary="Manually reset a tripped circuit breaker after upstream recovery"
)
async def reset_circuit_breaker(req: CircuitBreakerResetRequest) -> Dict[str, Any]:
    """
    Administrative reset trigger for circuit breakers.
    Re-arms the circuit breaker to CLOSED state and zeroes error counters.
    """
    target = req.component.lower().strip()
    if target in ["rebalance", "rebalance_agent"]:
        rebalance_circuit_breaker.reset()
        cb_state = rebalance_circuit_breaker.get_status()
    elif target in ["vision", "ledger_vision"]:
        vision_circuit_breaker.reset()
        cb_state = vision_circuit_breaker.get_status()
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown component '{req.component}'. Expected 'rebalance' or 'vision'."
        )

    return {
        "status": "RESET_SUCCESSFUL",
        "component": target,
        "circuit_breaker": cb_state
    }


@router.post(
    "/circuits/{component}/reset",
    summary="RESTful reset of a specific circuit breaker"
)
async def reset_circuit_by_path(component: str) -> Dict[str, Any]:
    """
    RESTful path-parameter trigger to reset a named circuit breaker ('rebalance' or 'vision').
    """
    return await reset_circuit_breaker(CircuitBreakerResetRequest(component=component))

