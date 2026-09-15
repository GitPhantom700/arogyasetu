import re
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional, Dict, Any
from enum import Enum


class FacilityTier(str, Enum):
    SC = "SC"
    PHC = "PHC"
    CHC = "CHC"
    SDH = "SDH"
    DH = "DH"


class TerrainType(str, Enum):
    HIGHWAY_CORRIDOR = "HIGHWAY_CORRIDOR"
    PLAINS = "PLAINS"
    GHAT_MOUNTAIN = "GHAT_MOUNTAIN"


class MedicineCategory(str, Enum):
    ANTIDOTE = "Antidote"
    VACCINE = "Vaccine"
    ANALGESIC = "Analgesic"
    ANTIBIOTIC = "Antibiotic"
    IV_FLUID = "IV Fluid"
    EMERGENCY = "Emergency"
    CHRONIC = "Chronic"


class BatchStatus(str, Enum):
    ACTIVE = "ACTIVE"
    QUARANTINED = "QUARANTINED"
    RECALLED = "RECALLED"
    EXPIRED = "EXPIRED"


class HealthCheckResponse(BaseModel):
    status: str = "healthy"
    database: str = "connected"
    timestamp: str
    total_facilities: int
    total_medicines: int
    total_stock_batches: int
    model_config = ConfigDict(from_attributes=True)


class FacilityResponse(BaseModel):
    id: int
    facility_code: str
    facility_gln: str = "8901234567890"
    name: str
    tier: FacilityTier
    district: str
    state: str
    latitude: float
    longitude: float
    terrain_type: TerrainType
    contact_phone: Optional[str] = None
    contact_person: Optional[str] = None
    total_beds: int
    icu_beds: int
    oxygen_beds: int
    has_cold_chain: int
    power_backup_hours: int
    has_dedicated_vehicle: int
    is_active: int
    model_config = ConfigDict(from_attributes=True)


class FacilityDetailResponse(FacilityResponse):
    available_beds: int
    total_medicines_stocked: int
    critical_stock_count: int
    model_config = ConfigDict(from_attributes=True)


class MedicineResponse(BaseModel):
    id: int
    sku: str
    gtin: str = "08901234567890"
    name: str
    category: MedicineCategory
    unit: str
    min_safety_stock: int
    is_emergency: int
    requires_cold_chain: int
    storage_temp_c: str
    seasonal_risk_months: str
    description: Optional[str] = None
    is_active: int
    model_config = ConfigDict(from_attributes=True)


class BatchItemResponse(BaseModel):
    id: int
    batch_number: str
    gtin: str = "08901234567890"
    serial_number: Optional[str] = None
    expiry_date: str
    quantity_available: int
    status: BatchStatus
    version: int
    model_config = ConfigDict(from_attributes=True)


class StockItemResponse(BaseModel):
    medicine_id: int
    sku: str
    medicine_name: str
    category: MedicineCategory
    unit: str
    min_safety_stock: int
    is_emergency: int
    requires_cold_chain: int
    total_quantity: int
    is_critical_stockout: bool
    batches: List[BatchItemResponse]
    model_config = ConfigDict(from_attributes=True)


class FacilityInventoryResponse(BaseModel):
    facility_id: int
    facility_code: str
    facility_name: str
    inventory: List[StockItemResponse]
    model_config = ConfigDict(from_attributes=True)


class OverviewStatsResponse(BaseModel):
    total_facilities: int
    total_beds: int
    total_icu_beds: int
    total_oxygen_beds: int
    total_medicines: int
    total_batches: int
    critical_stockouts_count: int
    facilities_with_cold_chain: int
    districts: List[str]
    cached: bool = False
    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Transactional Core & Concurrency Control
# ==========================================

class WriteOffReason(str, Enum):
    EXPIRED = "EXPIRED"
    DAMAGED = "DAMAGED"
    COLD_CHAIN_BREACH = "COLD_CHAIN_BREACH"
    LOST = "LOST"
    QUALITY_RECALL = "QUALITY_RECALL"
    OTHER = "OTHER"


class IoTCompromiseRequest(BaseModel):
    temperature_celsius: float = Field(..., ge=-50.0, le=100.0, description="Measured temperature in Celsius")
    duration_minutes: int = Field(..., ge=1, le=10080, description="Duration of breach in minutes")
    sensor_id: str = Field(..., min_length=3, max_length=50, description="IoT sensor identifier")
    expected_version: Optional[int] = Field(None, ge=1, description="Expected batch version for Optimistic Concurrency Control")

    @field_validator("sensor_id")
    @classmethod
    def validate_sensor_id(cls, v: str) -> str:
        s = v.strip()
        if len(s) < 3:
            raise ValueError("sensor_id must contain at least 3 non-whitespace characters")
        if not re.match(r"^[a-zA-Z0-9_\-]+$", s):
            raise ValueError("sensor_id must contain only alphanumeric characters, dashes, or underscores")
        return s


