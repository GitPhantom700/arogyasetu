# PranaVahini — Release Notes

## Version 1.0.0 — Production Release (September 2026)

**PranaVahini** is officially released for the **Build with AI: Code for Communities (Second Edition)** hackathon organized by **Hack2Skill** in partnership with **Google**.

This initial production release delivers autonomous emergency medicine rebalancing, clinical AI safety guardrails, offline-first frontline dispensing, and containerized deployment for rural public health networks.

---

### 🌟 Key Highlights & Milestones

#### 1. Core Logistics & Emergency Redistribution
- **15 Simulated PHCs:** Realistic health network across Pune and Satara districts (Western Ghats) seeded with 182 active critical medicine batches (183 total) and 13 lifecycle transfers.
- **Dynamic Burn Rate Engine:** Real-time calculation of Daily Average Consumption (DAC), Days of Inventory Remaining (DIR), and acute surge velocities.
- **Inter-PHC Transfer State Machine:** Complete 5-stage lifecycle (`REQUESTED` $\rightarrow$ `APPROVED` $\rightarrow$ `DISPATCHED` $\rightarrow$ `IN_TRANSIT` $\rightarrow$ `RECEIVED`) with physical return diversion on transit spoilage.
- **Mountain Terrain Transit Physics:** Accurate travel calculations accounting for steep Sahyadri mountain ghat passes rather than flat geodesic lines.

#### 2. Multimodal Google AI Integration
- **Gemini 3.6 Flash Vision OCR:** Physical paper register and invoice digitization (`/api/inventory/scan-register`) with `RapidFuzz` clinical catalog disambiguation and mandatory pharmacist-in-the-loop review.
- **Gemini Autonomous Rebalancer:** Multi-objective redistribution engine selecting donors within 50 km based on cold-chain readiness, FEFO batch selection, and zero donor depletion safety floors.
- **Deterministic AISafetyGuard:** Strict Python safety envelope enforcing 6 non-negotiable physical constraints, mass conservation, and rural blackout baseline floors.
- **Thread-Safe Circuit Breaker:** Monotonic watchdog providing $< 5\text{ ms}$ offline fallback to linear programming when cloud connectivity is unavailable.

#### 3. Sovereign Compliance & Cryptographic Integrity
- **DSCSA & NHM Cryptographic Audit Trail:** Append-only SHA-256 Merkle chain across 192 transaction blocks with zero mutation tolerance.
- **ABDM Sovereign Stack Integration:** Mock registries supporting Health Facility Registry (HFR M1), Health Professional Registry (HPR M2), and cryptographic ABHA consent sealing (M3).
- **BRICS+ Federated Learning Endpoints:** Global M4 weight and gradient synchronization endpoints with Laplace differential privacy noise addition.
- **IoT Thermal Quarantine:** Cold-chain compromise quarantine endpoint (`/api/inventory/batches/{id}/flag-compromised`) with Optimistic Concurrency Control (OCC 409).

#### 4. Cognitive Ergonomics & Rural Usability
- **Hands-Free Speech Dictation:** Continuous Web Speech API recognition supporting **मराठी (`mr-IN`)**, **हिन्दी (`hi-IN`)**, and **English (`en-IN`)**.
- **WCAG 2.1 AAA Accessibility:** Sunlight-readable dual-channel shape badges (⚠️, 🔒, 🛡️) with 2px high-contrast borders for outdoor Sahyadri clinic courtyards.
- **48×48px PPE Touch Targets:** Enlarged dispensing steppers and rapid decrement buttons (`-1`, `-5`, `-10`, `-20`) designed for latex medical gloves.
- **Rural Connectivity Resilience:** Optimistic IndexedDB offline queueing with non-punitive OCC 409 conflict reconciliation flow.

#### 5. Verification & Test Coverage
- **107 / 107 Backend Pytest Tests Passing (100% Green).**
- **Production React 19 Frontend:** Built via Vite in 2.60s with 0 errors.
- **Comprehensive 25-Screen UI/UX Design Audit Dossier:** (`pranavahini_ui_design_audit.pdf`, 6.78 MB).

---

## Version 1.1.0 — Hackathon Production Hardening & Refinements (September 2026)

### 🛠️ Key Fixes & Refinements

1. **AI Rebalancer Safe Allocation Fix:**
   - Resolved inventory calculation anomaly in `backend/ai_safety.py` where available stock was double-subtracted against reserved quantities (`SUM(quantity_available - quantity_reserved)`), causing negative or zero transfer proposals. Replaced with clean `SUM(quantity_available)`.
   - Re-verified across all facilities: transfer quantity now reliably calculates positive feasible quotas (e.g. 30–35 vials) during stockout triage.

2. **Infeasible Transfer Protection Guard:**
   - Added strict validation guard in `backend/ai_safety.py` and `backend/rebalancer.py`: any proposal where `safe_qty <= 0` is strictly tagged `is_feasible = False`.
   - Frontend `RebalanceAuthModal.jsx` and `RebalanceView.jsx` disable authorization buttons and display clear warning if transfer quantity is zero or infeasible.

3. **BRICS Sovereign Federated Learning Multi-Category Consensus:**
   - Expanded the federated learning coordinator in `backend/brics_federated.py` and `backend/routes/brics.py` to dynamically support all 4 essential healthcare categories:
     - `Antidote` (Polyvalent ASV)
     - `Vaccine` (ARV & Pentavalent)
     - `Antibiotic` (Amoxicillin)
     - `IV Fluid` (Ringer Lactate & Normal Saline)
   - Interactive category switching in `SafetyModal.jsx` triggers dynamic node updates with Laplace Differential Privacy ($\epsilon=0.5, \Delta=0.1$).

4. **Facility Stocks & Triage Filter Polish:**
   - Normalized triage filter logic in `FacilityStocksView.jsx` to accurately match `Critical`, `Warning`, and `Healthy` facilities without key type mismatches.
   - Enhanced Nodal Officer and bed capacity metadata rendering in `FacilitySlideOver.jsx` with flexible word wrapping.

5. **Production Navigation Badges:**
   - Cleaned sidebar navigation labels, replacing developmental sprint badges with production feature indicators (`Live GIS`, `ABDM OCR`).

