# PranaVahini (प्राणवाहिनी) — Public Health Logistics Command Center

> **Track 03:** Smart Health & Supply Chain Resilience (Theme: Resilience)  
> **Event:** Build with AI: Code for Communities (Second Edition) — Hack2Skill & Google Cloud  
> **Geographic Focus:** 15 Healthcare Facilities across Pune & Satara Districts, Western Ghats, Maharashtra  
> **Live Cloud Run Deployment:** [https://arogyasetu-615569835878.asia-south2.run.app](https://arogyasetu-615569835878.asia-south2.run.app)  
> **Interactive API Swagger:** [https://arogyasetu-615569835878.asia-south2.run.app/docs](https://arogyasetu-615569835878.asia-south2.run.app/docs)  
> **Executive Report & Dossier:** [https://arogyasetu-615569835878.asia-south2.run.app/report](https://arogyasetu-615569835878.asia-south2.run.app/report)  

---

## 🌟 Executive Overview

**PranaVahini (प्राणवाहिनी)** is an autonomous, federated emergency healthcare logistics and stock rebalancing platform engineered specifically for rural primary health networks in India. 

In remote regions of the Western Ghats (Sahyadri), emergency stockouts of critical life-saving medications—such as **Polyvalent Anti-Snake Venom (ASV)**, **Anti-Rabies Vaccines (ARV)**, and **Human Insulin**—frequently lead to preventable fatalities because central district warehouses take days to dispatch supplies over flooded mountain roads. However, neighboring Primary Health Centres just 15–30 km away often hold surplus supplies that could save a patient's life within hours.

PranaVahini connects these fragmented rural clinics into an intelligent, cooperative mesh that:
1. **Detects Acute Depletions in Real-Time:** Monitors facility burn rates and calculates dynamic Days of Inventory Remaining (DIR).
2. **Orchestrates Peer-to-Peer Rebalancing:** Uses Google Gemini AI and multi-objective optimization to calculate optimal donor clinics within a 50 km radius.
3. **Guarantees Medical & AI Safety:** Enforces a deterministic invariant firewall that physically prevents donor starvation, eliminates phantom inventory, and respects cold-chain and mountain transit physics.
4. **Digitizes Paper Records via Vision AI:** Transcribes handwritten physical stock ledgers and delivery chalans using Gemini 3.6 Flash Vision OCR with RapidFuzz catalog matching.
5. **Maintains Tamper-Evident DSCSA Chains:** Every milligram of medication moved or consumed is recorded into a cryptographically chained SHA-256 audit ledger.

---

## 🏗️ System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                   PranaVahini Enterprise Command Center UI                       │
│         React 19 • Vite • Tailwind CSS • Lucide Icons • Port 5173                │
│                                                                                  │
│  [🗺️ Geospatial Map]  [📦 Facility Stocks]   [🤖 AI Rebalancer] [🚚 Transfers & Ledger] │
│  [📷 Field Portal & OCR] [🛡️ AI Safety Modal] [⚡ Crisis Sim]    [🌓 Dark/Light]       │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │ HTTP REST & SSE EventSource
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                     FastAPI Application Core (Port 8000)                         │
│                                                                                  │
│  ┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────────┐  │
│  │ Real-Time Alert Engine │  │ Burn Rate & Deficits   │  │ Transfer Core      │  │
│  │ Sub-50ms SSE Stream    │  │ DIR, Surge, Monsoon    │  │ ACID State Machine │  │
│  └────────────────────────┘  └────────────────────────┘  └────────────────────┘  │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │                     Google Gemini AI & Safety Core                         │  │
│  │                                                                            │  │
│  │   Gemini 3.6 Flash Rebalancing   ◄──►   Gemini 3.6 Flash Vision OCR        │  │
│  │               │                                      │                     │  │
│  │               ▼                                      ▼                     │  │
│  │   ┌────────────────────────────────────────────────────────────────────┐   │  │
│  │   │        Deterministic AI Safety Guardrail Firewall (AISafetyGuard)  │   │  │
│  │   │   • Zero Donor Starvation (≥14d buffer)  • Cold-Chain Storage Guard│   │  │
│  │   │   • FEFO Expiry Integrity                • Physical Stock Bounding │   │  │
│  │   │   • Rural Blackout Baseline Demand       • Payload Distrust Filter │   │  │
│  │   └──────────────────────────────────┬─────────────────────────────────┘   │  │
│  │                                      │                                     │  │
│  │                                      ▼                                     │  │
│  │               Thread-Safe Circuit Breaker (Half-Open Probe & Watchdog)     │  │
│  │               Instant Fallback to Deterministic Multi-Objective Engine     │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │ SQLite ACID Write Transactions
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                   Persistent Relational Core (healthcare.db)                     │
│                                                                                  │
│   • facilities (15 PHCs)                 • medicines (10 Emergency Formulations) │
│   • stock_batches (180 Batches)          • inventory_transactions (SHA-256)      │
│   • transfers (State Machine Lifecycle)  • alerts (SSE Event Log)                │
│   • ai_safety_violations (Audit Log)     • crisis_snapshots (Durable Recovery)   │
│   • PRAGMA busy_timeout = 30000          • PRAGMA journal_mode = WAL             │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛡️ AI Safety Guardrails & The 6 Core Physical Invariants

PranaVahini enforces a strict **Zero-Hallucination, Zero-Harm** policy. All recommendations produced by Google Gemini models must pass through the deterministic `AISafetyGuard` firewall:

| # | Physical Invariant | Formulation / Guard Condition | Safety Failure Mitigated |
| :- | :--- | :--- | :--- |
| **1** | **Non-Cannibalization / Zero Starvation** | $\text{Retained} \ge \max(\text{min\_stock}, \lceil 14 \times \text{DAC}\rceil)$ ($21\text{d}$ in Monsoon) | Secondary stockout at donor facility |
| **2** | **Physical Bounding & Non-Negative Stock** | $\text{Allocated} \le \text{Actual Surplus}$ (Clamped to $[0, \text{Surplus}]$) | Over-allocation / phantom stock |
| **3** | **Cold-Chain Equipment Compatibility** | $\text{Requires ILR} \implies \text{Donor Cold-Chain Status} = \text{VERIFIED}$ | Spoiled biologics / vaccines |
| **4** | **Transit Feasibility & FEFO Buffer** | $\text{Batch Expiry} \ge \text{Today} + \lceil\text{Transit}/24\rceil + 7\text{ days}$ | In-transit medicine expiration |
| **5** | **Rural Blackout Demand Floor** | $\text{Historical DAC} = 0 \implies \text{Default DAC} = 1.0\text{ unit/day}$ | Buffer collapse during power cuts |
| **6** | **Payload Distrust & Input Sanitization** | Regex prompt injection stripping & parameter override immunity | Adversarial manipulation of transfer quotas |

---

## ⚡ Thread-Safe Circuit Breakers & Offline Fallbacks

When rural connectivity fails or cloud endpoints experience high latency:
- The **`CircuitBreaker`** trips after 3 consecutive failures.
- Switches seamlessly to a local **Deterministic Multi-Objective Optimization Engine** in **$< 5\text{ ms}$**.
- Healthcare workers and doctors continue rebalancing operations without downtime.
- Includes monotonic timeout tracking, hung-worker watchdog probes, and an interactive **`Reset Circuit`** mechanism.

---

## ⚙️ Core System Capabilities & Production Modules

PranaVahini is engineered as a full-stack, closed-loop public health logistics platform providing role-tailored capabilities across the primary health network:

| Module / Capability | Primary Stakeholder | Operational Reality & Features |
| :--- | :--- | :--- |
| **Geospatial Command Map** | Emergency Logistics Officer | Canvas-accelerated Leaflet GIS tracking 15 PHCs, Western Ghats mountain transit corridors, live buffer days, and cold-chain status. |
| **Autonomous AI Rebalancer** | Civil Surgeon / DMO | Multi-facility inventory redistribution powered by Google Gemini 3.6 Flash, calculating ghat pass transit hours and generating medical SOAP reasoning notes. |
| **Deterministic Safety Firewall** | Clinical Governance Board | Hardcoded `AISafetyGuard` enforcing 6 physical invariants: zero donor starvation ($\ge 14\text{d}$ buffer, $\ge 21\text{d}$ in monsoon), mass conservation, and cold-chain validation. |
| **Multimodal Vision OCR** | Rural PHC Pharmacist | Camera intake transcribing handwritten paper stock registers (*दैनिक औषध नोंदवही*) and state DHS delivery challans via Gemini 3.6 Flash Vision with RapidFuzz catalog matching. |
| **Inter-PHC Transfers & DSCSA Ledger** | Drug Inspector / Auditor | End-to-end 5-stage state machine tracking transfers with an immutable 180-block SHA-256 Merkle audit trail and 1-click ledger integrity verification. |
| **Frontline Dispensing Portal** | Rural Staff Nurse / ANM | High-contrast touch interface with $48\times 48\text{px}$ PPE glove steppers, multilingual voice dictation (मराठी, हिन्दी, English), and 2G/3G offline queueing. |
| **Epidemiological Crisis Simulator** | Disaster Preparedness Team | Emergency shock injection engine (Monsoon flooding, 400% snakebite clusters) with automated multi-facility swarm dispatch and baseline state recovery. |

> For the historical development roadmap and daily microtask logs, refer to [`roadmap.md`](roadmap.md).

---

## 🚀 Quickstart Guide

### Prerequisites
- **Python:** 3.11+ (tested on Python 3.13)
- **Node.js:** v18+ (npm v9+)
- **OS:** Windows / Linux / macOS

### 1. Environment Setup

```bash
# Clone the repository
git clone https://github.com/GitPhantom700/arogyasetu.git
cd arogyasetu

# Setup Python Virtual Environment
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate # Linux/macOS

# Install Python Dependencies
pip install -r requirements.txt

# Install Frontend Dependencies
npm --prefix frontend install
```

### 2. Configure API Keys (Optional for Cloud AI)
Create a `.env` file in the project root:
```env
GEMINI_API_KEY=your_google_ai_studio_api_key_here
```
*(Note: If no API key is provided, PranaVahini seamlessly operates in offline mode using the deterministic rule engine and clinical OCR emulator).*

### 3. Launching the Services

**Terminal 1: FastAPI Backend (Port 8000)**
```bash
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```
- Interactive Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- Fallback Web UI: [http://localhost:8000/](http://localhost:8000/)

**Terminal 2: React 19 Frontend (Port 5173)**
```bash
npm --prefix frontend run dev
```
- Modern Command Center: [http://localhost:5173/](http://localhost:5173/)

---

## 🧪 Test Verification & Quality Gates

PranaVahini is validated against 107 automated backend regression tests across 16 test modules and strict frontend build checks:

```bash
# Run full backend test suite (107 tests across 16 modules)
.venv\Scripts\pytest backend/ -v

# Run frontend production build verification
npm --prefix frontend run build
```

**Results:**
- **Backend Tests:** `107 passed in 79.31s (100% Green)`
- **Frontend Build:** `vite build completed in 2.94s with 0 errors`
- **DSCSA Cryptographic Audit Ledger:** `180 verified blocks, unbroken SHA-256 chain`

---

## 📂 Repository Layout

```
arogyasetu/
├── backend/
│   ├── ai_safety.py           # AISafetyGuard firewall & thread-safe CircuitBreaker
│   ├── alerts.py              # Server-Sent Events (SSE) Broadcaster & pub/sub
│   ├── burn_rate.py           # Consumption calculations, DIR, and surge detection
│   ├── crisis_simulator.py    # Crisis simulation engine, shock presets & snapshots
│   ├── database.py            # SQLite async transactions & connection pool
│   ├── ledger_vision.py       # Gemini 3.6 Flash Vision OCR & RapidFuzz matcher
│   ├── main.py                # FastAPI entry point & CORS configuration
│   ├── models.py              # Pydantic data transfer schemas
│   ├── rebalancer.py          # Gemini AI Rebalancer & multi-objective engine
│   ├── schema.sql             # Relational DDL with CHECK constraints & indexes
│   ├── schemas.py             # Domain models & validation schemas
│   ├── seed_data.py           # 15 Pune/Satara PHCs, 180 realistic medicine batches & 6 lifecycle transfers
│   ├── transfers_core.py      # Transfer state machine & DSCSA SHA-256 ledger
│   ├── routes/                # Modular FastAPI router endpoints
│   ├── static/                # Fallback vanilla web dashboard
│   └── test_*.py              # 16 comprehensive test suites (107/107 tests passing)
│
├── frontend/                  # Modern React 19 + Vite + Tailwind CSS Application
│   ├── src/
│   │   ├── components/        # Header, Sidebar, StatusBadge, SafetyModal, Toasts, FacilitySlideOver
│   │   ├── context/           # AppContext, translations.js (मराठी, हिन्दी, English)
│   │   ├── hooks/             # useAlertsStream (resilient SSE hook)
│   │   ├── services/          # api.js (unified backend fetch client)
│   │   ├── views/             # Overview, Map, Stocks, Rebalance, Transfers & Ledger, FieldPortal, Crisis
│   │   ├── App.jsx            # Application shell
│   │   └── main.jsx           # React DOM root
│   ├── tailwind.config.js     # Custom clinical color tokens & dark mode
│   └── vite.config.js         # Port 5173 & API reverse proxy configuration
│
├── arogyasetu_ui_design_audit.pdf  # Comprehensive 23-Screen UI/UX Design Audit Vector PDF Dossier (8.30 MB)
├── arogyasetu_ui_design_audit.html # Interactive Multi-View Audit Dossier & Adversarial AI Evaluation
├── walkthrough.md             # UI Design Audit walkthrough & Gemini evaluation response scorecard
├── executive_report.html      # Executive whitepaper, multi-model benchmark report & DSCSA ledger logs
├── explain_project.md         # Intuitive 10th-grade educational guide to PranaVahini
├── implementation.md          # Locked 20-day master microtask roadmap
├── progress.md                # Daily progress log & 4-stage gate approval history
├── roadmap.md                 # Master phase roadmap & milestone tracker
└── requirements.txt           # Python dependencies
```

---

## 👥 Contributors & Acknowledgements

Developed for **Build with AI: Code for Communities (Second Edition)** organized by **Hack2Skill** in partnership with **Google**.