class ConsumeStockRequest(BaseModel):
    facility_id: int = Field(..., description="ID of the facility consuming stock")
    batch_id: int = Field(..., description="ID of the batch being consumed")
    quantity: int = Field(..., gt=0, description="Quantity to consume (must be > 0)")
    facility_gln: Optional[str] = Field(None, description="GS1 Global Location Number")
    expected_version: Optional[int] = Field(None, description="Batch version for Optimistic Concurrency Control")
    reference_id: Optional[str] = Field(None, max_length=100, description="OPD/IPD prescription or patient ticket number")
    notes: Optional[str] = Field(None, max_length=500, description="Clinical reason or dispensing notes")
    logged_by: Optional[str] = Field("PHC Staff", max_length=100, description="Staff member logging the transaction")
    user_reported_at: Optional[str] = Field(None, description="Clinical event occurrence timestamp (ISO or YYYY-MM-DD HH:MM:SS)")


class ReceiveStockRequest(BaseModel):
    facility_id: int = Field(..., description="ID of the receiving facility")
    medicine_id: int = Field(..., description="ID of the medicine received")
    batch_number: str = Field(..., min_length=2, max_length=50, description="Manufacturer batch number")
    expiry_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="Batch expiry date (YYYY-MM-DD)")
    quantity: int = Field(..., gt=0, description="Quantity received (must be > 0)")
    gtin: Optional[str] = Field(None, description="GS1 14-digit Global Trade Item Number")
    serial_number: Optional[str] = Field(None, description="GS1 Pack Serial Number")
    reference_id: Optional[str] = Field(None, max_length=100, description="Goods Receipt Note (GRN) or Challan number")
    notes: Optional[str] = Field(None, max_length=500, description="Receiving notes or supplier info")
    logged_by: Optional[str] = Field("Store Incharge", max_length=100, description="Staff member verifying the delivery")
    user_reported_at: Optional[str] = Field(None, description="Delivery or acceptance timestamp (ISO or YYYY-MM-DD HH:MM:SS)")


class WriteOffStockRequest(BaseModel):
    facility_id: int = Field(..., description="ID of the facility writing off stock")
    batch_id: int = Field(..., description="ID of the batch to write off")
    quantity: int = Field(..., gt=0, description="Quantity to write off (must be > 0)")
    reason: WriteOffReason = Field(..., description="Categorization of write-off")
    facility_gln: Optional[str] = Field(None, description="GS1 Global Location Number")
    expected_version: Optional[int] = Field(None, description="Batch version for Optimistic Concurrency Control")
    reference_id: Optional[str] = Field(None, max_length=100, description="Damage/Disposal report reference")
    notes: Optional[str] = Field(None, max_length=500, description="Details of breach, expiration, or damage")
    logged_by: Optional[str] = Field("Medical Officer", max_length=100, description="Officer authorizing write-off")
    user_reported_at: Optional[str] = Field(None, description="Incident or breach discovery timestamp (ISO or YYYY-MM-DD HH:MM:SS)")


class StockTransactionResponse(BaseModel):
    transaction_id: int
    transaction_type: str
    facility_id: int
    facility_gln: str = "8901234567890"
    medicine_id: int
    gtin: str = "08901234567890"
    batch_id: int
    batch_number: str
    serial_number: Optional[str] = None
    expiry_date: str
    quantity: int
    balance_after: int
    batch_version_after: int
    batch_status_after: str
    reference_id: Optional[str] = None
    notes: Optional[str] = None
    logged_by: str
    user_reported_at: Optional[str] = None
    created_at: str
    previous_hash: Optional[str] = None
    hash: str
    message: str
    model_config = ConfigDict(from_attributes=True)


class BatchLedgerEntry(BaseModel):
    id: int
    transaction_type: str
    facility_gln: str = "8901234567890"
    gtin: str = "08901234567890"
    batch_number: str
    serial_number: Optional[str] = None
    expiry_date: str
    quantity: int
    balance_after: int
    reference_id: Optional[str] = None
    notes: Optional[str] = None
    logged_by: str
    user_reported_at: Optional[str] = None
    created_at: str
    previous_hash: Optional[str] = None
    hash: str
    model_config = ConfigDict(from_attributes=True)


