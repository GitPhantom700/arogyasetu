/**
 * ArogyaSetu — Modern Public Health Logistics Command Center
 * Pure Vanilla JavaScript Client Application
 */

const API_BASE = '/api';

// Global Application State
const appState = {
  facilities: [],
  medicines: [],
  transfers: [],
  alerts: [],
  stats: null,
  activeTab: 'transfers-tab',
  eventSource: null
};

// Speed lookup per terrain (km/h)
const TERRAIN_SPEEDS = {
  'GHAT_MOUNTAIN': 25.0,
  'PLAINS': 45.0,
  'HIGHWAY_CORRIDOR': 65.0
};

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  await loadAllData();
  await loadAlertsHistory();
  await loadSafetyTelemetry();
  initSSE();
  // Auto-refresh transfers every 15 seconds
  setInterval(refreshTransfersOnly, 15000);
}

// Data Fetching
async function loadAllData() {
  try {
    const [facRes, medRes, trfRes, statsRes] = await Promise.all([
      fetch(`${API_BASE}/facilities?limit=50`).then(r => r.json()),
      fetch(`${API_BASE}/medicines`).then(r => r.json()),
      fetch(`${API_BASE}/transfers?limit=50`).then(r => r.json()),
      fetch(`${API_BASE}/stats/overview`).then(r => r.json()).catch(() => null)
    ]);

    appState.facilities = Array.isArray(facRes) ? facRes : (facRes.facilities || facRes.items || []);
    appState.medicines = Array.isArray(medRes) ? medRes : (medRes.medicines || medRes.items || []);
    appState.transfers = Array.isArray(trfRes) ? trfRes : (trfRes.transfers || trfRes.items || []);
    appState.stats = statsRes;

    updateHeaderStats();
    populateDropdowns();
    renderTransfers();
    renderFacilitiesInventory();
    onFacilityOrMedicineChanged(); // Initial preview calculation
  } catch (err) {
    console.error("Error loading network data:", err);
    showToast("Failed to connect to backend server. Make sure API is running.", "error");
  }
}

async function refreshTransfersOnly() {
  try {
    const trfRes = await fetch(`${API_BASE}/transfers?limit=50`).then(r => r.json());
    appState.transfers = Array.isArray(trfRes) ? trfRes : (trfRes.transfers || trfRes.items || []);
    renderTransfers();
  } catch (err) {
    console.warn("Auto-refresh failed:", err);
  }
}

function updateHeaderStats() {
  const facCount = document.getElementById('stat-facilities-count');
  const medCount = document.getElementById('stat-medicines-count');
  const batchCount = document.getElementById('stat-batches-count');
  const counterBadge = document.getElementById('transfers-counter');

  if (facCount) facCount.textContent = `${appState.facilities.length} Facilities`;
  if (medCount) medCount.textContent = `${appState.medicines.length} Medicines`;
  if (batchCount && appState.stats) batchCount.textContent = `${appState.stats.total_batches || 165} Batches`;
  if (counterBadge) counterBadge.textContent = appState.transfers.length;
}

