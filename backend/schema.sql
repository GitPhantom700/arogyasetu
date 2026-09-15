-- =====================================================================
-- Healthcare Supply Chain & Emergency Logistics Platform
-- Production Hardened SQLite DDL Schema (Double Gemini Reviewed)
-- Strict Auditability, Concurrency, Cold-Chain & Terrain Logistics
-- =====================================================================

PRAGMA foreign_keys = ON;

-- 1. Healthcare Facilities (Sub-Centers, PHCs, CHCs, SDHs, District Hospitals)
CREATE TABLE IF NOT EXISTS facilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    facility_code TEXT UNIQUE NOT NULL,
    facility_gln TEXT NOT NULL DEFAULT '8901234567890', -- GS1 13-digit Global Location Number
    hfr_id TEXT UNIQUE DEFAULT NULL,                   -- ABDM Health Facility Registry ID (M2)
    name TEXT NOT NULL,
    tier TEXT CHECK(tier IN ('SC', 'PHC', 'CHC', 'SDH', 'DH')) NOT NULL,
    district TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'Maharashtra',
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    terrain_type TEXT CHECK(terrain_type IN ('HIGHWAY_CORRIDOR', 'PLAINS', 'GHAT_MOUNTAIN')) DEFAULT 'PLAINS',
    contact_phone TEXT,
    contact_person TEXT,
    total_beds INTEGER NOT NULL DEFAULT 10,
    icu_beds INTEGER NOT NULL DEFAULT 0,
    oxygen_beds INTEGER NOT NULL DEFAULT 2,
    has_cold_chain INTEGER CHECK(has_cold_chain IN (0, 1)) NOT NULL DEFAULT 1,
    power_backup_hours INTEGER NOT NULL DEFAULT 12,
    has_dedicated_vehicle INTEGER CHECK(has_dedicated_vehicle IN (0, 1)) NOT NULL DEFAULT 1,
    is_active INTEGER CHECK(is_active IN (0, 1)) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (icu_beds + oxygen_beds <= total_beds)
);