class BatchHistoryResponse(BaseModel):
    batch_id: int
    batch_number: str
    facility_id: int
    facility_name: str
    medicine_id: int
    medicine_name: str
    current_quantity: int
    status: str
    version: int
    transactions: List[BatchLedgerEntry]
    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Dynamic Burn Rate & Depletion Forecaster
# ==========================================

class InventoryStatus(str, Enum):
    HEALTHY = "HEALTHY"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class MedicineDepletionItem(BaseModel):
    facility_id: int
    facility_code: str
    facility_name: str
    district: str
    medicine_id: int
    sku: str
    medicine_name: str
    category: MedicineCategory
    unit: str
    min_safety_stock: int
    is_emergency: int
    current_stock: int
    active_batches_count: int
    window_days: int = 7
    total_consumed_in_window: int
    daily_average_consumption: float
    days_of_inventory_remaining: Optional[float] = None
    status: InventoryStatus
    burn_rate_surge: bool = False
    surge_multiplier: Optional[float] = None
    last_24h_consumption: int = 0
    estimated_stockout_date: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class FacilityDepletionResponse(BaseModel):
    facility_id: int
    facility_code: str
    facility_name: str
    district: str
    as_of: str
    window_days: int
    total_medicines_evaluated: int
    critical_count: int
    warning_count: int
    healthy_count: int
    medicines: List[MedicineDepletionItem]
    model_config = ConfigDict(from_attributes=True)


class NetworkDepletionResponse(BaseModel):
    as_of: str
    window_days: int
    total_facilities_evaluated: int
    total_items_evaluated: int
    total_critical_items: int
    total_warning_items: int
    total_healthy_items: int
    items: List[MedicineDepletionItem]
    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Inter-PHC Transfer State Machine Schemas
# ==========================================

class TransferStatus(str, Enum):
    DRAFT = "DRAFT"
    APPROVED = "APPROVED"
    DISPATCHED = "DISPATCHED"
    IN_TRANSIT = "IN_TRANSIT"
    RECEIVED = "RECEIVED"
    CANCELLED = "CANCELLED"
    PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED"
    RETURN_IN_PROGRESS = "RETURN_IN_PROGRESS"
    RETURNED = "RETURNED"


class TransferUrgency(str, Enum):
    ROUTINE = "ROUTINE"
    URGENT = "URGENT"
    CRITICAL_EMERGENCY = "CRITICAL_EMERGENCY"


class BatchAllocationItem(BaseModel):
    batch_id: int
    batch_number: str
    gtin: str = "08901234567890"
    serial_number: Optional[str] = None
    expiry_date: str
    quantity: int
    model_config = ConfigDict(from_attributes=True)


class CreateTransferRequest(BaseModel):
    source_facility_id: int
    destination_facility_id: int
    medicine_id: int
    quantity: int = Field(..., gt=0, description="Quantity of medicine units to transfer")
    urgency: TransferUrgency = TransferUrgency.ROUTINE
    reason: Optional[str] = None
    ai_recommended: bool = False
    ai_rationale: Optional[str] = None
    auto_approve: bool = False
    requested_by: Optional[str] = "PHC Medical Officer"


class ApproveTransferRequest(BaseModel):
    approved_by: Optional[str] = "District Health Officer (DHO)"
    notes: Optional[str] = None


class DispatchTransferRequest(BaseModel):
    dispatched_by: Optional[str] = "Donor Facility Pharmacist"
    batch_allocations: Optional[List[BatchAllocationItem]] = Field(
        None,
        description="Optional explicit batch allocations. If omitted, earliest expiring active batches are auto-allocated via FEFO."
    )
    notes: Optional[str] = None


class InTransitTransferRequest(BaseModel):
    dispatched_vehicle_id: Optional[str] = None
    driver_name: Optional[str] = None
    driver_contact: Optional[str] = None
    notes: Optional[str] = None


class ReceiveTransferRequest(BaseModel):
    received_by: Optional[str] = "Recipient Pharmacist"
    received_quantity: Optional[int] = Field(
        None,
        description="Quantity intact and received. If omitted, assumes 100% of dispatched quantity. If less, logs partial transit loss."
    )
    condition_ok: bool = True
    spoilage_reason: Optional[str] = None
    notes: Optional[str] = None


