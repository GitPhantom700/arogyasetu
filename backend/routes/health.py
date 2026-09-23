from fastapi import APIRouter
from datetime import datetime
from database import get_connection
from schemas import HealthCheckResponse

router = APIRouter(prefix="/api/health", tags=["System Health"])


@router.get("", response_model=HealthCheckResponse)
def get_health():
    """Returns the operational status of the API and underlying SQLite database."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM facilities;")
        fac_count = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM medicines;")
        med_count = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM stock_batches WHERE status = 'ACTIVE';")
        batch_count = cursor.fetchone()[0]

        return HealthCheckResponse(
            status="healthy",
            database="connected",
            timestamp=datetime.now().isoformat(),
            total_facilities=fac_count,
            total_medicines=med_count,
            total_stock_batches=batch_count
        )
    finally:
        conn.close()
