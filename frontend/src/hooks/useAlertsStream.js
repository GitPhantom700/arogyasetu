import { useEffect, useRef, useState, useCallback } from 'react';

const MAX_SEEN_IDS = 100;

/**
 * Custom hook for resilient Server-Sent Events (SSE) connection
 * to PranaVahini's real-time alert broadcaster (/api/alerts/stream).
 * 
 * Features:
 * - Ref-stabilized callback to eliminate stale closure reconnections.
 * - Monotonic lastEventId tracking across automatic reconnects.
 * - Bounded circular deduplication cache (MAX_SEEN_IDS) preventing memory leaks.
 * - Automatic exponential/bounded backoff reconnection on network drop.
 */
export function useAlertsStream(onAlertReceived) {
  const [isConnected, setIsConnected] = useState(false);
  const [streamError, setStreamError] = useState(null);
  
  const eventSourceRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const lastEventIdRef = useRef(null);
  const seenIdsRef = useRef(new Set());
  const callbackRef = useRef(onAlertReceived);

  // Keep callback ref updated without triggering reconnection
  useEffect(() => {
    callbackRef.current = onAlertReceived;
  }, [onAlertReceived]);

  const processAlert = useCallback((rawPayload, eventId) => {
    try {
      if (eventId) {
        lastEventIdRef.current = eventId;
      }

      if (!rawPayload || !rawPayload.trim()) return;
      const alert = JSON.parse(rawPayload);

      // Deduplicate using bounded Set
      const alertId = alert.id || (alert.event_id ? String(alert.event_id) : null);
      if (alertId) {
        if (seenIdsRef.current.has(alertId)) {
          return; // Skip duplicate event
        }
        seenIdsRef.current.add(alertId);

        // Keep cache bounded to MAX_SEEN_IDS
        if (seenIdsRef.current.size > MAX_SEEN_IDS) {
          const firstItem = seenIdsRef.current.values().next().value;
          seenIdsRef.current.delete(firstItem);
        }
      }

      if (callbackRef.current) {
        callbackRef.current(alert);
      }
    } catch (err) {
      console.warn('[SSE] Failed to parse alert event payload:', err);
    }
  }, []);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const url = new URL('/api/alerts/stream', window.location.origin);
    if (lastEventIdRef.current) {
      url.searchParams.set('last_event_id', lastEventIdRef.current);
    }

    const es = new EventSource(url.toString());
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      setStreamError(null);
    };

    es.onmessage = (event) => {
      processAlert(event.data, event.lastEventId);
    };

    es.addEventListener('alert', (event) => {
      processAlert(event.data, event.lastEventId);
    });

    es.onerror = () => {
      setIsConnected(false);
      setStreamError('Connection interrupted. Reconnecting in 3s...');
      es.close();

      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };
  }, [processAlert]);

  useEffect(() => {
    connect();

    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connect]);

  return { isConnected, streamError, lastEventId: lastEventIdRef.current };
}
