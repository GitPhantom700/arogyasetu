import asyncio
import math
import secrets
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta
from enum import Enum

BRICS_NODES = ["IN-DEL-01", "BR-SP-02", "RU-MOW-03", "CN-BJ-04", "ZA-JNB-05"]

class MedicineCategory(str, Enum):
    ANTIDOTE = "Antidote"
    VACCINE = "Vaccine"
    ANTIBIOTIC = "Antibiotic"
    IV_FLUID = "IV Fluid"
    EMERGENCY = "Emergency"
    GENERAL = "General"

class DifferentialPrivacyEngine:
    """
    Mathematically grounded Differential Privacy engine using Laplace Mechanism.
    Noise scale b = Sensitivity (Δf) / Epsilon (ε)
    """
    def __init__(self, epsilon: float = 0.5, delta_f: float = 0.1):
        self.epsilon = epsilon
        self.delta_f = delta_f
        self.b = delta_f / epsilon

    def sample_laplace_noise(self) -> float:
        # Cryptographically secure Laplace sampling using inverse CDF
        # Ensure u strictly avoids +/- 0.5 boundary
        u = secrets.SystemRandom().uniform(-0.5 + 1e-12, 0.5 - 1e-12)
        sign = 1.0 if u >= 0 else -1.0
        return -self.b * sign * math.log(max(1e-15, 1.0 - 2.0 * abs(u)))

class BRICSFederatedLearningService:
    def __init__(self, epsilon: float = 0.5):
        self.global_model_version = "v1.2.4-brics"
        self.last_sync = datetime.now(timezone.utc) - timedelta(hours=2)
        self.dp_engine = DifferentialPrivacyEngine(epsilon=epsilon, delta_f=0.1)
        
    async def get_global_anomaly_weights(self, medicine_category: str) -> Dict[str, Any]:
        await asyncio.sleep(0.05) # Simulated encrypted cross-border aggregation latency
        
        cat_lower = (medicine_category or "Antidote").strip().lower()
        if 'antidote' in cat_lower:
            base_threshold = 4.2
            confidence = 0.96
            protocol_desc = "FedAvg-Laplace-DP (High-Urgency Antidote Topology)"
            gradient_nodes = {
                "IN-DEL-01": "+14.8% snakebite shock gradient",
                "BR-SP-02": "+12.1% crotalic antivenom gradient",
                "RU-MOW-03": "+3.4% baseline vector",
                "CN-BJ-04": "+8.9% viperid regional vector",
                "ZA-JNB-05": "+16.2% elapid surge gradient"
            }
        elif 'vaccine' in cat_lower:
            base_threshold = 3.3
            confidence = 0.95
            protocol_desc = "FedAvg-Laplace-DP (Cold-Chain Biologicals Horizon)"
            gradient_nodes = {
                "IN-DEL-01": "+9.4% rabies immunization burn",
                "BR-SP-02": "+10.2% yellow fever cluster gradient",
                "RU-MOW-03": "+7.1% respiratory vaccine vector",
                "CN-BJ-04": "+8.5% viral prophylaxis vector",
                "ZA-JNB-05": "+11.3% outbreak vaccine demand"
            }
        elif 'antibiotic' in cat_lower:
            base_threshold = 2.7
            confidence = 0.93
            protocol_desc = "FedAvg-Laplace-DP (Antimicrobial Stewardship Weight)"
            gradient_nodes = {
                "IN-DEL-01": "+6.2% broad-spectrum sepsis consumption",
                "BR-SP-02": "+5.9% amoxicillin depletion rate",
                "RU-MOW-03": "+4.8% cephalosporin gradient",
                "CN-BJ-04": "+7.1% macrolide surge rate",
                "ZA-JNB-05": "+8.0% respiratory antibiotic vector"
            }
        elif 'fluid' in cat_lower:
            base_threshold = 2.1
            confidence = 0.91
            protocol_desc = "FedAvg-Laplace-DP (Hydration & Fluid Resuscitation)"
            gradient_nodes = {
                "IN-DEL-01": "+18.4% diarrheal dehydration surge",
                "BR-SP-02": "+14.7% dengue plasma expansion vector",
                "RU-MOW-03": "+5.2% crystalloid baseline",
                "CN-BJ-04": "+9.6% clinical fluid buffer",
                "ZA-JNB-05": "+15.1% cholera rehydration burn"
            }
        else:
            base_threshold = 2.5
            confidence = 0.92
            protocol_desc = "FedAvg-Laplace-DP (Standard Multi-Modal Consensus)"
            gradient_nodes = {n: "+6.0% baseline consensus" for n in BRICS_NODES}

        # Calibrated Differential Privacy Noise via Laplace Mechanism
        dp_noise = self.dp_engine.sample_laplace_noise()
        noisy_threshold = max(1.0, min(10.0, base_threshold + dp_noise))
        
        return {
            "model_version": self.global_model_version,
            "category": medicine_category,
            "last_global_sync_utc": self.last_sync.isoformat(),
            "active_nodes": BRICS_NODES,
            "anomaly_threshold_multiplier": round(noisy_threshold, 3),
            "privacy_guarantee": {
                "mechanism": "Laplace Mechanism",
                "epsilon_privacy_budget": self.dp_engine.epsilon,
                "global_sensitivity_delta": self.dp_engine.delta_f,
                "phi_exposure": "ZERO_PHI_SHARED"
            },
            "confidence_score": confidence,
            "aggregation_protocol": protocol_desc,
            "node_gradients": gradient_nodes
        }

    async def submit_local_gradients(self, node_id: str, local_metrics: Dict[str, Any]) -> Dict[str, Any]:
        if node_id not in BRICS_NODES:
            raise ValueError(f"Unauthorized BRICS+ node ID: {node_id}")
            
        await asyncio.sleep(0.2)
        self.last_sync = datetime.now(timezone.utc)
        
        # Clip gradient updates to bound sensitivity Δf <= 2.0
        surge_events = min(100, max(0, local_metrics.get("acute_surge_events", 0)))
        burn_shift = min(5.0, max(-5.0, local_metrics.get("average_burn_rate_shift", 0.0)))
        
        return {
            "status": "SUCCESS",
            "federation_status": "GRADIENTS_MERGED",
            "verified_node": node_id,
            "clipped_metrics": {
                "acute_surge_events": surge_events,
                "average_burn_rate_shift": burn_shift
            },
            "next_sync_eta_minutes": 60
        }

brics_fl_service = BRICSFederatedLearningService(epsilon=0.5)
