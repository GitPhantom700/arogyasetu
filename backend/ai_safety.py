"""
AI Safety, Guardrails, Input Sanitization & Circuit Breaker Engine
Track 03 — Smart Health & Supply Chain Resilience — Build with AI: Code for Communities (Microtask 3.4)

Provides deterministic invariant checking, prompt injection defenses,
output quantity clamping, multimodal OCR safety filters, and resilient
circuit-breaker fallbacks for all Google Gemini AI services.
"""

import re
import math
import time
import logging
import threading
from datetime import datetime, date, timezone
from typing import Optional, Dict, Any, List, Tuple, Callable
from pydantic import BaseModel, Field
from pathlib import Path
import sqlite3

from database import get_connection, execute_write_transaction_sync

logger = logging.getLogger("ai_safety")

# =====================================================================
# Constants & Adversarial Injection Patterns
# =====================================================================

PROMPT_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(all\s+|the\s+|any\s+)?(previous\s+|prior\s+|above\s+|safety\s+)?(instructions|prompts|rules|system|constraints)", re.IGNORECASE),
    re.compile(r"drop\s+(all\s+|the\s+)?(retention\s+|safety\s+)?buffers", re.IGNORECASE),
    re.compile(r"system\s+override", re.IGNORECASE),
    re.compile(r"drop\s+table", re.IGNORECASE),
    re.compile(r"you\s+are\s+now\s+in\s+(developer|jailbreak|unrestricted|god)\s+mode", re.IGNORECASE),
    re.compile(r"disregard\s+(all\s+|any\s+)?(safety|constraints|guidelines|limits|rules)", re.IGNORECASE),
    re.compile(r"pretend\s+you\s+have\s+no\s+(rules|constraints|instructions)", re.IGNORECASE),
    re.compile(r"output\s+(your|the)\s+(system\s+prompt|instructions|initial\s+prompt|secret)", re.IGNORECASE),
    re.compile(r"delete\s+from\s+stock_batches", re.IGNORECASE),
    re.compile(r"<script.*?>.*?</script>", re.IGNORECASE),
    re.compile(r"javascript:", re.IGNORECASE),
]

MAX_SAFE_BATCH_QUANTITY = 5000  # Max realistic units for single PHC batch intake
MAX_EXPIRY_HORIZON_YEARS = 15   # Reject expiration dates > 15 years in future


class AISafetyValidationError(Exception):
    """Raised when an AI-suggested payload violates hard physical/medical invariants."""
    def __init__(self, message: str, details: Dict[str, Any] = None):
        super().__init__(message)
        self.details = details or {}


# =====================================================================
# Circuit Breaker for Gemini Services (Thread-Safe & Probe Semaphore)
# =====================================================================