// Populate Dropdown Menus in Transfer Wizard
function populateDropdowns() {
  const srcSelect = document.getElementById('src-facility');
  const destSelect = document.getElementById('dest-facility');
  const medSelect = document.getElementById('med-select');

  if (!srcSelect || !destSelect || !medSelect) return;

  // Clear existing options
  srcSelect.innerHTML = '<option value="">-- Select Donor Facility (e.g., District Hospital Aundh) --</option>';
  destSelect.innerHTML = '<option value="">-- Select Recipient Facility (e.g., Kalyanpur PHC) --</option>';
  medSelect.innerHTML = '<option value="">-- Select Medicine --</option>';

  // Sort facilities: DH & CHC first, then PHC, SC
  const sortedFacilities = [...appState.facilities].sort((a, b) => {
    const tierPriority = { 'DH': 1, 'SDH': 2, 'CHC': 3, 'PHC': 4, 'SC': 5 };
    return (tierPriority[a.tier] || 99) - (tierPriority[b.tier] || 99);
  });

  sortedFacilities.forEach(f => {
    const isSurplus = (f.tier === 'DH' || f.tier === 'CHC');
    const badgeText = isSurplus ? ' [SURPLUS HUB]' : '';
    
    const optSrc = document.createElement('option');
    optSrc.value = f.id;
    optSrc.textContent = `${f.name} (${f.tier}) - ${f.district}${badgeText}`;
    srcSelect.appendChild(optSrc);

    const optDest = document.createElement('option');
    optDest.value = f.id;
    optDest.textContent = `${f.name} (${f.tier}) - ${f.district}`;
    destSelect.appendChild(optDest);
  });

  // Medicines
  appState.medicines.forEach(m => {
    const optMed = document.createElement('option');
    optMed.value = m.id;
    optMed.textContent = `${m.name} (${m.unit}) ${m.is_emergency ? '🚨 EMERGENCY' : ''}`;
    medSelect.appendChild(optMed);
  });

  // Populate scan facility dropdown
  const scanFacSelect = document.getElementById('scan-facility-select');
  if (scanFacSelect) {
    scanFacSelect.innerHTML = '<option value="">-- Select Receiving Facility --</option>';
    sortedFacilities.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = `${f.name} (${f.tier}) - ${f.district}`;
      scanFacSelect.appendChild(opt);
    });
  }

  // Sensible Defaults: Donor = District Hospital Aundh, Recipient = Kalyanpur PHC, Med = ASV
  const aundh = appState.facilities.find(f => f.facility_code === 'DH-PUN-01' || f.name.includes('Aundh'));
  const kalyanpur = appState.facilities.find(f => f.facility_code === 'PHC-PUN-01' || f.name.includes('Kalyanpur'));
  const asv = appState.medicines.find(m => m.sku === 'MED-ASV-01' || m.name.includes('Snake'));

  if (aundh) srcSelect.value = aundh.id;
  if (kalyanpur) {
    destSelect.value = kalyanpur.id;
    if (scanFacSelect) scanFacSelect.value = kalyanpur.id;
  }
  if (asv) medSelect.value = asv.id;

  // Populate Autonomous Rebalance dropdowns
  const rebRecipientSelect = document.getElementById('rebalance-recipient-select');
  const rebMedSelect = document.getElementById('rebalance-medicine-select');
  if (rebRecipientSelect && rebMedSelect) {
    rebRecipientSelect.innerHTML = '<option value="">-- Select Recipient Facility --</option>';
    sortedFacilities.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = `${f.name} (${f.tier}) - ${f.district}`;
      rebRecipientSelect.appendChild(opt);
    });

    rebMedSelect.innerHTML = '<option value="">-- Select Medicine --</option>';
    appState.medicines.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.name} (${m.unit}) ${m.is_emergency ? '🚨 EMERGENCY' : ''}`;
      rebMedSelect.appendChild(opt);
    });

    if (kalyanpur) rebRecipientSelect.value = kalyanpur.id;
    if (asv) rebMedSelect.value = asv.id;
  }
}

// Distance & Route Live Calculation Preview
function onFacilityOrMedicineChanged() {
  const srcId = parseInt(document.getElementById('src-facility')?.value, 10);
  const destId = parseInt(document.getElementById('dest-facility')?.value, 10);
  const medId = parseInt(document.getElementById('med-select')?.value, 10);

  const src = appState.facilities.find(f => f.id === srcId);
  const dest = appState.facilities.find(f => f.id === destId);
  const med = appState.medicines.find(m => m.id === medId);

  // Update Preview Node Cards
  const pSrcName = document.getElementById('preview-src-name');
  const pSrcTier = document.getElementById('preview-src-tier');
  const pDestName = document.getElementById('preview-dest-name');
  const pDestTier = document.getElementById('preview-dest-tier');
  const pTerrain = document.getElementById('preview-terrain-badge');
  const pDist = document.getElementById('preview-distance');
  const pTransit = document.getElementById('preview-transit-time');
  const pSpeedDesc = document.getElementById('preview-speed-desc');

  if (src && pSrcName && pSrcTier) {
    pSrcName.textContent = src.name;
    pSrcTier.textContent = `Tier: ${src.tier} • Terrain: ${src.terrain_type}`;
  }
  if (dest && pDestName && pDestTier) {
    pDestName.textContent = dest.name;
    pDestTier.textContent = `Tier: ${dest.tier} • Terrain: ${dest.terrain_type}`;
  }

  if (src && dest && pDist && pTransit && pTerrain) {
    if (src.id === dest.id) {
      pDist.textContent = "0.0 km";
      pTransit.textContent = "0.08 hrs";
      pTerrain.textContent = "Intra-facility";
      if (pSpeedDesc) pSpeedDesc.textContent = "Internal campus trolley move";
      return;
    }

    const distKm = calculateHaversine(src.latitude, src.longitude, dest.latitude, dest.longitude);
    const bottleneckSpeed = Math.min(
      TERRAIN_SPEEDS[src.terrain_type] || 45.0,
      TERRAIN_SPEEDS[dest.terrain_type] || 45.0
    );

    let bottleneckTerrain = "PLAINS";
    if (src.terrain_type === 'GHAT_MOUNTAIN' || dest.terrain_type === 'GHAT_MOUNTAIN') {
      bottleneckTerrain = "GHAT_MOUNTAIN (Sahyadri Ghats)";
    } else if (src.terrain_type === 'HIGHWAY_CORRIDOR' && dest.terrain_type === 'HIGHWAY_CORRIDOR') {
      bottleneckTerrain = "HIGHWAY_CORRIDOR";
    }

    const estHours = Math.round((distKm / bottleneckSpeed) * 100) / 100;

    pDist.textContent = `${distKm.toFixed(1)} km`;
    pTransit.textContent = `${estHours.toFixed(2)} hrs (~${Math.round(estHours * 60)} mins)`;
    pTerrain.textContent = `${bottleneckTerrain} (${bottleneckSpeed} km/h)`;
    if (pSpeedDesc) pSpeedDesc.textContent = `Impedance limited by ${bottleneckTerrain}`;
  }

  // Stock check hint at source facility
  if (src && med) {
    fetchStockAvailability(src.id, med.id);
  }
}

async function fetchStockAvailability(facilityId, medicineId) {
  try {
    const res = await fetch(`${API_BASE}/inventory/${facilityId}`).then(r => r.json());
    const stockHint = document.getElementById('src-stock-hint');
    const maxHint = document.getElementById('med-qty-max-hint');
    const qtyInput = document.getElementById('med-qty');

    const item = (res.inventory || []).find(i => i.medicine_id === medicineId);
    const available = item ? item.total_quantity : 0;

    if (stockHint) {
      stockHint.innerHTML = `Available stock at donor: <strong style="color: ${available > 0 ? '#34d399' : '#fb7185'}">${available} units</strong>`;
    }
    if (maxHint) {
      maxHint.textContent = `Max available: ${available} units`;
    }
    if (qtyInput && available > 0 && parseInt(qtyInput.value, 10) > available) {
      qtyInput.value = Math.min(10, available);
    }
  } catch (e) {
    console.warn("Failed to fetch facility stock hint:", e);
  }
}

function calculateHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371.0;
  const dLat = (lat2 - lat1) * Math.PI / 180.0;
  const dLon = (lon2 - lon1) * Math.PI / 180.0;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180.0) * Math.cos(lat2 * Math.PI / 180.0) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Tab Switching
function switchToTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

  const targetPanel = document.getElementById(tabId);
  const targetTab = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);

  if (targetPanel) targetPanel.classList.add('active');
  if (targetTab) targetTab.classList.add('active');

  appState.activeTab = tabId;
  if (tabId === 'transfers-tab') {
    renderTransfers();
  } else if (tabId === 'rebalance-tab') {
    scanLiveNetworkDeficits();
    onRebalanceSelectionChanged();
  }
}

// Render Active Transfers List
function renderTransfers() {
  const container = document.getElementById('transfers-container');
  if (!container) return;

  const filterStatus = document.getElementById('filter-status')?.value || '';
  const filterSearch = (document.getElementById('filter-search')?.value || '').toLowerCase();

  let filtered = [...appState.transfers];

  if (filterStatus) {
    filtered = filtered.filter(t => t.status === filterStatus);
  }
  if (filterSearch) {
    filtered = filtered.filter(t => 
      t.transfer_code.toLowerCase().includes(filterSearch) ||
      ((t.source_facility_name || t.source_facility?.name || '').toLowerCase().includes(filterSearch)) ||
      ((t.destination_facility_name || t.destination_facility?.name || '').toLowerCase().includes(filterSearch)) ||
      ((t.medicine_name || t.medicine?.name || '').toLowerCase().includes(filterSearch))
    );
  }

  // Update badge counter
  const counterBadge = document.getElementById('transfers-counter');
  if (counterBadge) counterBadge.textContent = appState.transfers.length;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 3rem 1.5rem;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5" style="margin: 0 auto 1rem;">
          <rect x="1" y="3" width="15" height="13"/>
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
          <circle cx="5.5" cy="18.5" r="2.5"/>
          <circle cx="18.5" cy="18.5" r="2.5"/>
        </svg>
        <h3 style="color: #cbd5e1; margin-bottom: 0.5rem;">No Transfers Found</h3>
        <p style="color: #94a3b8; font-size: 0.9rem; max-width: 400px; margin: 0 auto 1.5rem;">
          ${appState.transfers.length === 0 
            ? 'There are no active inter-PHC transfers currently in the system.' 
            : 'No transfers match your filter criteria.'}
        </p>
        <button class="btn btn-primary btn-sm" onclick="switchToTab('wizard-tab')">Create Transfer Now</button>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(t => createTransferCardHTML(t)).join('');
}

function filterTransfers() {
  renderTransfers();
}

// Generate Individual Transfer Card HTML with Visual Stepper
function createTransferCardHTML(t) {
  const isReturn = (t.status === 'RETURN_IN_PROGRESS' || t.status === 'RETURNED');
  const isCancelled = (t.status === 'CANCELLED');

  const steps = [
    { key: 'DRAFT', label: '1. Draft' },
    { key: 'APPROVED', label: '2. Stock Reserved' },
    { key: 'DISPATCHED', label: '3. Dispatched' },
    { key: 'IN_TRANSIT', label: '4. En Route' },
    { key: 'RECEIVED', label: '5. Delivered' }
  ];

  const statusOrder = ['DRAFT', 'APPROVED', 'DISPATCHED', 'IN_TRANSIT', 'RECEIVED'];
  const currentIndex = statusOrder.indexOf(t.status);

  const stepperHTML = isReturn ? `
    <div class="stepper-container">
      <div class="stepper">
        <div class="step-item completed">
          <div class="step-circle">✓</div>
          <div class="step-label">Dispatched</div>
        </div>
        <div class="step-item ${t.status === 'RETURN_IN_PROGRESS' ? 'active' : 'completed'}">
          <div class="step-circle">${t.status === 'RETURN_IN_PROGRESS' ? '↩' : '✓'}</div>
          <div class="step-label">Return En Route</div>
        </div>
        <div class="step-item ${t.status === 'RETURNED' ? 'completed' : ''}">
          <div class="step-circle">🏁</div>
          <div class="step-label">Received at Dock</div>
        </div>
      </div>
    </div>
  ` : isCancelled ? `
    <div style="background: rgba(148, 163, 184, 0.1); border-radius: 8px; padding: 0.6rem 1rem; margin: 1rem 0; font-size: 0.85rem; color: #94a3b8;">
      ⚠️ <strong>Transfer Cancelled:</strong> Stock reservation reversed. Reason: <em>${t.cancellation_reason || 'Administrative cancellation'}</em>
    </div>
  ` : `
    <div class="stepper-container">
      <div class="stepper">
        ${steps.map((step, idx) => {
          const isCompleted = currentIndex > idx;
          const isActive = currentIndex === idx;
          return `
            <div class="step-item ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}">
              <div class="step-circle">${isCompleted ? '✓' : (idx + 1)}</div>
              <div class="step-label">${step.label}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  // Action Buttons based on state
  let actionButtonsHTML = '';
  if (t.status === 'DRAFT') {
    actionButtonsHTML = `
      <button class="btn btn-primary btn-sm" onclick="executeTransferAction(${t.id}, 'approve')">
        Approve & Soft-Reserve Stock
      </button>
      <button class="btn btn-outline btn-sm" onclick="promptCancelTransfer(${t.id})">
        Cancel Request
      </button>
    `;
  } else if (t.status === 'APPROVED') {
    actionButtonsHTML = `
      <button class="btn btn-primary btn-sm" onclick="executeTransferAction(${t.id}, 'dispatch')">
        Dispatch Vehicle & Medicines
      </button>
      <button class="btn btn-outline btn-sm" onclick="promptCancelTransfer(${t.id})">
        Cancel & Rollback Reservation
      </button>
    `;
  } else if (t.status === 'DISPATCHED') {
    actionButtonsHTML = `
      <button class="btn btn-primary btn-sm" onclick="executeTransferAction(${t.id}, 'in-transit')">
        Driver Departure (Mark En Route)
      </button>
      <button class="btn btn-danger btn-sm" onclick="promptAbortTransfer(${t.id})">
        Abort Departure
      </button>
    `;
  } else if (t.status === 'IN_TRANSIT') {
    actionButtonsHTML = `
      <button class="btn btn-success btn-sm" onclick="promptReceiveTransfer(${t.id}, ${t.quantity})">
        Confirm Physical Arrival & Receive Stock
      </button>
      <button class="btn btn-danger btn-sm" onclick="promptAbortTransfer(${t.id})">
        Report Roadblock / Abort Return
      </button>
    `;
  } else if (t.status === 'RETURN_IN_PROGRESS') {
    actionButtonsHTML = `
      <button class="btn btn-warning btn-sm" onclick="promptReceiveReturn(${t.id}, ${t.quantity})">
        Receive Returned Goods at Donor Dock
      </button>
    `;
  } else if (t.status === 'RECEIVED') {
    actionButtonsHTML = `
      <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399;">
        ✓ Stock Confirmed in Inventory • SHA-256 Verified
      </span>
    `;
  } else if (t.status === 'RETURNED') {
    actionButtonsHTML = `
      <span class="badge" style="background: rgba(148, 163, 184, 0.2); color: #94a3b8;">
        ✓ Goods Restored / Audited at Donor Dock
      </span>
    `;
  }

  return `
    <div class="transfer-card" id="transfer-card-${t.id}">
      <div class="transfer-header">
        <div class="transfer-id-group">
          <span class="transfer-code">${t.transfer_code}</span>
          <span class="status-badge ${t.status}">${t.status.replace(/_/g, ' ')}</span>
          <span class="urgency-badge ${t.urgency}">${t.urgency.replace(/_/g, ' ')}</span>
        </div>
        <div style="font-size: 0.8rem; color: #94a3b8;">
          Requested: ${formatTimestamp(t.requested_at)}
        </div>
      </div>

      ${stepperHTML}

      <div class="transfer-details-grid">
        <div class="detail-item">
          <span class="detail-label">Donor Facility</span>
          <span class="detail-val">${t.source_facility_name || t.source_facility?.name || 'Facility ' + t.source_facility_id}</span>
          <span class="detail-sub">${t.source_facility_code || ''} • ${t.source_terrain || ''}</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Recipient Facility</span>
          <span class="detail-val">${t.destination_facility_name || t.destination_facility?.name || 'Facility ' + t.destination_facility_id}</span>
          <span class="detail-sub">${t.destination_facility_code || ''} • ${t.destination_terrain || ''}</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Medicine Transferred</span>
          <span class="detail-val" style="color: #38bdf8;">${t.medicine_name || t.medicine?.name || 'Medicine ' + t.medicine_id}</span>
          <span class="detail-sub"><strong>${t.quantity} ${t.medicine_unit || t.medicine?.unit || 'units'}</strong> requested</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Route & Logistics</span>
          <span class="detail-val">${t.distance_km ? t.distance_km.toFixed(1) + ' km' : '--'}</span>
          <span class="detail-sub">Est. Duration: <strong>${t.estimated_transit_hours ? t.estimated_transit_hours.toFixed(2) + ' hrs' : '--'}</strong></span>
        </div>
      </div>

      <div class="transfer-actions-bar">
        <div class="actions-left">
          ${actionButtonsHTML}
        </div>
        <div class="actions-right">
          <button class="btn btn-outline btn-sm" onclick="viewTransferAuditLedger(${t.id})">
            View Audit Ledger
          </button>
        </div>
      </div>
    </div>
  `;
}

// Action Handlers
async function handleCreateTransfer(event) {
  event.preventDefault();
  const btn = document.getElementById('btn-submit-transfer');
  if (btn) btn.disabled = true;

  try {
    const srcFacilityId = parseInt(document.getElementById('src-facility').value, 10);
    const destFacilityId = parseInt(document.getElementById('dest-facility').value, 10);
    const medicineId = parseInt(document.getElementById('med-select').value, 10);
    const quantity = parseInt(document.getElementById('med-qty').value, 10);
    const urgency = document.querySelector('input[name="urgency"]:checked')?.value || 'ROUTINE';
    const reason = document.getElementById('transfer-reason')?.value || null;
    const autoApprove = document.getElementById('auto-approve-toggle')?.checked || false;

    if (srcFacilityId === destFacilityId) {
      showToast("Source and Destination facilities cannot be the same.", "error");
      if (btn) btn.disabled = false;
      return;
    }

    const payload = {
      source_facility_id: srcFacilityId,
      destination_facility_id: destFacilityId,
      medicine_id: medicineId,
      quantity: quantity,
      urgency: urgency,
      reason: reason,
      auto_approve: autoApprove
    };

    const res = await fetch(`${API_BASE}/transfers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Failed to create transfer");
    }

    showToast(`Transfer ${data.transfer_code} initiated successfully! Status: ${data.status}`, "success");
    await loadAllData();
    switchToTab('transfers-tab');
  } catch (err) {
    console.error("Transfer creation error:", err);
    showToast(err.message || "Transfer creation failed", "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function executeTransferAction(transferId, action, body = {}) {
  try {
    const res = await fetch(`${API_BASE}/transfers/${transferId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || `Action ${action} failed`);
    }

    showToast(`Transfer ${data.transfer_code} transitioned to ${data.status}!`, "success");
    closeModal();
    await loadAllData();
  } catch (err) {
    console.error(`Action ${action} failed:`, err);
    showToast(err.message || `Action ${action} failed`, "error");
  }
}

// Modal Prompt Helpers
function promptReceiveTransfer(transferId, dispatchedQty) {
  openModal(
    "Confirm Physical Delivery at Destination PHC",
    `
      <div class="form-group">
        <label>Delivered Quantity (Units):</label>
        <input type="number" id="modal-received-qty" class="form-input" value="${dispatchedQty}" min="1" max="${dispatchedQty}">
        <div class="form-helper">Dispatched: ${dispatchedQty} units. Enter actual count if partial arrival.</div>
      </div>
      <div class="form-group">
        <label>Condition Verified:</label>
        <select id="modal-condition" class="form-select">
          <option value="true">Condition OK (Seal & Cold Chain Intact)</option>
          <option value="false">Damaged / Cold Chain Broken</option>
        </select>
      </div>
      <div class="form-group">
        <label>Receiving Pharmacist Notes:</label>
        <input type="text" id="modal-receive-notes" class="form-input" placeholder="e.g. Physical inventory counted and shelved in cold storage">
      </div>
    `,
    `
      <button class="btn btn-outline btn-sm" onclick="closeModal()">Cancel</button>
      <button class="btn btn-success btn-sm" onclick="submitReceive(${transferId})">Confirm & Add to Stock</button>
    `
  );
}

function submitReceive(transferId) {
  const qty = parseInt(document.getElementById('modal-received-qty')?.value, 10);
  const ok = document.getElementById('modal-condition')?.value === 'true';
  const notes = document.getElementById('modal-receive-notes')?.value || null;

  executeTransferAction(transferId, 'receive', {
    received_quantity: qty,
    condition_ok: ok,
    notes: notes
  });
}

function promptAbortTransfer(transferId) {
  openModal(
    "Abort Transfer & Initiate Physical Return",
    `
      <p style="color: #cbd5e1; font-size: 0.9rem; margin-bottom: 1rem;">
        Are you sure you want to abort this transit? The vehicle will be turned around and routed back to the donor loading dock under <strong>RETURN_IN_PROGRESS</strong>.
      </p>
      <div class="form-group">
        <label>Abort Reason <span class="required">*</span>:</label>
        <input type="text" id="modal-abort-reason" class="form-input" placeholder="e.g. Landslide on mountain ghat road / Emergency recall broadcast" required>
      </div>
    `,
    `
      <button class="btn btn-outline btn-sm" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger btn-sm" onclick="submitAbort(${transferId})">Confirm Abort & Turnaround</button>
    `
  );
}

function submitAbort(transferId) {
  const reason = document.getElementById('modal-abort-reason')?.value || "Road closure / physical impediment";
  executeTransferAction(transferId, 'abort-transit', { reason: reason });
}

function promptReceiveReturn(transferId, dispatchedQty) {
  openModal(
    "Receive Returned Stock at Donor Facility",
    `
      <p style="color: #64748b; font-size: 0.85rem; margin-bottom: 1rem;">
        Returned goods will be inspected at the loading dock. Any items that expired or were recalled during transit will automatically be diverted to <strong>WASTED_EXPIRED</strong> or <strong>QUARANTINED</strong> to prevent phantom inventory resurrection.
      </p>
      <div class="form-group">
        <label class="form-label">Physically Returned Quantity:</label>
        <input type="number" id="modal-return-qty" class="form-control" value="${dispatchedQty}" min="0" max="${dispatchedQty}">
      </div>
      <div class="form-group">
        <label class="form-label">Receiving Inspection Notes:</label>
        <input type="text" id="modal-return-notes" class="form-control" placeholder="e.g. Packaging checked, temp verified">
      </div>
    `,
    `
      <button class="btn btn-outline btn-sm" onclick="closeModal()">Cancel</button>
      <button class="btn btn-warning btn-sm" onclick="submitReceiveReturn(${transferId})">Inspect & Complete Return</button>
    `
  );
}

function submitReceiveReturn(transferId) {
  const qty = parseInt(document.getElementById('modal-return-qty')?.value, 10);
  const notes = document.getElementById('modal-return-notes')?.value || null;
  executeTransferAction(transferId, 'receive-return', {
    returned_quantity: isNaN(qty) ? null : qty,
    condition_ok: true,
    notes: notes
  });
}

function promptCancelTransfer(transferId) {
  openModal(
    "Cancel Transfer Request",
    `
      <div class="form-group">
        <label class="form-label">Cancellation Reason <span class="required">*</span>:</label>
        <input type="text" id="modal-cancel-reason" class="form-control" placeholder="e.g. Local stock replenishment arrived from state depot" required>
      </div>
    `,
    `
      <button class="btn btn-outline btn-sm" onclick="closeModal()">Back</button>
      <button class="btn btn-danger btn-sm" onclick="submitCancel(${transferId})">Confirm Cancellation</button>
    `
  );
}

function submitCancel(transferId) {
  const reason = document.getElementById('modal-cancel-reason')?.value || "Administrative cancellation";
  executeTransferAction(transferId, 'cancel', { reason: reason });
}

// Audit Ledger Modal View
async function viewTransferAuditLedger(transferId) {
  try {
    const res = await fetch(`${API_BASE}/transfers/${transferId}`).then(r => r.json());
    const txs = res.transactions || [];

    const txRows = txs.length === 0 ? `
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.5rem; text-align: center;">
        <div style="font-weight: 600; color: #1e293b; margin-bottom: 0.5rem; font-size: 0.95rem;">
          No Physical Dispatch Events Recorded Yet
        </div>
        <p style="color: #64748b; font-size: 0.85rem; margin: 0; line-height: 1.5;">
          This transfer is currently in <strong>${res.status}</strong> status. Inventory batches are allocated and soft-reserved at the donor facility dock.<br>
          Cryptographic SHA-256 ledger transactions are automatically committed upon <strong>physical dispatch</strong> and <strong>recipient dock receipt</strong>.
        </p>
      </div>
    ` : `
      <div style="max-height: 420px; overflow-y: auto; padding-right: 4px;">
        <div style="margin-bottom: 0.75rem; font-size: 0.82rem; color: #64748b;">
          Showing <strong>${txs.length}</strong> immutable transaction block${txs.length === 1 ? '' : 's'} linked to transfer <strong>${res.transfer_code}</strong>.
        </div>
        ${txs.map((t, idx) => `
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid ${t.transaction_type === 'TRANSFERRED_OUT' ? '#0284c7' : '#0d9488'}; border-radius: 8px; padding: 0.9rem; margin-bottom: 0.75rem; font-size: 0.82rem; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
              <span class="status-badge ${t.transaction_type}" style="font-weight: 600;">${t.transaction_type}</span>
              <span style="color: #64748b; font-size: 0.75rem;">Block #${idx + 1} • ${formatTimestamp(t.created_at)}</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin: 0.4rem 0;">
              <div><strong>Batch:</strong> <span style="font-family: monospace;">${t.batch_number}</span> (Exp: ${t.expiry_date})</div>
              <div><strong>Quantity:</strong> <strong>${t.quantity}</strong> units (Bal After: ${t.balance_after})</div>
            </div>
            <div style="color: #64748b; font-size: 0.75rem; margin-bottom: 0.35rem;">
              <strong>Logged by:</strong> ${t.logged_by || 'System'} | <strong>GLN:</strong> ${t.facility_gln || '--'}
            </div>
            <div style="margin-top: 0.4rem; padding: 0.4rem 0.6rem; background: #f8fafc; border-radius: 4px; font-family: monospace; font-size: 0.7rem; color: #0369a1; word-break: break-all; border: 1px solid #e2e8f0;">
              <div><strong>SHA-256:</strong> ${t.hash || t.cryptographic_hash || '--'}</div>
              ${t.previous_hash ? `<div style="color: #64748b; margin-top: 0.15rem;"><strong>Prev:</strong> ${t.previous_hash}</div>` : ''}
            </div>
            ${t.notes ? `<div style="color: #64748b; margin-top: 0.35rem; font-style: italic; font-size: 0.75rem;">Note: ${t.notes}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `;

    openModal(
      `DSCSA Immutable Ledger Audit Trail — ${res.transfer_code}`,
      txRows,
      `<button class="btn btn-secondary btn-sm" onclick="closeModal()">Close</button>`
    );
  } catch (e) {
    showToast("Failed to fetch ledger audit details", "error");
  }
}

// Facility Inventory Overview Tab
async function renderFacilitiesInventory() {
  const container = document.getElementById('facilities-inventory-grid');
  if (!container) return;

  try {
    const depRes = await fetch(`${API_BASE}/inventory/depletion`).then(r => r.json());
    const facilityDepletions = depRes.facilities || [];

    if (facilityDepletions.length === 0) {
      container.innerHTML = '<p style="color: #94a3b8;">No facility inventory data available.</p>';
      return;
    }

    container.innerHTML = facilityDepletions.map(f => {
      return `
        <div class="facility-card">
          <div class="facility-header">
            <span class="facility-title">${f.facility_name}</span>
            <span class="facility-tier-badge">${f.tier}</span>
          </div>
          <div class="facility-meta">
            <span>District: ${f.district}</span>
            <span>Terrain: ${f.terrain_type}</span>
          </div>
          <div class="facility-stock-list">
            ${(f.medicines || []).slice(0, 5).map(m => {
              const statusClass = m.status === 'CRITICAL' ? 'critical' : (m.status === 'WARNING' ? 'warning' : 'healthy');
              return `
                <div class="stock-item">
                  <span style="max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${m.medicine_name}
                  </span>
                  <span class="stock-qty ${statusClass}">
                    ${m.current_stock} units (${m.days_of_inventory_remaining !== null ? m.days_of_inventory_remaining.toFixed(1) + 'd' : 'Stockout'})
                  </span>
                </div>
              `;
            }).join('')}
          </div>
          <div style="margin-top: 1rem; text-align: right;">
            <button class="btn btn-outline btn-sm" onclick="quickTransferToFacility(${f.facility_id})">
              Send Emergency Stock ➔
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.warn("Error rendering facility stock grid:", err);
    container.innerHTML = '<p style="color: #94a3b8;">Failed to load facility inventories.</p>';
  }
}

function quickTransferToFacility(destFacilityId) {
  const destSelect = document.getElementById('dest-facility');
  if (destSelect) {
    destSelect.value = destFacilityId;
  }
  onFacilityOrMedicineChanged();
  switchToTab('wizard-tab');
}

// Modal Utility
function openModal(title, bodyHTML, footerHTML) {
  const modal = document.getElementById('action-modal');
  const mTitle = document.getElementById('modal-title');
  const mBody = document.getElementById('modal-body');
  const mFooter = document.getElementById('modal-footer');

  if (mTitle) mTitle.textContent = title;
  if (mBody) mBody.innerHTML = bodyHTML;
  if (mFooter) mFooter.innerHTML = footerHTML;
  if (modal) modal.classList.add('open');
}

function closeModal() {
  const modal = document.getElementById('action-modal');
  if (modal) modal.classList.remove('open');
}

// Toast Notification Utility
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div style="font-weight: 600;">${type === 'error' ? '⚠️ Error' : (type === 'success' ? '✓ Success' : 'ℹ Notice')}</div>
    <div>${message}</div>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

function formatTimestamp(isoStr) {
  if (!isoStr) return '--';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return isoStr;
  }
}

// ==========================================================================
// Real-Time Alert Engine (Server-Sent Events & Alerts Drawer)
// ==========================================================================

function initSSE() {
  if (appState.eventSource) {
    appState.eventSource.close();
  }

  const indicator = document.getElementById('sse-status-indicator');
  if (indicator) {
    indicator.className = 'sse-status-dot connecting';
    indicator.title = 'Connecting to real-time event stream...';
  }

  try {
    const es = new EventSource('/api/alerts/stream');
    appState.eventSource = es;

    es.onopen = () => {
      if (indicator) {
        indicator.className = 'sse-status-dot connected';
        indicator.title = 'Real-time alert stream connected';
      }
    };

    es.onerror = (err) => {
      console.warn("SSE stream connection interrupted. Browser will auto-reconnect:", err);
      if (indicator) {
        indicator.className = 'sse-status-dot connecting';
        indicator.title = 'Reconnecting to stream...';
      }
    };

    es.addEventListener('alert', (e) => {
      try {
        const alert = JSON.parse(e.data);
        handleIncomingAlert(alert);
      } catch (parseErr) {
        console.error("Error parsing incoming SSE alert payload:", parseErr, e.data);
      }
    });

    es.addEventListener('ping', (e) => {
      // Keepalive heartbeat received
      if (indicator) {
        indicator.className = 'sse-status-dot connected';
      }
    });
  } catch (err) {
    console.error("Failed to initialize EventSource:", err);
    if (indicator) {
      indicator.className = 'sse-status-dot disconnected';
      indicator.title = 'Connection failed';
    }
  }
}

function handleIncomingAlert(alert) {
  // Check if alert already exists to prevent duplicate rendering
  const existingIndex = appState.alerts.findIndex(a => a.id === alert.id);
  if (existingIndex >= 0) {
    appState.alerts[existingIndex] = alert;
  } else {
    appState.alerts.unshift(alert);
  }

  // Show Toast Notification
  const toastType = alert.severity === 'EMERGENCY' ? 'emergency' :
                   (alert.severity === 'CRITICAL' ? 'critical' :
                   (alert.severity === 'WARNING' ? 'warning' : 'info'));
  showToast(`${alert.title}\n${alert.message}`, toastType);

  // Update Drawer UI & Badge
  renderAlertsList();
  updateAlertsBadge();

  // If this alert affects operational data, refresh network views
  if (alert.category === 'TRANSFER_UPDATE') {
    refreshTransfersOnly();
  } else if (alert.category === 'STOCKOUT' || alert.category === 'CRITICAL_DEPLETION') {
    renderFacilitiesInventory();
  }
}

function toggleAlertsDrawer() {
  const drawer = document.getElementById('alerts-drawer');
  const backdrop = document.getElementById('alerts-drawer-backdrop');
  if (!drawer || !backdrop) return;

  const isOpen = drawer.classList.contains('open');
  if (isOpen) {
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
  } else {
    drawer.classList.add('open');
    backdrop.classList.add('open');
    renderAlertsList();
  }
}

async function loadAlertsHistory() {
  try {
    const res = await fetch(`${API_BASE}/alerts?limit=50`).then(r => r.json());
    if (res && res.alerts) {
      appState.alerts = res.alerts;
      renderAlertsList();
      updateAlertsBadge();
    }
  } catch (err) {
    console.warn("Failed to load historical alerts:", err);
  }
}

function updateAlertsBadge() {
  const badge = document.getElementById('alerts-unread-badge');
  const drawerCount = document.getElementById('alerts-drawer-count');
  const unreadCount = appState.alerts.filter(a => !a.acknowledged).length;

  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  if (drawerCount) {
    drawerCount.textContent = appState.alerts.length;
  }
}

function renderAlertsList() {
  const container = document.getElementById('alerts-list');
  if (!container) return;

  if (!appState.alerts || appState.alerts.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 2rem 1rem; text-align: center; color: var(--text-muted);">
        <p>No active alerts. System healthy.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = appState.alerts.map(a => {
    const sev = (a.severity || 'INFO').toLowerCase();
    const ackClass = a.acknowledged ? 'acknowledged' : '';
    return `
      <div class="alert-card ${sev} ${ackClass}" id="alert-card-${a.id}">
        <div class="alert-card-header">
          <span class="alert-badge ${sev}">${a.severity}</span>
          <span class="alert-time">${formatTimestamp(a.timestamp)}</span>
        </div>
        <div class="alert-title">${a.title}</div>
        <div class="alert-message">${a.message}</div>
        <div class="alert-footer">
          <span class="alert-facility-tag">${a.facility_name || ('Facility #' + a.facility_id)}</span>
          ${a.acknowledged ? 
            '<span class="ack-pill">✓ Acknowledged</span>' :
            `<button class="btn btn-ack btn-xs" onclick="acknowledgeAlert(${a.id}, this)">Acknowledge</button>`
          }
        </div>
      </div>
    `;
  }).join('');
}

async function acknowledgeAlert(alertId, btnEl) {
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.classList.add('acknowledging');
    btnEl.innerHTML = `<span class="spinner-inline"></span> Acknowledging...`;
  }
  const card = document.getElementById(`alert-card-${alertId}`);
  if (card) {
    card.style.transition = 'all 0.25s ease';
  }

  try {
    const res = await fetch(`${API_BASE}/alerts/${alertId}/acknowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acknowledged_by: 'Command Officer' })
    }).then(r => r.json());

    if (res && (res.acknowledged || res.success)) {
      const alert = appState.alerts.find(a => String(a.id) === String(alertId));
      if (alert) {
        alert.acknowledged = true;
      }
      if (card) {
        card.classList.add('acknowledged', 'ack-success-pop');
        const footer = card.querySelector('.alert-footer');
        if (footer) {
          const btn = footer.querySelector('button');
          if (btn) {
            btn.outerHTML = '<span class="ack-pill">✓ Acknowledged</span>';
          }
        }
      }
      updateAlertsBadge();
      showToast(`Alert #${alertId} acknowledged.`, 'info');
    } else {
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.classList.remove('acknowledging');
        btnEl.innerHTML = 'Acknowledge';
      }
      console.warn("Unexpected acknowledge response:", res);
      showToast(res.detail || "Failed to acknowledge alert.", "error");
    }
  } catch (err) {
    console.error("Error acknowledging alert:", err);
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.classList.remove('acknowledging');
      btnEl.innerHTML = 'Acknowledge';
    }
    showToast("Failed to acknowledge alert.", "error");
  }
}

async function markAllAlertsAcknowledged() {
  const unacked = appState.alerts.filter(a => !a.acknowledged);
  if (unacked.length === 0) {
    showToast("All alerts are already acknowledged.", "info");
    return;
  }

  for (const a of unacked) {
    try {
      await fetch(`${API_BASE}/alerts/${a.id}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledged_by: 'Command Officer' })
      });
      a.acknowledged = true;
    } catch (err) {
      console.warn(`Failed to ack alert ${a.id}:`, err);
    }
  }

  renderAlertsList();
  updateAlertsBadge();
  showToast(`Acknowledged ${unacked.length} alerts.`, "success");
}

async function simulateLiveAlert() {
  const sampleAlerts = [
    {
      severity: "EMERGENCY",
      category: "STOCKOUT",
      facility_id: 1,
      medicine_id: 1,
      title: "EMERGENCY: ASV Depleted at Aundh",
      message: "Urgent snakebite cluster reported. Anti-Snake Venom stock level reached 0. Inter-PHC redistribution required."
    },
    {
      severity: "CRITICAL",
      category: "COLD_CHAIN_BREACH",
      facility_id: 2,
      medicine_id: 2,
      title: "Cold Chain Breach: Rabies Vaccine",
      message: "ILR refrigeration sensor logged 11.2°C at Shirur (safe limit: 2-8°C). Potential potency risk."
    },
    {
      severity: "WARNING",
      category: "SURGE_SPIKE",
      facility_id: 5,
      medicine_id: 4,
      title: "Surge Consumption Spike: ORS",
      message: "Gastroenteritis outbreak suspected at Kalyanpur. 7-day consumption velocity spiked 3.8x baseline."
    },
    {
      severity: "INFO",
      category: "TRANSFER_UPDATE",
      facility_id: 4,
      medicine_id: 3,
      title: "Transfer Dispatched: Human Insulin",
      message: "Transport vehicle MH-12-AQ-4412 departed donor facility en route to Baramati."
    }
  ];

  const pick = sampleAlerts[Math.floor(Math.random() * sampleAlerts.length)];
  try {
    const res = await fetch(`${API_BASE}/alerts/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pick)
    });
    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || "Failed to broadcast alert", "error");
    }
  } catch (err) {
    console.error("Failed to simulate alert:", err);
    showToast("Failed to simulate alert.", "error");
  }
}

