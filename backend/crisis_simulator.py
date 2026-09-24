"""
Crisis & Outbreak Simulation Engine for Public Health Emergency Logistics.
Build with AI: Code for Communities (Second Edition) - Track 03 Smart Health & Supply Chain Resilience.
Day 16: Microtask 5.1 — Crisis & Outbreak Simulation Engine.

Enables emergency logistics coordinators to stress-test regional supply chains under acute shocks:
1. Monsoon Flash Flooding & Landslides in South Satara (400% ASV & 300% IV fluids spike).
2. Leptospirosis & Febrile Outbreak in Pune Foothills & Velhe (350% Doxycycline & Paracetamol spike).
3. Extreme Summer Heatwave in Eastern Plains (500% ORS & IV fluids spike).
4. Zoonotic Canine Rabies Spillover Cluster (400% ARV spike).

Features:
- Pre-crisis atomic snapshotting for 1-click zero-data-loss rollback (POST /api/crisis/reset).
- FEFO automated emergency depletion with valid DSCSA SHA-256 cryptographic chain preservation.
- Real-time Server-Sent Events (SSE) emergency alerts with high-visibility SURGE_SPIKE categorization.
- Automated multi-facility AI rebalancing proposal generation from surplus donor PHCs.
- Sahyadri mountain transit physics integration (monsoon 1.5x buffer and 25 km/h speed limits).
"""

import json
import sqlite3
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Any
import logging

from database import (
    get_connection,
    get_db_path,
    record_inventory_transaction,
    compute_deterministic_hash,
)
from schemas import TransferUrgency
from alerts import AlertBroadcaster
from rebalancer import autonomous_rebalancing_service
from routes.stats import invalidate_stats_cache

logger = logging.getLogger("pranavahini.crisis")


@dataclass
class CrisisScenarioDefinition:
    scenario_id: str
    title: str
    description: str
    category: str
    affected_district: str
    severity: str
    monsoon_mode: bool
    estimated_surge_multiplier: float
    affected_facility_codes: List[str]
    medicine_spikes: Dict[str, float]  # SKU -> surge multiplier
    icon: str
    estimated_casualties: str
    clinical_alert_message: str


