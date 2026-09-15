import React from 'react';
import { UIProvider, useUI } from './UIContext';
import { AlertsProvider, useAlerts } from './AlertsContext';

export { useUI } from './UIContext';
export { useAlerts } from './AlertsContext';

/**
 * Composite AppProvider combining isolated UI state and high-frequency Alerts state.
 */
export function AppProvider({ children }) {
  return (
    <UIProvider>
      <AlertsProvider>
        {children}
      </AlertsProvider>
    </UIProvider>
  );
}

/**
 * Composite hook providing combined access for views that require both domains.
 * For performance-critical components (e.g., Sidebar or Map), use useUI() directly.
 */
export function useApp() {
  const ui = useUI();
  const alerts = useAlerts();

  return {
    ...ui,
    ...alerts,
  };
}
