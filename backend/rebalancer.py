"""
Autonomous Rebalancing Agent Core Engine (Google Gemini AI & Clinical Optimization).
Build with AI: Code for Communities - Track 03 Smart Health & Supply Chain Resilience.
Microtask 3.3: Gemini Autonomous Rebalancing Agent.

Features:
1. Deterministic candidate donor discovery within configurable radius (default: 50 km).
2. Strict Donor Safety Buffer protection: Donor must retain at least 14 days of protective stock
   (Retention Buffer = max(min_safety_stock, ceil(14 * DAC))). Surplus = max(0, stock - Retention Buffer).
3. Geospatial & terrain-aware transit physics (Haversine + Ghats/Plains/Highway speeds).
4. Perishable cold-chain compatibility and transit-aware FEFO batch availability.
5. Google Gemini 3.6 Flash integration with structured Pydantic schema output.
6. Deterministic offline clinical scoring fallback for environments without API keys.
7. Atomic transfer order application into SQLite transfer state machine.
"""

import os
import json
import math
import uuid
import time
import sqlite3
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path

from database import get_connection, get_db_path
from schemas import (
    TransferUrgency,
    TransferStatus,
    DonorCandidateInfo,
    RebalanceRecommendationPayload,
    RebalanceRecommendationResponse,
    ApplyRebalanceRequest,
    ApplyRebalanceResponse,
    NetworkDeficitItem,
    CreateTransferRequest,
)
from transfers_core import (
    calculate_haversine_distance,
    estimate_transit_time,
    allocate_fefo_batches,
)
from burn_rate import calculate_depletion_metrics
from ai_safety import rebalance_circuit_breaker, AISafetyGuard

logger = logging.getLogger("rebalancer")
logger.setLevel(logging.INFO)

# In-memory recommendation registry for fast 1-click apply verification
_RECOMMENDATION_CACHE: Dict[str, Dict[str, Any]] = {}


class TOCTOUConflictError(Exception):
    """Raised when concurrent consumption or reservation depletes donor surplus before rebalance commitment."""
    pass


def _get_utc_now() -> datetime:
    return datetime.now(timezone.utc)


def calculate_facility_deficit(
    conn_or_path: Any,
    facility_id: int,
    medicine_id: int,
    target_buffer_days: int = 14
) -> Dict[str, Any]:
    """
    Calculates inventory deficit and depletion metrics for a specific facility and medicine.
    Determines how many units are required to elevate the clinic to a healthy operational buffer.
    """
    should_close = False
    if isinstance(conn_or_path, (str, Path)) or conn_or_path is None:
        conn = get_connection(conn_or_path)
        should_close = True
    else:
        conn = conn_or_path

    try:
        cur = conn.cursor()

        # Fetch Facility details
        cur.execute("""
            SELECT id, facility_code, name, district, latitude, longitude, terrain_type, has_cold_chain
            FROM facilities
            WHERE id = ? AND is_active = 1;
        """, (facility_id,))
        fac = cur.fetchone()
        if not fac:
            raise ValueError(f"Facility #{facility_id} not found or inactive.")

        # Fetch Medicine details
        cur.execute("""
            SELECT id, sku, name, category, unit, min_safety_stock, is_emergency, requires_cold_chain
            FROM medicines
            WHERE id = ? AND is_active = 1;
        """, (medicine_id,))
        med = cur.fetchone()
        if not med:
            raise ValueError(f"Medicine #{medicine_id} not found or inactive.")

        # Calculate burn rate metrics
        burn_res = calculate_depletion_metrics(
            facility_id=facility_id,
            medicine_id=medicine_id,
            window_days=7
        )

        item = burn_res["items"][0] if burn_res["items"] else None
        current_stock = item["current_stock"] if item else 0
        dac = float(item["daily_average_consumption"]) if item else 0.0
        dir_val = float(item["days_of_inventory_remaining"]) if (item and item["days_of_inventory_remaining"] is not None) else None
        status_val = item["status"] if item else "HEALTHY"

        # Calculate target stock required to achieve target_buffer_days
        min_safety = int(med["min_safety_stock"])
        target_stock = max(min_safety, math.ceil(target_buffer_days * dac))
        deficit = max(0, target_stock - current_stock)

        return {
            "facility_id": fac["id"],
            "facility_code": fac["facility_code"],
            "facility_name": fac["name"],
            "district": fac["district"],
            "latitude": fac["latitude"],
            "longitude": fac["longitude"],
            "terrain_type": fac["terrain_type"],
            "has_cold_chain": bool(fac["has_cold_chain"]),
            "medicine_id": med["id"],
            "medicine_sku": med["sku"],
            "medicine_name": med["name"],
            "medicine_category": med["category"],
            "medicine_unit": med["unit"],
            "min_safety_stock": min_safety,
            "is_emergency": bool(med["is_emergency"]),
            "requires_cold_chain": bool(med["requires_cold_chain"]),
            "current_stock": current_stock,
            "dac": dac,
            "dir": dir_val,
            "status": status_val,
            "target_stock": target_stock,
            "deficit": deficit,
        }
    finally:
        if should_close:
            conn.close()


