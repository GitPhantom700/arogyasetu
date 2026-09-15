"""
Hardened Data models and typed representations for Healthcare Supply Chain Platform.
Incorporates Gemini Pro recommendations: OCC versioning, soft-deletes, multi-batch transfers,
terrain types, cold-chain specifications, and seasonal risk metadata.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class Facility:
    id: Optional[int]
    facility_code: str
    name: str
    tier: str  # 'SC', 'PHC', 'CHC', 'SDH', 'DH'
    district: str
    state: str
    latitude: float
    longitude: float
    facility_gln: str = "8901234567890"  # GS1 13-digit GLN
    terrain_type: str = "PLAINS"  # 'HIGHWAY_CORRIDOR', 'PLAINS', 'GHAT_MOUNTAIN'
    contact_phone: Optional[str] = None
    contact_person: Optional[str] = None
    total_beds: int = 10
    icu_beds: int = 0
    oxygen_beds: int = 2
    has_cold_chain: int = 1
    power_backup_hours: int = 12
    has_dedicated_vehicle: int = 1
    is_active: int = 1
    created_at: Optional[str] = None


@dataclass
class Medicine:
    id: Optional[int]
    sku: str
    name: str
    category: str  # 'Antidote', 'Vaccine', 'Analgesic', 'Antibiotic', 'IV Fluid', 'Emergency', 'Chronic'
    unit: str
    gtin: str = "08901234567890"  # GS1 14-digit GTIN
    min_safety_stock: int = 20
    is_emergency: int = 0
    requires_cold_chain: int = 0
    storage_temp_c: str = "Ambient"
    seasonal_risk_months: str = "ALL"  # 'MONSOON_JUN_SEP', 'HARVEST_OCT_DEC', 'ALL'
    description: Optional[str] = None
    is_active: int = 1
    created_at: Optional[str] = None


@dataclass
class StockBatch:
    id: Optional[int]
    facility_id: int
    medicine_id: int
    batch_number: str
    expiry_date: str
    quantity_available: int
    gtin: str = "08901234567890"
    serial_number: Optional[str] = None
    status: str = "ACTIVE"  # 'ACTIVE', 'QUARANTINED', 'RECALLED', 'EXPIRED'
    version: int = 1  # Optimistic Concurrency Control (OCC)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


@dataclass
class Transfer:
    id: Optional[int]
    transfer_code: str
    source_facility_id: int
    destination_facility_id: int
    medicine_id: int
    quantity: int
    status: str = "DRAFT"  # 'DRAFT', 'APPROVED', 'DISPATCHED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED', 'PARTIALLY_RECEIVED'
    urgency: str = "ROUTINE"  # 'ROUTINE', 'URGENT', 'CRITICAL_EMERGENCY'
    distance_km: Optional[float] = None
    estimated_transit_hours: Optional[float] = None
    reason: Optional[str] = None
    ai_recommended: int = 0
    ai_rationale: Optional[str] = None
    requested_at: Optional[str] = None
    approved_at: Optional[str] = None
    dispatched_at: Optional[str] = None
    received_at: Optional[str] = None


@dataclass
class InventoryTransaction:
    id: Optional[int]
    facility_id: int
    medicine_id: int
    batch_id: int
    batch_number: str
    expiry_date: str
    transaction_type: str  # 'CONSUMED', 'RECEIVED', 'TRANSFERRED_OUT', 'TRANSFERRED_IN', 'WASTED_EXPIRED', 'AUDIT_CORRECTION', 'QUARANTINED'
    quantity: int
    balance_after: int
    hash: str
    facility_gln: str = "8901234567890"
    gtin: str = "08901234567890"
    serial_number: Optional[str] = None
    transfer_id: Optional[int] = None
    reference_id: Optional[str] = None
    notes: Optional[str] = None
    logged_by: str = "System"
    user_reported_at: Optional[str] = None
    created_at: Optional[str] = None
    previous_hash: Optional[str] = None
