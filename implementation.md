# Track 01: Healthcare Supply Chain & Emergency Logistics
## 20-Day Anti-Hallucination Implementation Plan
**Timeline:** September 5, 2026 – September 25, 2026  
**Event:** Build with AI: Code for Communities (Second Edition) — Hack2Skill & Google  
**Core Mandate:** A dynamic, stateful, end-to-end healthcare logistics platform with verified Google AI integration.

---

## 1. Governance & Anti-Hallucination Framework

To ensure 100% reliability and eliminate hallucinations, **every single microtask** must pass through a strict **4-Stage Review Gate** and an **Anti-Hallucination Checklist** before being marked complete.

### The 4-Stage Review Gate

```
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 1: Deterministic Grounding (Terminal & Code Proof)               │
│ • Code must physically run with real commands in the environment.      │
│ • Real output is captured directly from the terminal (never assumed).  │
│ • SQLite tables and API responses are inspected directly.              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 2: Primary Google Ecosystem Review (Gemini Pro Latest)           │
│ • Code diff + prompt provided to paste into Gemini Pro Latest (via     │
│   Google AI Studio or Gemini Advanced).                                │
│ • Focus: Spot architectural flaws, domain issues, and concurrency gaps.│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 3: Secondary Google Ecosystem Double-Audit (Different Gemini)    │
│ • Second verification prompt pasted into an independent model (e.g.    │
│   Gemini 3.6 Flash / Gemini 3.5 Flash in Google AI Studio).            │
│ • Focus: Verify fixes, check runtime edge cases and trigger safety.    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 4: Human & Interactive Final Approval (User Sign-Off)            │
│ • You visually inspect the feature in your browser (via the FastAPI    │
│   `/docs` dashboard or live web UI).                                   │
│ • Explicit user sign-off required before advancing to the next task.   │
└────────────────────────────────────────────────────────────────────────┘
```

### Mandatory Anti-Hallucination Checklist (Executed Before Task Completion)
- [ ] **No phantom imports:** All Python packages and npm libraries exist on PyPI/npm and run in your local environment.
- [ ] **No deprecated SDK patterns:** Only the official, current Google SDK (`google-genai`) is used.
- [ ] **Deterministic data proof:** Database state and API outputs are verified with real queries—never assumed.
- [ ] **No placeholder shortcuts:** No `TODO: implement later` or dummy returns in critical business paths.
- [ ] **Zero unapproved actions:** No files or commands outside the agreed scope are executed.

---

## 2. Technical Architecture & Decisions

| Layer | Selected Technology | Rationale |
| :--- | :--- | :--- |
| **Backend Framework** | **Python FastAPI** | Asynchronous, high-performance, automatic interactive Swagger UI (`/docs`), native integration with Google AI. |
| **Database** | **SQLite (`healthcare.db`)** | Zero installation or configuration required; runs out of a single file; supports full ACID transactions and relational schemas. |
| **AI Integration** | **Google Gemini 1.5 Flash (`google-genai`)** | Fast, multimodal (reads handwritten/printed physical ledgers), supports structured JSON outputs and function calling. |
| **Real-time Sync** | **Server-Sent Events (SSE)** | Lightweight, reliable push notifications to the Command Center map without requiring page refreshes. |
| **Frontend UI** | **React + Vite + Tailwind CSS + Leaflet** | Responsive, modern dashboard with dark/light themes and geospatial mapping for PHCs and delivery routes. |

---

## 3. The 20-Day Microtask Breakdown

```
Days 01 - 03 : Phase 1 — Foundations, Database Schemas & API Skeleton
Days 04 - 07 : Phase 2 — Transactional Core & Transfer State Machine
Days 08 - 11 : Phase 3 — Real-Time Alert Engine & Google Gemini AI Integration
Days 12 - 15 : Phase 4 — Geospatial Command Center & Field Staff UI
Days 16 - 18 : Phase 5 — Emergency Surge Simulation & End-to-End Hardening
Days 19 - 20 : Phase 6 — Deployment, Demo Video & Hack2Skill Submission
```

---

### Phase 1: Foundations, Database Schemas & API Skeleton (Days 1 – 3)

