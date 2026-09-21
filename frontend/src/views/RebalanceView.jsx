import React, { useState, useEffect, useMemo } from 'react';
import { useUI } from '../context/UIContext';
import { useAlerts } from '../context/AlertsContext';
import { api } from '../services/api';
import {
  Sparkles,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Truck,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Sliders,
  CloudRain,
  MapPin,
  Clock,
  Building2,
  ThermometerSnowflake,
  FileText,
  Lock,
  ChevronRight,
  Info
} from 'lucide-react';
import clsx from 'clsx';

export function RebalanceView() {
  const {
    facilities,
    medicines,
    facilityMap,
    medicineMap,
    openAuthModal,
    selectedDeficitId,
    setSelectedDeficitId
  } = useUI();
  const { showToast } = useAlerts();

  // Deficits state
  const [deficits, setDeficits] = useState([]);
  const [loadingDeficits, setLoadingDeficits] = useState(false);
  const [selectedDeficitIndex, setSelectedDeficitIndex] = useState(0);

  // Configuration controls
  const [selectedFacilityId, setSelectedFacilityId] = useState(null);
  const [selectedMedicineId, setSelectedMedicineId] = useState(null);
  const [maxRadiusKm, setMaxRadiusKm] = useState(50);
  const [minDonorBufferDays, setMinDonorBufferDays] = useState(14);
  const [monsoonMode, setMonsoonMode] = useState(false);
  const [urgency, setUrgency] = useState('ROUTINE');

  // Recommendation state
  const [recommendation, setRecommendation] = useState(null);
  const [loadingRecommendation, setLoadingRecommendation] = useState(false);

  // Fetch live network deficits on mount
  const fetchDeficits = async () => {
    try {
      setLoadingDeficits(true);
      const data = await api.getNetworkDeficits(maxRadiusKm, minDonorBufferDays);
      setDeficits(data || []);

      if (data && data.length > 0) {
        // If a specific deficit facility was requested, focus on it
        if (selectedDeficitId) {
          const matchIdx = data.findIndex(d => d.facility_id === selectedDeficitId);
          if (matchIdx !== -1) {
            setSelectedDeficitIndex(matchIdx);
            setSelectedFacilityId(data[matchIdx].facility_id);
            setSelectedMedicineId(data[matchIdx].medicine_id);
            return;
          }
        }
        // Otherwise default to the first one
        setSelectedDeficitIndex(0);
        setSelectedFacilityId(data[0].facility_id);
        setSelectedMedicineId(data[0].medicine_id);
      }
    } catch (err) {
      console.error('Failed to load network deficits:', err);
      showToast('Could not load active network deficits', 'error');
    } finally {
      setLoadingDeficits(false);
    }
  };

  useEffect(() => {
    fetchDeficits();
  }, [maxRadiusKm, minDonorBufferDays]);

  useEffect(() => {
    if (selectedDeficitId && deficits.length > 0) {
      const matchIdx = deficits.findIndex(d => d.facility_id === selectedDeficitId);
      if (matchIdx !== -1) {
        setSelectedDeficitIndex(matchIdx);
        setSelectedFacilityId(deficits[matchIdx].facility_id);
        setSelectedMedicineId(deficits[matchIdx].medicine_id);
        setRecommendation(null);
      }
    }
  }, [selectedDeficitId, deficits]);

  // Sync selected deficit into form
  const handleSelectDeficit = (def, idx) => {
    setSelectedDeficitIndex(idx);
    setSelectedFacilityId(def.facility_id);
    setSelectedMedicineId(def.medicine_id);
    setRecommendation(null);
  };

  // Run autonomous rebalance recommendation
  const handleGenerateRecommendation = async () => {
    if (!selectedFacilityId || !selectedMedicineId) {
      showToast('Please choose a recipient facility and medicine deficit', 'warning');
      return;
    }

    try {
      setLoadingRecommendation(true);
      setRecommendation(null);

      const payload = {
        destination_facility_id: Number(selectedFacilityId),
        medicine_id: Number(selectedMedicineId),
        target_buffer_days: 14,
        min_donor_buffer_days: Number(minDonorBufferDays),
        max_radius_km: Number(maxRadiusKm),
        urgency: urgency,
        monsoon_mode: monsoonMode
      };

      const result = await api.getRebalanceRecommendation(payload);
      setRecommendation(result);

      if (result.is_feasible) {
        showToast(
          `Feasible donor found: ${result.recommended_donor?.facility_name} (${result.recommended_quantity} ${result.medicine_unit})`,
          'success'
        );
      } else {
        showToast('No candidate donor satisfies safe non-cannibalization constraints', 'warning');
      }
    } catch (err) {
      console.error('Recommendation failed:', err);
      showToast(err.message || 'Failed to generate rebalancing proposal', 'error');
    } finally {
      setLoadingRecommendation(false);
    }
  };

  // Trigger modal sign-off
  const handleOpenAuthModal = () => {
    if (!recommendation || !recommendation.is_feasible || !recommendation.recommended_donor) {
      showToast('Cannot authorize an infeasible rebalancing proposal', 'error');
      return;
    }

    const donorFac = facilityMap.get(recommendation.recommended_donor.facility_id);
    const recFac = facilityMap.get(recommendation.destination_facility_id);

    const modalData = {
      recommendation_id: recommendation.recommendation_id,
      donor_facility_id: recommendation.recommended_donor.facility_id,
      recipient_facility_id: recommendation.destination_facility_id,
      medicine_id: recommendation.medicine_id,
      medicine_name: recommendation.medicine_name,
      unit: recommendation.medicine_unit,
      recommended_quantity: recommendation.recommended_quantity,
      distance_km: recommendation.estimated_distance_km || recommendation.recommended_donor.distance_km,
      estimated_transit_hours: recommendation.estimated_transit_hours || recommendation.recommended_donor.estimated_transit_hours,
      requires_cold_chain: Boolean(recommendation.recommended_donor.has_cold_chain),
      clinical_rationale: recommendation.clinical_rationale,
      ai_reasoning: `${recommendation.clinical_rationale}\n\nTradeoff Analysis:\n${recommendation.tradeoff_analysis}\n\nRisk Assessment:\n${recommendation.risk_assessment}`,
      allocated_batches: [],
      donor_post_transfer_dir: recommendation.donor_post_transfer_dir,
      donor_current_stock: recommendation.recommended_donor.current_stock,
      donor_retention_buffer: recommendation.recommended_donor.retention_buffer,
      monsoon_mode: monsoonMode,
      monsoon_buffer_applied: recommendation.monsoon_buffer_applied
    };

    openAuthModal(modalData);
  };

  const currentDeficit = deficits[selectedDeficitIndex];

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-brand-dark-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80">
              Module 4.4 • Peer-to-Peer Logistics
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>Gemini 3.6 Flash Autonomous Agent</span>
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-900 dark:text-white mt-1.5">
            Autonomous Stock Rebalancing Cockpit
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time peer-to-peer inter-PHC stock redistribution with non-cannibalization safety proof
          </p>
        </div>

        <button
          onClick={fetchDeficits}
          disabled={loadingDeficits}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-brand-dark-card border border-slate-200 dark:border-brand-dark-border hover:bg-slate-50 dark:hover:bg-brand-dark-surface text-slate-700 dark:text-slate-200 transition shadow-xs self-start sm:self-auto"
        >
          <RefreshCw className={clsx('w-3.5 h-3.5', loadingDeficits && 'animate-spin')} />
          <span>Refresh Deficits Radar</span>
        </button>
      </div>

      {/* Main Grid: Left Deficits Radar vs Right Control & Reasoning */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Network Deficits Radar (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="card-clinical p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-brand-dark-border pb-2.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h3 className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
                  Network Deficits Radar
                </h3>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {deficits.length} Shortages Detected
              </span>
            </div>

            {loadingDeficits ? (
              <div className="p-8 text-center space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-emerald-500 mx-auto" />
                <p className="text-xs text-slate-400">Scanning 15 facilities for clinical deficits...</p>
              </div>
            ) : deficits.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 space-y-1">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                <h4 className="font-bold text-xs text-emerald-900 dark:text-emerald-200">Network Fully Balanced</h4>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                  All 15 facilities across Pune & Satara maintain safe inventory buffers.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {deficits.map((def, idx) => {
                  const isSelected = selectedDeficitIndex === idx;
                  const isCritical = def.status === 'CRITICAL' || def.current_stock === 0;

                  return (
                    <div
                      key={`${def.facility_id}-${def.medicine_id}`}
                      onClick={() => handleSelectDeficit(def, idx)}
                      className={clsx(
                        'p-3 rounded-xl border transition cursor-pointer text-xs space-y-2',
                        isSelected
                          ? 'border-indigo-500 dark:border-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-xs'
                          : 'border-slate-200 dark:border-brand-dark-border bg-white dark:bg-brand-dark-card hover:bg-slate-50 dark:hover:bg-brand-dark-surface'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className={clsx(
                              'w-2 h-2 rounded-full',
                              isCritical ? 'bg-rose-500 animate-pulse' : 'bg-amber-500'
                            )} />
                            <h4 className="font-bold text-slate-900 dark:text-white">
                              {def.facility_name}
                            </h4>
                          </div>
                          <span className="text-[10px] text-slate-400 block ml-3.5">
                            {def.district} District
                          </span>
                        </div>

                        <span className={clsx(
                          'px-2 py-0.5 rounded-md font-bold text-[10px] uppercase',
                          isCritical
                            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                            : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                        )}>
                          {def.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800">
                        <div>
                          <span className="text-slate-400 block text-[10px]">Depleted Medicine:</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200 truncate block">
                            {def.medicine_name}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-400 block text-[10px]">Shortage Deficit:</span>
                          <span className="font-bold text-rose-600 dark:text-rose-400">
                            -{def.deficit_quantity} {def.unit}
                          </span>
                        </div>
                      </div>

                      {def.top_donor_facility_name && (
                        <div className="p-1.5 rounded-lg bg-slate-100/70 dark:bg-slate-800/40 text-[10px] flex items-center justify-between text-slate-600 dark:text-slate-300">
                          <span className="truncate">
                            Candidate Donor: <strong>{def.top_donor_facility_name}</strong>
                          </span>
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 shrink-0 ml-2">
                            +{def.top_donor_surplus} {def.unit} ({def.top_donor_distance_km?.toFixed(0)} km)
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Simulation Parameter Card */}
          <div className="card-clinical p-4 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-brand-dark-border pb-2">
              <Sliders className="w-4 h-4 text-slate-500" />
              <h3 className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Redistribution Constraints
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              {/* Max Search Radius */}
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-slate-500">Max Search Radius:</span>
                  <span className="font-bold font-mono text-slate-900 dark:text-white">{maxRadiusKm} km</span>
                </div>
                <input
                  type="range"
                  min="15"
                  max="100"
                  step="5"
                  value={maxRadiusKm}
                  onChange={(e) => setMaxRadiusKm(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              {/* Min Donor Retention Buffer */}
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-slate-500">Donor Retention Reserve (DAC):</span>
                  <span className="font-bold font-mono text-slate-900 dark:text-white">≥ {minDonorBufferDays} Days</span>
                </div>
                <input
                  type="range"
                  min="7"
                  max="30"
                  step="1"
                  value={minDonorBufferDays}
                  onChange={(e) => setMinDonorBufferDays(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              {/* Monsoon Mode Toggle */}
              <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-brand-dark-surface/40 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <CloudRain className={clsx('w-4 h-4', monsoonMode ? 'text-sky-500' : 'text-slate-400')} />
                  <div>
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-200 block">
                      Sahyadri Monsoon Multiplier (1.5x)
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      Guards against Western Ghats landslides and road washouts
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={monsoonMode}
                  onChange={(e) => setMonsoonMode(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4 h-4"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Right Column: AI Optimization Console & SOAP Rationale (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Active Target Configuration Bar */}
          <div className="card-clinical p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-brand-dark-border pb-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                <h3 className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
                  Target Deficit Triage
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                Peer Optimization Engine
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                  Recipient Facility (Deficit Node)
                </label>
                <select
                  value={selectedFacilityId || ''}
                  onChange={(e) => setSelectedFacilityId(Number(e.target.value))}
                  className="w-full p-2 rounded-xl bg-slate-100 dark:bg-brand-dark-surface border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Select Recipient Facility</option>
                  {facilities.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.facility_code} • {f.district})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                  Essential Medicine
                </label>
                <select
                  value={selectedMedicineId || ''}
                  onChange={(e) => setSelectedMedicineId(Number(e.target.value))}
                  className="w-full p-2 rounded-xl bg-slate-100 dark:bg-brand-dark-surface border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Select Medicine</option>
                  {medicines.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.sku} • {m.unit})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleGenerateRecommendation}
              disabled={loadingRecommendation || !selectedFacilityId || !selectedMedicineId}
              className={clsx(
                'w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white shadow-md transition flex items-center justify-center gap-2',
                loadingRecommendation || !selectedFacilityId || !selectedMedicineId
                  ? 'bg-slate-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700'
              )}
            >
              {loadingRecommendation ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Evaluating Candidate Donors with Gemini AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Gemini Autonomous Rebalancing Plan</span>
                </>
              )}
            </button>
          </div>

          {/* AI Recommendation Result Panel */}
          {recommendation && (
            <div className="card-clinical p-5 space-y-4 animate-fade-in">
              
              {/* Feasibility Header Banner */}
              <div className={clsx(
                'p-3.5 rounded-xl border flex items-start justify-between gap-3',
                recommendation.is_feasible
                  ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                  : 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/60 text-rose-900 dark:text-rose-200'
              )}>
                <div className="flex items-center gap-2.5">
                  {recommendation.is_feasible ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                  )}
                  <div>
                    <h4 className="font-bold text-xs leading-tight">
                      {recommendation.is_feasible
                        ? 'Redistribution Plan Verified: Mathematically Feasible'
                        : 'Redistribution Infeasible: Non-Cannibalization Invariant Guarded'}
                    </h4>
                    <p className="text-[11px] opacity-90 mt-0.5">
                      {recommendation.is_feasible
                        ? `Optimal donor ${recommendation.recommended_donor?.facility_name} has safe surplus of ${recommendation.recommended_quantity} ${recommendation.medicine_unit}`
                        : 'No candidate donor within radius possesses surplus exceeding minimum 14-day safety threshold.'}
                    </p>
                  </div>
                </div>

                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 shrink-0">
                  {recommendation.model_used || 'Gemini 3.6 Flash'}
                </span>
              </div>

              {/* Transit & Allocation Metric Cards */}
              {recommendation.is_feasible && recommendation.recommended_donor && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-brand-dark-surface/40 border border-slate-200/60 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Donor PHC</span>
                    <span className="font-bold text-slate-900 dark:text-white truncate block">
                      {recommendation.recommended_donor.facility_name}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-brand-dark-surface/40 border border-slate-200/60 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Transfer Qty</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 block font-mono">
                      {recommendation.recommended_quantity} {recommendation.medicine_unit}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-brand-dark-surface/40 border border-slate-200/60 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Road Distance</span>
                    <span className="font-bold text-slate-900 dark:text-white block font-mono">
                      {recommendation.estimated_distance_km?.toFixed(1) || recommendation.recommended_donor.distance_km?.toFixed(1)} km
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-brand-dark-surface/40 border border-slate-200/60 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Est. Transit</span>
                    <span className="font-bold text-slate-900 dark:text-white block font-mono">
                      {recommendation.estimated_transit_hours?.toFixed(1) || recommendation.recommended_donor.estimated_transit_hours?.toFixed(1)} hrs
                    </span>
                  </div>
                </div>
              )}

              {/* Gemini SOAP Clinical Reasoning Breakdown */}
              <div className="space-y-2.5 text-xs">
                <h4 className="font-bold text-[11px] text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>Clinical SOAP Rationale (Explainable AI Decisioning)</span>
                </h4>

                {/* S - Subjective / Clinical Rationale */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-brand-dark-surface/30 border border-slate-200/60 dark:border-slate-800 space-y-1">
                  <span className="font-bold text-[10px] text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                    [S] Subjective & Clinical Indication
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed">
                    {recommendation.clinical_rationale}
                  </p>
                </div>

                {/* O - Objective / Tradeoff Analysis */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-brand-dark-surface/30 border border-slate-200/60 dark:border-slate-800 space-y-1">
                  <span className="font-bold text-[10px] text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                    [O] Objective Network Tradeoff Analysis
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed">
                    {recommendation.tradeoff_analysis}
                  </p>
                </div>

                {/* A - Assessment / Risk Assessment */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-brand-dark-surface/30 border border-slate-200/60 dark:border-slate-800 space-y-1">
                  <span className="font-bold text-[10px] text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                    [A] Safety & Non-Cannibalization Proof
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed">
                    {recommendation.risk_assessment}
                  </p>
                </div>

                {/* P - Plan / Suggested Route Summary */}
                {recommendation.suggested_route_summary && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-brand-dark-surface/30 border border-slate-200/60 dark:border-slate-800 space-y-1">
                    <span className="font-bold text-[10px] text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                      [P] Logistical Transit Corridor
                    </span>
                    <p className="text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed">
                      {recommendation.suggested_route_summary}
                    </p>
                  </div>
                )}
              </div>

              {/* Candidate Donors Evaluated Table */}
              {recommendation.all_candidates_evaluated?.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-brand-dark-border">
                  <h5 className="font-bold text-[11px] text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Candidate Donors Evaluated ({recommendation.all_candidates_evaluated.length})
                  </h5>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] text-left">
                      <thead className="text-[10px] font-bold text-slate-400 uppercase border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-1.5 px-2">Facility</th>
                          <th className="py-1.5 px-2">Stock</th>
                          <th className="py-1.5 px-2">Retained</th>
                          <th className="py-1.5 px-2">Surplus</th>
                          <th className="py-1.5 px-2">Distance</th>
                          <th className="py-1.5 px-2">ETA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {recommendation.all_candidates_evaluated.map(cand => {
                          const isChosen = cand.facility_id === recommendation.recommended_donor?.facility_id;
                          return (
                            <tr
                              key={cand.facility_id}
                              className={clsx(
                                isChosen && 'bg-emerald-50/50 dark:bg-emerald-950/20 font-semibold'
                              )}
                            >
                              <td className="py-1.5 px-2 text-slate-900 dark:text-white">
                                {cand.facility_name} {isChosen && '⭐'}
                              </td>
                              <td className="py-1.5 px-2 font-mono">{cand.current_stock}</td>
                              <td className="py-1.5 px-2 font-mono text-slate-400">{cand.retention_buffer}</td>
                              <td className="py-1.5 px-2 font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                                {cand.surplus_available > 0 ? `+${cand.surplus_available}` : '0'}
                              </td>
                              <td className="py-1.5 px-2 font-mono">{cand.distance_km?.toFixed(1)} km</td>
                              <td className="py-1.5 px-2 font-mono">{cand.estimated_transit_hours?.toFixed(1)} h</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Primary Action Button: Open Clinical Authorization Modal */}
              {recommendation.is_feasible && (
                <div className="pt-3 border-t border-slate-100 dark:border-brand-dark-border">
                  <button
                    onClick={handleOpenAuthModal}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs shadow-lg transition flex items-center justify-center gap-2"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Authorize Redistribution Order (Official Sign-Off)</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

            </div>
          )}

        </div>

      </div>

    </div>
  );
}