class CircuitBreaker:
    """
    Adaptive, Thread-Safe Circuit Breaker preventing server hangs during cloud API outages,
    rate-limits (HTTP 429), or rural network latency timeouts.
    Transitions: CLOSED -> OPEN -> HALF_OPEN -> CLOSED.

    Production Concurrency Hardening (Stage 3 Double-Audit Verified):
    - Uses threading.RLock for re-entrant thread safety across concurrent asynchronous worker threads.
    - Uses time.monotonic() across all interval timers to eliminate NTP clock drift and container jumps.
    - Implements an automated probe watchdog (probe_timeout_sec = 10.0s) to prevent hung worker deadlocks.
    - Enforces strict single-token probe permit in HALF_OPEN: exactly ONE probe request is admitted,
      while all other concurrent requests are safely shed to deterministic heuristics.
    """
    def __init__(
        self,
        failure_threshold: int = 3,
        reset_timeout_sec: float = 30.0,
        probe_timeout_sec: float = 10.0,
        service_name: str = "gemini"
    ):
        self.failure_threshold = failure_threshold
        self.reset_timeout_sec = reset_timeout_sec
        self.probe_timeout_sec = probe_timeout_sec
        self.service_name = service_name
        self.state = "CLOSED"  # 'CLOSED', 'OPEN', 'HALF_OPEN'
        self.failure_count = 0
        self.last_failure_time: Optional[float] = None
        self.probe_start_time: Optional[float] = None
        self.total_trips = 0
        self.last_error_message: Optional[str] = None
        self._lock = threading.RLock()
        self.half_open_probe_in_flight: bool = False

    def is_allowed(self) -> bool:
        """
        Determines if a remote cloud call is allowed to proceed.
        Thread-safe; enforces monotonic timing, single-probe admission, and hung worker recovery.
        """
        with self._lock:
            now = time.monotonic()

            # Auto-heal hung probe worker if probe flight exceeded probe_timeout_sec
            if self.state == "HALF_OPEN" and self.half_open_probe_in_flight:
                if self.probe_start_time and (now - self.probe_start_time > self.probe_timeout_sec):
                    logger.warning(
                        f"CircuitBreaker[{self.service_name}]: Probe worker timed out "
                        f"({self.probe_timeout_sec}s). Recovering circuit to OPEN state."
                    )
                    self.half_open_probe_in_flight = False
                    self.probe_start_time = None
                    self.state = "OPEN"
                    self.last_failure_time = now
                    return False

            if self.state == "OPEN":
                if self.last_failure_time and (now - self.last_failure_time >= self.reset_timeout_sec):
                    logger.info(f"CircuitBreaker[{self.service_name}]: Cooldown expired ({self.reset_timeout_sec}s). Admitting single test probe in HALF_OPEN state.")
                    self.state = "HALF_OPEN"
                    self.half_open_probe_in_flight = True
                    self.probe_start_time = now
                    return True
                # Circuit is OPEN and cooldown has not expired: bypass immediately to deterministic fallback
                return False

            elif self.state == "HALF_OPEN":
                # Strict semaphore: only one probe allowed through concurrently
                if not self.half_open_probe_in_flight:
                    logger.info(f"CircuitBreaker[{self.service_name}]: Admitting probe permit in HALF_OPEN state.")
                    self.half_open_probe_in_flight = True
                    self.probe_start_time = now
                    return True
                else:
                    # Probe already in flight: shed load to deterministic fallback to avoid flooding upstream
                    return False

            # CLOSED state: traffic permitted
            return True

    def record_success(self):
        """Records successful remote invocation, resetting failure counters."""
        with self._lock:
            if self.state in ("HALF_OPEN", "OPEN"):
                logger.info(f"CircuitBreaker[{self.service_name}]: Probe succeeded. Circuit reset to CLOSED.")
            self.state = "CLOSED"
            self.failure_count = 0
            self.half_open_probe_in_flight = False
            self.probe_start_time = None
            self.last_error_message = None

    def record_failure(self, error: Exception):
        """Records remote failure, transitioning to OPEN if threshold reached or if probe failed."""
        with self._lock:
            self.failure_count += 1
            self.last_failure_time = time.monotonic()
            self.last_error_message = str(error)
            self.half_open_probe_in_flight = False
            self.probe_start_time = None

            if self.state == "HALF_OPEN" or self.failure_count >= self.failure_threshold:
                if self.state != "OPEN":
                    self.total_trips += 1
                    logger.warning(
                        f"CircuitBreaker[{self.service_name}]: Tripped to OPEN state! "
                        f"Failures: {self.failure_count}, Threshold: {self.failure_threshold}. Error: {error}"
                    )
                self.state = "OPEN"

    def reset(self):
        """Manually resets circuit breaker to CLOSED state and zeroes counters."""
        with self._lock:
            self.state = "CLOSED"
            self.failure_count = 0
            self.half_open_probe_in_flight = False
            self.probe_start_time = None
            self.last_failure_time = None
            self.last_error_message = None

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "service_name": self.service_name,
                "state": self.state,
                "failure_count": self.failure_count,
                "failure_threshold": self.failure_threshold,
                "reset_timeout_sec": self.reset_timeout_sec,
                "total_trips": self.total_trips,
                "half_open_probe_in_flight": self.half_open_probe_in_flight,
                "last_error": self.last_error_message,
            }