#### **Day 1: Microtask 1.1 — Relational Database Schema & Data Models**
* **Objective:** Define strict relational tables in SQLite for:
  * `facilities`: PHCs, Community Health Centres, District Hospitals (ID, name, district, lat/long, contact, tier).
  * `medicines`: Essential drug catalog (SKU, name, category, unit, min_safety_stock, is_emergency).
  * `stock_batches`: Batch-level inventory (batch_num, expiry_date, quantity_available, facility_id, medicine_id).
  * `inventory_transactions`: Immutable ledger of stock movements (type: CONSUMED, RECEIVED, TRANSFERRED, EXPIRED).
  * `transfers`: Inter-facility redistribution orders and state tracking.
* **Stage 1 Verification:** Execute a Python script that creates `healthcare.db`, inserts sample records, and executes relational JOIN queries.
* **Stage 2 Review Package:** Export schema DDL + Pydantic models for external AI audit.
* **Stage 3 Sign-Off:** You review the schema structure.

#### **Day 2: Microtask 1.2 — Realistic Seed Data Generator**
* **Objective:** Generate consistent, realistic mock data for 15 PHCs across 2 real districts (e.g., Pune & Satara in Maharashtra) with authentic geographic coordinates, essential medicines (Anti-Venom, Rabies Vaccine, Insulin, ORS, IV Fluids), and randomized stock levels.
* **Stage 1 Verification:** Run SQL count and bounds queries to confirm 15 facilities, realistic stock counts, and valid coordinates.
* **Stage 2 Review Package:** Export coordinate ranges and sample data distribution for external AI audit.
* **Stage 3 Sign-Off:** You verify the sample data list.

#### **Day 3: Microtask 1.3 — FastAPI Backend Skeleton & Swagger UI**
* **Objective:** Scaffold the FastAPI application with clean modular routes (`/facilities`, `/inventory`, `/health`).
* **Stage 1 Verification:** Launch the server; run automated curl tests against all endpoints; verify HTTP 200 responses.
* **Stage 2 Review Package:** Export route definitions and middleware configuration for external AI audit.
* **Stage 3 Sign-Off:** You open `http://localhost:8000/docs` in your browser and click "Execute" on the live endpoints.

---

### Phase 2: Transactional Core & Transfer State Machine (Days 4 – 7)

#### **Day 4: Microtask 2.1 — Transactional Stock Operations (Consume & Receive)**
* **Objective:** Implement ACID-compliant endpoints to log daily stock consumption, receipt of new supply batches, and damage write-offs with automatic inventory balance validation.
* **Stage 1 Verification:** Run a test transaction; verify database state changes; verify that negative stock throws an explicit HTTP 400 error.
* **Stage 2 Review Package:** Export transaction logic and race-condition handling for external AI audit.
* **Stage 3 Sign-Off:** You test consumption and receipt actions via Swagger UI.

#### **Day 5: Microtask 2.2 — Dynamic Burn Rate & Depletion Forecaster**
* **Objective:** Implement the computational engine that calculates:
  * Daily Average Consumption (DAC) based on trailing 7-day rolling window.
  * Days of Inventory Remaining (DIR): $\text{DIR} = \frac{\text{Current Stock}}{\text{DAC}}$.
  * Threshold status: `HEALTHY` ($\text{DIR} > 7$), `WARNING` ($2 \le \text{DIR} \le 7$), `CRITICAL` ($\text{DIR} < 2$).
* **Stage 1 Verification:** Feed synthetic consumption patterns; mathematically verify calculated DIR values and status tags.
* **Stage 2 Review Package:** Export mathematical formulas and edge-case handling (zero consumption, spikes) for external AI audit.
* **Stage 3 Sign-Off:** You inspect the calculated depletion metrics for each facility.

#### **Day 6: Microtask 2.3 — Inter-PHC Transfer State Machine**
* **Objective:** Implement the multi-step redistribution lifecycle:
  $$\text{DRAFT} \longrightarrow \text{APPROVED} \longrightarrow \text{DISPATCHED} \longrightarrow \text{IN\_TRANSIT} \longrightarrow \text{RECEIVED}$$
  * Stock locking at donor facility on dispatch.
  * Stock receipt and batch addition at recipient facility on delivery.
* **Stage 1 Verification:** Execute a full end-to-end transfer via API; verify donor stock decreases and recipient stock increases with zero inventory leakage.
* **Stage 2 Review Package:** Export state machine transitions and rollback mechanisms for external AI audit.
* **Stage 3 Sign-Off:** You approve a test transfer and observe the stock migration in SQLite.