# Preset authentic public health emergency scenarios grounded in Maharashtra geography
PRESET_SCENARIOS: Dict[str, CrisisScenarioDefinition] = {
    "MONSOON_FLOOD_SOUTH_SATARA": CrisisScenarioDefinition(
        scenario_id="MONSOON_FLOOD_SOUTH_SATARA",
        title="Monsoon Flash Flooding & Landslides (South Satara / Koyna Basin)",
        description="Torrential rainfall in the Koyna catchment causes flash flooding and mountain pass washouts. Displaced Russell's Vipers and Saw-scaled Vipers trigger a 400% surge in snakebites, alongside severe water-borne acute diarrheal disease in rural Ghats facilities.",
        category="FLOODING_LANDSLIDE",
        affected_district="Satara",
        severity="EMERGENCY",
        monsoon_mode=True,
        estimated_surge_multiplier=4.5,
        affected_facility_codes=["PHC-SAT-01", "PHC-SAT-02", "SC-SAT-01", "SC-SAT-02", "CHC-SAT-01"],
        medicine_spikes={
            "MED-ASV-01": 5.0,   # Anti-Snake Venom (400% surge)
            "MED-RL-01": 4.0,    # Ringer Lactate 500ml (300% surge)
            "MED-ORS-01": 4.5,   # Oral Rehydration Salts
            "MED-CIP-01": 3.5,   # Ciprofloxacin 500mg
        },
        icon="CloudRain",
        estimated_casualties="65-80 Acute Cases / 24h",
        clinical_alert_message="CRITICAL ENVENOMATION & CHOLERA SURGE: Koyna Basin road closures. Immediate emergency cold-chain redistribution of Polyvalent ASV required."
    ),
    "LEPTOSPIROSIS_PUNE_GHATS": CrisisScenarioDefinition(
        scenario_id="LEPTOSPIROSIS_PUNE_GHATS",
        title="Leptospirosis & Acute Febrile Outbreak (Maval & Velhe Foothills)",
        description="Post-flood agricultural runoff and waterlogged paddy fields lead to an acute spike in rodent-borne Leptospira interrogans infections and dengue fever across high-elevation Western Ghats communities in rural Pune.",
        category="WATERBORNE_OUTBREAK",
        affected_district="Pune",
        severity="CRITICAL",
        monsoon_mode=True,
        estimated_surge_multiplier=3.8,
        affected_facility_codes=["SC-PUN-01", "PHC-PUN-01", "PHC-PUN-02", "CHC-PUN-02"],
        medicine_spikes={
            "MED-DOX-01": 4.5,   # Doxycycline 100mg
            "MED-PCM-01": 4.0,   # Paracetamol 500mg
            "MED-RL-01": 3.0,    # Ringer Lactate
            "MED-AMX-01": 3.0,   # Amoxicillin 500mg
        },
        icon="Biohazard",
        estimated_casualties="120+ Febrile / Leptospirosis Suspects",
        clinical_alert_message="OUTBREAK ALERT: Multiple primary clinics reporting zero Doxycycline & Paracetamol reserves amidst escalating febrile admissions."
    ),
    "HEATWAVE_PLAINS_SHIRUR": CrisisScenarioDefinition(
        scenario_id="HEATWAVE_PLAINS_SHIRUR",
        title="Severe Summer Heatwave & Dehydration Shock (Eastern Plains)",
        description="Persistent ambient temperatures above 43.5°C across arid eastern talukas trigger pediatric heat exhaustion, hyperthermia, and acute gastroenteritis crises across plain PHCs.",
        category="CLIMATE_HEATWAVE",
        affected_district="Pune",
        severity="CRITICAL",
        monsoon_mode=False,
        estimated_surge_multiplier=4.2,
        affected_facility_codes=["SDH-PUN-01", "PHC-PUN-02", "SC-PUN-01"],
        medicine_spikes={
            "MED-ORS-01": 5.0,   # ORS (400% surge)
            "MED-PCM-01": 3.5,   # Paracetamol
            "MED-RL-01": 4.0,    # IV Fluids
        },
        icon="Sun",
        estimated_casualties="150+ Dehydration / Heatstroke Admissions",
        clinical_alert_message="HEAT ALERT: Acute dehydration epidemic. Oral Rehydration Salts and IV fluids stock depleted across Shirur plain cluster."
    ),
    "RABIES_CANINE_CLUSTER": CrisisScenarioDefinition(
        scenario_id="RABIES_CANINE_CLUSTER",
        title="Zoonotic Canine Rabies Outbreak (Peri-Urban Satara Border)",
        description="Multiple stray dog pack bite incidents in rural weekly market centers precipitate emergency Category III bite exposure presentations requiring immediate post-exposure rabies prophylaxis.",
        category="ZOONOTIC_CLUSTER",
        affected_district="Satara",
        severity="EMERGENCY",
        monsoon_mode=False,
        estimated_surge_multiplier=3.5,
        affected_facility_codes=["PHC-SAT-02", "SC-SAT-01", "DH-SAT-01"],
        medicine_spikes={
            "MED-ARV-01": 4.5,   # Anti-Rabies Vaccine
            "MED-TT-01": 3.0,    # Tetanus Toxoid
        },
        icon="AlertTriangle",
        estimated_casualties="45 Category III Animal Bites Reported",
        clinical_alert_message="RABIES CRISIS: Anti-Rabies Vaccine (ARV) reserves exhausted at peripheral PHCs. Cold-chain urgent resupply required."
    ),
}


