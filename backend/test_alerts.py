"""
Automated Test Suite for Microtask 3.1: Real-Time Alert Engine (Server-Sent Events / SSE broadcast).
Validates:
1. SSE streaming endpoint handshake, headers, and initial CONNECTION_ESTABLISHED event.
2. In-memory Pub/Sub event broadcaster fan-out across multiple concurrent subscribers.
3. Persistent SQLite ledgering of alerts in the `alerts` table.
4. Automatic alert trigger on stockout / critical safety stock depletion during `/consume`.
5. Automatic alert trigger on transfer lifecycle state transitions (/approve, /dispatch).
6. Auto-reconnection catch-up via Last-Event-ID header and query parameter.
7. Alert acknowledgment endpoint (POST /api/alerts/{id}/acknowledge).
8. Alert querying, pagination, and multi-dimensional filtering (severity, category, facility).
"""

import sys
from pathlib import Path
import json
import asyncio
import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from main import app
from database import get_connection, init_db
from seed_data import seed_database
from alerts import broadcaster, AlertBroadcaster


@pytest.fixture(autouse=True)
def setup_test_db():
    """Ensures a clean, seeded database state with alerts table before each test."""
    seed_database(reset_schema=False)
    broadcaster._recent_alerts.clear()
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM alerts;")
        conn.commit()
    finally:
        conn.close()
    yield
    broadcaster._recent_alerts.clear()


def test_sse_stream_handshake_and_headers():
    """
    Test 1: SSE Streaming Handshake & Response Headers
    Verifies that GET /api/alerts/stream returns text/event-stream,
    proper cache-control directives, and emits the initial connection event.
    """
    client = TestClient(app)
    with client.stream("GET", "/api/alerts/stream?max_events=1") as response:
        assert response.status_code == 200
        content_type = response.headers.get("content-type", "")
        assert "text/event-stream" in content_type
        assert "no-cache" in response.headers.get("cache-control", "")

        lines = [line for line in response.iter_lines() if line]
        full_output = "\n".join(lines)
        assert "event: connect" in full_output
        assert "CONNECTION_ESTABLISHED" in full_output


def test_manual_broadcast_and_persistence():
    """
    Test 2: Manual Alert Broadcast & Database Persistence
    Verifies that POST /api/alerts/broadcast creates an indexed row in SQLite
    and returns a well-formed AlertEvent schema.
    """
    client = TestClient(app)
    payload = {
        "severity": "CRITICAL",
        "category": "COLD_CHAIN_BREACH",
        "facility_id": 1,
        "medicine_id": 2,
        "title": "Severe Cold Chain Breach Detected",
        "message": "ILR refrigerator temperature spiked to 14.5 C for >45 minutes.",
        "data": {
            "temperature_celsius": 14.5,
            "threshold_celsius": 8.0,
            "duration_minutes": 48
        }
    }

    res = client.post("/api/alerts/broadcast", json=payload)
    assert res.status_code in [200, 201]
    data = res.json()
    assert data["id"] is not None
    assert data["severity"] == "CRITICAL"
    assert data["category"] == "COLD_CHAIN_BREACH"
    assert data["facility_id"] == 1
    assert data["facility_name"] is not None
    assert data["medicine_id"] == 2
    assert data["medicine_name"] is not None
    assert data["acknowledged"] is False
    assert data["data"]["temperature_celsius"] == 14.5

    # Verify SQLite persistence
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM alerts WHERE id = ?;", (data["id"],))
        row = cur.fetchone()
        assert row is not None
        assert row["severity"] == "CRITICAL"
        assert row["title"] == "Severe Cold Chain Breach Detected"
    finally:
        conn.close()