#### **Day 7: Microtask 2.4 — Phase 1 & 2 Automated Test Suite & Audit**
* **Objective:** Finalize all official Hack2Skill submission deliverables:
  * Export HD demo video showing multi-platform sync (Web CC + Mobile PWA).
  * Compile executive summary of the system’s impact for public health logistics in India.
* **Stage 1 Verification:** Ensure the pitch deck flows with the live demo timings.
* **Stage 2 Review Package:** Export slide content for external AI audit.
* **Stage 3 Sign-Off:** You approve the final submission bundle.

---

### Phase 7: Hackathon Mandate Compliance & Gap Remediation (Days 22 – 25)

#### **Day 22: Microtask 7.1 — ABDM Sovereign Stack Integration** `[100% COMPLETE]`
* **Objective:** Implement mock HFR/HPR verification and ABHA cryptographic consent sealing.
* **Verification:** Cryptographic hash integrity checks and schema verification. (PASSED - 90/90 tests)
* **Stage 4 Sign-Off:** Completed.

#### **Day 23: Microtask 7.2 — BRICS+ Federated Learning Endpoints**
* **Objective:** Expose global M4 federated weight synchronization endpoints with noise addition.
* **Verification:** Math deterministic validation for gradients. (PASSED - 2/2 tests)
* **Stage 4 Sign-Off:** Completed.

#### **Day 24: Microtask 7.3 — IoT Thermal Compromise & Concurrency**
* **Objective:** Implement cold chain quarantine endpoint and stress-test batch state machine.
* **Verification:** Integrity constraints correctly capture `QUARANTINED` status and full batch balance.
* **Stage 4 Sign-Off:** Completed.

#### **Day 25: Microtask 7.4 — Frontend UI/UX Accessibility & Executive Reporting**
* **Objective:** Update Voice-to-Text dictation inputs, high-contrast accessibility icons, and "Network Sync" visual toggles. Finalize Section 10 of the executive report.
* **Verification:** Linting, visual check via browser subagent.
* **Stage 4 Sign-Off:** Active.

---

### Phase 3: Real-Time Alerts & Google Gemini AI Integration (Days 8 – 11)

#### **Day 8: Microtask 3.1 — Real-Time Alert Engine (Server-Sent Events / SSE)**
* **Objective:** Implement an SSE stream (`/api/alerts/stream`) that broadcasts instant alerts to connected clients when any medicine at any facility drops below the critical threshold.
* **Stage 1 Verification:** Connect a test listener client; trigger an emergency stock reduction; verify the JSON event is delivered within 100ms.
* **Stage 2 Review Package:** Export SSE connection lifecycle and reconnection handling for external AI audit.
* **Stage 3 Sign-Off:** You view the live alert feed receiving an event in real time.

#### **Day 9: Microtask 3.2 — Multimodal Register Ingestion (Gemini 1.5 Flash Vision)**
* **Objective:** Create an image upload endpoint (`/api/inventory/scan-register`) where field staff upload photos of handwritten/printed paper ledgers or bills. Gemini Vision parses and returns structured JSON:
  `[{"medicine_name": "Anti-Venom", "batch_number": "AV-2026", "quantity": 40, "expiry_date": "2027-06-30"}]`
* **Stage 1 Verification:** Test with sample ledger images; verify Gemini outputs strictly validated Pydantic models.
* **Stage 2 Review Package:** Export Gemini system prompt, Pydantic response schema, and fallback logic for external AI audit.
* **Stage 3 Sign-Off:** You upload a test ledger image and view the structured data extracted.

#### **Day 10: Microtask 3.3 — Gemini Autonomous Rebalancing Agent**
* **Objective:** When a stockout alert fires, an intelligent logistics agent evaluates neighboring facilities within a 50 km radius, filters facilities with surplus stock (ensuring the donor retains $> 14$ days of buffer), and generates an optimal transfer recommendation with explainable reasoning.
* **Stage 1 Verification:** Run rebalancer on a critical stockout scenario; verify the returned route respects donor safety stock constraints.
* **Stage 2 Review Package:** Export logistics agent prompt, tool schema, and constraint algorithms for external AI audit.
* **Stage 3 Sign-Off:** You inspect the generated rebalancing proposal and explanation text.

