/**
 * PranaVahini API Client Service
 * Connects React frontend to FastAPI backend.
 */

const API_BASE = '/api';

async function request(endpoint, options = {}) {
  // Offline Simulation Mode for Rural Stress-Testing
  if (typeof window !== 'undefined' && window.__PRANAVAHINI_OFFLINE_SIMULATED__) {
    const offlineErr = new Error('NetworkError: Offline simulation mode active (Intermittent 2G/3G Disconnect)');
    offlineErr.status = 0;
    throw offlineErr;
  }

  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: {
      'Accept': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const res = await fetch(url, config);
    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      let message = `Request failed with status ${res.status}`;
      if (typeof errorBody.detail === 'string') {
        message = errorBody.detail;
      } else if (Array.isArray(errorBody.detail)) {
        message = errorBody.detail
          .map(d => (typeof d === 'string' ? d : d.msg ? `${d.loc ? d.loc.slice(1).join('.') + ': ' : ''}${d.msg}` : JSON.stringify(d)))
          .join('; ');
      } else if (errorBody.detail && typeof errorBody.detail === 'object') {
        message = JSON.stringify(errorBody.detail);
      } else if (errorBody.message) {
        message = errorBody.message;
      }
      const error = new Error(message);
      error.status = res.status;
      error.data = errorBody;
      throw error;
    }
    return await res.json();
  } catch (err) {
    console.error(`[API Error] ${options.method || 'GET'} ${url}:`, err);
    throw err;
  }
}

export const api = {
  // Stats & Overview
  getOverviewStats: () => request('/stats/overview'),

  // Facilities & Medicines
  getFacilities: (limit = 50) => request(`/facilities?limit=${limit}`),
  getFacilityDetail: (facilityId) => request(`/facilities/${facilityId}`),
  getMedicines: () => request('/medicines'),

  // Inventory & Stock
  getFacilityInventory: (facilityId) => request(`/inventory/${facilityId}`),
  getDepletionAnalysis: () => request('/inventory/depletion'),
  getLedgerVerification: () => request('/inventory/ledger/verify'),
  getLedgerBlocks: (limit = 50) => request(`/inventory/ledger/blocks?limit=${limit}`),
  getBatchTransactions: (batchId) => request(`/batches/${batchId}/transactions`),
  consumeStock: (payload) => request('/inventory/consume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),

  // Alerts & SSE
  getAlerts: (limit = 50) => request(`/alerts?limit=${limit}`),
  acknowledgeAlert: (alertId) => request(`/alerts/${alertId}/ack`, { method: 'POST' }),

  // Rebalancing
  getNetworkDeficits: (maxRadiusKm = 50, minDonorBufferDays = 14) =>
    request(`/rebalance/network-deficits?max_radius_km=${maxRadiusKm}&min_donor_buffer_days=${minDonorBufferDays}`),
  recommendRebalance: (payload) => request('/rebalance/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  getRebalanceRecommendation: (payload) => request('/rebalance/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  applyRebalance: (payload) => request('/rebalance/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),

  // Transfers
  getTransfers: (limit = 50) => request(`/transfers?limit=${limit}`),
  getTransferDetail: (transferId) => request(`/transfers/${transferId}`),
  approveTransfer: (transferId, payload = {}) => request(`/transfers/${transferId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  dispatchTransfer: (transferId, payload = {}) => request(`/transfers/${transferId}/dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  markInTransit: (transferId, payload = {}) => request(`/transfers/${transferId}/in-transit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  receiveTransfer: (transferId, payload = {}) => request(`/transfers/${transferId}/receive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  cancelTransfer: (transferId, payload = {}) => request(`/transfers/${transferId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  updateTransferStatus: (transferId, status) => request(`/transfers/${transferId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  }),

  // Register Scan
  getSampleRegisterImage: () => request('/inventory/scan-register/sample-image'),
  getSampleRegisterBlob: async () => {
    const res = await fetch(`${API_BASE}/inventory/scan-register/sample-image`);
    if (!res.ok) throw new Error('Failed to fetch sample register image');
    return await res.blob();
  },
  scanRegister: (formData) => {
    return fetch(`${API_BASE}/inventory/scan-register`, {
      method: 'POST',
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to process document');
      }
      return res.json();
    });
  },
  commitScannedRegister: (payload) => request('/inventory/scan-register/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),

  // AI Safety & Circuit Telemetry
  getSafetyStatus: () => request('/safety/status'),
  getSafetyViolations: (limit = 25) => request(`/safety/violations?limit=${limit}`),
  resetCircuit: async (component) => {
    try {
      return await request(`/safety/circuits/${component}/reset`, { method: 'POST' });
    } catch {
      return await request('/safety/circuit-breaker/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ component }),
      });
    }
  },

  // Crisis & Outbreak Simulation Engine
  getCrisisScenarios: () => request('/crisis/scenarios'),
  getCrisisStatus: () => request('/crisis/status'),
  triggerCrisis: (payload) => request('/crisis/trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  resetCrisis: () => request('/crisis/reset', { method: 'POST' }),
  swarmDispatchCrisis: (plans) => request('/crisis/swarm-dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(plans),
  }),

  // BRICS+ Federated Learning
  getBricsModelWeights: (category = 'Antidote') =>
    request(`/brics/model/weights?medicine_category=${encodeURIComponent(category)}`),
};