class CancelTransferRequest(BaseModel):
    cancelled_by: Optional[str] = "Supervising Officer"
    reason: str = Field(..., min_length=3, description="Justification for cancellation from DRAFT or APPROVED")


class AbortTransitRequest(BaseModel):
    aborted_by: Optional[str] = "Transit Supervisor"
    reason: str = Field(..., min_length=3, description="Justification for aborting transit (e.g. road blockage, landslide, vehicle failure)")
    notes: Optional[str] = None


class ReceiveReturnRequest(BaseModel):
    received_by: Optional[str] = "Donor Facility Pharmacist"
    returned_quantity: Optional[int] = Field(
        None,
        description="Quantity intact and received back at donor facility. If less than dispatched, difference is logged as transit loss."
    )
    condition_ok: bool = True
    spoilage_reason: Optional[str] = None
    notes: Optional[str] = None


class TransferResponse(BaseModel):
    id: int
    transfer_code: str
    source_facility_id: int
    source_facility_code: str
    source_facility_name: str
    source_district: str
    source_terrain: Optional[str] = None
    destination_facility_id: int
    destination_facility_code: str
    destination_facility_name: str
    destination_district: str
    destination_terrain: Optional[str] = None
    medicine_id: int
    medicine_sku: str
    medicine_name: str
    medicine_category: str
    medicine_unit: str
    quantity: int
    status: TransferStatus
    urgency: TransferUrgency
    distance_km: Optional[float] = None
    estimated_transit_hours: Optional[float] = None
    reason: Optional[str] = None
    ai_recommended: int = 0
    ai_rationale: Optional[str] = None
    requested_at: Optional[str] = None
    approved_at: Optional[str] = None
    dispatched_at: Optional[str] = None
    received_at: Optional[str] = None
    returned_at: Optional[str] = None
    transaction_count: int = 0
    model_config = ConfigDict(from_attributes=True)


class TransferDetailResponse(TransferResponse):
    dispatched_batches: List[BatchAllocationItem] = []
    received_batches: List[BatchAllocationItem] = []
    transactions: List[BatchLedgerEntry] = []
    model_config = ConfigDict(from_attributes=True)


class TransferListResponse(BaseModel):
    total: int
    transfers: List[TransferResponse]
    model_config = ConfigDict(from_attributes=True)


# =====================================================================
# Real-Time Alerts & Notification Schemas (Microtask 3.1)
# =====================================================================

class AlertSeverity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"
    EMERGENCY = "EMERGENCY"


class AlertCategory(str, Enum):
    STOCKOUT = "STOCKOUT"
    CRITICAL_DEPLETION = "CRITICAL_DEPLETION"
    SURGE_SPIKE = "SURGE_SPIKE"
    TRANSFER_UPDATE = "TRANSFER_UPDATE"
    COLD_CHAIN_BREACH = "COLD_CHAIN_BREACH"
    SYSTEM = "SYSTEM"


class AlertEvent(BaseModel):
    id: int
    timestamp: str
    severity: AlertSeverity
    category: AlertCategory
    facility_id: Optional[int] = None
    facility_name: Optional[str] = None
    district: Optional[str] = None
    medicine_id: Optional[int] = None
    medicine_name: Optional[str] = None
    title: str
    message: str
    data: Optional[Dict[str, Any]] = None
    acknowledged: bool = False
    model_config = ConfigDict(from_attributes=True)


class AlertBroadcastRequest(BaseModel):
    severity: AlertSeverity = AlertSeverity.WARNING
    category: AlertCategory = AlertCategory.SYSTEM
    facility_id: Optional[int] = None
    medicine_id: Optional[int] = None
    title: str = Field(..., min_length=3, max_length=150, description="Short summary title of the alert")
    message: str = Field(..., min_length=5, max_length=500, description="Detailed explanatory message")
    data: Optional[Dict[str, Any]] = None


class AlertListResponse(BaseModel):
    total: int
    unread_count: int
    alerts: List[AlertEvent]
    model_config = ConfigDict(from_attributes=True)


class AlertAcknowledgeResponse(BaseModel):
    id: int
    acknowledged: bool
    message: str
    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Multimodal Paper Register Ingestion (Gemini Vision)
# ==========================================

