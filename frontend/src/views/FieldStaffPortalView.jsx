import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useUI } from '../context/UIContext';
import { useAlerts } from '../context/AlertsContext';
import { api } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { VoiceDictationButton } from '../components/VoiceDictationButton';
import {
  Activity,
  ScanLine,
  Camera,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Calendar,
  Building2,
  Pill,
  ShieldCheck,
  RotateCw,
  Plus,
  Trash2,
  FileText,
  Clock,
  ArrowRight,
  Hash,
  Sparkles,
  ChevronDown,
  Info,
  Search,
  Mic,
  Lock,
  XCircle
} from 'lucide-react';
import clsx from 'clsx';

// Haptic & Audio Feedback Loops for Frontline Nurses (Ensures physical confirmation during rush hours)
function triggerFeedback(type = 'success') {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    if (type === 'offline') {
      navigator.vibrate([80, 40, 80]); // Distinct double-pulse for offline queue
    } else if (type === 'conflict') {
      navigator.vibrate([150, 60, 150]);
    } else {
      navigator.vibrate(60); // Crisp single pulse for success
    }
  }

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      if (type === 'offline') {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      } else if (type === 'conflict') {
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        osc.frequency.setValueAtTime(220, ctx.currentTime + 0.15);
      } else {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
      }
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch {
    // Graceful fallback if browser restricts audio autoplay
  }
}