def find_candidate_donors(
    conn_or_path: Any,
    recipient_facility_id: int,
    medicine_id: int,
    max_radius_km: float = 50.0,
    min_donor_buffer_days: int = 14,
    recipient_dac: float = 0.0,
    recipient_deficit: int = 0,
    monsoon_mode: bool = False
) -> List[DonorCandidateInfo]:
    """
    Finds and ranks all candidate donor facilities within max_radius_km of recipient.
    Strictly enforces:
    1. Distance boundary: Haversine distance <= max_radius_km.
    2. Cold-chain compatibility: If medicine requires cold chain, donor must possess cold chain facility.
    3. Mandatory Donor Retention Buffer:
       Donor must retain max(donor.min_safety_stock, ceil(effective_buffer_days * donor.DAC)).
       Applies 1.5x Monsoon Multiplier (e.g. 21 days) if monsoon_mode is True or during June-Sept
       in GHAT_MOUNTAIN terrain to prevent mountain isolation stockouts.
       Surplus = max(0, donor.stock - donor.retention_buffer).
    4. Consumption-Aware Perishable Batch Validity:
       Batches must not expire before:
       today + transit_days + ceil(recipient_deficit / max(0.1, recipient_dac)) + 7 days
       guaranteeing recipient patients consume all units safely before expiry.
    """
    should_close = False
    if isinstance(conn_or_path, (str, Path)) or conn_or_path is None:
        conn = get_connection(conn_or_path)
        should_close = True
    else:
        conn = conn_or_path

    try:
        cur = conn.cursor()

        # Recipient coordinates and medicine requirements
        cur.execute("""
            SELECT latitude, longitude, terrain_type, has_cold_chain
            FROM facilities WHERE id = ?;
        """, (recipient_facility_id,))
        rec_fac = cur.fetchone()
        if not rec_fac:
            return []

        cur.execute("""
            SELECT requires_cold_chain, min_safety_stock, is_emergency
            FROM medicines WHERE id = ?;
        """, (medicine_id,))
        med = cur.fetchone()
        if not med:
            return []

        requires_cold_chain = bool(med["requires_cold_chain"])
        rec_lat = rec_fac["latitude"]
        rec_lon = rec_fac["longitude"]
        rec_terrain = rec_fac["terrain_type"]

        # Fetch all candidate donor facilities (excluding recipient)
        query = """
            SELECT id, facility_code, name, district, latitude, longitude, terrain_type, has_cold_chain
            FROM facilities
            WHERE id != ? AND is_active = 1
        """
        params: List[Any] = [recipient_facility_id]
        if requires_cold_chain:
            query += " AND has_cold_chain = 1"

        cur.execute(query, params)
        all_donors = cur.fetchall()

        candidates: List[DonorCandidateInfo] = []
        now_dt = _get_utc_now()
        is_monsoon_month = now_dt.month in [6, 7, 8, 9]

        for d in all_donors:
            donor_id = d["id"]
            d_lat = d["latitude"]
            d_lon = d["longitude"]
            d_terrain = d["terrain_type"]

            # Calculate Haversine distance
            dist_km = calculate_haversine_distance(rec_lat, rec_lon, d_lat, d_lon)
            if dist_km > max_radius_km:
                continue

            # Calculate terrain-aware transit duration
            transit_hours = estimate_transit_time(dist_km, d_terrain, rec_terrain)
            transit_days = math.ceil(transit_hours / 24.0)

            # Consumption-Aware Batch Expiry Calculation:
            # Expiry >= today + transit_days + min(180, ceil(recipient_deficit / max(0.1, recipient_dac))) + 7 days
            # Enforces 180-day operational upper bound ceiling cap on consumption horizon per Stage 3 audit directive.
            if recipient_deficit > 0:
                effective_recipient_dac = max(0.1, recipient_dac)
                consumption_days = min(180, math.ceil(recipient_deficit / effective_recipient_dac))
                required_shelf_days = transit_days + consumption_days + 7
            else:
                required_shelf_days = max(7, transit_days + 7)

            min_viable_expiry = (now_dt + timedelta(days=required_shelf_days)).strftime("%Y-%m-%d")

            # Check donor's active viable stock and batches meeting consumption-aware shelf life
            cur.execute("""
                SELECT 
                    COALESCE(SUM(quantity_available), 0) AS total_viable_stock,
                    COUNT(*) AS batch_count,
                    MIN(expiry_date) AS earliest_expiry
                FROM stock_batches
                WHERE facility_id = ? AND medicine_id = ? AND status = 'ACTIVE' AND expiry_date >= ?;
            """, (donor_id, medicine_id, min_viable_expiry))
            stock_res = cur.fetchone()

            current_stock = int(stock_res["total_viable_stock"]) if stock_res else 0
            batch_count = int(stock_res["batch_count"]) if stock_res else 0
            earliest_expiry = stock_res["earliest_expiry"] if stock_res else None

            if current_stock <= 0:
                continue

            # Compute donor's Daily Average Consumption (DAC) from last 7 days
            cur.execute("""
                SELECT COALESCE(SUM(quantity), 0) AS total_consumed
                FROM inventory_transactions
                WHERE facility_id = ? AND medicine_id = ? 
                  AND transaction_type = 'CONSUMED'
                  AND created_at >= datetime('now', '-7 days');
            """, (donor_id, medicine_id))
            consumed_row = cur.fetchone()
            consumed_window = int(consumed_row["total_consumed"]) if consumed_row else 0
            donor_dac = round(consumed_window / 7.0, 2)
            donor_dir = round(current_stock / donor_dac, 1) if donor_dac > 0 else None

            # Monsoon Multiplier Protection:
            # In Sahyadri Ghats (GHAT_MOUNTAIN), scale buffer by 1.5x (e.g. 14 -> 21 days)
            # if monsoon_mode is activated or during South-West Monsoon months (June - Sept).
            donor_is_ghat = (d_terrain == "GHAT_MOUNTAIN")
            if monsoon_mode or (is_monsoon_month and donor_is_ghat):
                effective_donor_buffer_days = int(math.ceil(min_donor_buffer_days * 1.5))
            else:
                effective_donor_buffer_days = min_donor_buffer_days

            donor_min_stock = int(med["min_safety_stock"])
            donor_retention = max(donor_min_stock, math.ceil(effective_donor_buffer_days * donor_dac))
            surplus = max(0, current_stock - donor_retention)

            # Calculate multi-objective suitability score (0 - 100)
            # Prioritizes: 1. Surplus availability (45%), 2. Proximity (30%), 3. Transit speed (25%)
            distance_score = max(0.0, 1.0 - (dist_km / max_radius_km))
            transit_score = max(0.0, 1.0 - (transit_hours / 4.0))
            surplus_score = min(1.0, surplus / max(1, donor_retention))

            suitability = round(
                100.0 * (0.45 * surplus_score + 0.30 * distance_score + 0.25 * transit_score),
                1
            )

            candidate = DonorCandidateInfo(
                facility_id=donor_id,
                facility_code=d["facility_code"],
                facility_name=d["name"],
                district=d["district"],
                latitude=d_lat,
                longitude=d_lon,
                distance_km=dist_km,
                estimated_transit_hours=transit_hours,
                terrain_type=d_terrain,
                has_cold_chain=bool(d["has_cold_chain"]),
                current_stock=current_stock,
                daily_average_consumption=donor_dac,
                days_of_inventory_remaining=donor_dir,
                min_safety_stock=donor_min_stock,
                retention_buffer=donor_retention,
                surplus_available=surplus,
                viable_batch_count=batch_count,
                earliest_viable_expiry=earliest_expiry,
                suitability_score=suitability
            )
            candidates.append(candidate)

        # Sort candidates: First by surplus availability (>0 first), then by suitability score descending
        candidates.sort(key=lambda c: (1 if c.surplus_available > 0 else 0, c.suitability_score or 0.0), reverse=True)
        return candidates

    finally:
        if should_close:
            conn.close()


