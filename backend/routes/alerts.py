"""
Server-Sent Events (SSE) & Real-Time Alert REST API Routes.
Build with AI: Code for Communities (Second Edition) - Track 01 Healthcare Supply Chain.
Microtask 3.1: Real-Time Alert Engine.
"""

import json
import sqlite3
from typing import Optional, List
from fastapi import APIRouter, HTTPException, status, Query, Header, Request
from fastapi.responses import StreamingResponse

from database import get_connection, get_db_path, execute_write_transaction_async
from schemas import (
    AlertSeverity,
    AlertCategory,
    AlertEvent,
    AlertBroadcastRequest,
    AlertListResponse,
    AlertAcknowledgeResponse,
)
from alerts import broadcaster

router = APIRouter(prefix="/api/alerts", tags=["Real-Time Alerts & Events"])


@router.get("/stream")
async def stream_alerts(
    request: Request,
    last_event_id: Optional[str] = Header(None, alias="Last-Event-ID"),
    max_events: Optional[int] = Query(None, description="Optional limit of events to yield before closing stream")
):
    """
    Server-Sent Events (SSE) stream endpoint.
    Broadcasts real-time emergency stockouts, critical depletion alerts, and transfer status updates.
    Supports auto-reconnection via the standard 'Last-Event-ID' header or 'last_event_id' query parameter.
    Emits keepalive heartbeats every 15 seconds to prevent client/proxy timeouts.
    """
    effective_last_event_id = last_event_id or request.query_params.get("last_event_id")

    return StreamingResponse(
        broadcaster.stream_events(
            request=request,
            last_event_id=effective_last_event_id,
            max_events=max_events
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Content-Type": "text/event-stream; charset=utf-8",
        }
    )


@router.get("", response_model=AlertListResponse)
def get_alerts(
    severity: Optional[AlertSeverity] = Query(None, description="Filter by alert severity"),
    category: Optional[AlertCategory] = Query(None, description="Filter by alert category"),
    facility_id: Optional[int] = Query(None, description="Filter by facility ID"),
    medicine_id: Optional[int] = Query(None, description="Filter by medicine ID"),
    acknowledged: Optional[bool] = Query(None, description="Filter by acknowledgment state"),
    limit: int = Query(50, ge=1, le=200, description="Max alerts to return"),
    offset: int = Query(0, ge=0, description="Pagination offset")
):
    """
    Retrieves historical and active supply chain alerts with optional filtering and pagination.
    """
    conn = get_connection()
    try:
        cur = conn.cursor()

        # Build dynamic query
        conditions = []
        params = []

        if severity is not None:
            conditions.append("a.severity = ?")
            params.append(severity.value)
        if category is not None:
            conditions.append("a.category = ?")
            params.append(category.value)
        if facility_id is not None:
            conditions.append("a.facility_id = ?")
            params.append(facility_id)
        if medicine_id is not None:
            conditions.append("a.medicine_id = ?")
            params.append(medicine_id)
        if acknowledged is not None:
            conditions.append("a.acknowledged = ?")
            params.append(1 if acknowledged else 0)

        where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""

        # Count total
        cur.execute(f"SELECT COUNT(*) AS total FROM alerts a{where_clause};", params)
        total = cur.fetchone()["total"]

        # Count unread (unacknowledged)
        cur.execute(f"SELECT COUNT(*) AS unread FROM alerts a WHERE a.acknowledged = 0;")
        unread_count = cur.fetchone()["unread"]

        # Query records with joined facility and medicine names
        query = f"""
            SELECT 
                a.id, a.timestamp, a.severity, a.category, a.facility_id, a.medicine_id,
                a.title, a.message, a.data_json, a.acknowledged,
                f.name AS facility_name, f.district,
                m.name AS medicine_name
            FROM alerts a
            LEFT JOIN facilities f ON a.facility_id = f.id
            LEFT JOIN medicines m ON a.medicine_id = m.id
            {where_clause}
            ORDER BY a.timestamp DESC
            LIMIT ? OFFSET ?;
        """
        params.extend([limit, offset])
        cur.execute(query, params)
        rows = cur.fetchall()

        alert_list = []
        for r in rows:
            data_dict = {}
            if r["data_json"]:
                try:
                    data_dict = json.loads(r["data_json"])
                except Exception:
                    data_dict = {}

            alert_list.append(AlertEvent(
                id=r["id"],
                timestamp=r["timestamp"],
                severity=AlertSeverity(r["severity"]),
                category=AlertCategory(r["category"]),
                facility_id=r["facility_id"],
                facility_name=r["facility_name"],
                district=r["district"],
                medicine_id=r["medicine_id"],
                medicine_name=r["medicine_name"],
                title=r["title"],
                message=r["message"],
                data=data_dict,
                acknowledged=bool(r["acknowledged"])
            ))

        return AlertListResponse(
            total=total,
            unread_count=unread_count,
            alerts=alert_list
        )
    finally:
        conn.close()


@router.post("/broadcast", response_model=AlertEvent, status_code=status.HTTP_201_CREATED)
async def manual_broadcast_alert(req: AlertBroadcastRequest):
    """
    Manually triggers an alert broadcast across the SSE network.
    Useful for health authority emergency announcements, triage coordinators,
    testing, and disaster simulation exercises.
    """
    alert_event = await broadcaster.broadcast(req.model_dump())
    return alert_event


@router.post("/{alert_id}/acknowledge", response_model=AlertAcknowledgeResponse)
async def acknowledge_alert(alert_id: int):
    """
    Marks an active emergency alert as acknowledged by a duty officer.
    """
    def _ack_db_logic(conn: sqlite3.Connection):
        cur = conn.cursor()
        cur.execute("SELECT id FROM alerts WHERE id = ?;", (alert_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail=f"Alert #{alert_id} not found.")
        cur.execute("UPDATE alerts SET acknowledged = 1 WHERE id = ?;", (alert_id,))
        return True

    await execute_write_transaction_async(get_db_path(), _ack_db_logic)
    return AlertAcknowledgeResponse(
        id=alert_id,
        acknowledged=True,
        message=f"Alert #{alert_id} successfully acknowledged."
    )