class CrisisSimulatorService:
    """
    Singleton service managing crisis simulation lifecycle, FEFO emergency depletions,
    cryptographic DSCSA hash chaining, SSE broadcast telemetry, and atomic state rollback.
    """
    _instance: Optional["CrisisSimulatorService"] = None

    def __init__(self):
        self._active_simulation: Optional[Dict[str, Any]] = None
        self._snapshot_batches: Optional[List[Dict[str, Any]]] = None
        self._crisis_transaction_ids: List[int] = []
        self._cached_rebalance_plans: List[Dict[str, Any]] = []

    @classmethod
    def get_instance(cls) -> "CrisisSimulatorService":
        if cls._instance is None:
            cls._instance = CrisisSimulatorService()
        return cls._instance

    @staticmethod
    def _ensure_tables(cursor: sqlite3.Cursor):
        """Ensures the durable crisis_snapshots table exists."""
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS crisis_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scenario_id TEXT NOT NULL,
                captured_at TEXT NOT NULL,
                snapshot_data_json TEXT NOT NULL,
                max_tx_id INTEGER NOT NULL,
                head_hash TEXT NOT NULL,
                is_active INTEGER CHECK(is_active IN (0, 1)) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_crisis_snapshots_active ON crisis_snapshots(is_active);")

    def get_scenarios(self) -> List[Dict[str, Any]]:
        """Returns all preset crisis scenario definitions formatted for API response."""
        return [asdict(s) for s in PRESET_SCENARIOS.values()]

    def get_scenario_by_id(self, scenario_id: str) -> Optional[CrisisScenarioDefinition]:
        return PRESET_SCENARIOS.get(scenario_id)

    def get_status(self, db_path: Optional[Path] = None) -> Dict[str, Any]:
        """Returns current simulation status, recovering state from crisis_snapshots if worker restarted."""
        if not self._active_simulation:
            # Check if a crisis is active in the durable database snapshot table
            target_db = db_path or get_db_path()
            try:
                conn = get_connection(target_db)
                cur = conn.cursor()
                self._ensure_tables(cur)
                cur.execute("""
                    SELECT id, scenario_id, captured_at, snapshot_data_json
                    FROM crisis_snapshots
                    WHERE is_active = 1
                    ORDER BY id DESC LIMIT 1;
                """)
                active_row = cur.fetchone()
                if active_row:
                    scen_id = active_row["scenario_id"]
                    scen = PRESET_SCENARIOS.get(scen_id)
                    title = scen.title if scen else scen_id
                    monsoon = scen.monsoon_mode if scen else False
                    batches = json.loads(active_row["snapshot_data_json"])
                    self._snapshot_batches = batches
                    affected_ids = list({b["facility_id"] for b in batches[:10]})
                    self._active_simulation = {
                        "scenario_id": scen_id,
                        "title": title,
                        "activated_at": active_row["captured_at"],
                        "intensity": 1.0,
                        "affected_facility_ids": affected_ids,
                        "monsoon_mode": monsoon,
                        "total_units_consumed": 0,
                    }
                conn.close()
            except Exception as e:
                logger.warning(f"[CrisisSimulator] Could not recover status from crisis_snapshots: {e}")

        if not self._active_simulation:
            return {
                "is_active": False,
                "active_scenario_id": None,
                "active_scenario_title": None,
                "activated_at": None,
                "intensity": 1.0,
                "affected_facility_count": 0,
                "affected_facility_ids": [],
                "monsoon_mode": False,
                "rebalance_plans_available": 0
            }

        return {
            "is_active": True,
            "active_scenario_id": self._active_simulation.get("scenario_id"),
            "active_scenario_title": self._active_simulation.get("title"),
            "activated_at": self._active_simulation.get("activated_at"),
            "intensity": self._active_simulation.get("intensity", 1.0),
            "affected_facility_count": len(self._active_simulation.get("affected_facility_ids", [])),
            "affected_facility_ids": self._active_simulation.get("affected_facility_ids", []),
            "monsoon_mode": self._active_simulation.get("monsoon_mode", False),
            "rebalance_plans_available": len(self._cached_rebalance_plans)
        }

    async def trigger_crisis(
        self,
        scenario_id: str,
        intensity: float = 1.0,
        auto_generate_rebalance: bool = True,
        db_path: Optional[Path] = None
    ) -> Dict[str, Any]:
        """
        Executes a simulated emergency disaster surge:
        1. Captures durable atomic snapshot of stock_batches in SQLite if not already captured.
        2. Consumes inventory in targeted facilities using FEFO allocations.
        3. Records immutable CONSUMED ledger entries maintaining valid SHA-256 chains.
        4. Emits high-priority Server-Sent Events (SSE) to connected clients.
        5. Evaluates deficits and computes multi-facility autonomous rebalancing plans.
        """
        scenario = self.get_scenario_by_id(scenario_id)
        if not scenario:
            raise ValueError(f"Unknown crisis scenario ID: '{scenario_id}'")

        target_db = db_path or get_db_path()
        conn = get_connection(target_db)

        try:
            cursor = conn.cursor()
            self._ensure_tables(cursor)

            now_iso = datetime.now(timezone.utc).isoformat(timespec="microseconds")

            # 1. Take durable snapshot in SQLite crisis_snapshots if not already captured
            cursor.execute("""
                SELECT id, scenario_id, snapshot_data_json, max_tx_id, head_hash
                FROM crisis_snapshots
                WHERE is_active = 1
                ORDER BY id DESC LIMIT 1;
            """)
            active_snap_row = cursor.fetchone()

            if not active_snap_row:
                cursor.execute("""
                    SELECT id, facility_id, medicine_id, gtin, batch_number, 
                           serial_number, expiry_date, quantity_available, status, version
                    FROM stock_batches;
                """)
                baseline_batches = [dict(r) for r in cursor.fetchall()]

                cursor.execute("SELECT MAX(id) as max_tx_id, hash FROM inventory_transactions ORDER BY id DESC LIMIT 1;")
                tx_row = cursor.fetchone()
                max_tx_id = tx_row["max_tx_id"] if tx_row and tx_row["max_tx_id"] else 0
                head_hash = tx_row["hash"] if tx_row and tx_row["hash"] else ("0" * 64)

                cursor.execute("""
                    INSERT INTO crisis_snapshots (scenario_id, captured_at, snapshot_data_json, max_tx_id, head_hash, is_active)
                    VALUES (?, ?, ?, ?, ?, 1);
                """, (scenario.scenario_id, now_iso, json.dumps(baseline_batches), max_tx_id, head_hash))
                self._snapshot_batches = baseline_batches
                logger.info(f"[CrisisSimulator] Captured durable pre-crisis baseline snapshot of {len(baseline_batches)} stock batches into crisis_snapshots.")
            else:
                self._snapshot_batches = json.loads(active_snap_row["snapshot_data_json"])
                logger.info(f"[CrisisSimulator] Reusing existing active baseline snapshot (ID: {active_snap_row['id']}).")

            # Resolve facility IDs from codes
            placeholders = ",".join(["?"] * len(scenario.affected_facility_codes))
            cursor.execute(f"""
                SELECT id, facility_code, name, district, has_cold_chain 
                FROM facilities 
                WHERE facility_code IN ({placeholders}) AND is_active = 1;
            """, scenario.affected_facility_codes)
            target_facilities = cursor.fetchall()
            facility_map = {f["facility_code"]: f for f in target_facilities}

            # Resolve medicine IDs from SKUs
            sku_list = list(scenario.medicine_spikes.keys())
            sku_placeholders = ",".join(["?"] * len(sku_list))
            cursor.execute(f"""
                SELECT id, sku, name, unit, min_safety_stock, requires_cold_chain 
                FROM medicines 
                WHERE sku IN ({sku_placeholders}) AND is_active = 1;
            """, sku_list)
            target_medicines = cursor.fetchall()
            medicine_map = {m["sku"]: m for m in target_medicines}

            affected_facility_ids = [f["id"] for f in target_facilities]
            newly_depleted_items = []
            total_units_consumed = 0
            created_tx_ids = []

            # 2. Execute FEFO Emergency Depletions
            now_iso = datetime.now(timezone.utc).isoformat()

            for fac_code, fac in facility_map.items():
                f_id = fac["id"]
                f_name = fac["name"]

                for sku, spike_multiplier in scenario.medicine_spikes.items():
                    if sku not in medicine_map:
                        continue
                    med = medicine_map[sku]
                    m_id = med["id"]
                    m_name = med["name"]
                    min_stock = med["min_safety_stock"]

                    # Check if cold-chain constraint prevents stocking
                    if med["requires_cold_chain"] and not fac["has_cold_chain"]:
                        continue

                    # Fetch active batches in FEFO order (earliest expiry first)
                    cursor.execute("""
                        SELECT id, batch_number, serial_number, expiry_date, quantity_available, gtin, version
                        FROM stock_batches
                        WHERE facility_id = ? AND medicine_id = ? AND status = 'ACTIVE' AND quantity_available > 0
                        ORDER BY expiry_date ASC, id ASC;
                    """, (f_id, m_id))
                    batches = cursor.fetchall()

                    current_stock = sum(b["quantity_available"] for b in batches)
                    if current_stock == 0:
                        continue

                    # Calculate target depletion to create an authentic emergency deficit:
                    # Deplete down to 10% of safety floor or max 3 units remaining
                    target_remaining = max(1, int(min_stock * 0.15))
                    desired_deplete = max(0, current_stock - target_remaining)
                    # Scale with scenario intensity
                    actual_deplete = int(min(current_stock, max(1, desired_deplete * min(intensity, 2.0))))

                    if actual_deplete <= 0:
                        continue

                    rem_to_deplete = actual_deplete

                    for b in batches:
                        if rem_to_deplete <= 0:
                            break

                        batch_qty = b["quantity_available"]
                        deduct_qty = min(batch_qty, rem_to_deplete)
                        new_batch_balance = batch_qty - deduct_qty

                        # Update stock batch
                        cursor.execute("""
                            UPDATE stock_batches
                            SET quantity_available = ?,
                                status = CASE WHEN ? = 0 THEN 'ACTIVE' ELSE status END,
                                version = version + 1
                            WHERE id = ?;
                        """, (new_batch_balance, new_batch_balance, b["id"]))

                        # Record immutable cryptographic transaction
                        tx = record_inventory_transaction(
                            cursor=cursor,
                            facility_id=f_id,
                            medicine_id=m_id,
                            batch_id=b["id"],
                            batch_number=b["batch_number"],
                            expiry_date=b["expiry_date"],
                            transaction_type="CONSUMED",
                            quantity=deduct_qty,
                            balance_after=new_batch_balance,
                            gtin=b["gtin"] or "08901234567890",
                            serial_number=b["serial_number"],
                            reference_id=f"CRISIS-SIM-{scenario.scenario_id}",
                            notes=f"Emergency Crisis Surge: {scenario.title} (Multiplier: {spike_multiplier * intensity:.1f}x)",
                            logged_by="Emergency Crisis Simulator"
                        )
                        created_tx_ids.append(tx.get("id") or tx.get("transaction_id"))
                        rem_to_deplete -= deduct_qty
                        total_units_consumed += deduct_qty

                    newly_depleted_items.append({
                        "facility_id": f_id,
                        "facility_name": f_name,
                        "medicine_id": m_id,
                        "medicine_name": m_name,
                        "consumed_units": actual_deplete,
                        "remaining_stock": current_stock - actual_deplete,
                        "min_safety_stock": min_stock,
                        "status": "CRITICAL"
                    })

            conn.commit()
            self._crisis_transaction_ids.extend(created_tx_ids)
            logger.info(f"[CrisisSimulator] Successfully simulated emergency depletion of {total_units_consumed} units across {len(newly_depleted_items)} facility-medicine nodes.")

            # Invalidate stats cache so dashboard reflects updated figures
            invalidate_stats_cache()

            # 3. Broadcast Real-Time SSE Emergency Alerts
            alerts_broadcast_count = 0
            broadcaster = AlertBroadcaster.get_instance()

            for item in newly_depleted_items:
                try:
                    await broadcaster.broadcast({
                        "severity": scenario.severity,
                        "category": "SURGE_SPIKE",
                        "facility_id": item["facility_id"],
                        "medicine_id": item["medicine_id"],
                        "title": f"🚨 {scenario.title}: {item['facility_name']} Depleted",
                        "message": f"Critical epidemic spike! {item['facility_name']} stock of {item['medicine_name']} dropped to {item['remaining_stock']} units (Safety floor: {item['min_safety_stock']}). Immediate peer redistribution required!",
                        "data_json": json.dumps({
                            "scenario_id": scenario.scenario_id,
                            "facility_id": item["facility_id"],
                            "medicine_id": item["medicine_id"],
                            "surge_multiplier": scenario.estimated_surge_multiplier * intensity,
                            "monsoon_mode": scenario.monsoon_mode,
                            "crisis_active": True
                        })
                    })
                    alerts_broadcast_count += 1
                except Exception as alert_err:
                    logger.warning(f"[CrisisSimulator] Failed to broadcast SSE alert for item {item}: {alert_err}")

            # 4. Compute Autonomous Multi-Facility Rebalancing Proposals
            recommended_plans = []
            if auto_generate_rebalance:
                # Group by depleted nodes and query the rebalancing agent
                for item in newly_depleted_items:
                    try:
                        min_donor_buffer = 21 if scenario.monsoon_mode else 14
                        target_buffer = 21 if scenario.monsoon_mode else 14
                        rec = autonomous_rebalancing_service.recommend_rebalance(
                            recipient_facility_id=item["facility_id"],
                            medicine_id=item["medicine_id"],
                            target_buffer_days=target_buffer,
                            min_donor_buffer_days=min_donor_buffer,
                            max_radius_km=75.0,  # Expand radius during disaster
                            forced_urgency=TransferUrgency.CRITICAL_EMERGENCY if scenario.severity == "EMERGENCY" else TransferUrgency.URGENT,
                            monsoon_mode=scenario.monsoon_mode,
                            db_path=target_db
                        )
                        if rec.is_feasible and rec.recommended_donor:
                            plan_dict = {
                                "recommendation_id": rec.recommendation_id,
                                "recipient_facility_id": rec.destination_facility_id,
                                "recipient_facility_name": item["facility_name"],
                                "donor_facility_id": rec.recommended_donor.facility_id,
                                "donor_facility_name": rec.recommended_donor.facility_name,
                                "medicine_id": rec.medicine_id,
                                "medicine_name": rec.medicine_name,
                                "medicine_unit": rec.medicine_unit,
                                "recommended_quantity": rec.recommended_quantity,
                                "distance_km": rec.estimated_distance_km or rec.recommended_donor.distance_km,
                                "estimated_transit_hours": rec.estimated_transit_hours or rec.recommended_donor.estimated_transit_hours,
                                "monsoon_mode": rec.monsoon_buffer_applied,
                                "clinical_rationale": rec.clinical_rationale,
                                "requires_cold_chain": bool(rec.recommended_donor.has_cold_chain),
                            }
                            recommended_plans.append(plan_dict)
                    except Exception as rebal_err:
                        logger.warning(f"[CrisisSimulator] Could not evaluate rebalancing for deficit {item}: {rebal_err}")

            self._cached_rebalance_plans = recommended_plans

            # Set active simulation state
            self._active_simulation = {
                "scenario_id": scenario.scenario_id,
                "title": scenario.title,
                "activated_at": now_iso,
                "intensity": intensity,
                "affected_facility_ids": affected_facility_ids,
                "monsoon_mode": scenario.monsoon_mode,
                "total_units_consumed": total_units_consumed,
            }

            return {
                "status": "ACTIVE",
                "scenario_id": scenario.scenario_id,
                "scenario_title": scenario.title,
                "affected_facilities_count": len(affected_facility_ids),
                "critically_depleted_items_count": len(newly_depleted_items),
                "total_units_consumed": total_units_consumed,
                "alerts_broadcast": alerts_broadcast_count,
                "monsoon_multiplier_active": scenario.monsoon_mode,
                "recommended_rebalance_plans": recommended_plans,
                "message": f"Successfully activated '{scenario.title}'. {len(newly_depleted_items)} nodes depleted into CRITICAL status. {len(recommended_plans)} autonomous rebalancing corridors identified."
            }

        finally:
            conn.close()

    async def reset_simulation(self, db_path: Optional[Path] = None) -> Dict[str, Any]:
        """
        Restores baseline inventory from durable SQLite crisis_snapshots table:
        1. Queries active snapshot from crisis_snapshots (survives process restarts).
        2. Restores quantity_available and status for each stock batch.
        3. Appends line-item AUDIT_CORRECTION transactions for every batch with non-zero delta,
           preserving 100% unbroken DSCSA / NHM SHA-256 cryptographic ledger integrity.
        4. Marks crisis_snapshots row inactive.
        5. Broadcasts an INFO SSE alert notifying all clients that crisis mode has resolved.
        """
        target_db = db_path or get_db_path()
        conn = get_connection(target_db)

        try:
            cursor = conn.cursor()
            self._ensure_tables(cursor)

            # Query durable snapshot from crisis_snapshots
            cursor.execute("""
                SELECT id, scenario_id, captured_at, snapshot_data_json
                FROM crisis_snapshots
                WHERE is_active = 1
                ORDER BY id DESC LIMIT 1;
            """)
            snapshot_row = cursor.fetchone()

            batches_to_restore = []
            snap_id = None
            scenario_id = "UNKNOWN"

            if snapshot_row:
                snap_id = snapshot_row["id"]
                scenario_id = snapshot_row["scenario_id"]
                batches_to_restore = json.loads(snapshot_row["snapshot_data_json"])
            elif self._snapshot_batches:
                batches_to_restore = self._snapshot_batches
                scenario_id = self._active_simulation.get("scenario_id", "MANUAL") if self._active_simulation else "MANUAL"

            if not batches_to_restore:
                # Clean up any lingering active state
                self._active_simulation = None
                self._cached_rebalance_plans = []
                self._snapshot_batches = None
                return {
                    "status": "RESET",
                    "restored_batches_count": 0,
                    "message": "No active crisis simulation snapshot found; system is already in baseline state."
                }

            restored_count = 0
            audit_corrections_recorded = 0
            now_iso = datetime.now(timezone.utc).isoformat(timespec="microseconds")

            # 1. Line-item restoration with explicit AUDIT_CORRECTION records
            for b in batches_to_restore:
                cursor.execute("SELECT quantity_available, status FROM stock_batches WHERE id = ?;", (b["id"],))
                curr_row = cursor.fetchone()
                if not curr_row:
                    continue

                curr_qty = curr_row["quantity_available"]
                target_qty = b["quantity_available"]
                qty_diff = target_qty - curr_qty

                # Restore stock batch
                cursor.execute("""
                    UPDATE stock_batches
                    SET quantity_available = ?,
                        status = ?,
                        version = version + 1,
                        updated_at = ?
                    WHERE id = ?;
                """, (target_qty, b["status"], now_iso, b["id"]))
                restored_count += 1

                # If quantity changed during simulation, record line-item AUDIT_CORRECTION transaction
                if qty_diff != 0:
                    cursor.execute("""
                        SELECT COALESCE(SUM(quantity_available), 0) AS total_remaining
                        FROM stock_batches
                        WHERE facility_id = ? AND medicine_id = ? AND status = 'ACTIVE';
                    """, (b["facility_id"], b["medicine_id"]))
                    balance_after = cursor.fetchone()["total_remaining"]

                    record_inventory_transaction(
                        cursor=cursor,
                        facility_id=b["facility_id"],
                        medicine_id=b["medicine_id"],
                        batch_id=b["id"],
                        batch_number=b["batch_number"],
                        expiry_date=b["expiry_date"],
                        transaction_type="AUDIT_CORRECTION",
                        quantity=qty_diff,
                        balance_after=balance_after,
                        gtin=b.get("gtin") or "08901234567890",
                        serial_number=b.get("serial_number"),
                        reference_id=f"CRISIS-RESET-{scenario_id}",
                        notes=f"Restored batch stock from pre-crisis snapshot (Delta: {qty_diff:+d})",
                        logged_by="CrisisSimulationEngine"
                    )
                    audit_corrections_recorded += 1

            # 2. Deactivate durable snapshot
            if snap_id:
                cursor.execute("UPDATE crisis_snapshots SET is_active = 0 WHERE id = ?;", (snap_id,))
            else:
                cursor.execute("UPDATE crisis_snapshots SET is_active = 0;")

            conn.commit()
            invalidate_stats_cache()
            logger.info(f"[CrisisSimulator] Baseline restored: {restored_count} batches restored, {audit_corrections_recorded} AUDIT_CORRECTION transactions appended.")

            # 3. Broadcast SSE notification that crisis has resolved
            broadcaster = AlertBroadcaster.get_instance()
            try:
                await broadcaster.broadcast({
                    "severity": "INFO",
                    "category": "SYSTEM",
                    "title": "🕊️ Crisis Simulation Deactivated: Baseline Restored",
                    "message": f"Regional public health simulation reset. {audit_corrections_recorded} inventory lines restored to baseline with DSCSA audit continuity.",
                    "data_json": json.dumps({"crisis_active": False, "audit_corrections": audit_corrections_recorded})
                })
            except Exception as e:
                logger.warning(f"[CrisisSimulator] Failed to broadcast reset alert: {e}")

            # Reset in-memory tracking
            self._active_simulation = None
            self._snapshot_batches = None
            self._crisis_transaction_ids = []
            self._cached_rebalance_plans = []

            return {
                "status": "RESET",
                "restored_batches_count": restored_count,
                "audit_corrections_recorded": audit_corrections_recorded,
                "message": f"Crisis simulation deactivated. Successfully restored {restored_count} stock batches to baseline ({audit_corrections_recorded} audit corrections recorded)."
            }

        finally:
            conn.close()


# Module-level singleton
crisis_simulator_service = CrisisSimulatorService.get_instance()