REBALANCER_SYSTEM_PROMPT = """You are the Principal Emergency Healthcare Logistics Rebalancing Agent for the Pulse & Route platform across rural Maharashtra (Pune and Satara districts).

Your mandate is to evaluate Primary Health Centre (PHC) medicine deficits and recommend an optimal, safe inter-facility stock redistribution transfer.

STRICT CLINICAL RULES:
1. ZERO DONOR DEPLETION INVARIANT: A donor facility must NEVER be depleted below its mandatory safety buffer (Surplus Available). You may only recommend transfer quantities less than or equal to the selected donor's surplus_available.
2. TRANSIT FEASIBILITY: Balance distance, road transit time, and terrain type (e.g. Ghat mountains vs highways). Anti-snake venom and emergency biologics require rapid transit.
3. EXPLAINABILITY (SOAP NOTE FORMAT): Structure clinical_rationale strictly according to standard healthcare SOAP note format:
   [S - Subjective] Recipient clinical presentation, urgency, community risk (snakebite, rabies, maternal hemorrhage).
   [O - Objective] Hard operational metrics: recipient current stock, DAC, DIR, deficit; donor current stock, retention buffer, transit hours.
   [A - Assessment] Clinical justification of donor suitability, zero donor depletion verification, and secondary stockout prevention confirmation.
   [P - Plan] Explicit dispatch guidelines, transfer quantity, cold-chain protocol, and projected post-transfer buffer.
4. OUTPUT FORMAT: Adhere strictly to the requested JSON schema.
"""