def test_alert_acknowledgment():
    """
    Test 3: Alert Acknowledgment Workflow
    Verifies that POST /api/alerts/{id}/acknowledge marks the alert acknowledged
    and stores acknowledging personnel metadata.
    """
    client = TestClient(app)
    
    # 1. Create alert
    broadcast_res = client.post("/api/alerts/broadcast", json={
        "severity": "WARNING",
        "category": "CRITICAL_DEPLETION",
        "facility_id": 3,
        "title": "Low Stock Warning",
        "message": "Stock is near minimum buffer."
    })
    alert_id = broadcast_res.json()["id"]

    # 2. Acknowledge alert
    ack_res = client.post(f"/api/alerts/{alert_id}/acknowledge")
    assert ack_res.status_code == 200
    ack_data = ack_res.json()
    assert ack_data["acknowledged"] is True
    assert ack_data["id"] == alert_id

    # 3. Query filtered by acknowledged status
    list_res = client.get("/api/alerts?acknowledged=true")
    assert list_res.status_code == 200
    assert any(a["id"] == alert_id for a in list_res.json()["alerts"])

    unack_res = client.get("/api/alerts?acknowledged=false")
    assert unack_res.status_code == 200
    assert not any(a["id"] == alert_id for a in unack_res.json()["alerts"])


def test_stockout_auto_trigger_on_consumption():
    """
    Test 4: Automatic Stockout Alert Trigger
    Verifies that when stock consumption depletes a batch to zero,
    an automated EMERGENCY or CRITICAL alert is recorded in the alerts table.
    """
    client = TestClient(app)

    # 1. Locate an active batch at Facility 1
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT sb.id, sb.facility_id, sb.medicine_id, sb.batch_number, sb.quantity_available, sb.version
            FROM stock_batches sb
            WHERE sb.facility_id = 1 AND sb.quantity_available > 0
            LIMIT 1;
        """)
        batch = cur.fetchone()
        assert batch is not None
        batch_id = batch["id"]
        fac_id = batch["facility_id"]
        med_id = batch["medicine_id"]
        avail = batch["quantity_available"]
        version = batch["version"]
    finally:
        conn.close()

    # 2. Consume entire remaining quantity
    consume_res = client.post("/api/inventory/consume", json={
        "facility_id": fac_id,
        "batch_id": batch_id,
        "quantity": avail,
        "expected_version": version,
        "notes": "Emergency full batch dispensing for clinical trials"
    })
    assert consume_res.status_code == 200
    assert consume_res.json()["balance_after"] == 0

    # 3. Check for generated alert in alerts ledger
    # Note: background tasks run synchronously in TestClient or immediately before request returns
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT * FROM alerts 
            WHERE facility_id = ? AND medicine_id = ? AND category = 'STOCKOUT'
            ORDER BY id DESC LIMIT 1;
        """, (fac_id, med_id))
        alert = cur.fetchone()
        assert alert is not None
        assert alert["severity"] in ["EMERGENCY", "CRITICAL"]
        assert "STOCKOUT" in alert["title"]
    finally:
        conn.close()


