import React, { useState, useEffect } from 'react';
import { useUI } from '../context/UIContext';
import { useAlerts } from '../context/AlertsContext';
import { api } from '../services/api';
import {
  Flame,
  CloudRain,
  Sun,
  AlertTriangle,
  Biohazard,
  ShieldCheck,
  RefreshCw,
  Zap,
  Sliders,
  CheckCircle2,
  XCircle,
  Truck,
  ArrowRight,
  RotateCcw,
  MapPin,
  Clock,
  Building2,
  ThermometerSnowflake,
  ExternalLink,
  Layers,
  Sparkles
} from 'lucide-react';
import clsx from 'clsx';

export function CrisisSimulatorView() {
  const {
    facilities,
    facilityMap,
    medicines,
    medicineMap,
    crisisStatus,
    setCrisisStatus,
    refreshData,
    setActiveTab,
    setActiveTransferRoute,
    language,
    t
  } = useUI();
  const { showToast } = useAlerts();

  const [scenarios, setScenarios] = useState([]);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState('MONSOON_FLOOD_SOUTH_SATARA');
  const [intensity, setIntensity] = useState(1.0);
  const [autoRebalance, setAutoRebalance] = useState(true);

  // Execution states
  const [triggering, setTriggering] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [swarming, setSwarming] = useState(false);
  const [lastTriggerResult, setLastTriggerResult] = useState(null);

  // Fetch scenarios on mount
  useEffect(() => {
    const fetchScenarios = async () => {
      try {
        setLoadingScenarios(true);
        const data = await api.getCrisisScenarios();
        setScenarios(data || []);
      } catch (err) {
        console.error('Failed to load scenarios:', err);
        showToast('Could not load crisis scenarios', 'error');
      } finally {
        setLoadingScenarios(false);
      }
    };
    fetchScenarios();
  }, []);

  // Helpers to localize backend scenario data
  const getLocalizedScenario = (sc) => {
    if (!sc) return null;
    const id = sc.scenario_id;
    let title = sc.title;
    let desc = sc.description;
    let casualties = sc.estimated_casualties;

    if (id === 'MONSOON_FLOOD_SOUTH_SATARA') {
      title = t('scenario_monsoon_title') || sc.title;
      desc = t('scenario_monsoon_desc') || sc.description;
      casualties = t('scenario_monsoon_casualties') || sc.estimated_casualties;
    } else if (id === 'LEPTOSPIROSIS_PUNE_GHATS') {
      title = t('scenario_lepto_title') || sc.title;
      desc = t('scenario_lepto_desc') || sc.description;
      casualties = t('scenario_lepto_casualties') || sc.estimated_casualties;
    } else if (id === 'HEATWAVE_PLAINS_SHIRUR') {
      title = t('scenario_heatwave_title') || sc.title;
      desc = t('scenario_heatwave_desc') || sc.description;
      casualties = t('scenario_heatwave_casualties') || sc.estimated_casualties;
    } else if (id === 'RABIES_CANINE_CLUSTER') {
      title = t('scenario_rabies_title') || sc.title;
      desc = t('scenario_rabies_desc') || sc.description;
      casualties = t('scenario_rabies_casualties') || sc.estimated_casualties;
    }

    const localizedDistrict = sc.affected_district === 'Pune'
      ? (t('district_pune') || 'Pune')
      : sc.affected_district === 'Satara'
        ? (t('district_satara') || 'Satara')
        : sc.affected_district;

    const localizedSeverity = sc.severity === 'EMERGENCY'
      ? (t('severity_emergency') || 'EMERGENCY')
      : (t('severity_critical') || 'CRITICAL');

    return {
      ...sc,
      localizedTitle: title,
      localizedDescription: desc,
      localizedCasualties: casualties,
      localizedDistrict,
      localizedSeverity
    };
  };

  const getActiveScenarioTitle = () => {
    const id = crisisStatus?.active_scenario_id;
    if (id === 'MONSOON_FLOOD_SOUTH_SATARA') return t('scenario_monsoon_title') || crisisStatus.active_scenario_title;
    if (id === 'LEPTOSPIROSIS_PUNE_GHATS') return t('scenario_lepto_title') || crisisStatus.active_scenario_title;
    if (id === 'HEATWAVE_PLAINS_SHIRUR') return t('scenario_heatwave_title') || crisisStatus.active_scenario_title;
    if (id === 'RABIES_CANINE_CLUSTER') return t('scenario_rabies_title') || crisisStatus.active_scenario_title;
    return crisisStatus?.active_scenario_title || t('badge_crisis_active');
  };

  const currentScenario = scenarios.find(s => s.scenario_id === selectedScenarioId) || scenarios[0];
  const localizedCurrent = getLocalizedScenario(currentScenario);

  // Trigger Crisis
  const handleTriggerCrisis = async () => {
    if (!selectedScenarioId) return;

    try {
      setTriggering(true);
      const res = await api.triggerCrisis({
        scenario_id: selectedScenarioId,
        intensity: Number(intensity),
        auto_generate_rebalance: autoRebalance
      });

      setLastTriggerResult(res);
      await refreshData();

      const activeTitle = localizedCurrent?.localizedTitle || res.scenario_title;
      showToast(
        `${t('toast_crisis_activated') || '🚨 Crisis Activated'}: ${activeTitle}! ${res.critically_depleted_items_count} ${t('toast_depleted_suffix') || 'facilities depleted.'}`,
        'warning',
        t('badge_crisis_active') || 'Crisis Simulation Active'
      );
    } catch (err) {
      console.error('Trigger crisis failed:', err);
      showToast(err.message || 'Failed to trigger crisis simulation', 'error');
    } finally {
      setTriggering(false);
    }
  };

  // Reset Crisis
  const handleResetCrisis = async () => {
    try {
      setResetting(true);
      const res = await api.resetCrisis();
      setLastTriggerResult(null);
      await refreshData();

      showToast(
        res.message || 'Baseline stock levels restored successfully.',
        'success',
        'Crisis Deactivated'
      );
    } catch (err) {
      console.error('Reset crisis failed:', err);
      showToast(err.message || 'Failed to reset crisis', 'error');
    } finally {
      setResetting(false);
    }
  };

  // Swarm Dispatch
  const handleSwarmDispatch = async () => {
    const plans = lastTriggerResult?.recommended_rebalance_plans || [];
    if (!plans.length) {
      showToast('No active emergency rebalance plans to dispatch', 'info');
      return;
    }

    try {
      setSwarming(true);
      const sanitizedPlans = plans.map(p => ({
        recommendation_id: p.recommendation_id,
        recipient_facility_id: Number(p.recipient_facility_id),
        donor_facility_id: Number(p.donor_facility_id),
        medicine_id: Number(p.medicine_id),
        quantity: Number(p.recommended_quantity || p.quantity || 1),
        recommended_quantity: Number(p.recommended_quantity || p.quantity || 1),
        reason: p.clinical_rationale || "Emergency Swarm Rebalancing"
      }));

      const res = await api.swarmDispatchCrisis(sanitizedPlans);
      await refreshData();

      showToast(
        `⚡ Swarm Dispatched: ${res.dispatched_count} emergency corridors committed!`,
        'success',
        'Swarm Rebalance Committed'
      );
    } catch (err) {
      console.error('Swarm dispatch failed:', err);
      showToast(err.message || 'Failed to swarm dispatch transfers', 'error');
    } finally {
      setSwarming(false);
    }
  };

  // Route visualizer opener for a single plan
  const handleInspectPlanOnMap = (plan) => {
    const donor = facilityMap.get(plan.donor_facility_id);
    const recipient = facilityMap.get(plan.recipient_facility_id);

    setActiveTransferRoute({
      transfer_id: plan.recommendation_id,
      transfer_code: `EMG-${plan.recommendation_id.slice(-6)}`,
      status: 'APPROVED',
      source_facility_id: plan.donor_facility_id,
      source_facility_name: donor?.name || plan.donor_facility_name,
      source_lat: donor?.latitude,
      source_lng: donor?.longitude,
      destination_facility_id: plan.recipient_facility_id,
      destination_facility_name: recipient?.name || plan.recipient_facility_name,
      destination_lat: recipient?.latitude,
      destination_lng: recipient?.longitude,
      medicine_name: plan.medicine_name,
      quantity: plan.recommended_quantity,
      unit: plan.medicine_unit || 'units',
      distance_km: plan.distance_km,
      estimated_transit_hours: plan.estimated_transit_hours,
      requires_cold_chain: plan.requires_cold_chain,
      is_ghat_terrain: plan.monsoon_mode || donor?.terrain_type === 'GHAT_MOUNTAIN'
    });

    setActiveTab('map');
  };

  // Icon selector helper
  const renderScenarioIcon = (iconName, className = "w-5 h-5") => {
    switch (iconName) {
      case 'CloudRain': return <CloudRain className={className} />;
      case 'Biohazard': return <Biohazard className={className} />;
      case 'Sun': return <Sun className={className} />;
      case 'AlertTriangle': return <AlertTriangle className={className} />;
      default: return <Flame className={className} />;
    }
  };

  const isCrisisActive = Boolean(crisisStatus?.is_active);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-brand-dark-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/80">
              {t('badge_stress_engine') || 'Epidemiological Stress Testing Engine'}
            </span>
            <span className={clsx(
              "px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1",
              isCrisisActive
                ? "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-200 border-rose-300 animate-pulse"
                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200 border-emerald-300"
            )}>
              {isCrisisActive ? <AlertTriangle className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
              <span>{isCrisisActive ? (t('badge_crisis_active') || 'Emergency Shock Active') : (t('badge_nominal_state') || 'Nominal Network State')}</span>
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-900 dark:text-white mt-1.5 flex items-center gap-2">
            <span>{t('crisis_engine_title') || 'Crisis & Outbreak Simulation Engine'}</span>
            <Flame className="w-6 h-6 text-rose-500 animate-pulse" />
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('crisis_engine_subtitle') || 'Stress-test regional healthcare supply chains under disaster shocks with automated multi-facility rebalancing'}
          </p>
        </div>

        {/* Global Reset Action */}
        <div className="flex items-center gap-2">
          {isCrisisActive && (
            <button
              onClick={handleResetCrisis}
              disabled={resetting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-md transition cursor-pointer"
            >
              <RotateCcw className={clsx("w-3.5 h-3.5", resetting && "animate-spin")} />
              <span>{resetting ? (language === 'mr' ? 'मूळ स्थितीत आणत आहे...' : (language === 'hi' ? 'पुनर्प्राप्त कर रहा है...' : 'Restoring Baseline...')) : (t('btn_reset_baseline') || 'Reset to Baseline')}</span>
            </button>
          )}

          <button
            onClick={refreshData}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-brand-dark-card border border-slate-200 dark:border-brand-dark-border text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-brand-dark-surface transition shadow-xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t('btn_refresh_state') || 'Refresh State'}</span>
          </button>
        </div>
      </div>

      {/* Emergency Status Banner */}
      {isCrisisActive ? (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-900/90 via-slate-900/90 to-rose-950/90 text-white border border-rose-500/40 shadow-xl space-y-2 animate-pulse">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/40">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-rose-300 block">
                  {t('badge_active_regional_disaster') || 'Active Regional Disaster Emergency'}
                </span>
                <h3 className="font-display font-bold text-sm sm:text-base text-white">
                  {getActiveScenarioTitle()}
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-500/40 text-[11px] font-mono text-rose-200">
                {t('intensity_prefix') || 'Intensity:'} <strong>{crisisStatus.intensity || 1.0}x</strong>
              </span>
              {crisisStatus.monsoon_mode && (
                <span className="px-2.5 py-1 rounded-lg bg-sky-500/20 border border-sky-500/40 text-[11px] font-semibold text-sky-200 flex items-center gap-1">
                  <CloudRain className="w-3 h-3" />
                  <span>{t('sahyadri_monsoon_multiplier') || 'Sahyadri Monsoon (1.5x Multiplier)'}</span>
                </span>
              )}
            </div>
          </div>

          <p className="text-xs text-rose-200/90 leading-relaxed pt-1 border-t border-rose-500/20">
            {t('crisis_emergency_banner_desc') || 'Multiple facilities in the designated disaster cluster have suffered acute inventory depletions. Real-time SSE alerts have fired, and candidate donors outside the disaster zone are evaluating emergency redistribution corridors.'}
          </p>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                {t('baseline_operational_state') || 'Nominal Baseline Operational State'}
              </h4>
              <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                {t('baseline_operational_desc') || 'No emergency disaster shock is active. Choose a scenario below to simulate an acute public health shock.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Left Preset Scenarios (5 cols) vs Right Controls & AI Response (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Preset Outbreak Scenarios */}
        <div className="lg:col-span-5 space-y-4">
          <div className="card-clinical p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-brand-dark-border pb-2.5">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-rose-500" />
                <h3 className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
                  {t('scenarios_title') || 'Outbreak & Disaster Scenarios'}
                </h3>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {scenarios.length} {t('presets_count_suffix') || 'Presets'}
              </span>
            </div>

            {loadingScenarios ? (
              <div className="p-8 text-center space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-purple-500 mx-auto" />
                <p className="text-xs text-slate-400">{t('loading_scenarios') || 'Loading regional disaster models...'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {scenarios.map(sc => {
                  const locSc = getLocalizedScenario(sc);
                  const isSelected = selectedScenarioId === sc.scenario_id;
                  const isMonsoon = sc.monsoon_mode;

                  return (
                    <div
                      key={sc.scenario_id}
                      onClick={() => setSelectedScenarioId(sc.scenario_id)}
                      className={clsx(
                        "p-4 rounded-xl border transition cursor-pointer text-xs space-y-2.5 relative overflow-hidden",
                        isSelected
                          ? "border-rose-500 dark:border-rose-400 bg-rose-50/40 dark:bg-rose-950/20 shadow-md ring-1 ring-rose-500/50"
                          : "border-slate-200 dark:border-brand-dark-border bg-white dark:bg-brand-dark-card hover:bg-slate-50 dark:hover:bg-brand-dark-surface"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className={clsx(
                            "p-2 rounded-xl text-white",
                            sc.severity === 'EMERGENCY' ? "bg-rose-600" : "bg-amber-600"
                          )}>
                            {renderScenarioIcon(sc.icon, "w-4 h-4")}
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900 dark:text-white leading-tight">
                              {locSc.localizedTitle}
                            </h4>
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              {locSc.localizedDistrict} {t('district_word') || 'District'} • {sc.affected_facility_codes.length} {t('facilities_targeted_suffix') || 'Facilities Targeted'}
                            </span>
                          </div>
                        </div>

                        <span className={clsx(
                          "px-2 py-0.5 rounded-md font-bold text-[9px] uppercase",
                          sc.severity === 'EMERGENCY'
                            ? "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300"
                            : "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300"
                        )}>
                          {locSc.localizedSeverity}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
                        {locSc.localizedDescription}
                      </p>

                      {/* Medicine Spikes Pills */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          {t('primary_surge_multipliers') || 'Primary Surge Multipliers:'}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(sc.medicine_spikes).map(([sku, mult]) => (
                            <span
                              key={sku}
                              className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-mono font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                            >
                              {sku}: <strong>+{Math.round((mult - 1) * 100)}%</strong> ({mult}x)
                            </span>
                          ))}
                          {isMonsoon && (
                            <span className="px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/40 text-[10px] font-semibold text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60 flex items-center gap-1">
                              <CloudRain className="w-2.5 h-2.5" />
                              <span>{t('monsoon_multiplier_tag') || '1.5x Monsoon'}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Simulation Controls & AI Response Console */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Simulation Injector Card */}
          <div className="card-clinical p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-brand-dark-border pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-purple-500" />
                <h3 className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
                  {t('scenario_params_title') || 'Scenario Injection Parameters'}
                </h3>
              </div>
              <span className="text-[10px] font-mono text-purple-600 dark:text-purple-400 font-bold">
                {t('target_scenario_prefix') || 'Target:'} {localizedCurrent?.localizedTitle || currentScenario?.title || 'None'}
              </span>
            </div>

            {currentScenario && (
              <div className="space-y-4 text-xs">
                {/* Scenario Description Callout */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-brand-dark-surface/40 border border-slate-200/60 dark:border-slate-800 space-y-1">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block text-xs">
                    {t('clinical_briefing_label') || 'Clinical Briefing:'} {localizedCurrent?.localizedTitle || currentScenario.title}
                  </span>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    {localizedCurrent?.localizedDescription || currentScenario.description}
                  </p>
                  <div className="pt-1 text-[10px] text-slate-400 flex items-center gap-3">
                    <span>{t('expected_casualty_vel') || 'Expected Casualty Velocity:'} <strong>{localizedCurrent?.localizedCasualties || currentScenario.estimated_casualties}</strong></span>
                    <span>{t('district_label') || 'District:'} <strong>{localizedCurrent?.localizedDistrict || currentScenario.affected_district}</strong></span>
                  </div>
                </div>

                {/* Intensity Slider */}
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-500">{t('surge_intensity_label') || 'Epidemic Surge Intensity:'}</span>
                    <span className="font-bold font-mono text-purple-600 dark:text-purple-400 text-sm">
                      {intensity.toFixed(1)}x {t('peak_surge_suffix') || 'Peak Surge'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.5"
                    step="0.1"
                    value={intensity}
                    onChange={(e) => setIntensity(parseFloat(e.target.value))}
                    className="w-full accent-purple-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-400 mt-0.5 font-mono">
                    <span>{t('moderate_intensity') || '0.5x (Moderate)'}</span>
                    <span>{t('standard_intensity') || '1.0x (Standard Outbreak)'}</span>
                    <span>{t('catastrophic_intensity') || '2.5x (Catastrophic Flash Shock)'}</span>
                  </div>
                </div>

                {/* Auto Rebalance Switch */}
                <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-brand-dark-surface/40 cursor-pointer select-none">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    <div>
                      <span className="font-bold text-xs text-slate-800 dark:text-slate-200 block">
                        {t('auto_rebalance_checkbox') || 'Auto-Evaluate Gemini Multi-Facility Rebalancing Plans'}
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        {t('auto_rebalance_desc') || 'Instantly dispatches autonomous agent to source donor stock outside disaster zone'}
                      </span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoRebalance}
                    onChange={(e) => setAutoRebalance(e.target.checked)}
                    className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                  />
                </label>

                {/* Primary Trigger Button */}
                <button
                  onClick={handleTriggerCrisis}
                  disabled={triggering}
                  className={clsx(
                    "w-full py-3.5 px-4 rounded-xl font-bold text-xs text-white shadow-lg transition flex items-center justify-center gap-2 cursor-pointer",
                    triggering
                      ? "bg-slate-400 cursor-not-allowed"
                      : "bg-gradient-to-r from-rose-600 via-rose-500 to-purple-600 hover:from-rose-500 hover:to-purple-500 active:scale-[0.99]"
                  )}
                >
                  {triggering ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{language === 'mr' ? 'आपत्ती लाट लागू करत आहे आणि कॉरिडोअर मोजत आहे...' : (language === 'hi' ? 'आपदा लहर लागू कर रहा है...' : 'Injecting Disaster Surge & Calculating Corridors...')}</span>
                    </>
                  ) : (
                    <>
                      <Flame className="w-4 h-4" />
                      <span>🚨 {t('btn_trigger_crisis') || 'Trigger Regional Crisis Shock'} ({intensity}x)</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* AI Autonomous Rebalance Swarm Plans (Result from simulation trigger) */}
          {lastTriggerResult && (
            <div className="card-clinical p-5 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-brand-dark-border pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <h3 className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
                    {t('emergency_impact_title') || 'Emergency Impact & Autonomous Rebalance Plans'}
                  </h3>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {lastTriggerResult.recommended_rebalance_plans?.length || 0} {t('corridors_identified_suffix') || 'Corridors Identified'}
                </span>
              </div>

              {/* Execution Summary Statistics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-brand-dark-surface/40 border border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">{t('nodes_in_crisis_kpi') || 'Nodes In Crisis'}</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400 text-sm font-mono block">
                    {lastTriggerResult.affected_facilities_count} {t('facilities_kpi_suffix') || 'Facilities'}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-brand-dark-surface/40 border border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">{t('deficit_nodes_kpi') || 'Deficit Nodes'}</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400 text-sm font-mono block">
                    {lastTriggerResult.critically_depleted_items_count} {t('items_kpi_suffix') || 'Items'}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-brand-dark-surface/40 border border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">{t('units_consumed_kpi') || 'Units Consumed'}</span>
                  <span className="font-bold text-slate-900 dark:text-white text-sm font-mono block">
                    {lastTriggerResult.total_units_consumed} {t('units_kpi_suffix') || 'Units'}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-brand-dark-surface/40 border border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">{t('sse_alerts_kpi') || 'SSE Alerts Sent'}</span>
                  <span className="font-bold text-purple-600 dark:text-purple-400 text-sm font-mono block">
                    {lastTriggerResult.alerts_broadcast} {t('events_kpi_suffix') || 'Events'}
                  </span>
                </div>
              </div>

              {/* Rebalance Proposals List */}
              {lastTriggerResult.recommended_rebalance_plans?.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      {t('auto_generated_corridors') || 'Auto-Generated Rebalancing Corridors:'}
                    </span>
                    <button
                      onClick={handleSwarmDispatch}
                      disabled={swarming}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Zap className={clsx("w-3 h-3", swarming && "animate-spin")} />
                      <span>{swarming ? (t('btn_authorizing_swarm') || 'Authorizing Swarm...') : (t('btn_authorize_swarm') || 'Authorize All (Swarm Dispatch)')}</span>
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                    {lastTriggerResult.recommended_rebalance_plans.map((plan, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-brand-dark-surface/30 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {plan.donor_facility_name}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="font-bold text-rose-600 dark:text-rose-400">
                              {plan.recipient_facility_name}
                            </span>
                          </div>

                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            +{plan.recommended_quantity} {plan.medicine_unit}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                          <span>{plan.medicine_name} • {plan.distance_km?.toFixed(0)} km ({plan.estimated_transit_hours?.toFixed(1)} {t('hours_short_suffix') || 'hrs'})</span>
                          <button
                            onClick={() => handleInspectPlanOnMap(plan)}
                            className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <span>{t('inspect_route_link') || 'Inspect Route'}</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 text-center text-xs text-slate-500">
                  {t('no_donors_safe_buffer') || 'No candidate donor within safe non-cannibalization buffer for the current deficit set.'}
                </div>
              )}

              {/* Navigation Action */}
              <div className="pt-2 border-t border-slate-100 dark:border-brand-dark-border flex items-center justify-between text-xs">
                <button
                  onClick={() => setActiveTab('map')}
                  className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{t('view_affected_map') || 'View Affected Nodes on Geospatial Map'}</span>
                </button>
                <button
                  onClick={() => setActiveTab('rebalance')}
                  className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>{t('open_full_rebalance_cockpit') || 'Open Full Rebalancing Cockpit'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>
          )}

        </div>

      </div>

    </div>
  );
}