CREATE INDEX IF NOT EXISTS idx_facilities_district ON facilities(district);
CREATE INDEX IF NOT EXISTS idx_facilities_coords ON facilities(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_facilities_active ON facilities(is_active);
CREATE INDEX IF NOT EXISTS idx_facilities_terrain ON facilities(terrain_type);
CREATE INDEX IF NOT EXISTS idx_facilities_hfr_id ON facilities(hfr_id);

-- 2. Essential Medicines Catalog
CREATE TABLE IF NOT EXISTS medicines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE NOT NULL,
    gtin TEXT NOT NULL DEFAULT '08901234567890', -- GS1 14-digit Global Trade Item Number
    name TEXT NOT NULL,
    category TEXT CHECK(category IN ('Antidote', 'Vaccine', 'Analgesic', 'Antibiotic', 'IV Fluid', 'Emergency', 'Chronic')) NOT NULL,
    unit TEXT NOT NULL,
    min_safety_stock INTEGER NOT NULL DEFAULT 20,
    is_emergency INTEGER CHECK(is_emergency IN (0, 1)) NOT NULL DEFAULT 0,
    requires_cold_chain INTEGER CHECK(requires_cold_chain IN (0, 1)) NOT NULL DEFAULT 0,
    storage_temp_c TEXT DEFAULT 'Ambient',
    seasonal_risk_months TEXT DEFAULT 'ALL', -- e.g. 'MONSOON_JUN_SEP' for ASV/ORS, 'HARVEST_OCT_DEC'
    description TEXT,
    is_active INTEGER CHECK(is_active IN (0, 1)) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_medicines_sku ON medicines(sku);
CREATE INDEX IF NOT EXISTS idx_medicines_category ON medicines(category);
CREATE INDEX IF NOT EXISTS idx_medicines_cold_chain ON medicines(requires_cold_chain);

-- 3. Batch-level Inventory per Facility
CREATE TABLE IF NOT EXISTS stock_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    facility_id INTEGER NOT NULL REFERENCES facilities(id) ON DELETE RESTRICT,
    medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
    gtin TEXT NOT NULL DEFAULT '08901234567890',
    batch_number TEXT NOT NULL,
    serial_number TEXT,
    expiry_date DATE NOT NULL,
    quantity_available INTEGER NOT NULL CHECK(quantity_available >= 0),
    quantity_reserved INTEGER NOT NULL DEFAULT 0 CHECK(quantity_reserved >= 0),
    status TEXT CHECK(status IN ('ACTIVE', 'QUARANTINED', 'RECALLED', 'EXPIRED')) NOT NULL DEFAULT 'ACTIVE',
    temperature_celsius REAL DEFAULT 4.2,              -- Continuous IoT sensor reading (°C)
    thermal_status TEXT CHECK(thermal_status IN ('OPTIMAL', 'EXCURSION_RISK', 'COMPROMISED')) DEFAULT 'OPTIMAL',
    last_temp_breach_at TIMESTAMP DEFAULT NULL,
    version INTEGER NOT NULL DEFAULT 1, -- Optimistic Concurrency Control (OCC)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(facility_id, medicine_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_stock_batches_facility_med ON stock_batches(facility_id, medicine_id);
CREATE INDEX IF NOT EXISTS idx_stock_batches_fefo ON stock_batches(medicine_id, status, expiry_date);
CREATE INDEX IF NOT EXISTS idx_stock_batches_status_expiry ON stock_batches(status, expiry_date);
CREATE INDEX IF NOT EXISTS idx_stock_covering ON stock_batches(status, expiry_date, facility_id, medicine_id, quantity_available);

-- 4. Inter-Facility Transfer Orders & State Machine
CREATE TABLE IF NOT EXISTS transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transfer_code TEXT UNIQUE NOT NULL,
    source_facility_id INTEGER NOT NULL REFERENCES facilities(id) ON DELETE RESTRICT,
    destination_facility_id INTEGER NOT NULL REFERENCES facilities(id) ON DELETE RESTRICT,
    medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    status TEXT CHECK(status IN ('DRAFT', 'APPROVED', 'DISPATCHED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED', 'PARTIALLY_RECEIVED', 'RETURN_IN_PROGRESS', 'RETURNED')) NOT NULL DEFAULT 'DRAFT',
    urgency TEXT CHECK(urgency IN ('ROUTINE', 'URGENT', 'CRITICAL_EMERGENCY')) DEFAULT 'ROUTINE',
    distance_km REAL,
    estimated_transit_hours REAL,
    reason TEXT,
    ai_recommended INTEGER CHECK(ai_recommended IN (0, 1)) DEFAULT 0,
    ai_rationale TEXT,
    authorizer_hpr_id TEXT DEFAULT NULL,               -- ABDM Healthcare Professionals Registry ID (M1)
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP,
    dispatched_at TIMESTAMP,
    received_at TIMESTAMP,
    returned_at TIMESTAMP,
    CHECK (source_facility_id != destination_facility_id),
    CHECK (approved_at IS NULL OR approved_at >= requested_at),
    CHECK (dispatched_at IS NULL OR approved_at IS NULL OR dispatched_at >= approved_at),
    CHECK (received_at IS NULL OR dispatched_at IS NULL OR received_at >= dispatched_at),
    CHECK (returned_at IS NULL OR dispatched_at IS NULL OR returned_at >= dispatched_at)
);

CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers(status);
CREATE INDEX IF NOT EXISTS idx_transfers_facilities ON transfers(source_facility_id, destination_facility_id);

-- 4b. Soft Reservation Batch Allocations (Pre-dispatch stock locking)
CREATE TABLE IF NOT EXISTS transfer_batch_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transfer_id INTEGER NOT NULL REFERENCES transfers(id) ON DELETE RESTRICT,
    batch_id INTEGER NOT NULL REFERENCES stock_batches(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    allocated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transfer_alloc_transfer ON transfer_batch_allocations(transfer_id);

-- 5. Immutable Inventory Transaction Ledger (DSCSA & NHM Compliant Cryptographic Ledger)
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    facility_id INTEGER NOT NULL REFERENCES facilities(id) ON DELETE RESTRICT,
    facility_gln TEXT NOT NULL DEFAULT '8901234567890', -- GS1 Global Location Number
    medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
    gtin TEXT NOT NULL DEFAULT '08901234567890',        -- GS1 Global Trade Item Number
    batch_id INTEGER NOT NULL REFERENCES stock_batches(id) ON DELETE RESTRICT,
    transfer_id INTEGER REFERENCES transfers(id) ON DELETE RESTRICT,
    batch_number TEXT NOT NULL,
    serial_number TEXT,                                -- Unit pack serial number (DSCSA)
    expiry_date DATE NOT NULL,
    transaction_type TEXT CHECK(transaction_type IN ('CONSUMED', 'RECEIVED', 'TRANSFERRED_OUT', 'TRANSFERRED_IN', 'WASTED_EXPIRED', 'AUDIT_CORRECTION', 'QUARANTINED', 'WRITE_OFF')) NOT NULL,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    balance_after INTEGER NOT NULL CHECK(balance_after >= 0),
    reference_id TEXT,
    notes TEXT,
    logged_by TEXT DEFAULT 'System',
    abha_id TEXT DEFAULT NULL,                         -- ABDM 14-digit Patient ABHA ID (M3)
    consent_token TEXT DEFAULT NULL,                   -- ABDM Electronic Consent Artifact Token
    user_reported_at TEXT NOT NULL,                    -- Strict ISO-8601 UTC microsecond string
    created_at TEXT NOT NULL,                          -- Strict ISO-8601 UTC microsecond string
    previous_hash TEXT NOT NULL,
    hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_facility_med ON inventory_transactions(facility_id, medicine_id);
CREATE INDEX IF NOT EXISTS idx_tx_facility_batch ON inventory_transactions(facility_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_tx_created ON inventory_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_tx_transfer ON inventory_transactions(transfer_id);
CREATE INDEX IF NOT EXISTS idx_tx_hash ON inventory_transactions(hash);
CREATE INDEX IF NOT EXISTS idx_tx_batch_number ON inventory_transactions(batch_number);
CREATE INDEX IF NOT EXISTS idx_tx_type_created ON inventory_transactions(transaction_type, created_at);
CREATE INDEX IF NOT EXISTS idx_tx_covering ON inventory_transactions(transaction_type, created_at, facility_id, medicine_id, quantity);

-- 6. Recursion-Safe Trigger: Fires ONLY on business column updates
CREATE TRIGGER IF NOT EXISTS update_stock_batches_modtime 
AFTER UPDATE OF quantity_available, quantity_reserved, status, version, batch_number, expiry_date ON stock_batches
FOR EACH ROW
BEGIN
    UPDATE stock_batches SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- 7. Real-Time Emergency Alerts & Notifications (Microtask 3.1)
CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    severity TEXT CHECK(severity IN ('INFO', 'WARNING', 'CRITICAL', 'EMERGENCY')) NOT NULL,
    category TEXT CHECK(category IN ('STOCKOUT', 'CRITICAL_DEPLETION', 'SURGE_SPIKE', 'TRANSFER_UPDATE', 'COLD_CHAIN_BREACH', 'SYSTEM')) NOT NULL,
    facility_id INTEGER REFERENCES facilities(id) ON DELETE SET NULL,
    medicine_id INTEGER REFERENCES medicines(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data_json TEXT,
    acknowledged INTEGER CHECK(acknowledged IN (0, 1)) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_facility ON alerts(facility_id);
CREATE INDEX IF NOT EXISTS idx_alerts_category ON alerts(category);

-- 8. AI Safety & Security Audit Trail (Microtask 3.4)
CREATE TABLE IF NOT EXISTS ai_safety_violations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,                           -- Strict ISO-8601 UTC microsecond string
    component TEXT NOT NULL,                           -- 'ledger_vision', 'rebalance_agent', or 'input_guard'
    violation_type TEXT NOT NULL,                      -- 'PROMPT_INJECTION', 'QUANTITY_OUT_OF_BOUNDS', 'EXPIRED_BATCH_INGESTION', 'CIRCUIT_BREAKER_TRIP', 'INVALID_FACILITY_OR_DRUG'
    severity TEXT CHECK(severity IN ('INFO', 'WARNING', 'HIGH', 'CRITICAL')) NOT NULL,
    details TEXT NOT NULL,
    raw_input_snippet TEXT,
    remediation_applied TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_safety_timestamp ON ai_safety_violations(timestamp);
CREATE INDEX IF NOT EXISTS idx_safety_component ON ai_safety_violations(component);
CREATE INDEX IF NOT EXISTS idx_safety_type ON ai_safety_violations(violation_type);
CREATE INDEX IF NOT EXISTS idx_safety_severity ON ai_safety_violations(severity);

-- 9. Crisis Simulation Snapshots (Microtask 5.1)
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

CREATE INDEX IF NOT EXISTS idx_crisis_snapshots_active ON crisis_snapshots(is_active);
CREATE INDEX IF NOT EXISTS idx_crisis_snapshots_scenario ON crisis_snapshots(scenario_id);