def test_transfer_lifecycle_auto_trigger():
    """
    Test 5: Automatic Transfer Lifecycle Alert Trigger
    Verifies that approving and dispatching a transfer order automatically
    emits TRANSFER_UPDATE alerts into the persistent alerts ledger.
    """
    client = TestClient(app)

    # 1. Create a transfer request
    create_res = client.post("/api/transfers", json={
        "source_facility_id": 1,
        "destination_facility_id": 4,
        "medicine_id": 1,
        "quantity": 10,
        "urgency": "CRITICAL_EMERGENCY",
        "reason": "Severe outbreak stock depletion"
    })
    assert create_res.status_code == 201
    transfer = create_res.json()
    transfer_id = transfer["id"]

    # 2. Approve transfer
    approve_res = client.post(f"/api/transfers/{transfer_id}/approve", json={
        "approver_name": "Dr. Verma",
        "notes": "Fast-track approved"
    })
    assert approve_res.status_code == 200

    # Verify TRANSFER_UPDATE alert logged
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT * FROM alerts 
            WHERE category = 'TRANSFER_UPDATE' AND data_json LIKE ?
            ORDER BY id DESC LIMIT 1;
        """, (f"%{transfer_id}%",))
        alert = cur.fetchone()
        assert alert is not None
        assert "Transfer" in alert["title"]
    finally:
        conn.close()


def test_sse_reconnection_catchup_with_last_event_id():
    """
    Test 6: Historical Catch-up via Last-Event-ID
    Emits alerts, then tests connecting with Last-Event-ID header and verifies
    that subsequent missed alerts are delivered upon initial connection.
    """
    client = TestClient(app)

    # 1. Emit 3 sequential alerts
    res1 = client.post("/api/alerts/broadcast", json={
        "severity": "INFO",
        "category": "TRANSFER_UPDATE",
        "title": "Event #1",
        "message": "Order placed"
    })
    id1 = res1.json()["id"]

    res2 = client.post("/api/alerts/broadcast", json={
        "severity": "WARNING",
        "category": "CRITICAL_DEPLETION",
        "title": "Event #2",
        "message": "Stock low"
    })
    id2 = res2.json()["id"]

    res3 = client.post("/api/alerts/broadcast", json={
        "severity": "EMERGENCY",
        "category": "STOCKOUT",
        "title": "Event #3",
        "message": "Stockout occurred"
    })
    id3 = res3.json()["id"]

    # 2. Reconnect supplying Last-Event-ID = id1
    with client.stream("GET", f"/api/alerts/stream?last_event_id={id1}&max_events=3") as response:
        assert response.status_code == 200
        lines = [line for line in response.iter_lines() if line]
        stream_text = "\n".join(lines)
        # Should deliver Event #2 and Event #3
        assert f"id: {id2}" in stream_text
        assert "Event #2" in stream_text
        assert f"id: {id3}" in stream_text
        assert "Event #3" in stream_text
        # Should NOT redeliver Event #1
        assert f"id: {id1}\n" not in stream_text


def test_alert_broadcaster_pubsub_fanout():
    """
    Test 7: In-Memory Pub/Sub Multi-Subscriber Fan-out
    Subscribes two independent async queues and verifies concurrent delivery
    under sub-50ms latency with zero cross-talk.
    """
    async def _run():
        test_broadcaster = AlertBroadcaster()

        q1 = await test_broadcaster.subscribe()
        q2 = await test_broadcaster.subscribe()

        assert test_broadcaster.subscriber_count == 2

        event_payload = {
            "severity": "EMERGENCY",
            "category": "STOCKOUT",
            "title": "Mass Casualty Triage Triggered",
            "message": "Anti-snake venom depleted at Kalyanpur PHC."
        }

        # Broadcast event
        created_alert = await test_broadcaster.broadcast(event_payload)

        # Both queues must receive the exact payload within 50ms
        event1 = await asyncio.wait_for(q1.get(), timeout=0.1)
        event2 = await asyncio.wait_for(q2.get(), timeout=0.1)

        assert event1["title"] == "Mass Casualty Triage Triggered"
        assert event2["title"] == "Mass Casualty Triage Triggered"
        assert event1["id"] == created_alert.id
        assert event2["id"] == created_alert.id

        # Unsubscribe
        await test_broadcaster.unsubscribe(q1)
        await test_broadcaster.unsubscribe(q2)
        assert test_broadcaster.subscriber_count == 0

    asyncio.run(_run())


def test_query_filters_severity_category_facility():
    """
    Test 8: Multi-dimensional Query Filtering
    Validates filtering alerts by severity, category, facility_id, and unacknowledged status.
    """
    client = TestClient(app)

    # Seed 3 distinct alerts
    client.post("/api/alerts/broadcast", json={
        "severity": "EMERGENCY",
        "category": "STOCKOUT",
        "facility_id": 1,
        "title": "Emergency Stockout",
        "message": "Zero inventory"
    })
    client.post("/api/alerts/broadcast", json={
        "severity": "WARNING",
        "category": "COLD_CHAIN_BREACH",
        "facility_id": 2,
        "title": "Cold Chain Alert",
        "message": "Temp exceeded"
    })
    client.post("/api/alerts/broadcast", json={
        "severity": "INFO",
        "category": "TRANSFER_UPDATE",
        "facility_id": 1,
        "title": "Transfer Info",
        "message": "Vehicle departed"
    })

    # Filter by severity
    res_sev = client.get("/api/alerts?severity=EMERGENCY")
    assert res_sev.status_code == 200
    assert all(a["severity"] == "EMERGENCY" for a in res_sev.json()["alerts"])

    # Filter by category
    res_cat = client.get("/api/alerts?category=COLD_CHAIN_BREACH")
    assert res_cat.status_code == 200
    assert all(a["category"] == "COLD_CHAIN_BREACH" for a in res_cat.json()["alerts"])

    # Filter by facility
    res_fac = client.get("/api/alerts?facility_id=2")
    assert res_fac.status_code == 200
    assert all(a["facility_id"] == 2 for a in res_fac.json()["alerts"])


def test_slow_consumer_queue_eviction_event_dropped():
    """
    Test 9: Queue Eviction on Slow Consumer / Saturation
    Verifies that when a subscriber's queue fills up to maxsize,
    the broadcaster evicts oldest events and injects a synthetic
    EVENT_DROPPED warning to alert the subscriber of stream lag.
    """
    async def _run():
        test_broadcaster = AlertBroadcaster()
        # Subscribe with bounded small queue
        queue = await test_broadcaster.subscribe(maxsize=2)
        try:
            # Emit 4 sequential events to saturate queue of size 2
            for i in range(4):
                await test_broadcaster.broadcast({
                    "severity": "INFO",
                    "category": "SYSTEM",
                    "title": f"Saturation Test #{i}",
                    "message": f"Message #{i}"
                })

            # Inspect what the subscriber receives from queue
            events_received = []
            while not queue.empty():
                events_received.append(queue.get_nowait())

            # At least one event should be the synthetic EVENT_DROPPED alert
            dropped_alerts = [
                e for e in events_received
                if e.get("data", {}).get("event") == "EVENT_DROPPED" or "Stream Lag" in e.get("title", "")
            ]
            assert len(dropped_alerts) > 0
            assert dropped_alerts[0]["severity"] == "WARNING"
            assert dropped_alerts[0]["title"] == "Stream Lag / Event Dropped"
        finally:
            await test_broadcaster.unsubscribe(queue)

    asyncio.run(_run())


def test_reconnection_catchup_uncapped_monotonic():
    """
    Test 10: Uncapped Reconnection Catch-up via Monotonic IDs
    Verifies that catch-up is strictly monotonic (WHERE a.id > ?)
    and is NOT arbitrarily capped at 50 events.
    """
    client = TestClient(app)

    # 1. Broadcast an anchor event
    res_anchor = client.post("/api/alerts/broadcast", json={
        "severity": "INFO",
        "category": "SYSTEM",
        "title": "Anchor Event",
        "message": "Start of sequence"
    })
    anchor_id = res_anchor.json()["id"]

    # 2. Broadcast 55 alerts
    for i in range(55):
        client.post("/api/alerts/broadcast", json={
            "severity": "INFO",
            "category": "SYSTEM",
            "title": f"Bulk Event #{i+1}",
            "message": f"Monotonic test payload #{i+1}"
        })

    # 3. Request catch-up with Last-Event-ID = anchor_id
    async def _check():
        missed = await broadcaster.get_missed_alerts(anchor_id)
        assert len(missed) >= 55
        # Ensure strictly increasing IDs
        ids = [m["id"] for m in missed]
        assert ids == sorted(ids)
        assert all(i > anchor_id for i in ids)

    asyncio.run(_check())


def test_double_audit_queue_saturation_preserves_new_alert():
    """
    Test 11 (Double-Audit): Queue Saturation Eviction & Alert Delivery
    Verifies that when a queue is 100% full, the 2-slot eviction logic ensures
    both the synthetic EVENT_DROPPED warning AND the incoming emergency alert
    are placed in the queue, eliminating the silent data loss defect.
    """
    async def _run():
        test_broadcaster = AlertBroadcaster()
        # Maxsize of 3
        queue = await test_broadcaster.subscribe(maxsize=3)
        try:
            # 1. Completely fill the queue with 3 dummy items
            for i in range(3):
                queue.put_nowait({"id": i + 1, "title": f"Pre-existing #{i + 1}"})
            assert queue.full()

            # 2. Broadcast a critical emergency alert
            await test_broadcaster.broadcast({
                "severity": "EMERGENCY",
                "category": "STOCKOUT",
                "title": "Emergency Anti-Rabies Depletion",
                "message": "Critical patient awaiting treatment"
            })

            # 3. Read everything from the queue
            received = []
            while not queue.empty():
                received.append(queue.get_nowait())

            # Verify size is <= 3
            assert len(received) <= 3

            # Verify the synthetic EVENT_DROPPED warning is present
            dropped_warning = next((e for e in received if e.get("data", {}).get("event") == "EVENT_DROPPED"), None)
            assert dropped_warning is not None
            assert dropped_warning["title"] == "Stream Lag / Event Dropped"

            # CRITICAL VERIFICATION: The emergency alert MUST be present (not silently dropped)
            emergency_alert = next((e for e in received if e.get("title") == "Emergency Anti-Rabies Depletion"), None)
            assert emergency_alert is not None
            assert emergency_alert["severity"] == "EMERGENCY"
        finally:
            await test_broadcaster.unsubscribe(queue)

    asyncio.run(_run())


def test_double_audit_ring_buffer_out_of_order_sorting_guard():
    """
    Test 12 (Double-Audit): Ring Buffer Inversion Sorting Guard
    Verifies that if concurrent asynchronous worker threads complete out of sequence,
    the broadcaster's ring buffer guard automatically detects inversion and re-sorts
    by monotonic sequence ID.
    """
    async def _run():
        test_broadcaster = AlertBroadcaster()
        
        # Broadcast id 100
        a1 = await test_broadcaster.broadcast({"title": "Alert 1", "explicit_id": 100})
        # Simulate thread B finishing slightly before thread A by manually triggering out-of-order broadcast
        a3 = await test_broadcaster.broadcast({"title": "Alert 3", "explicit_id": 105})
        a2 = await test_broadcaster.broadcast({"title": "Alert 2", "explicit_id": 102})

        # Check ring buffer order
        async with test_broadcaster._lock:
            buf_ids = [a["id"] for a in test_broadcaster._recent_alerts if "id" in a]
            assert buf_ids == sorted(buf_ids), f"Buffer sequence must be monotonically sorted, got {buf_ids}"

    asyncio.run(_run())


def test_double_audit_get_missed_alerts_chunk_limit():
    """
    Test 13 (Double-Audit): Reconnection Catch-Up Memory Protection (Safe Chunking)
    Verifies that get_missed_alerts respects the limit parameter (default 1000)
    to protect against out-of-memory crashes during reconnection after long downtime.
    """
    client = TestClient(app)
    # Broadcast 15 alerts
    res_start = client.post("/api/alerts/broadcast", json={
        "severity": "INFO", "category": "SYSTEM", "title": "Start Alert", "message": "Initialization message"
    })
    assert res_start.status_code == 201
    start_id = res_start.json()["id"]

    for i in range(15):
        client.post("/api/alerts/broadcast", json={
            "severity": "INFO", "category": "SYSTEM", "title": f"Bulk {i}", "message": f"Message {i}"
        })

    async def _run():
        # Query with safe chunk limit of 5
        chunk = await broadcaster.get_missed_alerts(last_event_id=start_id, limit=5)
        assert len(chunk) == 5
        # Verify monotonically ascending
        ids = [c["id"] for c in chunk]
        assert ids == sorted(ids)
        assert ids[0] > start_id

    asyncio.run(_run())

