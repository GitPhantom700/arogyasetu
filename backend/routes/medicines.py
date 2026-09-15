from fastapi import APIRouter, Query
from typing import List, Optional
from database import get_connection
from schemas import MedicineResponse, MedicineCategory

router = APIRouter(prefix="/api/medicines", tags=["Medicines Catalog"])


@router.get("", response_model=List[MedicineResponse])
def list_medicines(
    category: Optional[MedicineCategory] = Query(None, description="Filter by therapeutic category"),
    is_emergency: Optional[int] = Query(None, description="Filter emergency lifesaving drugs (1 or 0)"),
    requires_cold_chain: Optional[int] = Query(None, description="Filter cold chain items (1 or 0)"),
    skip: int = Query(0, ge=0, description="Offset pagination index"),
    limit: int = Query(50, ge=1, le=100, description="Page limit")
):
    """Retrieves the National Essential Medicines catalog with filters and pagination."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        query = "SELECT * FROM medicines WHERE is_active = 1"
        params = []

        if category:
            query += " AND category = ?"
            params.append(category.value)
        if is_emergency is not None:
            query += " AND is_emergency = ?"
            params.append(is_emergency)
        if requires_cold_chain is not None:
            query += " AND requires_cold_chain = ?"
            params.append(requires_cold_chain)

        query += " ORDER BY is_emergency DESC, name ASC LIMIT ? OFFSET ?;"
        params.extend([limit, skip])

        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()
