# PranaVahini — Security, Cryptography & Safety Posture

PranaVahini is engineered around a zero-trust, safety-critical architecture designed to protect rural healthcare supply chains from inventory pilferage, AI hallucination, concurrency corruption, and communication blackouts.

---

## 1. DSCSA & NHM Cryptographic Audit Trail

All inventory movements (receipts, dispensations, thermal quarantines, inter-facility transfers, and disaster baseline resets) are recorded in an append-only, tamper-evident cryptographic ledger within the `inventory_transactions` table.

### Block Chaining Protocol
Every transaction block $T_n$ is cryptographically bound to its parent $T_{n-1}$:
$$\text{Hash}_n = \text{SHA256}(\text{Hash}_{n-1} \parallel \text{GLN} \parallel \text{GTIN} \parallel \text{BatchNumber} \parallel \text{ExpiryDate} \parallel \text{TxType} \parallel \text{Quantity} \parallel \text{BalanceAfter} \parallel \text{Timestamp}_{\text{UTC}})$$

- **Immutability:** Modifying any historical row corrupts the forward hash chain, triggering instant detection on verification.
- **Verification Endpoint:** The `/api/transfers/ledger/verify` endpoint verifies all blocks deterministically, confirming 100% chain validity before any high-level state transition is finalized.

---

## 2. Deterministic AI Safety Invariant Firewall (`AISafetyGuard`)

Google Gemini operates within a deterministic Python safety envelope that intercepts, distrusts, and validates all proposed rebalancing actions against 6 physical invariants before any recommendation reaches a human doctor:

1. **Non-Cannibalization Invariant:** Donor PHCs must preserve a minimum 14-day safety buffer (21 days during monsoon season). The firewall strips and clamps any request that touches this threshold.
2. **Mass Conservation Invariant:** $\sum \Delta Q = 0$. Medication cannot be minted from nothing or vanish without ledger accounting.
3. **Finite Positive Integer Quantities:** Rejects zero, negative, or fractional delivery amounts.
4. **Valid Topological Nodes:** Rejects transfers involving unverified facilities or unregistered drug SKUs.
5. **Cold-Chain Transport Compatibility:** Blocks transfers of thermolabile medicines (e.g. Anti-Rabies Vaccine, Insulin) if donor or recipient cold-storage is quarantined.
6. **Rural Blackout Demand Floor:** In rural facilities that experience multi-day power and cellular outages, the firewall guarantees a baseline consumption floor, preventing the AI from assuming zero demand.

---

## 3. Monotonic Thread-Safe Circuit Breaker

To guarantee uninterrupted hospital operations during internet outages or cloud latency spikes:
- **Fast Failure Detection:** Tracks consecutive API timeouts or network errors.
- **Microsecond State Transition:** When failures exceed threshold, the breaker flips from `CLOSED` to `OPEN` and delegates decision-making to an offline mathematical linear programming solver in $< 5\text{ ms}$.
- **Hung Worker Watchdog:** Employs monotonic timing (`time.monotonic()`) to prevent clock drift issues and automatically terminates hung background probe threads.

---

## 4. ABDM Sovereign Stack Compliance (M1 – M3)

- **M1 (HFR / HPR Verification):** Validates Health Facility Registry (HFR) and Health Professional Registry (HPR) identifiers against sovereign registry standards.
- **M2 (ABHA Validation):** Performs checksum verification on 14-digit Ayushman Bharat Health Account (ABHA) identifiers.
- **M3 (Consent Sealing):** Cryptographically binds clinical dispensation records to cryptographic consent hashes (`SHA-256(ABHA || ConsentToken || Timestamp)`).

---

## 5. Concurrency & Container Hardening

- **Optimistic Concurrency Control (OCC):** Prevents double-spending of stock batches using `version` check-and-set queries (`WHERE id = ? AND version = ?`), returning `409 Conflict` on race conditions.
- **Non-Root Execution:** The Docker container runs as an unprivileged user (`appuser:appuser`) with zero root privileges.
- **Strict CORS & Input Sanitization:** Rejects SQL injection, prompt injection control characters, and unauthorized origins.
