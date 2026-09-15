from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from database import get_connection
from schemas import (
    FacilityResponse,
    FacilityDetailResponse,
    FacilityTier,
    TerrainType,
    FacilityDepletionResponse,
    InventoryStatus,
)
from burn_rate import calculate_depletion_metrics

router = APIRouter(prefix="/api/facilities", tags=["Healthcare Facilities"])


@router.get("", response_model=List[FacilityResponse])
def list_facilities(
    district: Optional[str] = Query(None, description="Filter by district (e.g. Pune, Satara)"),
    tier: Optional[FacilityTier] = Query(None, description="Filter by tier (DH, SDH, CHC, PHC, SC)"),
    terrain_type: Optional[TerrainType] = Query(None, description="Filter by terrain (HIGHWAY_CORRIDOR, PLAINS, GHAT_MOUNTAIN)"),
    has_cold_chain: Optional[int] = Query(None, description="Filter by cold chain availability (1 or 0)"),
    skip: int = Query(0, ge=0, description="Offset pagination index"),
    limit: int = Query(50, ge=1, le=100, description="Page limit")
):
    """Lists healthcare facilities across districts with optional attribute filters and pagination."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        query = "SELECT * FROM facilities WHERE is_active = 1"
        params = []

        if district:
            query += " AND district = ?"
            params.append(district)
        if tier:
            query += " AND tier = ?"
            params.append(tier.value)
        if terrain_type:
            query += " AND terrain_type = ?"
            params.append(terrain_type.value)
        if has_cold_chain is not None:
            query += " AND has_cold_chain = ?"
            params.append(has_cold_chain)

        query += " ORDER BY tier, name LIMIT ? OFFSET ?;"
        params.extend([limit, skip])

        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


@router.get("/{facility_id}", response_model=FacilityDetailResponse)
def get_facility_detail(facility_id: int):
    """Retrieves full facility details including bed metrics and inventory summaries."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM facilities WHERE id = ? AND is_active = 1;", (facility_id,))
        facility = cursor.fetchone()
        if not facility:
            raise HTTPException(status_code=404, detail="Facility not found")

        fac_data = dict(facility)

        cursor.execute("""
            SELECT 
                COUNT(DISTINCT sb.medicine_id) AS total_medicines,
                COUNT(DISTINCT CASE WHEN total_qty <= m.min_safety_stock THEN m.id END) AS critical_count
            FROM medicines m
            LEFT JOIN (
                SELECT medicine_id, SUM(quantity_available) AS total_qty
                FROM stock_batches
                WHERE facility_id = ? AND status = 'ACTIVE'
                GROUP BY medicine_id
            ) sb ON m.id = sb.medicine_id
            WHERE m.is_active = 1;
        """, (facility_id,))
        stats = cursor.fetchone()

        fac_data["available_beds"] = fac_data["total_beds"] - fac_data["icu_beds"]
        fac_data["total_medicines_stocked"] = stats["total_medicines"] or 0
        fac_data["critical_stock_count"] = stats["critical_count"] or 0

        return fac_data
    finally:
        conn.close()


@router.get("/{facility_id}/depletion", response_model=FacilityDepletionResponse)
def get_facility_depletion_endpoint(
    facility_id: int,
    status: Optional[InventoryStatus] = Query(None, description="Filter by triage status (CRITICAL, WARNING, HEALTHY)"),
    window_days: int = Query(7, ge=1, le=90, description="Rolling consumption window in days"),
    as_of: Optional[str] = Query(None, description="Anchor timestamp for simulation or back-testing (ISO-8601 string)")
):
    """Retrieves dynamic burn rate and depletion timeline for all medicines at a specific facility."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, facility_code, name, district FROM facilities WHERE id = ? AND is_active = 1;", (facility_id,))
        fac = cur.fetchone()
        if not fac:
            raise HTTPException(status_code=404, detail=f"Facility ID {facility_id} not found")
        fac_code = fac["facility_code"]
        fac_name = fac["name"]
        district = fac["district"]
    finally:
        conn.close()

    status_str = status.value if status else None
    try:
        result = calculate_depletion_metrics(
            facility_id=facility_id,
            status_filter=status_str,
            window_days=window_days,
            as_of=as_of
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return FacilityDepletionResponse(
        facility_id=facility_id,
        facility_code=fac_code,
        facility_name=fac_name,
        district=district,
        as_of=result["as_of"],
        window_days=result["window_days"],
        total_medicines_evaluated=len(result["items"]),
        critical_count=result["total_critical_items"],
        warning_count=result["total_warning_items"],
        healthy_count=result["total_healthy_items"],
        medicines=result["items"]
    )