class ExtractedStockItem(BaseModel):
    medicine_name: str = Field(..., description="Raw transcribed drug or medicine name from the physical ledger")
    matched_medicine_id: Optional[int] = Field(None, description="Auto-matched catalog medicine ID from healthcare database")
    matched_medicine_name: Optional[str] = Field(None, description="Official catalog name matching the transcribed entry")
    batch_number: str = Field(..., min_length=1, description="Batch / Lot number written on chalan or register")
    quantity: int = Field(..., ge=1, description="Quantity received or logged")
    expiry_date: str = Field(
        ...,
        description="Strict ISO-8601 date in YYYY-MM-DD format. Transcribe the expiration date. If only month/year or month name is visible (e.g. '08/27', 'Oct 25', 'End of 2024'), parse and assume the final calendar day of that month."
    )
    unit_price: Optional[float] = Field(None, ge=0.0, description="Optional unit price if present on receipt")
    confidence_score: float = Field(default=0.95, ge=0.0, le=1.0, description="Model extraction confidence score (0.0 to 1.0)")
    requires_pharmacist_review: bool = Field(default=False, description="Flagged true if fuzzy match is ambiguous (score between 60.0% and 81.9%) requiring Human-in-the-Loop review")
    safety_warning: Optional[str] = Field(None, description="AI safety violation or anomaly warning")
    is_expired: bool = Field(default=False, description="Flagged true if batch expiration date is in the past")
    notes: Optional[str] = Field(None, description="Handwritten marginalia, dosage form, or condition notes")
    model_config = ConfigDict(from_attributes=True)


class LedgerExtractionPayload(BaseModel):
    """Pydantic model provided to Gemini response_json_schema for strict structured output."""
    facility_name: Optional[str] = None
    voucher_or_chalan_number: Optional[str] = None
    register_date: Optional[str] = None
    items: List[ExtractedStockItem]
    raw_summary: Optional[str] = None


class RegisterScanResponse(BaseModel):
    scan_id: str
    timestamp: str
    facility_id: Optional[int] = None
    facility_name: Optional[str] = None
    model_used: str
    processing_time_ms: float
    total_items_detected: int
    extracted_items: List[ExtractedStockItem]
    raw_summary: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class RegisterCommitItem(BaseModel):
    medicine_id: int
    batch_number: str
    quantity: int = Field(..., ge=1)
    expiry_date: str
    unit_price: Optional[float] = None


class RegisterCommitRequest(BaseModel):
    facility_id: int
    items: List[RegisterCommitItem]
    notes: Optional[str] = "Paper register optical ingestion"


class RegisterCommitResponse(BaseModel):
    facility_id: int
    facility_name: Optional[str] = None
    committed_batches: int
    total_quantity_added: int
    batch_ids: List[int]
    transaction_ids: List[int]
    message: str
    model_config = ConfigDict(from_attributes=True)


# =====================================================================
# Autonomous Rebalancing Agent Schemas (Microtask 3.3)
# =====================================================================

class DonorCandidateInfo(BaseModel):
    facility_id: int
    facility_code: str
    facility_name: str
    district: str
    latitude: float
    longitude: float
    distance_km: float
    estimated_transit_hours: float
    terrain_type: str
    has_cold_chain: bool
    current_stock: int
    daily_average_consumption: float
    days_of_inventory_remaining: Optional[float] = None
    min_safety_stock: int
    retention_buffer: int
    surplus_available: int
    viable_batch_count: int
    earliest_viable_expiry: Optional[str] = None
    suitability_score: Optional[float] = None
    model_config = ConfigDict(from_attributes=True)


class RebalanceRecommendationRequest(BaseModel):
    destination_facility_id: int
    medicine_id: int
    target_buffer_days: int = Field(14, ge=3, le=60, description="Target buffer days to replenish recipient to")
    min_donor_buffer_days: int = Field(14, ge=7, le=60, description="Mandatory protective buffer donor must retain")
    max_radius_km: float = Field(50.0, gt=0, le=200.0, description="Geographic search radius in kilometers")
    urgency: Optional[TransferUrgency] = None
    monsoon_mode: bool = Field(False, description="Whether to apply the 1.5x monsoon landslide buffer (June-Sept Sahyadri Ghats protection)")


class RebalanceRecommendationPayload(BaseModel):
    """Structured Pydantic response schema for Google Gemini SDK function output."""
    recommended_donor_facility_id: Optional[int] = Field(None, description="Selected donor facility ID, or null if no viable donors exist")
    transfer_quantity: int = Field(0, ge=0, description="Recommended units to transfer")
    urgency: str = Field("ROUTINE", description="ROUTINE, URGENT, or CRITICAL_EMERGENCY")
    clinical_rationale: str = Field(..., description="Explainable clinical rationale for choice and patient safety")
    tradeoff_analysis: str = Field(..., description="Comparison of donors, terrain friction, and distance vs surplus tradeoffs")
    risk_assessment: str = Field(..., description="Safety assessment proving donor facility remains protected")
    suggested_route_summary: str = Field(..., description="Highway/corridor notes and cold-chain transport considerations")
    fallback_donor_facility_id: Optional[int] = Field(None, description="Secondary alternative donor facility ID if primary is unavailable")