#### **Day 11: Microtask 3.4 — AI Safety, Guardrails & Fallbacks Audit**
* **Objective:** Implement guardrails ensuring that AI-suggested quantities never exceed donor surplus or recipient deficits, and that non-existent drugs or malformed outputs are gracefully caught.
* **Stage 1 Verification:** Run adversarial test inputs (corrupted images, extreme quantities); confirm server returns clean validation errors rather than crashing.
* **Stage 2 Review Package:** Export validation guardrails for external AI review.
* **Stage 3 Sign-Off:** You review the safety audit summary.

---

### Phase 4: Geospatial Command Center & Field Staff UI (Days 12 – 15)

#### **Day 12: Microtask 4.1 — Frontend Scaffolding & Design System**
* **Objective:** Set up the React + Vite frontend with Tailwind CSS, emergency status badges, collapsible sidebars, and dark/light modes.
* **Stage 1 Verification:** Build and run the frontend; verify zero console errors; verify clean API communication with FastAPI.
* **Stage 2 Review Package:** Export component tree and state management architecture for external AI audit.
* **Stage 3 Sign-Off:** You open `http://localhost:5173` and inspect the layout.

#### **Day 13: Microtask 4.2 — Interactive Geospatial Command Map**
* **Objective:** Integrate Leaflet to display all 15 facilities on an interactive map, color-coded by real-time status:
  * 🟢 Green: Adequate inventory
  * 🟡 Yellow: Low stock warning
  * 🔴 Red: Emergency stockout risk
  * Clicking a facility opens a slide-over panel showing its live inventory table.
* **Stage 1 Verification:** Change stock in SQLite; verify map pin changes color dynamically via SSE without page reload.
* **Stage 2 Review Package:** Export map rendering and event-listener code for external AI audit.
* **Stage 3 Sign-Off:** You navigate and interact with the live map in your browser.

#### **Day 14: Microtask 4.3 — Field Staff Portal (Quick Stock Logger & Camera OCR)**
* **Objective:** Build a clean, mobile-responsive view for rural clinic workers:
  * Quick buttons to log daily consumption (e.g., `-1 vial`, `-5 strips`).
  * Drag-and-drop / camera photo upload for physical paper registers.
  * Preview table allowing staff to verify and edit OCR-extracted items before committing them to the database.
* **Stage 1 Verification:** Upload a file through the UI; verify the OCR preview table populates and commits cleanly.
* **Stage 2 Review Package:** Export field staff UI workflow for external AI review.
* **Stage 3 Sign-Off:** You test logging a consumption event and uploading a sample image via the UI.

#### **Day 15: Microtask 4.4 — Rebalancing Authorization Modal & Dispatch Visualizer [COMPLETED]**
* **Objective:** In the Command Center, when an alert is selected, display the Gemini recommendation card with an **"Approve Transfer"** button. Upon approval:
  * Draw the animated transfer route between donor and recipient facilities on the map.
  * Update the transfer state in the database.
* **Stage 1 Verification:** Click "Approve Transfer"; verify the route line is drawn and both facilities update their stock indicators. (PASSED - 77/77 tests green, production build verified, browser subagent captured 3 visual proofs)
* **Stage 2 Review Package:** Export transfer approval modal and map route rendering for external AI audit. (PASSED - 94/100 Approved with Conditions, all remediations applied)
* **Stage 3 Double-Audit:** Independent Gemini Flash double-audit verified all remediations. (PASSED - 99/100 Approved)
* **Stage 4 Sign-Off:** Interactive browser sign-off on live frontend.

---

### Phase 5: Crisis Simulation & Rigorous Testing (Days 16 – 18)

#### **Day 16: Microtask 5.1 — Crisis & Outbreak Simulation Engine**
* **Objective:** Add an interactive "Crisis Simulator" control panel (e.g., *Simulate Monsoon Flooding in District South $\rightarrow$ 400% spike in snakebite & water-borne illness cases*).
* **Stage 1 Verification:** Trigger the simulation; observe multiple facilities turning red, emergency SSE alerts firing, and the AI agent auto-generating multi-facility rebalancing plans.
* **Stage 2 Review Package:** Export crisis simulation parameters and stress logic for external AI audit.
* **Stage 3 Sign-Off:** You trigger a simulated crisis from the dashboard and watch the system respond.

