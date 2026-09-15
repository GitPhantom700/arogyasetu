import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api } from '../services/api';
import { useAlertsStream } from '../hooks/useAlertsStream';

import { useUI } from './UIContext';

const AlertsContext = createContext(null);
const MAX_ALERTS = 50;

export function AlertsProvider({ children }) {
  const [alerts, setAlerts] = useState([]);
  const [toasts, setToasts] = useState([]);
  const { updateFacilityStatus } = useUI();

  const MAX_CONCURRENT_TOASTS = 5;

  // Toast dispatcher with bounded queue ceiling (max 5) and auto-dismiss
  const showToast = useCallback((message, type = 'info', title = null) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev.slice(-(MAX_CONCURRENT_TOASTS - 1)), { id, message, type, title }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  // Real-time SSE alert handler with bounded circular buffer (MAX_ALERTS = 50)
  const handleNewAlert = useCallback((newAlert) => {
    setAlerts(prev => {
      // Prepend and bound to MAX_ALERTS
      const updated = [newAlert, ...prev];
      return updated.slice(0, MAX_ALERTS);
    });

    // Real-time spatial pin reactivity
    if (newAlert.facility_id) {
      if (newAlert.severity === 'CRITICAL' || newAlert.severity === 'STOCKOUT') {
        updateFacilityStatus(newAlert.facility_id, 'CRITICAL');
      } else if (newAlert.severity === 'WARNING') {
        updateFacilityStatus(newAlert.facility_id, 'WARNING');
      }
    }

    const isCritical = newAlert.severity === 'CRITICAL' || newAlert.severity === 'STOCKOUT';
    showToast(
      `${newAlert.facility_name || 'Facility'}: ${newAlert.message || 'Stock event recorded'}`,
      isCritical ? 'critical' : 'warning',
      `🚨 ${newAlert.severity || 'ALERT'}`
    );
  }, [showToast, updateFacilityStatus]);

  const { isConnected: isSSEConnected } = useAlertsStream(handleNewAlert);

  // Initial fetch of recent alerts
  useEffect(() => {
    api.getAlerts()
      .then(data => {
        const rawAlerts = data.alerts || data || [];
        setAlerts(Array.isArray(rawAlerts) ? rawAlerts.slice(0, MAX_ALERTS) : []);
      })
      .catch(err => {
        console.warn('[AlertsContext] Could not fetch alert history:', err);
      });

    const onCustomToast = (e) => {
      if (e.detail) {
        showToast(e.detail.message, e.detail.type, e.detail.title);
      }
    };
    window.addEventListener('arogya_toast', onCustomToast);
    return () => window.removeEventListener('arogya_toast', onCustomToast);
  }, [showToast]);

  const acknowledgeAlert = useCallback(async (alertId) => {
    try {
      await api.acknowledgeAlert(alertId);
      setAlerts(prev => prev.map(a => (a.id === alertId ? { ...a, is_acknowledged: true } : a)));
      showToast('Alert acknowledged', 'success');
    } catch (err) {
      console.error('[AlertsContext] Failed to acknowledge alert:', err);
      showToast('Failed to acknowledge alert', 'error');
    }
  }, [showToast]);

  const unreadAlertsCount = alerts.filter(a => !a.is_acknowledged).length;

  const value = {
    alerts,
    unreadAlertsCount,
    isSSEConnected,
    toasts,
    showToast,
    addToast: showToast,
    acknowledgeAlert,
  };

  return (
    <AlertsContext.Provider value={value}>
      {children}
    </AlertsContext.Provider>
  );
}

export function useAlerts() {
  const context = useContext(AlertsContext);
  if (!context) {
    throw new Error('useAlerts must be used within an AlertsProvider');
  }
  return context;
}