// ==========================================
// Multimodal Paper Register Ingestion (Gemini Vision)
// ==========================================

let currentScannedItems = [];

async function handleRegisterFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const facSelect = document.getElementById('scan-facility-select');
  const facilityId = facSelect ? parseInt(facSelect.value, 10) : null;

  // Show visual document preview
  const previewImg = document.getElementById('scanned-image-preview');
  const previewWrapper = document.getElementById('scan-image-preview-wrapper');
  const previewFilename = document.getElementById('scan-preview-filename');
  const previewLink = document.getElementById('scan-preview-open-link');
  if (previewImg && previewWrapper) {
    const objectUrl = URL.createObjectURL(file);
    previewImg.src = objectUrl;
    previewWrapper.style.display = 'block';
    if (previewFilename) previewFilename.textContent = file.name;
    if (previewLink) previewLink.href = objectUrl;
  }

  const formData = new FormData();
  formData.append('file', file);
  if (facilityId) {
    formData.append('facility_id', facilityId);
  }

  await executeRegisterScan(formData);
}

async function loadAndScanSampleRegister() {
  const facSelect = document.getElementById('scan-facility-select');
  const facilityId = facSelect ? parseInt(facSelect.value, 10) : null;

  const banner = document.getElementById('scan-status-banner');
  if (banner) {
    banner.innerHTML = `<strong>⏳ Fetching:</strong> Downloading official NHM sample arrival register chalan...`;
    banner.style.background = 'rgba(99, 102, 241, 0.12)';
  }

  try {
    const sampleUrl = `${API_BASE}/inventory/scan-register/sample-image?t=${Date.now()}`;
    const res = await fetch(sampleUrl);
    if (!res.ok) throw new Error("Failed to download sample register image");
    const blob = await res.blob();
    const file = new File([blob], "nhm_sample_chalan.png", { type: "image/png" });

    // Show visual document preview
    const previewImg = document.getElementById('scanned-image-preview');
    const previewWrapper = document.getElementById('scan-image-preview-wrapper');
    const previewFilename = document.getElementById('scan-preview-filename');
    const previewLink = document.getElementById('scan-preview-open-link');
    if (previewImg && previewWrapper) {
      previewImg.src = sampleUrl;
      previewWrapper.style.display = 'block';
      if (previewFilename) previewFilename.textContent = "DHS-MH-2026/09/8821 (Maharashtra DHS Inward Delivery Challan)";
      if (previewLink) previewLink.href = sampleUrl;
    }

    const formData = new FormData();
    formData.append('file', file);
    if (facilityId) {
      formData.append('facility_id', facilityId);
    }

    await executeRegisterScan(formData);
  } catch (err) {
    console.error("Error loading sample register:", err);
    showToast("Failed to load sample chalan image.", "error");
    if (banner) {
      banner.innerHTML = `<strong>Error:</strong> Failed to fetch sample image.`;
    }
  }
}

