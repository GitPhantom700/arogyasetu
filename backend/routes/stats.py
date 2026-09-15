from fastapi import APIRouter
from datetime import datetime, timedelta
from typing import Optional
from database import get_connection
from schemas import OverviewStatsResponse

router = APIRouter(prefix="/api/stats", tags=["System Statistics"])

# In-Memory TTL Cache (60 seconds expiration)
_stats_cache: Optional[dict] = None
_cache_expires_at: Optional[datetime] = None
_last_invalidation_at: Optional[datetime] = None
CACHE_TTL_SECONDS = 60
DEBOUNCE_SECONDS = 0.5  # Prevents cache stampedes during rapid burst transactions


def invalidate_stats_cache(force: bool = False):
    """
    Invalidates the in-memory overview stats cache after transactional stock changes.
    Resets the cache pointer immediately to guarantee cache coherence across writes.
    """
    global _stats_cache, _cache_expires_at, _last_invalidation_at
    _stats_cache = None
    _cache_expires_at = None
    _last_invalidation_at = datetime.now()


@router.get("/overview", response_model=OverviewStatsResponse)
def get_overview_stats():
    """Returns high-level operational statistics with a 60-second TTL cache for performance."""
    global _stats_cache, _cache_expires_at
    now = datetime.now()

    if _stats_cache and _cache_expires_at and now < _cache_expires_at:
        cached_copy = _stats_cache.copy()
        cached_copy["cached"] = True
        return OverviewStatsResponse(**cached_copy)

    conn = get_connection()
    try:
        cursor = conn.cursor()

        # Aggregate facility counts and beds
        cursor.execute("""
            SELECT 
                COUNT(*) AS total_fac,
                SUM(total_beds) AS beds,
                SUM(icu_beds) AS icu,
                SUM(oxygen_beds) AS oxygen,
                SUM(has_cold_chain) AS cold_chain
            FROM facilities 
            WHERE is_active = 1;
        """)
        fac_row = cursor.fetchone()

        # Total medicines & batches
        cursor.execute("SELECT COUNT(*) FROM medicines WHERE is_active = 1;")
        total_med = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM stock_batches WHERE status = 'ACTIVE';")
        total_batches = cursor.fetchone()[0]

        # Distinct districts
        cursor.execute("SELECT DISTINCT district FROM facilities WHERE is_active = 1 ORDER BY district;")
        districts = [r["district"] for r in cursor.fetchall()]

        # Critical stockout count across network
        cursor.execute("""
            SELECT COUNT(*) AS critical_count
            FROM (
                SELECT f.id, m.id, COALESCE(SUM(sb.quantity_available), 0) AS current_stock, m.min_safety_stock
                FROM facilities f
                CROSS JOIN medicines m
                LEFT JOIN stock_batches sb ON f.id = sb.facility_id AND m.id = sb.medicine_id AND sb.status = 'ACTIVE'
                WHERE f.is_active = 1 AND m.is_active = 1 AND m.is_emergency = 1
                GROUP BY f.id, m.id
                HAVING current_stock < m.min_safety_stock
            );
        """)
        critical_stockouts = cursor.fetchone()["critical_count"]

        data = {
            "total_facilities": fac_row["total_fac"] or 0,
            "total_beds": fac_row["beds"] or 0,
            "total_icu_beds": fac_row["icu"] or 0,
            "total_oxygen_beds": fac_row["oxygen"] or 0,
            "total_medicines": total_med,
            "total_batches": total_batches,
            "critical_stockouts_count": critical_stockouts,
            "facilities_with_cold_chain": fac_row["cold_chain"] or 0,
            "districts": districts,
            "cached": False
        }

        _stats_cache = data
        _cache_expires_at = now + timedelta(seconds=CACHE_TTL_SECONDS)

        return OverviewStatsResponse(**data)
    finally:
        conn.close()