class RebalanceRecommendationResponse(BaseModel):
    recommendation_id: str
    generated_at: str
    model_used: str
    destination_facility_id: int
    destination_facility_name: str
    medicine_id: int
    medicine_name: str
    medicine_unit: str
    recipient_current_stock: int
    recipient_dac: float
    recipient_dir: Optional[float] = None
    recipient_status: str
    calculated_deficit: int
    recommended_donor: Optional[DonorCandidateInfo] = None
    recommended_quantity: int
    recommended_urgency: TransferUrgency
    estimated_distance_km: Optional[float] = None
    estimated_transit_hours: Optional[float] = None
    donor_post_transfer_dir: Optional[float] = None
    recipient_post_transfer_dir: Optional[float] = None
    clinical_rationale: str
    tradeoff_analysis: str
    risk_assessment: str
    suggested_route_summary: Optional[str] = None
    fallback_donor: Optional[DonorCandidateInfo] = None
    all_candidates_evaluated: List[DonorCandidateInfo] = []
    is_feasible: bool
    monsoon_buffer_applied: bool = False
    safety_verified: bool = True
    clamped_by_safety_guard: bool = False
    clamped_reason: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class ApplyRebalanceRequest(BaseModel):
    recommendation_id: Optional[str] = None
    source_facility_id: int
    destination_facility_id: int
    medicine_id: int
    quantity: int = Field(..., gt=0, description="Quantity to transfer")
    urgency: TransferUrgency = TransferUrgency.ROUTINE
    ai_rationale: Optional[str] = None
    auto_approve: bool = False
    requested_by: Optional[str] = "Gemini Autonomous Rebalancer"


class ApplyRebalanceResponse(BaseModel):
    transfer_id: int
    transfer_code: str
    status: str
    source_facility_name: str
    destination_facility_name: str
    medicine_name: str
    quantity: int
    message: str
    model_config = ConfigDict(from_attributes=True)


class NetworkDeficitItem(BaseModel):
    facility_id: int
    facility_name: str
    district: str
    medicine_id: int
    medicine_name: str
    category: str
    unit: str
    is_emergency: bool
    current_stock: int
    daily_average_consumption: float
    days_of_inventory_remaining: Optional[float] = None
    status: str
    deficit_quantity: int
    candidate_donor_count: int
    top_donor_facility_name: Optional[str] = None
    top_donor_surplus: Optional[int] = None
    top_donor_distance_km: Optional[float] = None
    top_donor_transit_hours: Optional[float] = None
    model_config = ConfigDict(from_attributes=True)


class CrisisScenarioResponse(BaseModel):
    scenario_id: str
    title: str
    description: str
    category: str
    affected_district: str
    severity: str
    monsoon_mode: bool
    estimated_surge_multiplier: float
    affected_facility_codes: List[str]
    medicine_spikes: Dict[str, float]
    icon: str
    model_config = ConfigDict(from_attributes=True)


class TriggerCrisisRequest(BaseModel):
    scenario_id: str
    intensity: float = Field(1.0, ge=0.5, le=3.0, description="Surge intensity multiplier")
    auto_generate_rebalance: bool = True


class TriggerCrisisResponse(BaseModel):
    status: str
    scenario_id: str
    scenario_title: str
    affected_facilities_count: int
    critically_depleted_items_count: int
    total_units_consumed: int
    alerts_broadcast: int
    monsoon_multiplier_active: bool
    recommended_rebalance_plans: List[Dict[str, Any]] = []
    message: str
    model_config = ConfigDict(from_attributes=True)


class CrisisStatusResponse(BaseModel):
    is_active: bool
    active_scenario_id: Optional[str] = None
    active_scenario_title: Optional[str] = None
    activated_at: Optional[str] = None
    intensity: float = 1.0
    affected_facility_count: int = 0
    affected_facility_ids: List[int] = []
    monsoon_mode: bool = False
    model_config = ConfigDict(from_attributes=True)


class ResetCrisisResponse(BaseModel):
    status: str
    restored_batches_count: int
    message: str
    audit_corrections_recorded: int = 0
    model_config = ConfigDict(from_attributes=True)