async function executeRegisterScan(formData) {
  const banner = document.getElementById('scan-status-banner');
  const sampleBtn = document.getElementById('btn-use-sample');
  const resultsContainer = document.getElementById('scan-results-container');
  const commitSuccess = document.getElementById('scan-commit-success');

  if (commitSuccess) commitSuccess.style.display = 'none';

  if (banner) {
    banner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <div class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
        <span><strong>🧠 Gemini Vision Processing:</strong> Reading tabular rows, transcribing handwriting, and validating catalog mappings...</span>
      </div>
    `;
    banner.style.background = 'rgba(79, 70, 229, 0.15)';
    banner.style.color = '#3730a3';
  }
  if (sampleBtn) sampleBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/inventory/scan-register`, {
      method: "POST",
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Vision OCR scanning failed.");
    }

    const data = await res.json();
    currentScannedItems = data.extracted_items || [];

    // Update Telemetry Header
    const modelBadge = document.getElementById('scan-badge-model');
    const metaInfo = document.getElementById('scan-meta-info');

    if (modelBadge) {
      modelBadge.textContent = data.model_used || 'Gemini Vision';
      modelBadge.style.background = data.model_used.includes('fallback') ? '#f59e0b' : '#10b981';
    }
    if (metaInfo) {
      metaInfo.textContent = `Extracted ${data.total_items_detected} line items in ${data.processing_time_ms} ms • Facility: ${data.facility_name || 'Unassigned'}`;
    }

    renderScannedItems();

    if (resultsContainer) resultsContainer.style.display = 'block';

    if (banner) {
      banner.innerHTML = `<strong>✓ Extraction Complete:</strong> Successfully parsed ${currentScannedItems.length} items. Review the preview below and click "Commit to Facility Inventory".`;
      banner.style.background = 'rgba(16, 185, 129, 0.12)';
      banner.style.color = '#065f46';
    }
    showToast(`Parsed ${currentScannedItems.length} items from register image.`, "success");

  } catch (err) {
    console.error("Scan error:", err);
    showToast(err.message, "error");
    if (banner) {
      banner.innerHTML = `<strong>Extraction Error:</strong> ${err.message}`;
      banner.style.background = 'rgba(239, 68, 68, 0.12)';
      banner.style.color = '#991b1b';
    }
  } finally {
    if (sampleBtn) sampleBtn.disabled = false;
  }
}