#### **Day 17: Microtask 5.2 — System Hardening & Edge-Case Audit**
* **Objective:** Resolve any UI layout issues, optimize bundle size, handle offline states, and test browser compatibility.
* **Stage 1 Verification:** Run frontend linting, TypeScript/build check, and backend regression test suite; achieve zero errors.
* **Stage 2 Review Package:** Export full codebase audit report for external AI review.
* **Stage 3 Sign-Off:** You verify clean console and smooth operation across all screens.

#### **Day 18: Microtask 5.3 — End-to-End Rehearsal & Verification**
* **Objective:** Perform a complete, seamless dry-run of the demo story from a fresh database start:
  1. Overview of the 15 PHCs across the district.
  2. Field nurse uploads paper ledger photo $\rightarrow$ inventory updates automatically.
  3. Monsoon crisis triggered $\rightarrow$ critical anti-venom stockout detected.
  4. Real-time alert broadcasts to the Command Center map.
  5. Gemini AI recommends optimal cross-district redistribution from a surplus facility.
  6. District Officer clicks "Approve" $\rightarrow$ route visually rendered $\rightarrow$ stock balances updated.
* **Stage 1 Verification:** Verify the entire story runs without hiccups or manual database intervention.
* **Stage 2 Review Package:** Export rehearsal log for external AI review.
* **Stage 3 Sign-Off:** You watch or perform the dry run.

---

### Phase 6: Deployment, Demo Video & Submission Package (Days 19 – 20)

#### **Day 19: Microtask 6.1 — Deployment & Clean Documentation**
* **Objective:** 
  * Provide a one-click local runner script (`start.bat`) for Windows.
  * Prepare deployment configuration (e.g., Dockerfile / Cloud Run / Render).
  * Write a comprehensive `README.md` with system architecture diagrams, API documentation, and Google AI integration details.
* **Stage 1 Verification:** Run `start.bat` on a clean terminal; confirm both backend and frontend launch seamlessly.
* **Stage 2 Review Package:** Export documentation and deployment configs for external AI audit.
* **Stage 3 Sign-Off:** You test starting the application with a single click.

#### **Day 20: Microtask 6.2 — Pitch Deck, Demo Video & Hack2Skill Submission**
* **Objective:** Finalize all official Hack2Skill submission deliverables:
  1. **GitHub Repository:** Clean code, descriptive commit history, and comprehensive README.
  2. **Pitch Deck (10–12 Slides):** Problem statement, ground reality in rural PHCs, solution architecture, Google AI utilization, and national scalability.
  3. **Demo Video (3–5 Minutes):** Crisp voiceover walkthrough showing the working prototype solving a live crisis.
  4. **Official Portal Submission:** Complete and submit the Hack2Skill form before the deadline.
* **Stage 1 Verification:** Verify all public links (GitHub, unlisted YouTube demo video, deployed app/deck) are accessible without login barriers.
* **Stage 2 Review Package:** Export pitch deck outline and video script for external AI review.
* **Stage 3 Sign-Off:** **Final approval and submission to Hack2Skill!**

---

### Phase 7: Hackathon Mandate Compliance & Gap Remediation (Days 22 – 25)

#### **Day 22: Microtask 7.1 — ABDM Sovereign Stack Integration**
* **Objective:** Implement mock HFR/HPR verification and ABHA cryptographic consent sealing.
* **Verification:** Cryptographic hash integrity checks and schema verification. (PASSED - 90/90 tests)
* **Stage 4 Sign-Off:** Completed.

#### **Day 23: Microtask 7.2 — BRICS+ Federated Learning Endpoints**
* **Objective:** Expose global M4 federated weight synchronization endpoints with noise addition.
* **Verification:** Math deterministic validation for gradients. (PASSED - 2/2 tests)
* **Stage 4 Sign-Off:** Completed.

#### **Day 24: Microtask 7.3 — IoT Thermal Compromise & Concurrency**
* **Objective:** Implement cold chain quarantine endpoint and stress-test batch state machine.
* **Verification:** Integrity constraints correctly capture `QUARANTINED` status and full batch balance.
* **Stage 4 Sign-Off:** Completed.

#### **Day 25: Microtask 7.4 — Frontend UI/UX Accessibility & Executive Reporting**
* **Objective:** Update Voice-to-Text dictation inputs, high-contrast accessibility icons, and "Network Sync" visual toggles. Finalize Section 10 of the executive report.
* **Verification:** Linting, visual check via browser subagent.
* **Stage 4 Sign-Off:** Active.