export function FieldStaffPortalView() {
  const {
    facilities,
    medicines,
    selectedFacilityId,
    setSelectedFacilityId,
    refreshData,
    t
  } = useUI();
  const { showToast } = useAlerts();

  // Active sub-tab: 'logger' | 'ocr'
  const [activeSubTab, setActiveSubTab] = useState('logger');

  // Non-punitive OCC 409 Offline Conflict Reconciliation Queue
  const [reconciliationList, setReconciliationList] = useState([]);
  // Pharmacist review acknowledgment gate to eliminate OCR alert fatigue
  const [pharmacistVerified, setPharmacistVerified] = useState(false);

  // Currently selected facility for field staff work (defaults to selectedFacilityId or first facility)
  const currentFacilityId = selectedFacilityId || (facilities[0]?.id ? String(facilities[0].id) : null);
  const currentFacility = facilities.find(f => String(f.id) === String(currentFacilityId)) || facilities[0];

  // Facility stock inventory
  const [facilityInventory, setFacilityInventory] = useState([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [hideZeroStock, setHideZeroStock] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Offline queue for intermittent rural 2G/3G connectivity
  const [offlineQueue, setOfflineQueue] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('arogyasetu_offline_dispense_queue') || '[]');
    } catch {
      return [];
    }
  });

  // ----------------------------------------------------
  // SUB-TAB 1: Quick Daily Consumption Logger State
  // ----------------------------------------------------
  const [selectedMedicineId, setSelectedMedicineId] = useState(null);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [consumeQty, setConsumeQty] = useState(1);
  const [consumeReason, setConsumeReason] = useState('OPD Patient Dispense');
  const [ticketReference, setTicketReference] = useState('');
  const [loggedBy, setLoggedBy] = useState('Staff Nurse');
  const [submittingConsume, setSubmittingConsume] = useState(false);
  const [lastTransaction, setLastTransaction] = useState(null);

  // ----------------------------------------------------
  // SUB-TAB 2: Paper Register OCR Vision State
  // ----------------------------------------------------
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [editableItems, setEditableItems] = useState([]);
  const [challanRef, setChallanRef] = useState('');
  const [ocrNotes, setOcrNotes] = useState('Paper challan digitized via Gemini 3.6 Flash Vision');
  const [submittingCommit, setSubmittingCommit] = useState(false);
  const [commitResult, setCommitResult] = useState(null);

  // Fetch inventory for the currently selected facility
  const loadFacilityData = useCallback(async () => {
    if (!currentFacilityId) return;
    try {
      setLoadingInventory(true);
      const data = await api.getFacilityInventory(currentFacilityId);
      const items = data.inventory || data.items || [];
      setFacilityInventory(items);

      // Auto-select first medicine if none selected or no longer available
      if (items.length > 0) {
        setSelectedMedicineId(prev => {
          const exists = items.some(i => i.medicine_id === prev);
          return exists ? prev : items[0].medicine_id;
        });
      }
    } catch (err) {
      console.error('[FieldPortal] Failed to fetch inventory:', err);
      showToast('Could not fetch facility stock records', 'error');
    } finally {
      setLoadingInventory(false);
    }
  }, [currentFacilityId, showToast]);

  useEffect(() => {
    loadFacilityData();
  }, [loadFacilityData]);

  // Flush offline queue when connectivity resumes
  const flushOfflineQueue = useCallback(async () => {
    if (offlineQueue.length === 0) return;
    const remaining = [];
    const conflicts = [];
    let synced = 0;

    for (const item of offlineQueue) {
      try {
        await api.consumeStock(item.payload);
        synced++;
      } catch (err) {
        console.warn('[OfflineQueue] Sync result for item:', item.id, err);
        const errMsg = String(err.message || '');
        const isConflict = err.status === 409 || errMsg.includes('409') || errMsg.includes('Conflict') || errMsg.includes('Version mismatch') || errMsg.includes('Insufficient');
        
        if (isConflict) {
          // Graceful non-punitive OCC 409 conflict handling
          conflicts.push({
            id: item.id,
            timestamp: item.timestamp,
            medicine_name: item.medicine_name,
            unit: item.unit,
            batch_number: item.batch_number,
            quantity: item.quantity,
            reason: errMsg || 'Stock allocated or transferred by peer facility while offline'
          });
        } else {
          remaining.push(item);
        }
      }
    }

    setOfflineQueue(remaining);
    try {
      localStorage.setItem('arogyasetu_offline_dispense_queue', JSON.stringify(remaining));
    } catch (err) {
      console.error('[OfflineQueue] Storage update error:', err);
    }

    if (synced > 0) {
      triggerFeedback('success');
      showToast(`Successfully synced ${synced} offline dispensing transactions`, 'success', 'Offline Queue Synced');
      await loadFacilityData();
      refreshData();
    }

    if (conflicts.length > 0) {
      triggerFeedback('conflict');
      setReconciliationList(prev => [...conflicts, ...prev]);
      showToast(`${conflicts.length} offline transactions require physical register reconciliation (Allocated while offline)`, 'warning', 'Reconciliation Notice');
    }
  }, [offlineQueue, showToast, loadFacilityData, refreshData]);

  // Listen to network online event and header sync trigger
  useEffect(() => {
    const handleOnline = () => {
      flushOfflineQueue();
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('arogyasetu:flush_offline_queue', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('arogyasetu:flush_offline_queue', handleOnline);
    };
  }, [flushOfflineQueue]);

  // Filtered inventory considering hideZeroStock toggle and voice/text search query
  const displayedInventory = useMemo(() => {
    let list = facilityInventory;
    if (hideZeroStock) {
      list = list.filter(item => {
        const qty = item.total_quantity != null ? item.total_quantity : (item.total_stock || 0);
        return qty > 0;
      });
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(item =>
        (item.medicine_name || '').toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [facilityInventory, hideZeroStock, searchTerm]);

  // Currently selected medicine object
  const activeMedicine = useMemo(() => {
    return facilityInventory.find(m => m.medicine_id === selectedMedicineId) || null;
  }, [facilityInventory, selectedMedicineId]);

  // Active batches for selected medicine (FEFO ordered by expiry date)
  const availableBatches = useMemo(() => {
    if (!activeMedicine || !activeMedicine.batches) return [];
    return [...activeMedicine.batches].sort((a, b) => {
      return (a.expiry_date || '').localeCompare(b.expiry_date || '');
    });
  }, [activeMedicine]);

  // Auto-select the earliest expiring active batch with available stock
  useEffect(() => {
    if (availableBatches.length > 0) {
      const validBatch = availableBatches.find(b => b.quantity_available > 0) || availableBatches[0];
      setSelectedBatchId(validBatch.id);
    } else {
      setSelectedBatchId(null);
    }
  }, [availableBatches]);

  const activeBatch = useMemo(() => {
    return availableBatches.find(b => b.id === selectedBatchId) || null;
  }, [availableBatches, selectedBatchId]);

  // ----------------------------------------------------
  // HANDLERS: Quick Stock Consumption
  // ----------------------------------------------------
  const handleQuickConsume = async () => {
    if (!currentFacilityId || !selectedBatchId) {
      showToast('Please select a facility, medicine, and active batch', 'warning');
      return;
    }

    // Critical Sanitization: Force strict positive integer
    const sanitizedQty = Math.floor(Number(consumeQty));
    if (isNaN(sanitizedQty) || sanitizedQty <= 0) {
      showToast('Quantity must be a valid whole number greater than zero', 'warning');
      return;
    }

    if (activeBatch && sanitizedQty > activeBatch.quantity_available) {
      showToast(`Cannot consume ${sanitizedQty} units (only ${activeBatch.quantity_available} available in this batch)`, 'error');
      return;
    }

    const payload = {
      facility_id: Number(currentFacilityId),
      batch_id: Number(selectedBatchId),
      quantity: sanitizedQty,
      expected_version: activeBatch?.version,
      reference_id: ticketReference.trim() || `OPD-${new Date().toISOString().slice(0, 10)}`,
      notes: consumeReason,
      logged_by: loggedBy.trim() || 'Staff Nurse',
    };

    try {
      setSubmittingConsume(true);
      const result = await api.consumeStock(payload);
      triggerFeedback('success');
      setLastTransaction(result);
      showToast(`Logged consumption of ${sanitizedQty} ${activeMedicine?.unit || 'units'}`, 'success', 'Stock Deducted');

      // Refresh inventory and global telemetry
      await loadFacilityData();
      refreshData();
    } catch (err) {
      console.error('[FieldPortal] Consume stock failed:', err);

      // Rural Resilience: Offline queue fallback for network dropouts
      const isNetworkError = !navigator.onLine || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError');
      if (isNetworkError) {
        triggerFeedback('offline');
        const clientTxId = `OFFLINE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const offlineItem = {
          id: clientTxId,
          timestamp: new Date().toISOString(),
          facility_id: Number(currentFacilityId),
          medicine_name: activeMedicine?.medicine_name,
          unit: activeMedicine?.unit,
          batch_number: activeBatch?.batch_number,
          quantity: sanitizedQty,
          payload,
        };
        const updated = [offlineItem, ...offlineQueue];
        setOfflineQueue(updated);
        try {
          localStorage.setItem('arogyasetu_offline_dispense_queue', JSON.stringify(updated));
        } catch (storageErr) {
          console.error('[FieldPortal] Failed to save offline queue:', storageErr);
        }

        setLastTransaction({
          transaction_id: clientTxId,
          new_quantity: Math.max(0, (activeBatch?.quantity_available || 0) - sanitizedQty),
          current_hash: 'PENDING-OFFLINE-SYNC',
          is_offline: true,
        });
        showToast(`Offline mode: transaction saved locally (${clientTxId}). Will sync when connected.`, 'warning', 'Queued for Sync');
      } else {
        triggerFeedback('conflict');
        showToast(err.message || 'Failed to record stock consumption', 'error');
      }
    } finally {
      setSubmittingConsume(false);
    }
  };

  // ----------------------------------------------------
  // HANDLERS: Multimodal Paper Register OCR Vision
  // ----------------------------------------------------
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setScanResult(null);
    setEditableItems([]);
    setCommitResult(null);
  };

  const handleLoadSampleChallan = async () => {
    try {
      showToast('Loading authentic Maharashtra DHS sample register image...', 'info');
      const blob = await api.getSampleRegisterBlob();
      const file = new File([blob], 'sample_dhs_register_chalan.png', { type: 'image/png' });
      setSelectedImageFile(file);
      setImagePreviewUrl(URL.createObjectURL(blob));
      setScanResult(null);
      setEditableItems([]);
      setCommitResult(null);
      showToast('Sample DHS stock register loaded', 'success');
    } catch (err) {
      console.error('[FieldPortal] Failed to load sample image:', err);
      showToast('Could not load sample challan image', 'error');
    }
  };

  const handleScanRegister = async () => {
    if (!selectedImageFile) {
      showToast('Please select or capture an image first', 'warning');
      return;
    }

    try {
      setIsScanning(true);
      setCommitResult(null);

      const formData = new FormData();
      formData.append('file', selectedImageFile);
      if (currentFacilityId) {
        formData.append('facility_id', String(currentFacilityId));
      }

      const result = await api.scanRegister(formData);
      setScanResult(result);

      // Populate editable rows with robust schema mapping
      const rows = (result.extracted_items || []).map((item, idx) => {
        let resolvedMedId = item.matched_medicine_id ?? item.medicine_id;
        if (!resolvedMedId && medicines.length > 0) {
          const found = medicines.find(m => 
            m.name.toLowerCase().includes((item.medicine_name || '').toLowerCase()) ||
            (item.medicine_name || '').toLowerCase().includes(m.name.toLowerCase())
          );
          if (found) resolvedMedId = found.id;
        }
        const matchedMed = medicines.find(m => m.id === resolvedMedId) || medicines[0];

        return {
          id: idx + 1,
          medicine_id: resolvedMedId || matchedMed?.id || 1,
          medicine_name: item.medicine_name || matchedMed?.name,
          matched_catalog_name: item.matched_medicine_name || item.matched_catalog_name || matchedMed?.name,
          match_confidence: Math.round((item.confidence_score != null ? (item.confidence_score <= 1.0 ? item.confidence_score * 100 : item.confidence_score) : 95)),
          batch_number: item.batch_number || `BATCH-${idx + 1}`,
          expiry_date: item.expiry_date || new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
          quantity: Math.max(1, Math.floor(Number(item.quantity)) || 10),
          unit: matchedMed?.unit || item.unit || 'units',
          gtin: item.gtin || '',
          requires_pharmacist_review: Boolean(item.requires_pharmacist_review),
          review_reason: item.safety_warning || item.review_reason || (item.requires_pharmacist_review ? 'Ambiguous match requires pharmacist review' : null),
        };
      });

      setEditableItems(rows);
      showToast(`Extracted ${rows.length} medicine records from register`, 'success', 'Gemini Vision Complete');
    } catch (err) {
      console.error('[FieldPortal] OCR scan failed:', err);
      showToast(err.message || 'Failed to scan paper register', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const handleUpdateRow = (rowId, field, value) => {
    setEditableItems(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      return { ...row, [field]: value };
    }));
  };

  const handleDeleteRow = (rowId) => {
    setEditableItems(prev => prev.filter(row => row.id !== rowId));
  };

  const handleAddManualRow = () => {
    const defaultMed = medicines[0] || { id: 1, name: 'Paracetamol 500mg Tablets', unit: 'strips' };
    const newRow = {
      id: Date.now(),
      medicine_id: defaultMed.id,
      medicine_name: defaultMed.name,
      matched_catalog_name: defaultMed.name,
      match_confidence: 100,
      batch_number: `MANUAL-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`,
      expiry_date: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
      quantity: 50,
      unit: defaultMed.unit || 'units',
      requires_pharmacist_review: false,
      review_reason: null,
    };
    setEditableItems(prev => [...prev, newRow]);
  };

  const handleCommitScannedItems = async () => {
    if (editableItems.length === 0) {
      showToast('No items available to commit', 'warning');
      return;
    }

    // GS1 / GTIN Format Validation (8 to 14 digits if provided)
    for (const item of editableItems) {
      if (item.gtin && String(item.gtin).trim().length > 0) {
        const cleanGtin = String(item.gtin).trim();
        if (!/^\d{8,14}$/.test(cleanGtin)) {
          showToast(`Invalid GTIN format for batch ${item.batch_number}: must be 8 to 14 numeric digits`, 'warning');
          return;
        }
      }
    }

    try {
      setSubmittingCommit(true);
      const payload = {
        facility_id: Number(currentFacilityId),
        reference_id: challanRef.trim() || `CHALAN-${new Date().toISOString().slice(0, 10)}`,
        notes: ocrNotes.trim() || 'Digitized via Gemini 3.6 Flash Vision',
        logged_by: loggedBy.trim() || 'Staff Nurse / Store Incharge',
        items: editableItems.map(item => ({
          medicine_id: Number(item.medicine_id),
          batch_number: String(item.batch_number).trim(),
          expiry_date: String(item.expiry_date).trim(),
          quantity: Math.max(1, Math.floor(Number(item.quantity)) || 1),
          gtin: item.gtin ? String(item.gtin).trim() : null,
        }))
      };

      const result = await api.commitScannedRegister(payload);
      setCommitResult(result);
      showToast(`Successfully committed ${result.total_items_processed || editableItems.length} batches to SQLite`, 'success', 'Inventory Updated');

      // Refresh data
      await loadFacilityData();
      refreshData();
    } catch (err) {
      console.error('[FieldPortal] Commit failed:', err);
      showToast(err.message || 'Failed to commit batches into inventory', 'error');
    } finally {
      setSubmittingCommit(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">

      {/* Top Header Card */}
      <div className="p-6 rounded-2xl bg-white dark:bg-brand-dark-card border border-slate-200/80 dark:border-brand-dark-border shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
              Rural Field Staff Operations
            </span>
            <span className="text-xs text-slate-400 font-medium">आरोग्य केंद्र दैनंदिन साठा पोर्टल</span>
          </div>
          <h2 className="text-2xl font-bold font-display text-slate-900 dark:text-white">
            Field Staff Inventory Portal
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
            Mobile-first rapid dispensing for clinical nurses and multimodal Gemini 3.6 Flash Vision OCR ingestion for handwritten paper registers and delivery chalans.
          </p>
        </div>

        {/* Actions & Facility Selector */}
        <div className="flex items-center gap-3 flex-wrap">
          {offlineQueue.length > 0 && (
            <button
              type="button"
              onClick={flushOfflineQueue}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/70 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-200 font-bold text-xs border border-amber-300 dark:border-amber-800 transition shadow-xs cursor-pointer"
              title="Click to flush pending offline consumption records"
            >
              <Clock className="w-3.5 h-3.5 text-amber-600 animate-spin" />
              <span>{offlineQueue.length} Offline Tx (Sync Now)</span>
            </button>
          )}

          {/* Facility Selector Dropdown */}
          <div className="flex items-center gap-2.5 shrink-0 bg-slate-50 dark:bg-brand-dark-surface p-2 rounded-xl border border-slate-200/80 dark:border-brand-dark-border">
            <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 ml-1" />
            <div className="text-xs">
              <label className="text-[10px] text-slate-400 font-semibold uppercase block leading-tight">
                Active Facility
              </label>
              <select
                value={currentFacilityId || ''}
                onChange={(e) => setSelectedFacilityId(Number(e.target.value))}
                className="bg-transparent font-bold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer pr-2"
              >
                {facilities.map(f => (
                  <option key={f.id} value={f.id} className="dark:bg-slate-900 text-slate-900 dark:text-white">
                    {f.name} ({f.facility_code})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Non-Punitive OCC 409 Offline Conflict Reconciliation Banner */}
      {reconciliationList.length > 0 && (
        <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-700 shadow-md space-y-3 animate-fade-in">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500 text-white shrink-0 shadow-xs">
                <AlertTriangle className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-amber-950 dark:text-amber-100 flex items-center gap-2">
                  <span>साठा ताळमेळ सूचना • Physical Ledger Reconciliation Notice</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                    {reconciliationList.length} Pending
                  </span>
                </h3>
                <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5 leading-relaxed">
                  तुम्ही ऑफलाइन असताना या औषध बॅचचा साठा इतर केंद्रास हस्तांतरित किंवा वितरित झाला आहे. डेटाबेस अखंड आहे. कृपया तुमच्या प्रत्यक्ष नोंदवहीत (Physical Register) नोंद करून हा रेकॉर्ड अद्ययावत करा.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReconciliationList([])}
              className="p-1.5 rounded-lg text-amber-700 hover:text-amber-950 dark:text-amber-300 dark:hover:text-white transition cursor-pointer"
              title="Dismiss all reconciled items"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-2 pt-1">
            {reconciliationList.map((item, idx) => (
              <div
                key={item.id || idx}
                className="p-3.5 rounded-xl bg-white/90 dark:bg-brand-dark-surface/90 border border-amber-300/80 dark:border-amber-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white text-sm">
                      {item.medicine_name}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      Batch #{item.batch_number}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-800 dark:text-amber-400 mt-1">
                    Attempted: <strong>{item.quantity} {item.unit || 'units'}</strong> • {item.reason}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setReconciliationList(prev => prev.filter((_, i) => i !== idx));
                      triggerFeedback('success');
                      showToast('Reconciliation confirmed in physical register', 'info');
                    }}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>नोंदवहीत नोंद केली • Acknowledge</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sub-Tab Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-brand-dark-border pb-2">
        <button
          id="tab-logger"
          onClick={() => setActiveSubTab('logger')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-xs cursor-pointer',
            activeSubTab === 'logger'
              ? 'bg-emerald-600 text-white'
              : 'bg-white dark:bg-brand-dark-card text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          )}
        >
          <Activity className="w-4 h-4" />
          <span>Quick Daily Consumption Logger</span>
        </button>

        <button
          id="tab-ocr"
          onClick={() => setActiveSubTab('ocr')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-xs cursor-pointer',
            activeSubTab === 'ocr'
              ? 'bg-teal-600 text-white'
              : 'bg-white dark:bg-brand-dark-card text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          )}
        >
          <ScanLine className="w-4 h-4" />
          <span>Multimodal Paper Register OCR (Gemini Vision)</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-teal-100 text-teal-800 dark:bg-teal-900/80 dark:text-teal-200">
            Gemini 3.6 Flash
          </span>
        </button>
      </div>

      {/* Sub-Tab Switcher / OCR Callout Banner */}
      {activeSubTab === 'logger' && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-xs shadow-xs">
          <div className="flex items-center gap-2 text-teal-900 dark:text-teal-200">
            <ScanLine className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
            <span>Need to digitize handwritten stock logbooks with <strong>Gemini 3.6 Flash Vision</strong>?</span>
          </div>
          <button
            type="button"
            onClick={() => setActiveSubTab('ocr')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition shadow-xs cursor-pointer shrink-0"
          >
            <span>Open Paper Register OCR</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 1: Quick Daily Consumption Logger                                 */}
      {/* ========================================================================= */}
      {activeSubTab === 'logger' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Panel: Medicine & Batch Selection */}
          <div className="lg:col-span-7 space-y-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-brand-dark-card border border-slate-200/80 dark:border-brand-dark-border shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-brand-dark-border pb-3">
                <div className="flex items-center gap-2">
                  <Pill className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    1. Select Essential Medicine ({displayedInventory.length} of {facilityInventory.length})
                  </h3>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none bg-slate-100 dark:bg-slate-800/80 px-2 py-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition">
                    <input
                      type="checkbox"
                      checked={hideZeroStock}
                      onChange={(e) => setHideZeroStock(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span>Hide Zero-Stock</span>
                  </label>
                  {loadingInventory && (
                    <RotateCw className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
                  )}
                </div>
              </div>

              {/* Medicine Search & Hands-Free Voice Dictation Input */}
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Voice or type to filter medicines (e.g. Paracetamol, Snake, Vaccine)..."
                  className="w-full pl-9 pr-10 py-2 rounded-xl bg-slate-50 dark:bg-brand-dark-surface border border-slate-200 dark:border-brand-dark-border text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                  aria-label="Filter essential medicines by name or category"
                />
                <div className="absolute right-1.5 flex items-center">
                  <VoiceDictationButton
                    onTranscript={(transcript) => setSearchTerm(transcript)}
                    size="xs"
                    tooltip="Click to dictate medicine name"
                    sampleOptions={['Paracetamol', 'Anti-Snake Venom', 'Rabies', 'Amoxicillin', 'Oxytocin', 'Doxycycline']}
                  />
                </div>
              </div>

              {/* Medicine Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[360px] overflow-y-auto pr-1">
                {displayedInventory.map(item => {
                  const isSelected = item.medicine_id === selectedMedicineId;
                  const qty = item.total_quantity != null ? item.total_quantity : (item.total_stock || 0);
                  const isStockout = qty <= (item.min_safety_stock || 0);

                  const hasNearExpiry = item.batches?.some(b => {
                    if (!b.expiry_date || b.quantity_available <= 0) return false;
                    const days = Math.ceil((new Date(b.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
                    return days <= 30 && days >= 0;
                  });
                  const hasExpired = item.batches?.some(b => {
                    if (!b.expiry_date || b.quantity_available <= 0) return false;
                    const days = Math.ceil((new Date(b.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
                    return days < 0;
                  });

                  return (
                    <button
                      key={item.medicine_id}
                      onClick={() => setSelectedMedicineId(item.medicine_id)}
                      className={clsx(
                        'p-3 rounded-xl border text-left transition-all flex flex-col justify-between gap-2',
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 ring-1 ring-emerald-500'
                          : hasNearExpiry
                            ? 'border-amber-300 dark:border-amber-800/60 bg-amber-50/20 dark:bg-brand-dark-surface/40 hover:bg-amber-50/40'
                            : 'border-slate-200 dark:border-brand-dark-border bg-slate-50/40 dark:bg-brand-dark-surface/40 hover:bg-slate-100 dark:hover:bg-brand-dark-surface'
                      )}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-bold text-xs text-slate-900 dark:text-white leading-tight line-clamp-1">
                            {item.medicine_name}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {item.requires_cold_chain ? (
                              <span className="text-[10px] text-teal-600 dark:text-teal-400" title="Cold Chain Required">❄️</span>
                            ) : null}
                            {hasExpired ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                Expired
                              </span>
                            ) : hasNearExpiry ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 flex items-center gap-0.5 border border-amber-300/80">
                                ⚠️ &lt;30d Exp
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {item.category} • Floor: {item.min_safety_stock} {item.unit}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-800">
                        <span className="text-[10px] text-slate-400">
                          {item.batches?.length || 0} batches
                        </span>
                        <span className={clsx(
                          'font-bold text-xs',
                          isStockout ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
                        )}>
                          {qty} {item.unit}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Active Batches Selection (FEFO) */}
              <div className="pt-3 border-t border-slate-100 dark:border-brand-dark-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-500" />
                    <span>2. Select Batch (Ordered by FEFO - First Expired First Out)</span>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {availableBatches.length} batch{availableBatches.length === 1 ? '' : 'es'} active
                  </span>
                </div>

                {/* Near-Expiry Clinical Notice */}
                {availableBatches.some(b => {
                  const days = b.expiry_date ? Math.ceil((new Date(b.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)) : null;
                  return days !== null && days <= 30 && days >= 0 && b.quantity_available > 0;
                }) && (
                  <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/80 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="leading-tight">
                      <strong>FEFO Priority Protocol:</strong> Active batch expiring within 30 days detected. System automatically prioritizes dispensing this lot before newer stock.
                    </span>
                  </div>
                )}

                {availableBatches.length === 0 ? (
                  <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs text-center">
                    Zero stock batches available for this medicine at {currentFacility?.name}.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {availableBatches.map(b => {
                      const isSelected = b.id === selectedBatchId;
                      const daysUntilExpiry = b.expiry_date ? Math.ceil((new Date(b.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)) : null;
                      const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;
                      const isNearExpiry = daysUntilExpiry !== null && daysUntilExpiry <= 30 && daysUntilExpiry >= 0;

                      return (
                        <div
                          key={b.id}
                          onClick={() => setSelectedBatchId(b.id)}
                          className={clsx(
                            'p-2.5 rounded-xl border cursor-pointer transition flex items-center justify-between text-xs',
                            isSelected
                              ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 ring-1 ring-blue-500'
                              : isNearExpiry
                                ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/30 dark:bg-amber-950/20 hover:bg-amber-50/50'
                                : 'border-slate-200 dark:border-brand-dark-border bg-white dark:bg-brand-dark-surface hover:bg-slate-50'
                          )}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                              {b.batch_number}
                            </span>
                            <span className="text-slate-400">•</span>
                            <span className="text-[11px] text-slate-500 flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              Exp: {b.expiry_date}
                            </span>
                            {isExpired && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                                Expired ({Math.abs(daysUntilExpiry)}d ago)
                              </span>
                            )}
                            {isNearExpiry && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300 dark:border-amber-700 flex items-center gap-1 shadow-xs">
                                <AlertTriangle className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                                <span>⚠️ Near Expiry ({daysUntilExpiry}d left)</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {b.quantity_available} {activeMedicine?.unit || 'units'}
                            </span>
                            {isSelected && (
                              <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel: Rapid Decrement Controls & Action */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-brand-dark-card border border-slate-200/80 dark:border-brand-dark-border shadow-xs space-y-5">
              <div className="border-b border-slate-100 dark:border-brand-dark-border pb-3">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  3. Dispense & Consumption Action
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Logs clinical consumption with optimistic OCC concurrency and SHA-256 audit chaining.
                </p>
              </div>

              {/* Quick Decrement Stepper - 48px Touch Target Padding for Gloved Field Staff / PPE */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Quick Quantity ({activeMedicine?.unit || 'units'})
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">PPE 48px Touch Safe</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 5, 10, 20].map(qty => (
                    <button
                      key={qty}
                      type="button"
                      onClick={() => setConsumeQty(qty)}
                      className={clsx(
                        'min-h-[48px] py-3 px-2 rounded-xl font-bold text-sm transition border active:scale-95 cursor-pointer flex items-center justify-center',
                        consumeQty === qty
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-400/40'
                          : 'bg-slate-100 dark:bg-brand-dark-surface border-slate-200 dark:border-brand-dark-border text-slate-800 dark:text-slate-200 hover:bg-slate-200'
                      )}
                    >
                      -{qty} {activeMedicine?.unit?.slice(0, 4) || ''}
                    </button>
                  ))}
                </div>

                {/* Custom Quantity Stepper - Minimum 48x48px Hit-box */}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setConsumeQty(prev => Math.max(1, prev - 1))}
                    aria-label="Decrease Quantity"
                    className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-extrabold hover:bg-slate-300 dark:hover:bg-slate-700 transition flex items-center justify-center text-2xl active:scale-95 cursor-pointer shadow-xs border border-slate-300 dark:border-slate-700"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={consumeQty}
                    onChange={(e) => setConsumeQty(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
                    className="flex-1 h-12 min-h-[48px] text-center rounded-xl bg-slate-100 dark:bg-brand-dark-surface border border-slate-200 dark:border-brand-dark-border font-extrabold text-base text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setConsumeQty(prev => prev + 1)}
                    aria-label="Increase Quantity"
                    className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-extrabold hover:bg-slate-300 dark:hover:bg-slate-700 transition flex items-center justify-center text-2xl active:scale-95 cursor-pointer shadow-xs border border-slate-300 dark:border-slate-700"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Dispensing Reason */}
              <div className="space-y-1.5 text-xs">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Clinical Dispensing Reason
                </label>
                <select
                  value={consumeReason}
                  onChange={(e) => setConsumeReason(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-brand-dark-surface border border-slate-200 dark:border-brand-dark-border text-slate-800 dark:text-slate-200 font-medium"
                >
                  <option value="OPD Patient Dispense">OPD Patient Prescription Dispense</option>
                  <option value="Emergency Resuscitation">Emergency Snakebite / Trauma Treatment</option>
                  <option value="Inpatient Ward Administration">Inpatient Ward Routine Administration</option>
                  <option value="Wasted / Damaged / Cold Chain Break">Damaged / Excursion Write-Off</option>
                </select>
              </div>

              {/* Reference & Staff Member */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      Patient / Ticket No.
                    </label>
                    <VoiceDictationButton
                      onTranscript={(text) => setTicketReference(text)}
                      size="xs"
                      tooltip="Click to dictate Patient / Ticket ID"
                      sampleOptions={['OPD-9214', 'IPD-4081', 'EMERGENCY-01', 'SNAKE-BITE-77']}
                    />
                  </div>
                  <input
                    type="text"
                    value={ticketReference}
                    onChange={(e) => setTicketReference(e.target.value)}
                    placeholder="OPD-9214"
                    className="w-full p-2 rounded-xl bg-slate-100 dark:bg-brand-dark-surface border border-slate-200 dark:border-brand-dark-border text-slate-800 dark:text-slate-200 text-xs"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      Logged By
                    </label>
                    <VoiceDictationButton
                      onTranscript={(text) => setLoggedBy(text)}
                      size="xs"
                      tooltip="Click to dictate Staff Member Name"
                      sampleOptions={['Staff Nurse Sunita', 'Dr. Patil', 'Store Incharge Shinde', 'ANM Anita']}
                    />
                  </div>
                  <input
                    type="text"
                    value={loggedBy}
                    onChange={(e) => setLoggedBy(e.target.value)}
                    placeholder="Staff Nurse"
                    className="w-full p-2 rounded-xl bg-slate-100 dark:bg-brand-dark-surface border border-slate-200 dark:border-brand-dark-border text-slate-800 dark:text-slate-200 text-xs"
                  />
                </div>
              </div>

              {/* Action Submit Button - 52px Touch Height for PPE Gloves */}
              <button
                type="button"
                onClick={handleQuickConsume}
                disabled={submittingConsume || !selectedBatchId || (activeBatch && activeBatch.quantity_available <= 0)}
                className={clsx(
                  'w-full min-h-[52px] py-3.5 px-4 rounded-xl font-bold text-sm text-white shadow-md transition flex items-center justify-center gap-2 active:scale-[0.98]',
                  submittingConsume || !selectedBatchId || (activeBatch && activeBatch.quantity_available <= 0)
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-500 cursor-pointer shadow-emerald-600/20'
                )}
              >
                {submittingConsume ? (
                  <>
                    <RotateCw className="w-5 h-5 animate-spin" />
                    <span>Writing to Cryptographic DSCSA Ledger...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5" />
                    <span>Confirm & Record Consumption (-{consumeQty} {activeMedicine?.unit})</span>
                  </>
                )}
              </button>

              {/* Last Transaction Cryptographic Confirmation */}
              {lastTransaction && (
                <div className={clsx(
                  "p-3 rounded-xl border text-xs space-y-1.5 animate-fade-in",
                  lastTransaction.is_offline
                    ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800"
                    : "bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                )}>
                  <div className={clsx(
                    "flex items-center justify-between font-bold",
                    lastTransaction.is_offline
                      ? "text-amber-800 dark:text-amber-300"
                      : "text-emerald-600 dark:text-emerald-400"
                  )}>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{lastTransaction.is_offline ? 'Stored in Local Offline Queue' : 'Stock Decrement Recorded'}</span>
                    </span>
                    <span className="text-[10px] font-mono">TX #{lastTransaction.transaction_id || lastTransaction.id}</span>
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300">
                    Remaining batch balance: <strong>{lastTransaction.new_quantity ?? lastTransaction.quantity_available} units</strong>
                  </div>
                  {lastTransaction.current_hash && (
                    <div className="text-[10px] font-mono text-slate-400 truncate">
                      {lastTransaction.is_offline ? 'Status: Queued for Sync' : `SHA-256: ${lastTransaction.current_hash}`}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: Multimodal Paper Register OCR (Gemini 3.6 Flash Vision)         */}
      {/* ========================================================================= */}
      {activeSubTab === 'ocr' && (
        <div className="space-y-6">

          {/* Upload & Scanning Control Card */}
          <div className="p-6 rounded-2xl bg-white dark:bg-brand-dark-card border border-slate-200/80 dark:border-brand-dark-border shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-brand-dark-border pb-4">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <Camera className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span>Upload Physical Paper Register / Delivery Challan</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Upload a photo of handwritten stock logs or delivery vouchers for Gemini 3.6 Flash Vision OCR transcription.
                </p>
              </div>

              {/* Quick Sample Challan Button */}
              <button
                type="button"
                id="load-sample-register-btn"
                data-testid="load-sample-register-btn"
                onClick={handleLoadSampleChallan}
                className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-xs transition flex items-center gap-2 shrink-0 cursor-pointer"
                title="Load sample photograph of a rural handwritten paper stock logbook"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>⚡ Load Sample Register</span>
              </button>
            </div>

            {/* Drag & Drop Zone */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              <div className="md:col-span-7">
                <label className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 dark:hover:border-teal-400 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all bg-slate-50/50 dark:bg-brand-dark-surface/40 group">
                  <UploadCloud className="w-10 h-10 text-slate-400 group-hover:text-teal-600 transition mb-2" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Click to browse or drag & drop photo
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1">
                    Supports PNG, JPEG, WebP (up to 10MB)
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Image Preview & Scan Action */}
              <div className="md:col-span-5 flex flex-col items-center justify-center space-y-3">
                {imagePreviewUrl ? (
                  <div className="w-full space-y-3">
                    <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 max-h-48 bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
                      <img
                        src={imagePreviewUrl}
                        alt="Register preview"
                        className="object-contain max-h-48 w-full"
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="truncate max-w-[200px] font-mono">{selectedImageFile?.name}</span>
                      <span>{(selectedImageFile?.size / 1024).toFixed(0)} KB</span>
                    </div>

                    <button
                      type="button"
                      id="analyze-gemini-vision-btn"
                      data-testid="analyze-gemini-vision-btn"
                      onClick={handleScanRegister}
                      disabled={isScanning}
                      className={clsx(
                        'w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white shadow-md transition flex items-center justify-center gap-2 cursor-pointer',
                        isScanning
                          ? 'bg-slate-400 cursor-not-allowed'
                          : 'bg-teal-600 hover:bg-teal-500'
                      )}
                    >
                      {isScanning ? (
                        <>
                          <RotateCw className="w-4 h-4 animate-spin" />
                          <span>Gemini 3.6 Flash Vision Transcribing...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Analyze Register with Gemini Vision</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="text-center text-xs text-slate-400 py-6">
                    No image selected. Click the box to upload, or click <strong className="text-teal-600 dark:text-teal-400">"⚡ Load Sample Register"</strong> above.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Extracted Items Verification Table */}
          {editableItems.length > 0 && (
            <div className="p-6 rounded-2xl bg-white dark:bg-brand-dark-card border border-slate-200/80 dark:border-brand-dark-border shadow-xs space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-brand-dark-border pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      Verified Batch Ledger Preview ({editableItems.length} Medicines Extracted)
                    </h3>
                    {scanResult?.requires_pharmacist_review_count > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>{scanResult.requires_pharmacist_review_count} Requires Pharmacist Review</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Review and adjust medicine matching, batch numbers, or expiration dates prior to committing to SQLite.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAddManualRow}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Add Line Item</span>
                </button>
              </div>

              {/* Interactive Verification Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-brand-dark-border">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-brand-dark-surface/80 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-brand-dark-border">
                      <th className="p-3">Matched Medicine</th>
                      <th className="p-3">Batch / GTIN</th>
                      <th className="p-3">Expiry Date</th>
                      <th className="p-3">Quantity</th>
                      <th className="p-3">Catalog Match & Audit Status</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {editableItems.map(row => {
                      const matchedMed = medicines.find(m => m.id === row.medicine_id);
                      const isColdChain = Boolean(matchedMed?.requires_cold_chain);

                      return (
                        <tr key={row.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                          {/* Medicine Select Override */}
                          <td className="p-3 min-w-[220px]">
                            <select
                              value={row.medicine_id}
                              onChange={(e) => {
                                const newId = Number(e.target.value);
                                const targetMed = medicines.find(m => m.id === newId);
                                handleUpdateRow(row.id, 'medicine_id', newId);
                                if (targetMed) {
                                  handleUpdateRow(row.id, 'medicine_name', targetMed.name);
                                  handleUpdateRow(row.id, 'matched_catalog_name', targetMed.name);
                                  handleUpdateRow(row.id, 'unit', targetMed.unit);
                                }
                              }}
                              className="w-full p-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
                            >
                              {medicines.map(m => (
                                <option key={m.id} value={m.id}>
                                  {m.name} ({m.category})
                                </option>
                              ))}
                            </select>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="text-[10px] text-slate-400">
                                Extracted: <em>{row.medicine_name}</em>
                              </span>
                              {isColdChain && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800" title="Verify cold box / ILR temperature log (2°C - 8°C)">
                                  <span>❄️</span>
                                  <span>Cold Chain (2°C - 8°C)</span>
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Batch Number & Optional GS1 GTIN */}
                          <td className="p-3 min-w-[150px]">
                            <input
                              type="text"
                              value={row.batch_number}
                              onChange={(e) => handleUpdateRow(row.id, 'batch_number', e.target.value.toUpperCase())}
                              placeholder="Batch Number"
                              className="w-full p-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white uppercase"
                            />
                            <input
                              type="text"
                              value={row.gtin || ''}
                              onChange={(e) => handleUpdateRow(row.id, 'gtin', e.target.value.replace(/\D/g, ''))}
                              placeholder="GS1 GTIN (Optional)"
                              maxLength={14}
                              className="w-full p-1 mt-1 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-400"
                              title="14-digit GS1 Global Trade Item Number"
                            />
                          </td>

                          {/* Expiry Date */}
                          <td className="p-3 min-w-[130px]">
                            <input
                              type="date"
                              value={row.expiry_date}
                              onChange={(e) => handleUpdateRow(row.id, 'expiry_date', e.target.value)}
                              className="w-full p-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white"
                            />
                          </td>

                          {/* Quantity */}
                          <td className="p-3 min-w-[100px]">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={row.quantity}
                                onChange={(e) => handleUpdateRow(row.id, 'quantity', Math.max(1, Math.floor(Number(e.target.value)) || 1))}
                                className="w-16 p-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white text-right"
                              />
                              <span className="text-[11px] text-slate-400">{row.unit}</span>
                            </div>
                          </td>

                          {/* Match & Review Status */}
                          <td className="p-3 min-w-[180px]">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {row.match_confidence != null && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                    {Math.round(row.match_confidence)}% match
                                  </span>
                                )}
                                {row.requires_pharmacist_review ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    <span>Review Needed</span>
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    Standard Match
                                  </span>
                                )}
                              </div>
                              {row.review_reason && (
                                <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-tight">
                                  {row.review_reason}
                                </p>
                              )}
                            </div>
                          </td>

                          {/* Delete Action */}
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(row.id)}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                              title="Delete Item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pharmacist Review Gate - Eliminates Alert Fatigue on Borderline OCR Matches */}
              {editableItems.some(i => i.requires_pharmacist_review) && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-700/80 flex items-start gap-3 mt-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs">
                    <p className="font-extrabold text-amber-950 dark:text-amber-100 flex items-center gap-1.5">
                      <span>⚠️</span>
                      <span>{t('ocr_alert_fatigue_title')}</span>
                    </p>
                    <p className="text-amber-900/80 dark:text-amber-300 text-[11px] mt-0.5 mb-2 leading-relaxed">
                      {t('ocr_alert_fatigue_desc')}
                    </p>
                    <label className="inline-flex items-center gap-2 cursor-pointer font-bold text-amber-950 dark:text-amber-100 select-none bg-amber-100/60 dark:bg-amber-900/40 px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700">
                      <input
                        type="checkbox"
                        checked={pharmacistVerified}
                        onChange={(e) => setPharmacistVerified(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-amber-400 cursor-pointer"
                      />
                      <span className="text-xs">{t('ocr_verify_checkbox')}</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Commit Section Footer */}
              <div className="pt-4 border-t border-slate-100 dark:border-brand-dark-border grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div className="md:col-span-7 flex items-center gap-3 flex-wrap">
                  <div className="min-w-[180px]">
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-[10px] text-slate-400 font-semibold block">
                        {t('challan_ref_label')}
                      </label>
                      <VoiceDictationButton
                        onTranscript={(text) => setChallanRef(text)}
                        size="xs"
                        position="above"
                        tooltip="Click to dictate Challan ID"
                        sampleOptions={['CHALAN-MH-2026-09', 'DHS-PUNE-8821', 'SATARA-COLD-04']}
                      />
                    </div>
                    <input
                      type="text"
                      value={challanRef}
                      onChange={(e) => setChallanRef(e.target.value)}
                      placeholder="CHALAN-MH-2026-09"
                      className="w-full p-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-slate-800 dark:text-slate-200"
                    />
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-[10px] text-slate-400 font-semibold block">
                        {t('audit_notes_label')}
                      </label>
                      <VoiceDictationButton
                        onTranscript={(text) => setOcrNotes(text)}
                        size="xs"
                        position="above"
                        tooltip="Click to dictate Audit Notes"
                        sampleOptions={['Routine weekly OPD supply', 'Emergency monsoonal antivenom restock', 'Cold chain 4C verified']}
                      />
                    </div>
                    <input
                      type="text"
                      value={ocrNotes}
                      onChange={(e) => setOcrNotes(e.target.value)}
                      className="w-full p-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>

                <div className="md:col-span-5 flex flex-col items-end gap-1">
                  {editableItems.some(i => i.requires_pharmacist_review) && !pharmacistVerified && (
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      <span>{t('ocr_alert_fatigue_title')}</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleCommitScannedItems}
                    disabled={
                      submittingCommit ||
                      editableItems.length === 0 ||
                      (editableItems.some(i => i.requires_pharmacist_review) && !pharmacistVerified)
                    }
                    className={clsx(
                      'w-full min-h-[48px] py-3 px-4 rounded-xl font-bold text-xs text-white shadow-md transition flex items-center justify-center gap-2 active:scale-95',
                      submittingCommit ||
                      editableItems.length === 0 ||
                      (editableItems.some(i => i.requires_pharmacist_review) && !pharmacistVerified)
                        ? 'bg-slate-400 cursor-not-allowed opacity-75'
                        : 'bg-emerald-600 hover:bg-emerald-500 cursor-pointer shadow-emerald-600/20'
                    )}
                  >
                    {submittingCommit ? (
                      <>
                        <RotateCw className="w-4 h-4 animate-spin" />
                        <span>Executing SQLite Atomic UPSERT...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>{t('btn_commit_inventory')} ({editableItems.length} Batches)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Commit Confirmation Result */}
              {commitResult && (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between text-emerald-800 dark:text-emerald-300 font-bold">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>{commitResult.message || 'Batches Committed Successfully'}</span>
                    </span>
                    <span className="font-mono text-[11px]">
                      {commitResult.total_items_processed || editableItems.length} Records Inserted
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    Live stock balances at <strong>{currentFacility?.name}</strong> have been updated. Cryptographic SHA-256 audit ledger records written to <code>inventory_transactions</code>.
                  </p>
                </div>
              )}

            </div>
          )}

        </div>
      )}

    </div>
  );
}