function renderScannedItems() {
  const tbody = document.getElementById('scan-items-tbody');
  if (!tbody) return;

  if (currentScannedItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">
          No items remaining. Upload a new register or click "Clear / New Scan".
        </td>
      </tr>
    `;
    const commitBtn = document.getElementById('btn-commit-scan');
    if (commitBtn) commitBtn.disabled = true;
    return;
  }

  const commitBtn = document.getElementById('btn-commit-scan');
  if (commitBtn) commitBtn.disabled = false;

  tbody.innerHTML = currentScannedItems.map((item, idx) => {
    const isMatched = !!item.matched_medicine_id;
    const isReview = !!item.requires_pharmacist_review;
    const matchBadge = isMatched
      ? (isReview
          ? `<span class="badge" style="background: #f59e0b; color: #fff; font-size: 0.72rem; padding: 2px 6px;" title="Ambiguous match (Score 60-81%). Verify formulation before commit.">⚠️ Review: ${item.matched_medicine_name}</span>`
          : `<span class="badge" style="background: #10b981; color: #fff; font-size: 0.72rem; padding: 2px 6px;">✓ ${item.matched_medicine_name}</span>`)
      : `<span class="badge" style="background: #ef4444; color: #fff; font-size: 0.72rem; padding: 2px 6px;">Unmatched</span>`;

    const confPct = Math.round(item.confidence_score * 100);
    const confColor = confPct >= 90 ? '#059669' : (confPct >= 70 ? '#d97706' : '#dc2626');

    return `
      <tr style="border-bottom: 1px solid var(--border-color); font-size: 0.88rem;">
        <td style="padding: 0.75rem; font-weight: 500;">
          ${item.medicine_name}
          ${item.notes ? `<div style="font-size: 0.75rem; color: var(--text-muted);">${item.notes}</div>` : ''}
        </td>
        <td style="padding: 0.75rem;">${matchBadge}</td>
        <td style="padding: 0.75rem; font-family: monospace; font-size: 0.85rem;">
          <input type="text" class="form-input" style="padding: 4px 8px; font-size: 0.82rem; width: 120px;" 
                 value="${item.batch_number}" onchange="updateScannedItemField(${idx}, 'batch_number', this.value)">
        </td>
        <td style="padding: 0.75rem;">
          <input type="date" class="form-input" style="padding: 4px 6px; font-size: 0.82rem; width: 135px;" 
                 value="${item.expiry_date}" onchange="updateScannedItemField(${idx}, 'expiry_date', this.value)">
        </td>
        <td style="padding: 0.75rem;">
          <input type="number" min="1" class="form-input" style="padding: 4px 8px; font-size: 0.82rem; width: 80px;" 
                 value="${item.quantity}" onchange="updateScannedItemField(${idx}, 'quantity', parseInt(this.value, 10))">
        </td>
        <td style="padding: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; font-weight: 600; color: ${confColor};">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${confColor};"></span>
            ${confPct}%
          </div>
        </td>
        <td style="padding: 0.75rem; text-align: center;">
          <button class="btn btn-outline btn-xs" style="color: #ef4444; border-color: #fca5a5;" onclick="removeScannedRow(${idx})" title="Remove item">✕</button>
        </td>
      </tr>
    `;
  }).join('');
}

function updateScannedItemField(index, field, value) {
  if (currentScannedItems[index]) {
    currentScannedItems[index][field] = value;
  }
}

function removeScannedRow(index) {
  currentScannedItems.splice(index, 1);
  renderScannedItems();
}

function resetScanView() {
  currentScannedItems = [];
  const fileInput = document.getElementById('scan-file-input');
  if (fileInput) fileInput.value = '';

  const resultsContainer = document.getElementById('scan-results-container');
  if (resultsContainer) resultsContainer.style.display = 'none';

  const previewWrapper = document.getElementById('scan-image-preview-wrapper');
  if (previewWrapper) previewWrapper.style.display = 'none';
  const previewImg = document.getElementById('scanned-image-preview');
  if (previewImg) previewImg.src = '';

  const banner = document.getElementById('scan-status-banner');
  if (banner) {
    banner.innerHTML = `<strong>Ready:</strong> Select a facility and upload a register photo or click "Use Sample Register Chalan" to test.`;
    banner.style.background = 'rgba(99, 102, 241, 0.08)';
    banner.style.color = '#4338ca';
  }
}

async function commitScannedRegister() {
  const facSelect = document.getElementById('scan-facility-select');
  const facilityId = facSelect ? parseInt(facSelect.value, 10) : null;

  if (!facilityId) {
    showToast("Please select a target facility before committing.", "warning");
    if (facSelect) facSelect.focus();
    return;
  }

  if (currentScannedItems.length === 0) {
    showToast("No scanned items to commit.", "warning");
    return;
  }

  const validItems = currentScannedItems.filter(i => !!i.matched_medicine_id && i.quantity > 0);
  if (validItems.length === 0) {
    showToast("None of the items have matched catalog medicines. Please check items before committing.", "error");
    return;
  }

  const commitBtn = document.getElementById('btn-commit-scan');
  const originalBtnText = commitBtn ? commitBtn.innerHTML : '';
  if (commitBtn) {
    commitBtn.disabled = true;
    commitBtn.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.4rem;">
        <div class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></div>
        <span>Committing Batches...</span>
      </div>
    `;
  }

  const payload = {
    facility_id: facilityId,
    items: validItems.map(i => ({
      medicine_id: i.matched_medicine_id,
      batch_number: i.batch_number,
      quantity: i.quantity,
      expiry_date: i.expiry_date,
      unit_price: i.unit_price || 0.0
    })),
    notes: "Multimodal Gemini Vision OCR Optical Ingestion"
  };

  try {
    const res = await fetch(`${API_BASE}/inventory/scan-register/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to commit batches into inventory.");
    }

    const data = await res.json();

    // Show Success Banner
    const commitSuccess = document.getElementById('scan-commit-success');
    if (commitSuccess) {
      commitSuccess.style.display = 'block';
      commitSuccess.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 0.75rem;">
          <span style="font-size: 1.5rem;">🎉</span>
          <div>
            <h4 style="font-weight: 700; color: #065f46; margin-bottom: 0.25rem;">Inventory Commit Successful!</h4>
            <p style="font-size: 0.88rem; line-height: 1.5; margin-bottom: 0.5rem;">${data.message}</p>
            <div style="font-size: 0.8rem; color: #047857;">
              <strong>Committed Batches:</strong> IDs [${data.batch_ids.join(', ')}] • 
              <strong>DSCSA Audit Hash Trail:</strong> ${data.transaction_ids.length} transactions recorded.
            </div>
          </div>
        </div>
      `;
    }

    showToast(`Committed ${data.committed_batches} batches (${data.total_quantity_added} units) to ${data.facility_name}!`, "success");

    // Refresh inventory and stats
    loadAllData();

  } catch (err) {
    console.error("Commit error:", err);
    showToast(err.message, "error");
  } finally {
    if (commitBtn) {
      commitBtn.disabled = false;
      commitBtn.innerHTML = originalBtnText;
    }
  }
}