class AutonomousRebalancingService:
    """
    Intelligent Autonomous Rebalancing Agent orchestrating Gemini Flash LLM reasoning
    with deterministic clinical safety invariants and offline fallback support.
    """

    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.model_name = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
        self._client = None

    def _get_client(self):
        if not self.api_key:
            return None
        if self._client is None:
            try:
                from google import genai
                self._client = genai.Client(api_key=self.api_key)
            except Exception as e:
                logger.warning(f"Failed to initialize google-genai Client: {e}")
                self._client = None
        return self._client

    def recommend_rebalance(
        self,
        recipient_facility_id: int,
        medicine_id: int,
        target_buffer_days: int = 14,
        min_donor_buffer_days: int = 14,
        max_radius_km: float = 50.0,
        forced_urgency: Optional[TransferUrgency] = None,
        monsoon_mode: bool = False,
        db_path: Optional[Path] = None
    ) -> RebalanceRecommendationResponse:
        """
        Main entrypoint: analyzes recipient deficit, finds candidates, calls Gemini AI or offline fallback,
        and constructs a complete RebalanceRecommendationResponse.
        Enforces Monsoon Multipliers for Sahyadri Ghats, Consumption-Aware Expiry Math, and Zero Donor Depletion Invariants.
        """
        now_dt = _get_utc_now()
        now_iso = now_dt.strftime("%Y-%m-%d %H:%M:%S UTC")
        rec_id = f"REC-{now_dt.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

        # Coerce string urgency to TransferUrgency enum if needed
        if isinstance(forced_urgency, str):
            try:
                forced_urgency = TransferUrgency(forced_urgency)
            except ValueError:
                forced_urgency = TransferUrgency.URGENT

        # 1. Compute baseline recipient deficit
        recipient_info = calculate_facility_deficit(
            conn_or_path=db_path,
            facility_id=recipient_facility_id,
            medicine_id=medicine_id,
            target_buffer_days=target_buffer_days
        )

        # Monsoon Multiplier Check:
        # If monsoon_mode is requested OR if recipient is in GHAT_MOUNTAIN during June-Sept
        is_monsoon_season = now_dt.month in [6, 7, 8, 9]
        rec_is_ghat = (recipient_info.get("terrain_type") == "GHAT_MOUNTAIN")
        apply_monsoon = monsoon_mode or (is_monsoon_season and rec_is_ghat)

        effective_target_buffer_days = int(math.ceil(target_buffer_days * 1.5)) if apply_monsoon else target_buffer_days
        effective_min_donor_buffer_days = int(math.ceil(min_donor_buffer_days * 1.5)) if apply_monsoon else min_donor_buffer_days

        # If monsoon buffer altered target days, recalculate recipient deficit to reflect enhanced protection
        if apply_monsoon and effective_target_buffer_days != target_buffer_days:
            recipient_info = calculate_facility_deficit(
                conn_or_path=db_path,
                facility_id=recipient_facility_id,
                medicine_id=medicine_id,
                target_buffer_days=effective_target_buffer_days
            )

        deficit = recipient_info["deficit"]
        is_emergency = recipient_info["is_emergency"]
        status_val = recipient_info["status"]

        # If already healthy with zero deficit
        if deficit <= 0:
            resp = RebalanceRecommendationResponse(
                recommendation_id=rec_id,
                generated_at=now_iso,
                model_used="deterministic-rule-engine",
                destination_facility_id=recipient_facility_id,
                destination_facility_name=recipient_info["facility_name"],
                medicine_id=medicine_id,
                medicine_name=recipient_info["medicine_name"],
                medicine_unit=recipient_info["medicine_unit"],
                recipient_current_stock=recipient_info["current_stock"],
                recipient_dac=recipient_info["dac"],
                recipient_dir=recipient_info["dir"],
                recipient_status=status_val,
                calculated_deficit=0,
                recommended_donor=None,
                recommended_quantity=0,
                recommended_urgency=TransferUrgency.ROUTINE,
                clinical_rationale=(
                    f"[S - Subjective] Routine inventory review at {recipient_info['facility_name']}.\n"
                    f"[O - Objective] Current stock {recipient_info['current_stock']} {recipient_info['medicine_unit']} "
                    f"exceeds target buffer of {effective_target_buffer_days} days (DAC: {recipient_info['dac']} units/day).\n"
                    f"[A - Assessment] Facility holds adequate operational coverage. Zero clinical risk detected.\n"
                    f"[P - Plan] No inter-PHC redistribution transfer required."
                ),
                tradeoff_analysis="Network inventory is balanced for this item.",
                risk_assessment="Zero clinical risk detected.",
                all_candidates_evaluated=[],
                is_feasible=False,
                monsoon_buffer_applied=apply_monsoon
            )
            return resp

        # 2. Discover viable candidate donors within radius with consumption-aware expiry
        candidates = find_candidate_donors(
            conn_or_path=db_path,
            recipient_facility_id=recipient_facility_id,
            medicine_id=medicine_id,
            max_radius_km=max_radius_km,
            min_donor_buffer_days=effective_min_donor_buffer_days,
            recipient_dac=recipient_info["dac"],
            recipient_deficit=deficit,
            monsoon_mode=monsoon_mode
        )

        viable_donors = [c for c in candidates if c.surplus_available > 0]

        # Determine default clinical urgency
        if forced_urgency:
            urgency = forced_urgency
        elif recipient_info["current_stock"] == 0 or (recipient_info["dir"] is not None and recipient_info["dir"] < 1.0):
            urgency = TransferUrgency.CRITICAL_EMERGENCY if is_emergency else TransferUrgency.URGENT
        elif status_val == "CRITICAL":
            urgency = TransferUrgency.URGENT
        else:
            urgency = TransferUrgency.ROUTINE

        # 3. Boundary check: If no viable donors with surplus exist
        if not viable_donors:
            rationale_text = (
                f"[S - Subjective] {recipient_info['facility_name']} experiences critical shortage of {recipient_info['medicine_name']} "
                f"requiring urgent replenishment of {deficit} {recipient_info['medicine_unit']}.\n"
                f"[O - Objective] Scanned {len(candidates)} facilities within {max_radius_km} km. Zero facilities possess surplus stock "
                f"exceeding their mandatory {effective_min_donor_buffer_days}-day safety retention buffer.\n"
                f"[A - Assessment] Inter-facility transfer is clinically infeasible without inducing secondary stockouts at neighboring clinics.\n"
                f"[P - Plan] Escalate immediate emergency supply requisition to the District Drug Warehouse (DDW)."
            )
            resp = RebalanceRecommendationResponse(
                recommendation_id=rec_id,
                generated_at=now_iso,
                model_used="deterministic-safety-guard",
                destination_facility_id=recipient_facility_id,
                destination_facility_name=recipient_info["facility_name"],
                medicine_id=medicine_id,
                medicine_name=recipient_info["medicine_name"],
                medicine_unit=recipient_info["medicine_unit"],
                recipient_current_stock=recipient_info["current_stock"],
                recipient_dac=recipient_info["dac"],
                recipient_dir=recipient_info["dir"],
                recipient_status=status_val,
                calculated_deficit=deficit,
                recommended_donor=None,
                recommended_quantity=0,
                recommended_urgency=urgency,
                clinical_rationale=rationale_text,
                tradeoff_analysis=f"Evaluated {len(candidates)} facilities within {max_radius_km} km radius; all lack surplus above {effective_min_donor_buffer_days}-day safety threshold.",
                risk_assessment="High risk of donor depletion and secondary stockouts if stock is forced from low-inventory facilities.",
                all_candidates_evaluated=candidates,
                is_feasible=False,
                monsoon_buffer_applied=apply_monsoon
            )
            return resp

        # 4. Invoke Google Gemini or Deterministic Fallback with Circuit Breaker Protection
        client = self._get_client()
        gemini_payload: Optional[RebalanceRecommendationPayload] = None
        if rebalance_circuit_breaker.state == "OPEN":
            model_used = "offline-clinical-optimizer-fallback (Circuit Breaker OPEN)"
        else:
            model_used = "offline-clinical-optimizer-fallback"

        safety_conn = get_connection(db_path)
        try:
            if client is not None:
                if not rebalance_circuit_breaker.is_allowed():
                    logger.warning(f"Rebalance circuit breaker is {rebalance_circuit_breaker.state}. Bypassing Gemini API and using deterministic clinical optimizer.")
                    gemini_payload = None
                    model_used = f"offline-clinical-optimizer-fallback (Circuit Breaker {rebalance_circuit_breaker.state})"
                else:
                    try:
                        from google.genai import types

                        # Prepare concise prompt context
                        prompt_data = {
                            "recipient": {
                                "name": recipient_info["facility_name"],
                                "district": recipient_info["district"],
                                "medicine": recipient_info["medicine_name"],
                                "unit": recipient_info["medicine_unit"],
                                "current_stock": recipient_info["current_stock"],
                                "dac": recipient_info["dac"],
                                "dir": recipient_info["dir"],
                                "deficit": deficit,
                                "is_emergency": is_emergency,
                                "status": status_val,
                            },
                            "candidate_donors_with_surplus": [
                                {
                                    "facility_id": c.facility_id,
                                    "facility_name": c.facility_name,
                                    "distance_km": c.distance_km,
                                    "transit_hours": c.estimated_transit_hours,
                                    "terrain": c.terrain_type,
                                    "current_stock": c.current_stock,
                                    "retention_buffer": c.retention_buffer,
                                    "surplus_available": c.surplus_available,
                                    "earliest_expiry": c.earliest_viable_expiry
                                }
                                for c in viable_donors[:4]
                            ],
                            "constraints": {
                                "target_buffer_days": effective_target_buffer_days,
                                "min_donor_buffer_days": effective_min_donor_buffer_days,
                                "max_radius_km": max_radius_km,
                                "monsoon_buffer_applied": apply_monsoon
                            }
                        }

                        user_prompt = (
                            f"Analyze this healthcare inventory deficit and candidate donor facilities:\n"
                            f"{json.dumps(prompt_data, indent=2)}\n\n"
                            f"Recommend the optimal donor, transfer quantity, and provide explainable clinical rationale in SOAP note format."
                        )

                        # Sanitize prompt inputs against adversarial prompts
                        clean_user_prompt, prompt_violations = AISafetyGuard.sanitize_prompt_input(user_prompt)
                        if prompt_violations:
                            AISafetyGuard.record_violations_batch(prompt_violations, component="rebalance_agent", conn=safety_conn)

                        response = client.models.generate_content(
                            model=self.model_name,
                            contents=[clean_user_prompt, REBALANCER_SYSTEM_PROMPT],
                            config=types.GenerateContentConfig(
                                response_mime_type="application/json",
                                response_schema=RebalanceRecommendationPayload,
                                temperature=0.1,
                            )
                        )

                        parsed = json.loads(response.text)
                        gemini_payload = RebalanceRecommendationPayload(**parsed)
                        model_used = f"google-genai:{self.model_name}"
                        rebalance_circuit_breaker.record_success()

                    except Exception as e:
                        rebalance_circuit_breaker.record_failure(e)
                        logger.warning(f"Gemini API call failed, falling back to deterministic clinical optimizer: {e}")
                        if rebalance_circuit_breaker.state == "OPEN":
                            AISafetyGuard.record_violation(
                                component="rebalance_agent",
                                violation_type="CIRCUIT_BREAKER_TRIP",
                                severity="CRITICAL",
                                details=f"Gemini rebalance circuit breaker tripped to OPEN state: {e}",
                                raw_input_snippet=str(e)[:100],
                                remediation_applied="Diverted traffic to deterministic clinical optimizer",
                                conn=safety_conn
                            )
                        gemini_payload = None
                        model_used = f"offline-clinical-optimizer-fallback (Circuit Breaker {rebalance_circuit_breaker.state})"

            # 5. Offline Fallback Generator if Gemini is unavailable
            if gemini_payload is None:
                gemini_payload = self._generate_offline_recommendation(
                    recipient_info=recipient_info,
                    viable_donors=viable_donors,
                    deficit=deficit,
                    urgency=urgency,
                    target_buffer_days=effective_target_buffer_days,
                    min_donor_buffer_days=effective_min_donor_buffer_days,
                    monsoon_applied=apply_monsoon
                )

            # 6. Safety Clamp: Comprehensive deterministic invariant validation & clamping
            selected_donor = next((c for c in viable_donors if c.facility_id == gemini_payload.recommended_donor_facility_id), viable_donors[0])
            
            proposal_dict = {
                "destination_facility_id": recipient_facility_id,
                "medicine_id": medicine_id,
                "recommended_quantity": gemini_payload.transfer_quantity,
                "is_feasible": True,
                "recommended_donor": {
                    "facility_id": selected_donor.facility_id,
                    "retention_buffer": selected_donor.retention_buffer,
                },
                "calculated_deficit": deficit,
            }

            clamped_rec, safety_violations = AISafetyGuard.clamp_and_validate_recommendation(
                proposal_dict, safety_conn, monsoon_mode=apply_monsoon
            )
            if safety_violations:
                AISafetyGuard.record_violations_batch(safety_violations, component="rebalance_agent", conn=safety_conn)

            safe_qty = clamped_rec.get("recommended_quantity", 0) if clamped_rec else 0
            is_clamped = clamped_rec.get("clamped_by_safety_guard", False) if clamped_rec else True
            clamped_reason = clamped_rec.get("clamped_reason") if clamped_rec else "Proposal rejected by AI Safety Guard"
            is_feasible = clamped_rec.get("is_feasible", False) if clamped_rec else False
            if safe_qty <= 0:
                is_feasible = False
            safety_verified = clamped_rec.get("safety_verified", False) if clamped_rec else False

            fallback_donor = next((c for c in viable_donors if c.facility_id == gemini_payload.fallback_donor_facility_id), None)
            if fallback_donor and fallback_donor.facility_id == selected_donor.facility_id:
                fallback_donor = next((c for c in viable_donors if c.facility_id != selected_donor.facility_id), None)

            # Projected Post-transfer DIR
            donor_post_stock = selected_donor.current_stock - safe_qty
            donor_post_dir = round(donor_post_stock / selected_donor.daily_average_consumption, 1) if selected_donor.daily_average_consumption > 0 else None

            rec_post_stock = recipient_info["current_stock"] + safe_qty
            rec_post_dir = round(rec_post_stock / recipient_info["dac"], 1) if recipient_info["dac"] > 0 else None

            final_rationale = gemini_payload.clinical_rationale
            if apply_monsoon and ("monsoon" not in final_rationale.lower()):
                final_rationale = f"{final_rationale} (1.5x Monsoon Buffer Applied)"

            # Final response object
            response_obj = RebalanceRecommendationResponse(
                recommendation_id=rec_id,
                generated_at=now_iso,
                model_used=model_used,
                destination_facility_id=recipient_facility_id,
                destination_facility_name=recipient_info["facility_name"],
                medicine_id=medicine_id,
                medicine_name=recipient_info["medicine_name"],
                medicine_unit=recipient_info["medicine_unit"],
                recipient_current_stock=recipient_info["current_stock"],
                recipient_dac=recipient_info["dac"],
                recipient_dir=recipient_info["dir"],
                recipient_status=status_val,
                calculated_deficit=deficit,
                recommended_donor=selected_donor,
                recommended_quantity=safe_qty,
                recommended_urgency=urgency,
                estimated_distance_km=selected_donor.distance_km,
                estimated_transit_hours=selected_donor.estimated_transit_hours,
                donor_post_transfer_dir=donor_post_dir,
                recipient_post_transfer_dir=rec_post_dir,
                clinical_rationale=final_rationale,
                tradeoff_analysis=gemini_payload.tradeoff_analysis,
                risk_assessment=gemini_payload.risk_assessment,
                suggested_route_summary=gemini_payload.suggested_route_summary,
                fallback_donor=fallback_donor,
                all_candidates_evaluated=candidates,
                is_feasible=is_feasible,
                monsoon_buffer_applied=apply_monsoon,
                safety_verified=safety_verified,
                clamped_by_safety_guard=is_clamped,
                clamped_reason=clamped_reason
            )

            # Cache recommendation for fast 1-click apply
            _RECOMMENDATION_CACHE[rec_id] = {
                "source_facility_id": selected_donor.facility_id,
                "destination_facility_id": recipient_facility_id,
                "medicine_id": medicine_id,
                "quantity": safe_qty,
                "urgency": urgency.value if hasattr(urgency, "value") else str(urgency),
                "ai_rationale": f"{gemini_payload.clinical_rationale} | Route: {gemini_payload.suggested_route_summary}",
                "created_at": time.time()
            }

            return response_obj
        finally:
            safety_conn.close()

    def _generate_offline_recommendation(
        self,
        recipient_info: Dict[str, Any],
        viable_donors: List[DonorCandidateInfo],
        deficit: int,
        urgency: TransferUrgency,
        target_buffer_days: int = 14,
        min_donor_buffer_days: int = 14,
        monsoon_applied: bool = False
    ) -> RebalanceRecommendationPayload:
        """
        Deterministic, rule-based clinical scoring engine that selects the best donor
        and populates structured explainability text in medical SOAP format.
        """
        top_donor = viable_donors[0]
        rec_qty = min(deficit, top_donor.surplus_available)
        fallback = viable_donors[1] if len(viable_donors) > 1 else None

        terrain_note = (
            "traverse mountainous ghat passes requiring reduced convoy speed"
            if "GHAT" in top_donor.terrain_type or "GHAT" in recipient_info["terrain_type"]
            else "follow primary state highway corridor at steady transit velocity"
        )

        clinical_rationale = (
            f"[S - Subjective] {recipient_info['facility_name']} ({recipient_info['district']}) reports an active {recipient_info['status']} "
            f"inventory state for {recipient_info['medicine_name']} ({recipient_info['medicine_category']}), posing critical stockout risk "
            f"for local rural patients.\n"
            f"[O - Objective] Recipient holds {recipient_info['current_stock']} {recipient_info['medicine_unit']} "
            f"(DAC: {recipient_info['dac']} units/day, DIR: {recipient_info['dir']} days), creating a calculated deficit of {deficit} units "
            f"against the {target_buffer_days}-day target buffer ({'1.5x Monsoon buffer applied' if monsoon_applied else 'standard buffer'}). "
            f"Donor {top_donor.facility_name} possesses {top_donor.current_stock} units ({top_donor.surplus_available} units verified unreserved surplus "
            f"beyond mandatory {min_donor_buffer_days}-day retention buffer of {top_donor.retention_buffer} units; distance: {top_donor.distance_km} km; "
            f"transit: {top_donor.estimated_transit_hours} hrs).\n"
            f"[A - Assessment] Zero donor depletion invariant verified: donor preserves {top_donor.current_stock - rec_qty} units post-transfer. "
            f"{top_donor.facility_name} ranked optimal (suitability: {top_donor.suitability_score}/100) due to route transit speed and surplus depth. "
            f"Batches meet consumption-aware shelf life criteria.\n"
            f"[P - Plan] Dispatch {rec_qty} {recipient_info['medicine_unit']} under {'monitored cold-chain' if recipient_info['requires_cold_chain'] else 'standard'} "
            f"transport protocol. Elevates recipient to ~{round((recipient_info['current_stock'] + rec_qty) / max(0.1, recipient_info['dac']), 1)} days inventory."
        )

        tradeoff_analysis = (
            f"{top_donor.facility_name} was chosen as optimal donor (suitability score {top_donor.suitability_score}/100) "
            f"over {len(viable_donors) - 1} alternative candidates due to proximity ({top_donor.distance_km} km) "
            f"and estimated transit duration of {top_donor.estimated_transit_hours} hours. "
            f"{('Alternative donor ' + fallback.facility_name + ' is available with ' + str(fallback.surplus_available) + ' units surplus.') if fallback else 'No secondary viable donor is available in range.'}"
        )

        risk_assessment = (
            f"Donor Safety Invariant Verified: Post-transfer, {top_donor.facility_name} retains "
            f"{top_donor.current_stock - rec_qty} units, comfortably exceeding its mandatory safety threshold of "
            f"{top_donor.retention_buffer} units. Zero donor stockout risk."
        )

        route_summary = (
            f"Dispatched via refrigerated transport along {top_donor.district} regional corridor ({top_donor.distance_km} km). "
            f"Route conditions {terrain_note}. Earliest batch expiry {top_donor.earliest_viable_expiry} preserves safety margin."
        )

        return RebalanceRecommendationPayload(
            recommended_donor_facility_id=top_donor.facility_id,
            transfer_quantity=rec_qty,
            urgency=urgency.value,
            clinical_rationale=clinical_rationale,
            tradeoff_analysis=tradeoff_analysis,
            risk_assessment=risk_assessment,
            suggested_route_summary=route_summary,
            fallback_donor_facility_id=fallback.facility_id if fallback else None
        )

    def apply_recommendation(
        self,
        conn: sqlite3.Connection,
        req: ApplyRebalanceRequest
    ) -> ApplyRebalanceResponse:
        """
        Applies an AI-generated rebalancing recommendation by creating a transfer order
        in the transfers table with ai_recommended=1 and soft-reservation batch locking if auto-approved.
        Includes atomic TOCTOU concurrency guard to ensure donor surplus has not been depleted.
        """
        cur = conn.cursor()

        # Validate facilities and medicine
        cur.execute("SELECT id, name, terrain_type FROM facilities WHERE id = ? AND is_active = 1;", (req.source_facility_id,))
        src_row = cur.fetchone()
        if not src_row:
            raise ValueError(f"Source donor facility #{req.source_facility_id} not found.")

        cur.execute("SELECT id, name, terrain_type FROM facilities WHERE id = ? AND is_active = 1;", (req.destination_facility_id,))
        dst_row = cur.fetchone()
        if not dst_row:
            raise ValueError(f"Destination facility #{req.destination_facility_id} not found.")

        cur.execute("SELECT id, name, min_safety_stock FROM medicines WHERE id = ? AND is_active = 1;", (req.medicine_id,))
        med_row = cur.fetchone()
        if not med_row:
            raise ValueError(f"Medicine #{req.medicine_id} not found.")

        # TOCTOU Optimistic Concurrency Guard:
        # Re-verify donor's active stock and ensure it still maintains the donor safety buffer above req.quantity
        cur.execute("""
            SELECT COALESCE(SUM(quantity_available), 0) AS current_viable_stock
            FROM stock_batches
            WHERE facility_id = ? AND medicine_id = ? AND status = 'ACTIVE';
        """, (req.source_facility_id, req.medicine_id))
        stock_row = cur.fetchone()
        current_viable_stock = int(stock_row["current_viable_stock"]) if stock_row else 0

        # Fetch donor DAC over last 7 days
        cur.execute("""
            SELECT COALESCE(SUM(quantity), 0) AS total_consumed
            FROM inventory_transactions
            WHERE facility_id = ? AND medicine_id = ? 
              AND transaction_type = 'CONSUMED'
              AND created_at >= datetime('now', '-7 days');
        """, (req.source_facility_id, req.medicine_id))
        consumed_row = cur.fetchone()
        donor_dac = round((int(consumed_row["total_consumed"]) if consumed_row else 0) / 7.0, 2)

        # Check donor retention buffer (monsoon 21 days for ghat during June-Sept, else 14 days)
        now_dt = _get_utc_now()
        is_monsoon_month = now_dt.month in [6, 7, 8, 9]
        donor_is_ghat = (src_row["terrain_type"] == "GHAT_MOUNTAIN")
        retention_days = 21 if (donor_is_ghat and is_monsoon_month) else 14

        min_safety = int(med_row["min_safety_stock"])
        donor_retention = max(min_safety, math.ceil(retention_days * donor_dac))
        actual_surplus = max(0, current_viable_stock - donor_retention)

        if actual_surplus < req.quantity:
            raise TOCTOUConflictError(
                f"TOCTOU Concurrency Conflict: Donor facility '{src_row['name']}' unreserved surplus has decreased "
                f"to {actual_surplus} units (active stock: {current_viable_stock}, safety retention buffer: {donor_retention} units), "
                f"which is insufficient for requested transfer of {req.quantity} units. Please refresh rebalancing recommendations."
            )

        # Atomic Invariant Firewall Verification inside SQLite Write Transaction:
        # Guarantees that self-transfer, donor starvation, inactive facilities, or stale telemetry
        # cannot bypass the safety firewall during concurrent transaction execution.
        safety_rec_payload = {
            "destination_facility_id": req.destination_facility_id,
            "medicine_id": req.medicine_id,
            "from_facility_id": req.source_facility_id,
            "recommended_quantity": req.quantity,
            "is_feasible": True,
            "recommended_donor": {
                "facility_id": req.source_facility_id,
                "retention_buffer": donor_retention,
            }
        }
        clamped_check, safety_violations = AISafetyGuard.clamp_and_validate_recommendation(
            safety_rec_payload, conn, monsoon_mode=(retention_days == 21)
        )
        if not clamped_check or clamped_check.get("recommended_quantity", 0) < req.quantity:
            reasons = [v.get("details", "") for v in safety_violations]
            raise TOCTOUConflictError(
                f"Atomic Safety Invariant Breach inside Transaction: Transfer of {req.quantity} units violates "
                f"physical safety boundary. Allowed maximum: {clamped_check.get('recommended_quantity', 0) if clamped_check else 0}. "
                f"Violations: {'; '.join(reasons)}"
            )

        # If rationale was not provided, look up from recommendation cache
        ai_rationale = req.ai_rationale
        if not ai_rationale and req.recommendation_id and req.recommendation_id in _RECOMMENDATION_CACHE:
            ai_rationale = _RECOMMENDATION_CACHE[req.recommendation_id]["ai_rationale"]

        if not ai_rationale:
            ai_rationale = f"Autonomous AI peer-to-peer rebalancing transfer: {req.quantity} units to {dst_row['name']}."

        # Leverage create_transfer core logic
        from routes.transfers import _create_transfer_db_logic

        create_req = CreateTransferRequest(
            source_facility_id=req.source_facility_id,
            destination_facility_id=req.destination_facility_id,
            medicine_id=req.medicine_id,
            quantity=req.quantity,
            urgency=req.urgency,
            reason=f"AI Autonomous Rebalance: {ai_rationale[:120]}",
            ai_recommended=True,
            ai_rationale=ai_rationale,
            auto_approve=req.auto_approve,
            requested_by=req.requested_by or "Gemini Autonomous Rebalancing Agent"
        )

        transfer_resp = _create_transfer_db_logic(conn, create_req)

        return ApplyRebalanceResponse(
            transfer_id=transfer_resp.id,
            transfer_code=transfer_resp.transfer_code,
            status=transfer_resp.status.value,
            source_facility_name=src_row["name"],
            destination_facility_name=dst_row["name"],
            medicine_name=med_row["name"],
            quantity=req.quantity,
            message=f"Successfully created {'and approved ' if req.auto_approve else ''}transfer order {transfer_resp.transfer_code} via Gemini Autonomous Rebalancing."
        )

    def scan_network_deficits(
        self,
        db_path: Optional[Path] = None,
        max_radius_km: float = 50.0,
        min_donor_buffer_days: int = 14
    ) -> List[NetworkDeficitItem]:
        """
        Scans all facilities and medicines across the network for CRITICAL or WARNING items.
        For each deficit item, computes candidate donor count and top viable donor opportunity.
        """
        depletion = calculate_depletion_metrics(
            db_path=db_path,
            status_filter=None,  # Scan all items
            window_days=7
        )

        deficit_items: List[NetworkDeficitItem] = []
        conn = get_connection(db_path)

        try:
            for item in depletion["items"]:
                # Only surface facilities in WARNING or CRITICAL triage states
                if item["status"] not in ("WARNING", "CRITICAL"):
                    continue

                fac_id = item["facility_id"]
                med_id = item["medicine_id"]
                current_stock = item["current_stock"]
                min_stock = item["min_safety_stock"]
                dac = float(item["daily_average_consumption"])
                dir_val = float(item["days_of_inventory_remaining"]) if item["days_of_inventory_remaining"] is not None else None

                target_stock = max(min_stock, math.ceil(14 * dac))
                deficit = max(0, target_stock - current_stock)

                if deficit <= 0:
                    continue

                candidates = find_candidate_donors(
                    conn_or_path=conn,
                    recipient_facility_id=fac_id,
                    medicine_id=med_id,
                    max_radius_km=max_radius_km,
                    min_donor_buffer_days=min_donor_buffer_days,
                    recipient_dac=dac,
                    recipient_deficit=deficit
                )

                viable = [c for c in candidates if c.surplus_available > 0]
                top_donor = viable[0] if viable else None

                deficit_items.append(NetworkDeficitItem(
                    facility_id=fac_id,
                    facility_name=item["facility_name"],
                    district=item["district"],
                    medicine_id=med_id,
                    medicine_name=item["medicine_name"],
                    category=item["category"],
                    unit=item["unit"],
                    is_emergency=bool(item["is_emergency"]),
                    current_stock=current_stock,
                    daily_average_consumption=dac,
                    days_of_inventory_remaining=dir_val,
                    status=item["status"],
                    deficit_quantity=deficit,
                    candidate_donor_count=len(viable),
                    top_donor_facility_name=top_donor.facility_name if top_donor else None,
                    top_donor_surplus=top_donor.surplus_available if top_donor else None,
                    top_donor_distance_km=top_donor.distance_km if top_donor else None,
                    top_donor_transit_hours=top_donor.estimated_transit_hours if top_donor else None
                ))

            # Sort: CRITICAL first, then by deficit descending
            deficit_items.sort(key=lambda x: (1 if x.status == "CRITICAL" else 0, x.deficit_quantity), reverse=True)
            return deficit_items

        finally:
            conn.close()


# Singleton Service Instance
autonomous_rebalancing_service = AutonomousRebalancingService()