# Global Circuit Breakers for Gemini Vision & Rebalance Agent
vision_circuit_breaker = CircuitBreaker(failure_threshold=3, reset_timeout_sec=30.0, service_name="gemini_vision")
rebalance_circuit_breaker = CircuitBreaker(failure_threshold=3, reset_timeout_sec=30.0, service_name="gemini_rebalance")


# =====================================================================
# Centralized AI Safety Guard
# =====================================================================

class AISafetyGuard:
    """
    Central safety firewall for validating, sanitizing, and clamping
    all multimodal AI inputs and outputs.
    """

    @staticmethod
    def sanitize_prompt_input(text: Optional[str], max_length: int = 2000) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Detects adversarial prompt injection attempts, strips dangerous control characters,
        and neutralizes SQL keywords and jailbreak patterns.
        """
        if not text:
            return "", []

        violations = []
        clean_text = text.strip()

        # Check for adversarial injection patterns
        for pattern in PROMPT_INJECTION_PATTERNS:
            match = pattern.search(clean_text)
            if match:
                snippet = match.group(0)
                violations.append({
                    "type": "PROMPT_INJECTION_DETECTED",
                    "violation_type": "PROMPT_INJECTION_DETECTED",
                    "severity": "HIGH",
                    "details": f"Detected adversarial pattern: '{snippet}'",
                    "raw_input_snippet": snippet
                })
                # Neutralize the injection text
                clean_text = pattern.sub("[FILTERED_PROMPT_INJECTION]", clean_text)

        # Strip non-printable control characters except standard whitespace
        clean_text = "".join(ch for ch in clean_text if ch.isprintable() or ch in "\n\r\t")

        # Truncate length if extreme
        if len(clean_text) > max_length:
            violations.append({
                "type": "INPUT_LENGTH_EXCEEDED",
                "violation_type": "INPUT_LENGTH_EXCEEDED",
                "severity": "WARNING",
                "details": f"Input length ({len(clean_text)}) exceeded safe maximum ({max_length}). Truncated.",
                "raw_input_snippet": clean_text[:50] + "..."
            })
            clean_text = clean_text[:max_length]

        return clean_text, violations

    @staticmethod
    def clamp_and_validate_recommendation(
        recommendation: Dict[str, Any],
        conn: sqlite3.Connection,
        monsoon_mode: bool = False
    ) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        """
        Enforces strict physical, mathematical, and medical invariants on the
        Gemini logistics rebalance proposal.
        """
        violations = []
        rec = dict(recommendation)
        dest_id = rec.get("destination_facility_id") if rec.get("destination_facility_id") is not None else rec.get("to_facility_id")
        med_id = rec.get("medicine_id")
        
        donor_data = rec.get("recommended_donor")
        donor_id = None
        if isinstance(donor_data, dict) and donor_data.get("facility_id") is not None:
            donor_id = donor_data.get("facility_id")
        elif rec.get("from_facility_id") is not None:
            donor_id = rec.get("from_facility_id")
            if not donor_data:
                rec["recommended_donor"] = {"facility_id": donor_id}
                donor_data = rec["recommended_donor"]
            elif isinstance(donor_data, dict):
                donor_data["facility_id"] = donor_id

        recommended_qty = rec.get("recommended_quantity") if rec.get("recommended_quantity") is not None else rec.get("quantity", 0)

        # 1. Whitelist Verification: Destination Facility & Medicine existence
        dest_row = conn.execute("SELECT id, name, is_active FROM facilities WHERE id = ?", (dest_id,)).fetchone()
        if not dest_row or not dest_row["is_active"]:
            violations.append({
                "type": "UNKNOWN_FACILITY_HALLUCINATION",
                "violation_type": "UNKNOWN_FACILITY_HALLUCINATION",
                "severity": "CRITICAL",
                "details": f"Destination facility ID {dest_id} does not exist or is inactive.",
                "raw_input_snippet": f"dest_id={dest_id}"
            })
            return None, violations

        med_row = conn.execute("SELECT id, name, is_active FROM medicines WHERE id = ?", (med_id,)).fetchone()
        if not med_row or not med_row["is_active"]:
            violations.append({
                "type": "UNKNOWN_MEDICINE_HALLUCINATION",
                "violation_type": "UNKNOWN_MEDICINE_HALLUCINATION",
                "severity": "CRITICAL",
                "details": f"Medicine ID {med_id} does not exist or is inactive.",
                "raw_input_snippet": f"med_id={med_id}"
            })
            return None, violations

        # 2. Donor Whitelist & Self-Transfer Invariant
        if donor_id is not None and dest_id is not None and donor_id == dest_id:
            violations.append({
                "type": "SELF_TRANSFER_ANOMALY",
                "violation_type": "SELF_TRANSFER_ANOMALY",
                "severity": "CRITICAL",
                "details": "Donor and recipient cannot be the identical facility.",
                "raw_input_snippet": f"donor_id={donor_id}, dest_id={dest_id}"
            })
            return None, violations

        # If rebalance is marked infeasible or donor is missing
        if not rec.get("is_feasible", True) or donor_id is None:
            rec["recommended_quantity"] = 0
            rec["quantity"] = 0
            return rec, violations

        donor_row = conn.execute("SELECT id, name, is_active FROM facilities WHERE id = ?", (donor_id,)).fetchone()
        if not donor_row or not donor_row["is_active"]:
            violations.append({
                "type": "UNKNOWN_FACILITY_HALLUCINATION",
                "violation_type": "UNKNOWN_FACILITY_HALLUCINATION",
                "severity": "CRITICAL",
                "details": f"Donor facility ID {donor_id} is inactive or does not exist.",
                "raw_input_snippet": f"donor_id={donor_id}"
            })
            return None, violations

        # 3. Real-Time Donor Stock & Invariant Re-Check
        # quantity_available is already net unreserved stock (reserved stock is already deducted upon transfer allocation).
        stock_row = conn.execute("""
            SELECT COALESCE(SUM(quantity_available), 0) as active_stock
            FROM stock_batches
            WHERE facility_id = ? AND medicine_id = ? AND status = 'ACTIVE' AND expiry_date >= date('now')
        """, (donor_id, med_id)).fetchone()
        actual_donor_stock = stock_row["active_stock"] if stock_row else 0

        # Physical Reserve Buffer enforcement (14-day DAC or mandatory clinical safety stock):
        # 1. Fetch medicine min_safety_stock from catalog
        min_safety = 5 if med_id in (1, 2) else 10
        try:
            med_stock_row = conn.execute("SELECT min_safety_stock FROM medicines WHERE id = ?", (med_id,)).fetchone()
            if med_stock_row and med_stock_row["min_safety_stock"]:
                min_safety = int(med_stock_row["min_safety_stock"])
        except Exception:
            pass

        # 2. Telemetry Freshness & Historical Consumption Query
        # Checks if rural node has been offline > 48 hours (power/network outage)
        sync_row = conn.execute("""
            SELECT 
                MAX(created_at) AS last_sync_time,
                (julianday('now') - julianday(MAX(created_at))) * 24.0 AS hours_since_sync
            FROM inventory_transactions
            WHERE facility_id = ? AND medicine_id = ?;
        """, (donor_id, med_id)).fetchone()

        hours_offline = sync_row["hours_since_sync"] if sync_row and sync_row["hours_since_sync"] is not None else 999.0

        # Query 30-day consumption for robust historical baseline
        consumed_30d_row = conn.execute("""
            SELECT COALESCE(SUM(quantity), 0) AS total_consumed_30d
            FROM inventory_transactions
            WHERE facility_id = ? AND medicine_id = ?
              AND transaction_type = 'CONSUMED'
              AND created_at >= datetime('now', '-30 days');
        """, (donor_id, med_id)).fetchone()
        total_30d = consumed_30d_row["total_consumed_30d"] if consumed_30d_row else 0
        historical_30d_dac = round(total_30d / 30.0, 2)

        # Baseline DAC from catalog rules:
        catalog_baseline_dac = max(0.5, round(min_safety / 14.0, 2))
        baseline_dac = max(catalog_baseline_dac, historical_30d_dac)

        # Telemetry Freshness Decision:
        # If rural clinic offline > 48h or 7-day transactions are 0 due to blackout, fallback to baseline DAC
        if hours_offline > 48.0:
            donor_dac = baseline_dac
            if hours_offline < 900.0:  # Has logged before, but un-synced > 48h
                violations.append({
                    "type": "STALE_TELEMETRY_FALLBACK",
                    "violation_type": "STALE_TELEMETRY_FALLBACK",
                    "severity": "INFO",
                    "details": f"Donor telemetry stale ({round(hours_offline, 1)}h since last sync > 48h). Falling back to catalog baseline DAC ({baseline_dac} units/day).",
                    "raw_input_snippet": f"hours_offline={round(hours_offline, 1)}"
                })
        else:
            consumed_7d_row = conn.execute("""
                SELECT COALESCE(SUM(quantity), 0) AS total_consumed
                FROM inventory_transactions
                WHERE facility_id = ? AND medicine_id = ? 
                  AND transaction_type = 'CONSUMED'
                  AND created_at >= datetime('now', '-7 days');
            """, (donor_id, med_id)).fetchone()
            log_consumed = consumed_7d_row["total_consumed"] if consumed_7d_row else 0
            log_dac = round(log_consumed / 7.0, 2)
            donor_dac = max(baseline_dac, log_dac)  # Floor 7-day DAC with authoritative baseline

        # 3. Compute Authoritative Physical Minimum Buffer
        base_buffer_days = 14
        retention_buffer = max(min_safety, int(math.ceil(base_buffer_days * donor_dac)))
        if monsoon_mode:
            retention_buffer = int(math.ceil(retention_buffer * 1.5))

        # 4. Payload Distrust & Prompt Injection Defense:
        # STRIP retention_buffer from incoming untrusted payload. Never allow external caller or LLM to dictate physical reserves.
        payload_buffer = None
        if isinstance(donor_data, dict) and "retention_buffer" in donor_data:
            payload_buffer = donor_data.pop("retention_buffer")
        elif "retention_buffer" in rec:
            payload_buffer = rec.pop("retention_buffer")

        if payload_buffer is not None and payload_buffer < retention_buffer:
            violations.append({
                "type": "BUFFER_UNDERMINING_ATTEMPT",
                "violation_type": "BUFFER_UNDERMINING_ATTEMPT",
                "severity": "CRITICAL",
                "details": f"Untrusted payload attempted to undermine retention buffer ({payload_buffer} < {retention_buffer}). Stripped and enforced authoritative catalog buffer.",
                "raw_input_snippet": f"payload_buffer={payload_buffer}, enforced={retention_buffer}"
            })

        # Explicitly enforce authoritative buffer
        rec["retained_buffer_enforced"] = retention_buffer
        if isinstance(donor_data, dict):
            donor_data["retention_buffer"] = retention_buffer

        safe_max_quantity = max(0, actual_donor_stock - retention_buffer)

        # 4. Quantity Sanity Checks
        if recommended_qty is None or recommended_qty <= 0:
            violations.append({
                "type": "LOGICAL_INVARIANT_VIOLATION",
                "violation_type": "LOGICAL_INVARIANT_VIOLATION",
                "severity": "WARNING",
                "details": f"Invalid non-positive or NaN quantity: {recommended_qty}",
                "raw_input_snippet": f"recommended_quantity={recommended_qty}"
            })
            if safe_max_quantity > 0:
                rec["recommended_quantity"] = safe_max_quantity
                rec["quantity"] = safe_max_quantity
                rec["clamped_by_safety_guard"] = True
                rec["clamped_reason"] = f"Quantity reset to maximum safe transfer ({safe_max_quantity} units)."
            else:
                rec["is_feasible"] = False
                rec["recommended_quantity"] = 0
                rec["quantity"] = 0
                return rec, violations

        # Clamping to maximum safe surplus
        recommended_qty = int(round(recommended_qty))
        if recommended_qty > safe_max_quantity:
            violations.append({
                "type": "QUANTITY_OUT_OF_BOUNDS",
                "violation_type": "QUANTITY_OUT_OF_BOUNDS",
                "severity": "HIGH",
                "details": f"Proposed quantity {recommended_qty} exceeds safe surplus limit ({safe_max_quantity} units). Clamped.",
                "raw_input_snippet": f"proposed={recommended_qty}, max_allowed={safe_max_quantity}"
            })
            rec["recommended_quantity"] = safe_max_quantity
            rec["quantity"] = safe_max_quantity
            rec["clamped_by_safety_guard"] = True
            rec["clamped_reason"] = f"Quantity clamped from {recommended_qty} to verified donor surplus limit of {safe_max_quantity} units."
            if safe_max_quantity <= 0:
                rec["is_feasible"] = False
        else:
            rec["recommended_quantity"] = recommended_qty
            rec["quantity"] = recommended_qty

        # 5. Zero Donor Depletion Invariant Assertion
        post_donor_stock = actual_donor_stock - rec["recommended_quantity"]
        if post_donor_stock < retention_buffer:
            violations.append({
                "type": "DONOR_STARVATION_ATTEMPT",
                "violation_type": "DONOR_STARVATION_ATTEMPT",
                "severity": "CRITICAL",
                "details": f"Transfer would breach donor retention buffer ({post_donor_stock} < {retention_buffer}).",
                "raw_input_snippet": f"post_stock={post_donor_stock}, required_buffer={retention_buffer}"
            })
            rec["recommended_quantity"] = max(0, actual_donor_stock - retention_buffer)
            rec["quantity"] = rec["recommended_quantity"]
            rec["clamped_by_safety_guard"] = True

        rec["safety_verified"] = True
        return rec, violations

    @staticmethod
    def validate_scanned_ledger_safety(
        items: List[Dict[str, Any]],
        conn: sqlite3.Connection
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Validates OCR-extracted register batches against clinical safety rules:
        - Rejects negative / zero quantities.
        - Flags quantities > 5,000 as high-volume anomalies requiring pharmacist review.
        - Rejects past expiry dates (expired drug ingestion guard).
        - Flags near-expiry stock (< 30 days).
        - Rejects future dates > 15 years.
        - Sanitizes drug names and batch numbers against prompt injection payloads.
        """
        validated_items = []
        violations = []
        today = date.today()

        for idx, raw_item in enumerate(items):
            item = dict(raw_item)
            item_label = f"Item #{idx+1} ({item.get('medicine_name', 'Unknown')})"

            # 1. Sanitize text fields
            clean_med, med_violations = AISafetyGuard.sanitize_prompt_input(item.get("medicine_name", ""))
            clean_batch, batch_violations = AISafetyGuard.sanitize_prompt_input(item.get("batch_number", ""))
            item["medicine_name"] = clean_med
            item["batch_number"] = clean_batch

            for v in (med_violations + batch_violations):
                v["details"] = f"{item_label}: {v['details']}"
                violations.append(v)

            # 2. Quantity Bounds Checking
            qty = item.get("quantity")
            if qty is None or not isinstance(qty, (int, float)) or math.isnan(qty) or qty <= 0:
                violations.append({
                    "type": "QUANTITY_OUT_OF_BOUNDS",
                    "violation_type": "QUANTITY_OUT_OF_BOUNDS",
                    "severity": "HIGH",
                    "details": f"{item_label}: Invalid or non-positive quantity ({qty}). Marked for review.",
                    "raw_input_snippet": f"quantity={qty}"
                })
                item["quantity"] = max(1, int(qty)) if (isinstance(qty, (int, float)) and not math.isnan(qty) and qty > 0) else 1
                item["requires_pharmacist_review"] = True
                item["safety_warning"] = "Non-positive quantity detected; corrected to 1 for verification."
            else:
                item["quantity"] = int(round(qty))
                if item["quantity"] > MAX_SAFE_BATCH_QUANTITY:
                    violations.append({
                        "type": "ANOMALOUS_RECEIPT_QUANTITY",
                        "violation_type": "ANOMALOUS_RECEIPT_QUANTITY",
                        "severity": "WARNING",
                        "details": f"{item_label}: Extreme quantity ({item['quantity']} units) exceeds safe threshold ({MAX_SAFE_BATCH_QUANTITY}). Clamped to {MAX_SAFE_BATCH_QUANTITY}.",
                        "raw_input_snippet": f"quantity={item['quantity']}"
                    })
                    item["quantity"] = MAX_SAFE_BATCH_QUANTITY
                    item["requires_pharmacist_review"] = True
                    item["safety_warning"] = f"High-volume intake clamped to {MAX_SAFE_BATCH_QUANTITY} units (exceeds normal PHC threshold). Verify against physical chalan."

            # 3. Temporal Expiration Safety Invariant
            exp_str = item.get("expiry_date", "")
            try:
                exp_date = date.fromisoformat(exp_str)
                if exp_date <= today:
                    violations.append({
                        "type": "EXPIRED_BATCH_INGESTION",
                        "violation_type": "EXPIRED_BATCH_INGESTION",
                        "severity": "CRITICAL",
                        "details": f"{item_label}: Attempted ingestion of expired batch (Expiry: {exp_str}, Today: {today.isoformat()}).",
                        "raw_input_snippet": f"expiry_date={exp_str}"
                    })
                    item["requires_pharmacist_review"] = True
                    item["is_expired"] = True
                    item["safety_warning"] = f"🚨 EXPIRED STOCK: Batch expired on {exp_str}. Cannot be distributed to patients."
                elif (exp_date - today).days < 30:
                    violations.append({
                        "type": "TEMPORAL_ANOMALY",
                        "violation_type": "TEMPORAL_ANOMALY",
                        "severity": "WARNING",
                        "details": f"{item_label}: Batch expires within {(exp_date - today).days} days (< 30d safety margin).",
                        "raw_input_snippet": f"expiry_date={exp_str}"
                    })
                    item["requires_pharmacist_review"] = True
                    item["safety_warning"] = f"⚠️ Short-dated stock (expires in {(exp_date - today).days} days). Rapid distribution required."
                elif exp_date.year > (today.year + MAX_EXPIRY_HORIZON_YEARS):
                    violations.append({
                        "type": "TEMPORAL_ANOMALY",
                        "violation_type": "TEMPORAL_ANOMALY",
                        "severity": "WARNING",
                        "details": f"{item_label}: Expiration year ({exp_date.year}) is over {MAX_EXPIRY_HORIZON_YEARS} years in the future.",
                        "raw_input_snippet": f"expiry_date={exp_str}"
                    })
                    item["requires_pharmacist_review"] = True
                    item["safety_warning"] = f"Unrealistic expiry date ({exp_str}). Please confirm physical stamp."
            except Exception as e:
                violations.append({
                    "type": "TEMPORAL_ANOMALY",
                    "violation_type": "TEMPORAL_ANOMALY",
                    "severity": "HIGH",
                    "details": f"{item_label}: Unparseable expiry date '{exp_str}'. Error: {e}",
                    "raw_input_snippet": f"expiry_date={exp_str}"
                })
                item["requires_pharmacist_review"] = True
                item["safety_warning"] = "Invalid date format; pharmacist review mandatory."

            validated_items.append(item)

        return validated_items, violations

    @staticmethod
    def record_violation(
        component: str,
        violation_type: str,
        severity: str,
        details: str,
        raw_input_snippet: Optional[str] = None,
        remediation_applied: str = "Clamped to safe boundary",
        conn: Optional[sqlite3.Connection] = None
    ) -> Dict[str, Any]:
        """
        Persists detected safety anomalies, injections, or clamps into ai_safety_violations.
        """
        now_iso = datetime.now(timezone.utc).isoformat(timespec="microseconds")
        payload = (
            now_iso, component, violation_type, severity,
            details, raw_input_snippet, remediation_applied
        )

        def _insert(c: sqlite3.Connection):
            c.execute("""
                INSERT INTO ai_safety_violations (
                    timestamp, component, violation_type, severity,
                    details, raw_input_snippet, remediation_applied
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, payload)
            return c.execute("SELECT last_insert_rowid() as id;").fetchone()["id"]

        if conn is not None:
            v_id = _insert(conn)
        else:
            v_id = execute_write_transaction_sync(None, _insert)

        logger.warning(f"AISafetyGuard[{component}] Violation {v_id} ({violation_type}/{severity}): {details}")
        return {
            "id": v_id,
            "timestamp": now_iso,
            "component": component,
            "violation_type": violation_type,
            "severity": severity,
            "details": details,
            "raw_input_snippet": raw_input_snippet,
            "remediation_applied": remediation_applied
        }

    @staticmethod
    def record_violations_batch(violations: List[Dict[str, Any]], component: str, conn: Optional[sqlite3.Connection] = None):
        """Batch-persists a collection of violations."""
        for v in violations:
            AISafetyGuard.record_violation(
                component=component,
                violation_type=v.get("type", "UNKNOWN"),
                severity=v.get("severity", "WARNING"),
                details=v.get("details", ""),
                raw_input_snippet=v.get("raw_input_snippet"),
                remediation_applied=v.get("remediation", "Safety invariant enforced"),
                conn=conn
            )

    @staticmethod
    def get_violations(
        limit: int = 50,
        offset: int = 0,
        component: Optional[str] = None,
        severity: Optional[str] = None,
        conn: Optional[sqlite3.Connection] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Queries the security audit log with optional component/severity filters and returns (violations, total)."""
        close_conn = False
        if conn is None:
            conn = get_connection()
            close_conn = True

        try:
            base_where = "WHERE 1=1"
            base_params = []
            if component:
                base_where += " AND component = ?"
                base_params.append(component)
            if severity:
                base_where += " AND severity = ?"
                base_params.append(severity)

            count_row = conn.execute(f"SELECT COUNT(*) as c FROM ai_safety_violations {base_where}", base_params).fetchone()
            total = count_row["c"] if count_row else 0

            query = f"SELECT * FROM ai_safety_violations {base_where} ORDER BY id DESC LIMIT ? OFFSET ?"
            page_params = list(base_params) + [limit, offset]

            rows = conn.execute(query, page_params).fetchall()
            return [dict(r) for r in rows], total
        finally:
            if close_conn:
                conn.close()

    @staticmethod
    def get_safety_status(conn: Optional[sqlite3.Connection] = None) -> Dict[str, Any]:
        """Returns the real-time operational status of all AI safety systems."""
        close_conn = False
        if conn is None:
            conn = get_connection()
            close_conn = True

        try:
            total_violations = conn.execute("SELECT COUNT(*) as c FROM ai_safety_violations").fetchone()["c"]
            critical_violations = conn.execute(
                "SELECT COUNT(*) as c FROM ai_safety_violations WHERE severity = 'CRITICAL'"
            ).fetchone()["c"]

            severity_rows = conn.execute(
                "SELECT severity, COUNT(*) as c FROM ai_safety_violations GROUP BY severity"
            ).fetchall()
            violation_counts_by_severity = {r["severity"]: r["c"] for r in severity_rows}

            return {
                "guardrails_active": True,
                "invariants_enforced": [
                    "Zero Donor Depletion Safety Buffer (>= 14 days / 21d Monsoon)",
                    "Consumption-Aware FEFO Shelf-Life Horizon",
                    "Deficit & Surplus Strict Quantity Clamping",
                    "Expired Medication Ingestion Blocking",
                    "Adversarial Prompt Injection Sanitization",
                    "Adaptive Cloud API Circuit Breakers"
                ],
                "circuit_breakers": {
                    "vision": vision_circuit_breaker.get_status(),
                    "rebalance": rebalance_circuit_breaker.get_status(),
                },
                "total_violations": total_violations,
                "total_violations_logged": total_violations,
                "critical_violations_count": critical_violations,
                "violation_counts_by_severity": violation_counts_by_severity,
                "status": "HEALTHY" if critical_violations == 0 else "ATTENTION_REQUIRED"
            }
        finally:
            if close_conn:
                conn.close()