// ==========================================================================
// Microtask 3.3: Gemini Autonomous Rebalancing Agent Logic
// ==========================================================================

let currentRebalanceResponse = null;

async function onRebalanceSelectionChanged() {
  const recipientSelect = document.getElementById('rebalance-recipient-select');
  const medSelect = document.getElementById('rebalance-medicine-select');
  const targetDaysInput = document.getElementById('rebalance-target-days');

  const stockEl = document.getElementById('rebalance-preview-stock');
  const dacEl = document.getElementById('rebalance-preview-dac');
  const dirEl = document.getElementById('rebalance-preview-dir');
  const deficitEl = document.getElementById('rebalance-preview-deficit');

  if (!recipientSelect || !medSelect || !stockEl) return;

  const recipientId = parseInt(recipientSelect.value, 10);
  const medicineId = parseInt(medSelect.value, 10);
  const targetDays = parseInt(targetDaysInput?.value, 10) || 14;

  if (!recipientId || !medicineId) {
    stockEl.textContent = '--';
    dacEl.textContent = '--';
    dirEl.textContent = '--';
    deficitEl.textContent = '--';
    return;
  }

  try {
    const invRes = await fetch(`${API_BASE}/inventory/${recipientId}`).then(r => r.json());
    const item = (invRes.inventory || []).find(i => i.medicine_id === medicineId);
    const stock = item ? item.total_quantity : 0;
    const dac = item && item.daily_consumption ? item.daily_consumption : 1.0;
    const dir = dac > 0 ? (stock / dac) : null;
    const targetStock = Math.ceil(targetDays * dac);
    const deficit = Math.max(0, targetStock - stock);

    stockEl.textContent = `${stock} units`;
    dacEl.textContent = `${dac.toFixed(1)} units/day`;
    dirEl.innerHTML = dir !== null 
      ? `<span style="color: ${dir < 3 ? '#e11d48' : (dir < 7 ? '#d97706' : '#059669')}; font-weight: 600;">${dir.toFixed(1)} days</span>` 
      : '<span style="color: #e11d48; font-weight: 600;">Stockout (0 days)</span>';
    deficitEl.textContent = deficit > 0 ? `${deficit} units (Target: ${targetStock})` : '0 (Stock Healthy)';
    deficitEl.style.color = deficit > 0 ? '#e11d48' : '#059669';
  } catch (err) {
    console.warn("Failed to fetch recipient inventory preview:", err);
  }
}

async function scanLiveNetworkDeficits() {
  const container = document.getElementById('network-deficits-container');
  const badge = document.getElementById('rebalance-deficit-count-badge');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.85rem;">
      <div class="spinner" style="width: 18px; height: 18px; border-width: 2px; margin: 0 auto 0.5rem;"></div>
      Scanning network for stockouts and low inventory...
    </div>
  `;

  try {
    const res = await fetch(`${API_BASE}/rebalance/network-deficits`);
    if (!res.ok) throw new Error("Failed to scan network deficits");
    const data = await res.json();
    const deficits = Array.isArray(data) ? data : (data.deficits || []);

    if (badge) badge.textContent = deficits.length;

    if (deficits.length === 0) {
      container.innerHTML = `
        <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 8px; padding: 1.5rem; text-align: center; color: #065f46; font-size: 0.88rem;">
          <div style="font-size: 1.5rem; margin-bottom: 0.35rem;">🛡️</div>
          <strong>All Network Facilities Operating Within Safe Inventory Buffers</strong>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem;">
            No CRITICAL or WARNING deficits detected across the network.
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = deficits.map(d => {
      const isCritical = d.status === 'CRITICAL';
      const statusBg = isCritical ? 'rgba(225, 29, 72, 0.1)' : 'rgba(217, 119, 6, 0.1)';
      const statusColor = isCritical ? '#e11d48' : '#d97706';
      const statusBorder = isCritical ? 'rgba(225, 29, 72, 0.25)' : 'rgba(217, 119, 6, 0.25)';

      const candidateSnippet = d.top_donor_facility_name ? `
        <div style="margin-top: 0.45rem; padding: 0.4rem 0.6rem; background: #fff; border-radius: 6px; border: 1px solid var(--border-color); font-size: 0.78rem; display: flex; justify-content: space-between; align-items: center;">
          <span>
            <strong>Donor Match:</strong> ${d.top_donor_facility_name} (${d.top_donor_surplus} units surplus)
          </span>
          <span style="color: var(--text-muted); font-size: 0.74rem;">
            ~${d.top_donor_transit_hours}h transit (${d.top_donor_distance_km} km)
          </span>
        </div>
      ` : `
        <div style="margin-top: 0.45rem; font-size: 0.76rem; color: #64748b; font-style: italic;">
          No candidates with surplus within 50 km (Escalate to District Central Store)
        </div>
      `;

      return `
        <div style="background: #ffffff; border: 1px solid ${statusBorder}; border-left: 4px solid ${statusColor}; border-radius: 8px; padding: 0.85rem; margin-bottom: 0.75rem; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
            <div>
              <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">
                ${d.facility_name}
              </div>
              <div style="font-size: 0.78rem; color: var(--text-muted);">
                District: ${d.district} ${d.is_emergency ? '• <span style="color: #e11d48; font-weight: 600;">EMERGENCY DRUG</span>' : ''}
              </div>
            </div>
            <span class="badge" style="background: ${statusBg}; color: ${statusColor}; font-size: 0.72rem; padding: 2px 7px; font-weight: 700;">
              ${d.status}
            </span>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 0.5rem; font-size: 0.82rem;">
            <div>
              <strong>${d.medicine_name}</strong>
              <span style="color: var(--text-muted); font-size: 0.76rem;">(${d.unit})</span>
            </div>
            <div>
              Stock: <strong style="color: ${d.current_stock === 0 ? '#e11d48' : '#d97706'};">${d.current_stock}</strong> • 
              Deficit: <strong style="color: #e11d48;">-${d.deficit_quantity}</strong> (${d.days_of_inventory_remaining !== null ? d.days_of_inventory_remaining.toFixed(1) + 'd' : 'Stockout'})
            </div>
          </div>

          ${candidateSnippet}

          <div style="margin-top: 0.65rem; text-align: right;">
            <button class="btn btn-outline btn-xs" style="font-weight: 600; color: #0284c7; border-color: #bae6fd;" 
                    onclick="selectDeficitForRebalance(${d.facility_id}, ${d.medicine_id})">
              ⚡ Select & Analyze Rebalance
            </button>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error("Error scanning network deficits:", err);
    container.innerHTML = `
      <div style="padding: 1.5rem; text-align: center; color: #e11d48; font-size: 0.85rem;">
        Failed to scan network deficits: ${err.message}
      </div>
    `;
  }
}

function selectDeficitForRebalance(facilityId, medicineId) {
  const recSelect = document.getElementById('rebalance-recipient-select');
  const medSelect = document.getElementById('rebalance-medicine-select');
  if (recSelect) recSelect.value = facilityId;
  if (medSelect) medSelect.value = medicineId;

  onRebalanceSelectionChanged();
  executeRebalanceAnalysis();
}

async function executeRebalanceAnalysis() {
  const recSelect = document.getElementById('rebalance-recipient-select');
  const medSelect = document.getElementById('rebalance-medicine-select');
  const targetDaysInput = document.getElementById('rebalance-target-days');
  const donorBufferInput = document.getElementById('rebalance-donor-buffer');
  const radiusInput = document.getElementById('rebalance-radius-km');
  const runBtn = document.getElementById('btn-run-rebalance');
  const resultsCard = document.getElementById('rebalance-results-card');

  const recipientId = parseInt(recSelect?.value, 10);
  const medicineId = parseInt(medSelect?.value, 10);
  const targetDays = parseInt(targetDaysInput?.value, 10) || 14;
  const donorBuffer = parseInt(donorBufferInput?.value, 10) || 14;
  const radiusKm = parseFloat(radiusInput?.value) || 50.0;

  if (!recipientId || !medicineId) {
    showToast("Please select both a Recipient Facility and a Medicine.", "warning");
    return;
  }

  const originalBtnContent = runBtn.innerHTML;
  runBtn.disabled = true;
  runBtn.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
      <div class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
      <span>Reasoning with Gemini Agent...</span>
    </div>
  `;

  resultsCard.style.display = 'block';
  resultsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  resultsCard.innerHTML = `
    <div class="card" style="background: var(--bg-card); border-radius: 12px; padding: 2.5rem 1.5rem; border: 1px solid var(--border-color); text-align: center;">
      <div class="spinner" style="width: 32px; height: 32px; border-width: 3px; margin: 0 auto 1.25rem;"></div>
      <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.35rem;">
        Gemini 3.6 Autonomous Rebalancing Engine Active
      </h3>
      <p style="color: var(--text-secondary); font-size: 0.88rem; max-width: 580px; margin: 0 auto; line-height: 1.5;">
        Evaluating candidate donors within <strong>${radiusKm} km</strong>, verifying <strong>${donorBuffer}-day safety buffer retention</strong>, checking cold chain telemetry, and calculating Western Ghats road transit impedance...
      </p>
    </div>
  `;

  const monsoonChecked = document.getElementById('rebalance-monsoon-mode')?.checked || false;

  try {
    const res = await fetch(`${API_BASE}/rebalance/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destination_facility_id: recipientId,
        medicine_id: medicineId,
        target_buffer_days: targetDays,
        min_donor_buffer_days: donorBuffer,
        max_radius_km: radiusKm,
        urgency: "URGENT",
        monsoon_mode: monsoonChecked
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Rebalancing recommendation failed.");
    }

    const data = await res.json();
    currentRebalanceResponse = data;
    renderRebalanceResults(data);

  } catch (err) {
    console.error("Rebalance analysis error:", err);
    resultsCard.innerHTML = `
      <div class="card" style="background: #fff; border-radius: 12px; padding: 1.5rem; border: 1px solid #fca5a5;">
        <div style="display: flex; align-items: center; gap: 0.75rem; color: #dc2626;">
          <span style="font-size: 1.5rem;">⚠️</span>
          <div>
            <h4 style="font-weight: 700;">Rebalancing Analysis Failed</h4>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;">${err.message}</p>
          </div>
        </div>
      </div>
    `;
    showToast(err.message, "error");
  } finally {
    runBtn.disabled = false;
    runBtn.innerHTML = originalBtnContent;
  }
}

function renderRebalanceResults(data) {
  const card = document.getElementById('rebalance-results-card');
  if (!card) return;

  const isTransfer = data.is_feasible && data.recommended_donor && data.recommended_quantity > 0;
  const donor = data.recommended_donor;

  const actionBadgeColor = isTransfer ? '#059669' : '#d97706';
  const actionBadgeBg = isTransfer ? 'rgba(16, 185, 129, 0.12)' : 'rgba(217, 119, 6, 0.12)';
  const actionLabel = isTransfer ? '✓ Inter-PHC Transfer Recommended' : '⚠️ No Viable Donors with Surplus';

  const modelBadge = data.model_used.toLowerCase().includes('gemini') 
    ? `<span class="badge" style="background: rgba(79, 70, 229, 0.12); color: #4338ca; border: 1px solid rgba(79, 70, 229, 0.25);">🧠 ${data.model_used}</span>`
    : `<span class="badge" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;">⚡ ${data.model_used}</span>`;

  const monsoonBadge = data.monsoon_buffer_applied
    ? `<span class="badge" style="background: rgba(14, 165, 233, 0.12); color: #0284c7; border: 1px solid rgba(14, 165, 233, 0.3);">🌧️ Monsoon Buffer (1.5× / 21-Day) Applied</span>`
    : '';

  const safetyBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.12); color: #047857; border: 1px solid rgba(16, 185, 129, 0.3); font-weight: 700; font-size: 0.78rem; padding: 3px 8px;">🛡️ AI Safety Invariants: 100% Enforced</span>`;

  const clampedBannerHTML = data.clamped_by_safety_guard ? `
    <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid #f59e0b; border-radius: 8px; padding: 0.85rem 1.25rem; margin-bottom: 1.25rem; color: #b45309; display: flex; align-items: center; gap: 0.65rem;">
      <span style="font-size: 1.35rem;">🛡️</span>
      <div>
        <strong style="display: block; font-size: 0.88rem; color: #92400e;">Safety Clamped by Invariant Guard</strong>
        <span style="font-size: 0.82rem;">${data.clamped_reason || `Proposed transfer quantity was clamped to verified physical donor surplus ceiling (${data.recommended_quantity} units) to protect donor safety buffer.`}</span>
      </div>
    </div>
  ` : '';

  // Candidates Matrix
  const candidates = data.all_candidates_evaluated || [];
  const candidatesTableHTML = candidates.length > 0 ? `
    <div style="margin-top: 1.5rem;">
      <h4 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 0.75rem; color: var(--text-primary); display: flex; align-items: center; justify-content: space-between;">
        <span>📊 Evaluated Candidate Facilities (${candidates.length} within 50 km)</span>
        <span style="font-size: 0.78rem; font-weight: 500; color: var(--text-muted);">Ranked by Multi-Factor Score</span>
      </h4>
      <div style="overflow-x: auto; border: 1px solid var(--border-color); border-radius: 8px;">
        <table class="data-table" style="width: 100%; border-collapse: collapse; font-size: 0.82rem;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 1px solid var(--border-color); text-align: left;">
              <th style="padding: 0.65rem 0.8rem;">Rank</th>
              <th style="padding: 0.65rem 0.8rem;">Candidate Facility</th>
              <th style="padding: 0.65rem 0.8rem;">Distance & Transit</th>
              <th style="padding: 0.65rem 0.8rem;">Stock / Surplus</th>
              <th style="padding: 0.65rem 0.8rem;">Cold Chain</th>
              <th style="padding: 0.65rem 0.8rem;">FEFO Earliest Expiry</th>
              <th style="padding: 0.65rem 0.8rem;">Score</th>
            </tr>
          </thead>
          <tbody>
            ${candidates.map((c, idx) => {
              const isSelected = isTransfer && donor && c.facility_id === donor.facility_id;
              const rowBg = isSelected ? 'rgba(16, 185, 129, 0.08)' : (idx % 2 === 0 ? '#ffffff' : '#fcfdfd');
              return `
                <tr style="background: ${rowBg}; border-bottom: 1px solid var(--border-color); ${isSelected ? 'font-weight: 600;' : ''}">
                  <td style="padding: 0.65rem 0.8rem;">
                    ${isSelected ? '<span style="color: #059669;">★ #1</span>' : `#${idx + 1}`}
                  </td>
                  <td style="padding: 0.65rem 0.8rem;">
                    ${c.facility_name}
                    <span class="facility-tier-badge" style="font-size: 0.68rem; padding: 1px 4px;">${c.tier || 'PHC'}</span>
                    <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: normal;">Terrain: ${c.terrain_type}</div>
                  </td>
                  <td style="padding: 0.65rem 0.8rem;">
                    <div>${c.distance_km} km</div>
                    <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: normal;">~${c.estimated_transit_hours} hrs</div>
                  </td>
                  <td style="padding: 0.65rem 0.8rem;">
                    <div>Stock: <strong>${c.current_stock}</strong></div>
                    <div style="font-size: 0.74rem; color: ${c.surplus_available > 0 ? '#059669' : '#dc2626'}; font-weight: 600;">
                      Surplus: ${c.surplus_available}
                    </div>
                  </td>
                  <td style="padding: 0.65rem 0.8rem;">
                    ${c.has_cold_chain 
                      ? '<span style="color: #059669;">✓ Verified</span>' 
                      : '<span style="color: #dc2626;">✗ None</span>'}
                  </td>
                  <td style="padding: 0.65rem 0.8rem;">
                    ${c.earliest_viable_expiry ? `${c.earliest_viable_expiry} (${c.viable_batch_count} batches)` : '--'}
                  </td>
                  <td style="padding: 0.65rem 0.8rem; font-family: monospace; font-size: 0.85rem;">
                    ${c.suitability_score !== null && c.suitability_score !== undefined ? c.suitability_score.toFixed(3) : '--'}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  ` : '';

  // Donor Safety Invariant Box
  const donorPostStock = isTransfer && donor ? (donor.current_stock - data.recommended_quantity) : 0;
  const donorSafetyHTML = isTransfer && donor ? `
    <div style="background: rgba(16, 185, 129, 0.06); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 8px; padding: 1rem; margin-top: 1.25rem;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
        <span style="font-size: 0.88rem; font-weight: 700; color: #065f46; display: flex; align-items: center; gap: 0.4rem;">
          <span>🛡️ Donor Safety Stock Invariant: VERIFIED</span>
        </span>
        <span class="badge" style="background: #059669; color: #fff; font-size: 0.72rem; padding: 2px 7px;">Zero Starvation Guarantee</span>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; font-size: 0.82rem; color: #065f46;">
        <div>
          <span style="display: block; color: var(--text-muted); font-size: 0.74rem;">Donor Current Stock</span>
          <strong>${donor.current_stock} units</strong>
        </div>
        <div>
          <span style="display: block; color: var(--text-muted); font-size: 0.74rem;">Mandatory Retention Buffer</span>
          <strong>${donor.retention_buffer} units</strong>
        </div>
        <div>
          <span style="display: block; color: var(--text-muted); font-size: 0.74rem;">Transfer Quantity</span>
          <strong style="color: #0284c7;">-${data.recommended_quantity} units</strong>
        </div>
        <div>
          <span style="display: block; color: var(--text-muted); font-size: 0.74rem;">Post-Transfer Remaining</span>
          <strong style="color: #059669;">${donorPostStock} units (${data.donor_post_transfer_dir !== null ? data.donor_post_transfer_dir.toFixed(1) + 'd' : '--'})</strong>
        </div>
      </div>
      <div style="margin-top: 0.5rem; font-size: 0.78rem; color: #047857; font-style: italic;">
        Confirmed: Transferring ${data.recommended_quantity} units leaves ${donorPostStock} units at ${donor.facility_name}, safely exceeding the ${donor.retention_buffer}-unit retention threshold for local clinical consumption.
      </div>
    </div>
  ` : '';

  // Commit Order Action Bar
  const commitActionBarHTML = isTransfer ? `
    <div style="margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <input type="checkbox" id="rebalance-auto-approve" checked style="cursor: pointer; width: 16px; height: 16px;">
        <label for="rebalance-auto-approve" style="font-size: 0.85rem; font-weight: 500; cursor: pointer;">
          Auto-approve & allocate batches immediately (DRAFT ➔ APPROVED)
        </label>
      </div>

      <div style="display: flex; gap: 0.75rem;">
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('rebalance-results-card').style.display='none'">
          Dismiss
        </button>
        <button id="btn-commit-rebalance" class="btn btn-primary btn-sm" style="background: #059669; border-color: #059669;" onclick="applyRebalanceOrder()">
          ✓ Authorize & Commit Inter-PHC Transfer
        </button>
      </div>
    </div>
  ` : `
    <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border-color); text-align: right;">
      <button class="btn btn-secondary btn-sm" onclick="document.getElementById('rebalance-results-card').style.display='none'">
        Dismiss
      </button>
    </div>
  `;

  card.innerHTML = `
    <div class="card" style="background: var(--bg-card); border-radius: 12px; padding: 1.75rem; border: 1px solid var(--border-color); box-shadow: var(--shadow-card);">
      
      <!-- Top Title Bar -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem;">
        <div>
          <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
            <h3 style="font-size: 1.2rem; font-weight: 700; color: var(--text-primary); margin: 0;">
              AI Rebalance Recommendation
            </h3>
            <span class="badge" style="background: ${actionBadgeBg}; color: ${actionBadgeColor}; font-weight: 700; font-size: 0.8rem; padding: 3px 9px;">
              ${actionLabel}
            </span>
            ${modelBadge}
            ${monsoonBadge}
            ${safetyBadge}
          </div>
          <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 0.35rem;">
            Ref: <strong>${data.recommendation_id}</strong> • Recipient: <strong>${data.destination_facility_name}</strong> • Medicine: <strong>${data.medicine_name}</strong>
          </div>
        </div>

        <div style="text-align: right;">
          <span class="badge ${data.recommended_urgency.toLowerCase()}" style="font-size: 0.78rem; padding: 3px 8px;">
            Priority: ${data.recommended_urgency}
          </span>
        </div>
      </div>

      <!-- Safety Clamping Alert (if triggered) -->
      ${clampedBannerHTML}

      <!-- Key Transfer Spec (If Transfer Recommended) -->
      ${isTransfer && donor ? `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.25rem; background: #f8fafc; border: 1px solid var(--border-color); border-radius: 10px; padding: 1.1rem;">
          <div>
            <div style="font-size: 0.76rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Optimal Donor Facility</div>
            <div style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary); margin-top: 0.2rem;">
              ${donor.facility_name}
            </div>
            <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.15rem;">
              Distance: ${data.estimated_distance_km} km (${donor.terrain_type})
            </div>
          </div>

          <div>
            <div style="font-size: 0.76rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Recommended Quantity</div>
            <div style="font-size: 1.25rem; font-weight: 800; color: #0284c7; margin-top: 0.1rem;">
              ${data.recommended_quantity} <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-secondary);">${data.medicine_unit}</span>
            </div>
            <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.15rem;">
              Deficit: ${data.calculated_deficit} units (${data.monsoon_buffer_applied ? '21d Monsoon Target' : '14d Target'})
            </div>
          </div>

          <div>
            <div style="font-size: 0.76rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Estimated Transit Time</div>
            <div style="font-size: 1.15rem; font-weight: 700; color: #d97706; margin-top: 0.15rem;">
              ~${data.estimated_transit_hours} hrs
            </div>
            <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.15rem;">
              Accounts for mountain ghat impedance
            </div>
          </div>
        </div>
      ` : `
        <div style="background: rgba(225, 29, 72, 0.08); border: 1px solid rgba(225, 29, 72, 0.2); border-radius: 8px; padding: 1.25rem; margin-bottom: 1.25rem; color: #9f1239;">
          <strong>No Eligible Donors with Surplus within 50 km:</strong> All nearby facilities would fall below their mandatory retention safety stock buffer if transfer were executed. 
          Please escalate an emergency procurement order to the District Central Drug Store.
        </div>
      `}

      <!-- Rationales & Tradeoff Analysis -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem; margin-top: 1rem;">
        
        <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem;">
          <h4 style="font-size: 0.85rem; font-weight: 700; text-transform: uppercase; color: #4338ca; margin-bottom: 0.4rem; display: flex; align-items: center; gap: 0.35rem;">
            <span>🩺 Clinical Rationale (SOAP Standard)</span>
          </h4>
          <div style="font-size: 0.85rem; line-height: 1.6; color: var(--text-secondary); white-space: pre-wrap; font-family: inherit;">
            ${data.clinical_rationale}
          </div>
        </div>

        <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem;">
          <h4 style="font-size: 0.85rem; font-weight: 700; text-transform: uppercase; color: #0369a1; margin-bottom: 0.4rem; display: flex; align-items: center; gap: 0.35rem;">
            <span>🚚 Route & Logistics Strategy</span>
          </h4>
          <p style="font-size: 0.85rem; line-height: 1.55; color: var(--text-secondary);">
            ${data.suggested_route_summary || data.risk_assessment}
          </p>
        </div>

      </div>

      <!-- Tradeoff Analysis Card -->
      <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; margin-top: 1rem;">
        <h4 style="font-size: 0.85rem; font-weight: 700; text-transform: uppercase; color: #b45309; margin-bottom: 0.4rem; display: flex; align-items: center; gap: 0.35rem;">
          <span>⚖️ Multi-Factor Tradeoff Evaluation</span>
        </h4>
        <p style="font-size: 0.85rem; line-height: 1.55; color: var(--text-secondary);">
          ${data.tradeoff_analysis}
        </p>
      </div>

      <!-- Donor Safety Check Invariant -->
      ${donorSafetyHTML}

      <!-- Candidates Table -->
      ${candidatesTableHTML}

      <!-- Commit Action Footer -->
      ${commitActionBarHTML}

    </div>
  `;

  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (isTransfer) {
    showToast(`Gemini Rebalance: Recommended ${data.recommended_quantity} units from ${donor.facility_name}`, "success");
  } else {
    showToast("Rebalance complete: No viable candidate donors with surplus within radius.", "warning");
  }
}

async function applyRebalanceOrder() {
  if (!currentRebalanceResponse || !currentRebalanceResponse.recommended_donor) {
    showToast("No active recommendation or donor to apply.", "warning");
    return;
  }

  const rec = currentRebalanceResponse;
  const donor = rec.recommended_donor;

  const autoApprove = document.getElementById('rebalance-auto-approve')?.checked ?? true;
  const commitBtn = document.getElementById('btn-commit-rebalance');
  const originalBtnContent = commitBtn ? commitBtn.innerHTML : '';

  if (commitBtn) {
    commitBtn.disabled = true;
    commitBtn.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.4rem;">
        <div class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></div>
        <span>Committing Transfer...</span>
      </div>
    `;
  }

  try {
    const res = await fetch(`${API_BASE}/rebalance/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recommendation_id: rec.recommendation_id,
        source_facility_id: donor.facility_id,
        destination_facility_id: rec.destination_facility_id,
        medicine_id: rec.medicine_id,
        quantity: rec.recommended_quantity,
        urgency: rec.recommended_urgency || 'URGENT',
        ai_rationale: `${rec.clinical_rationale} | Tradeoff: ${rec.tradeoff_analysis}`,
        auto_approve: autoApprove,
        requested_by: "Gemini Autonomous Rebalancer"
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to commit rebalance transfer.");
    }

    const data = await res.json();
    showToast(`Transfer ${data.transfer_code} committed successfully! Status: ${data.status}`, "success");

    // Hide recommendation card
    const resultsCard = document.getElementById('rebalance-results-card');
    if (resultsCard) resultsCard.style.display = 'none';

    // Refresh network data and switch to transfers tab
    await loadAllData();
    switchToTab('transfers-tab');

  } catch (err) {
    console.error("Failed to commit rebalance transfer:", err);
    showToast(err.message, "error");
  } finally {
    if (commitBtn) {
      commitBtn.disabled = false;
      commitBtn.innerHTML = originalBtnContent;
    }
  }
}

// ==========================================
// AI Safety & Circuit Breakers Telemetry
// ==========================================

function toggleSafetyModal() {
  const modal = document.getElementById('safety-modal');
  if (!modal) return;
  const isOpen = modal.classList.contains('open');
  if (isOpen) {
    modal.classList.remove('open');
  } else {
    modal.classList.add('open');
    loadSafetyTelemetry();
  }
}

async function loadSafetyTelemetry() {
  try {
    const [statusRes, violationsRes] = await Promise.all([
      fetch(`${API_BASE}/safety/status`).then(r => r.json()),
      fetch(`${API_BASE}/safety/violations?limit=25`).then(r => r.json())
    ]);

    // Update Header Pill
    const reb = statusRes.circuit_breakers?.rebalance || statusRes.circuit_breakers?.rebalance_agent;
    const vis = statusRes.circuit_breakers?.vision || statusRes.circuit_breakers?.vision_ocr;
    const headerPill = document.getElementById('safety-header-pill');
    if (headerPill) {
      const rebOpen = reb?.state === 'OPEN';
      const visOpen = vis?.state === 'OPEN';
      if (rebOpen || visOpen) {
        headerPill.style.background = '#f59e0b';
        headerPill.innerText = 'Fallback Active';
      } else {
        headerPill.style.background = '#10b981';
        headerPill.innerText = '100% Guarded';
      }
    }

    // Modal Guard Status
    const isGuardActive = statusRes.guardrails_active ?? statusRes.ai_guardrails_active ?? true;
    const guardStatusEl = document.getElementById('safety-modal-guard-status');
    if (guardStatusEl) {
      guardStatusEl.innerText = isGuardActive ? 'ACTIVE (100%)' : 'DISABLED';
      guardStatusEl.style.color = isGuardActive ? '#15803d' : '#b91c1c';
    }

    // Rebalance Circuit
    if (reb) {
      const rebStateEl = document.getElementById('safety-modal-rebalance-state');
      const rebDetailEl = document.getElementById('safety-modal-rebalance-detail');
      if (rebStateEl) {
        rebStateEl.innerText = reb.state;
        rebStateEl.style.background = reb.state === 'CLOSED' ? '#10b981' : (reb.state === 'HALF_OPEN' ? '#f59e0b' : '#ef4444');
      }
      if (rebDetailEl) {
        const thresh = reb.failure_threshold ?? reb.threshold ?? 3;
        rebDetailEl.innerText = `Failures: ${reb.failure_count} / ${thresh} (${reb.state === 'CLOSED' ? 'Healthy' : 'Fallback Engaged'})`;
      }
    }

    // Vision Circuit
    if (vis) {
      const visStateEl = document.getElementById('safety-modal-vision-state');
      const visDetailEl = document.getElementById('safety-modal-vision-detail');
      if (visStateEl) {
        visStateEl.innerText = vis.state;
        visStateEl.style.background = vis.state === 'CLOSED' ? '#10b981' : (vis.state === 'HALF_OPEN' ? '#f59e0b' : '#ef4444');
      }
      if (visDetailEl) {
        const thresh = vis.failure_threshold ?? vis.threshold ?? 3;
        visDetailEl.innerText = `Failures: ${vis.failure_count} / ${thresh} (${vis.state === 'CLOSED' ? 'Healthy' : 'Fallback Engaged'})`;
      }
    }

    // Violations Table
    const countEl = document.getElementById('safety-modal-violations-count');
    const tbody = document.getElementById('safety-modal-violations-tbody');
    const items = violationsRes.violations || [];

    if (countEl) {
      countEl.innerText = `${violationsRes.total_count || items.length} events recorded`;
    }

    if (tbody) {
      if (items.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; padding: 1.5rem; color: var(--text-muted);">
              ✓ No active violations. All AI inputs and recommendations within physical bounds.
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = items.map(v => {
          const sevColor = v.severity === 'CRITICAL' ? '#ef4444' : (v.severity === 'HIGH' ? '#f97316' : '#eab308');
          const sevBg = v.severity === 'CRITICAL' ? '#fef2f2' : (v.severity === 'HIGH' ? '#fff7ed' : '#fefce8');
          const timeFormatted = v.timestamp ? new Date(v.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}) : 'Just now';
          return `
            <tr>
              <td style="padding: 0.5rem 0.75rem; white-space: nowrap; font-family: monospace;">${timeFormatted}</td>
              <td style="padding: 0.5rem 0.75rem;"><strong>${v.component}</strong></td>
              <td style="padding: 0.5rem 0.75rem;"><code style="font-size: 0.72rem; color: #4338ca;">${v.violation_type}</code></td>
              <td style="padding: 0.5rem 0.75rem;"><span class="badge" style="background: ${sevBg}; color: ${sevColor}; font-weight: 700;">${v.severity}</span></td>
              <td style="padding: 0.5rem 0.75rem; color: var(--text-secondary);">${v.remediation_applied || 'Clamped / Sanitized'}</td>
            </tr>
          `;
        }).join('');
      }
    }

  } catch (err) {
    console.error("Failed to load safety telemetry:", err);
  }
}

async function resetCircuitBreaker(component) {
  try {
    let res = await fetch(`${API_BASE}/safety/circuits/${component}/reset`, {
      method: 'POST',
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) {
      // Fallback to alternative endpoint with JSON body
      res = await fetch(`${API_BASE}/safety/circuit-breaker/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ component })
      });
    }
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || "Failed to reset circuit breaker");
    }
    showToast(`Circuit breaker for ${component} reset to CLOSED`, "success");
    await loadSafetyTelemetry();
  } catch (err) {
    showToast(err.message, "error");
  }
}



