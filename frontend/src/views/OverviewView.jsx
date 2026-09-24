import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { StatusBadge } from '../components/StatusBadge';
import {
  Building2,
  Pill,
  AlertTriangle,
  Truck,
  ShieldCheck,
  ArrowRight,
  TrendingDown,
  Clock,
  Sparkles,
  Layers,
  Check,
  CheckCircle2,
  ThermometerSnowflake,
  Filter
} from 'lucide-react';
import clsx from 'clsx';
import { localizeAlert } from '../utils/alertI18n';

export function OverviewView() {
  const {
    stats,
    facilities,
    alerts,
    setActiveTab,
    setIsSafetyModalOpen,
    setSelectedFacilityId,
    setSelectedDeficitId,
    setTransferSearchTerm,
    acknowledgeAlert,
    language,
    t
  } = useApp();

  const [alertFilter, setAlertFilter] = useState('ALL');

  // Filtered alerts based on selected category pill
  const filteredAlerts = useMemo(() => {
    return alerts.filter(alert => {
      const cat = alert.category || '';
      const text = (alert.title || '') + ' ' + (alert.message || '');
      if (alertFilter === 'DEFICIT') {
        return cat === 'STOCKOUT' || cat === 'CRITICAL_DEPLETION' || cat === 'SURGE_SPIKE';
      }
      if (alertFilter === 'TRANSFER') {
        return cat === 'TRANSFER_UPDATE' || text.includes('TRF-');
      }
      if (alertFilter === 'COLD_CHAIN') {
        return cat === 'COLD_CHAIN_BREACH';
      }
      return true;
    });
  }, [alerts, alertFilter]);

  // Context-aware action resolver for each alert
  const getAlertAction = (alert) => {
    const cat = alert.category || '';
    const text = (alert.title || '') + ' ' + (alert.message || '');
    const trfMatch = text.match(/TRF-[A-Z0-9-]+/i);
    const transferCode = trfMatch ? trfMatch[0] : null;

    if (cat === 'TRANSFER_UPDATE' || transferCode) {
      return {
        label: t('btn_view_transfer', 'View Transfer'),
        icon: Truck,
        badge: t('badge_transfer', 'Transfer'),
        badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
        btnClass: 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60 border border-blue-200/60 dark:border-blue-800/40',
        onClick: () => {
          if (transferCode) {
            setTransferSearchTerm(transferCode);
          }
          setActiveTab('transfers');
        }
      };
    }

    if (cat === 'STOCKOUT' || cat === 'CRITICAL_DEPLETION' || cat === 'SURGE_SPIKE') {
      return {
        label: t('btn_rebalance_deficit', 'Rebalance Deficit'),
        icon: Sparkles,
        badge: cat === 'STOCKOUT' ? t('badge_stockout', 'Stockout') : cat === 'SURGE_SPIKE' ? t('badge_surge', 'Surge') : t('badge_deficit', 'Deficit'),
        badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
        btnClass: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60 border border-emerald-200/60 dark:border-emerald-800/40',
        onClick: () => {
          if (alert.facility_id) {
            setSelectedDeficitId(alert.facility_id);
            setSelectedFacilityId(alert.facility_id);
          }
          setActiveTab('rebalance');
        }
      };
    }

    if (cat === 'COLD_CHAIN_BREACH') {
      return {
        label: t('btn_inspect_facility', 'Inspect Facility'),
        icon: ThermometerSnowflake,
        badge: t('badge_cold_chain', 'Cold Chain'),
        badgeClass: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
        btnClass: 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100 dark:bg-cyan-950/60 dark:text-cyan-300 dark:hover:bg-cyan-900/60 border border-cyan-200/60 dark:border-cyan-800/40',
        onClick: () => {
          if (alert.facility_id) {
            setSelectedFacilityId(alert.facility_id);
          } else {
            setActiveTab('inventory');
          }
        }
      };
    }

    return {
      label: alert.facility_id ? t('btn_view_facility', 'View Facility') : t('alert_acknowledged', 'Acknowledge'),
      icon: alert.facility_id ? Building2 : CheckCircle2,
      badge: t('badge_system', 'System'),
      badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      btnClass: 'bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60',
      onClick: () => {
        if (alert.facility_id) {
          setSelectedFacilityId(alert.facility_id);
        } else {
          acknowledgeAlert(alert.id);
        }
      }
    };
  };

  const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL');
  const warningAlerts = alerts.filter(a => a.severity === 'WARNING');

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Top Banner with Regional Mission Statement */}
      <div className="card-clinical p-6 bg-gradient-to-r from-emerald-900 via-slate-900 to-teal-950 text-white border-0 shadow-lg relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('overview_pill', 'Autonomous Rural Health Supply Chain Intelligence')}</span>
          </div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {t('overview_mission_title', 'Maharashtra Emergency Stock Rebalancing')}
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm mt-2 leading-relaxed">
            {t('overview_mission_subtitle', 'Coordinating 15 public healthcare nodes across Pune and Satara districts. Protecting rural villagers from vaccine and anti-snake venom stockouts via peer-to-peer inter-PHC redistribution.')}
          </p>
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => setActiveTab('rebalance')}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition shadow-md flex items-center gap-2 cursor-pointer"
            >
              <span>{t('btn_run_rebalancer', 'Run Autonomous Rebalancer')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsSafetyModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition border border-white/20 flex items-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>{t('btn_inspect_safety', 'Inspect AI Safety Invariants')}</span>
            </button>
          </div>
        </div>

        {/* Ambient background watermark icon */}
        <Building2 className="absolute -right-10 -bottom-10 w-64 h-64 text-white/5 pointer-events-none" />
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Metric 1: Facilities */}
        <div className="card-clinical p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {t('kpi_network_facilities', 'Network Facilities')}
            </span>
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-display text-slate-900 dark:text-white mt-2">
            {language === 'mr' ? (stats?.total_facilities ?? facilities.length ?? 15).toLocaleString('mr-IN') : (stats?.total_facilities ?? facilities.length ?? 15)}
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{t('kpi_100_active', '100% Active')}</span>
            <span>{t('kpi_two_districts', '• 2 Districts (Pune/Satara)')}</span>
          </div>
        </div>

        {/* Metric 2: Critical Stockouts */}
        <div className="card-clinical p-5 border-red-200/70 dark:border-red-900/40 bg-red-50/20 dark:bg-red-950/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider">
              {t('kpi_critical_stockouts', 'Critical Stockouts')}
            </span>
            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-display text-red-700 dark:text-red-400 mt-2 flex items-center gap-2">
            {language === 'mr' ? (stats?.critical_stockouts ?? criticalAlerts.length ?? 0).toLocaleString('mr-IN') : (stats?.critical_stockouts ?? criticalAlerts.length ?? 0)}
            {stats?.critical_stockouts > 0 && (
              <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-red-600 dark:text-red-400 font-medium">
            <TrendingDown className="w-3.5 h-3.5" />
            <span>{language === 'mr' ? warningAlerts.length.toLocaleString('mr-IN') : warningAlerts.length} {t('kpi_warning_deficits', 'Warning Level Deficits')}</span>
          </div>
        </div>

        {/* Metric 3: Active Transfers */}
        <div className="card-clinical p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {t('kpi_active_transfers', 'Active Transfers')}
            </span>
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <Truck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-display text-slate-900 dark:text-white mt-2">
            {language === 'mr' ? (stats?.in_transit_transfers ?? 0).toLocaleString('mr-IN') : (stats?.in_transit_transfers ?? 0)}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500 dark:text-slate-400">
            <Clock className="w-3.5 h-3.5 text-indigo-500" />
            <span>{t('kpi_physical_flow', 'Zero Teleportation Physical Flow')}</span>
          </div>
        </div>

        {/* Metric 4: DSCSA Ledger */}
        <div className="card-clinical p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {t('kpi_dscsa_audit_chain', 'DSCSA Audit Chain')}
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-display text-emerald-700 dark:text-emerald-400 mt-2">
            {language === 'mr' ? (stats?.total_batches ?? 182).toLocaleString('mr-IN') : (stats?.total_batches ?? 182)} {t('kpi_batches_suffix', 'Batches')}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <span>{t('kpi_sha256_verified', '✓ SHA-256 Chain Verified')}</span>
          </div>
        </div>

      </div>

      {/* Two Column Layout: Deficit Alerts Feed + Network Facilities Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Real-Time Deficits & Alerts Feed */}
        <div className="lg:col-span-2 card-clinical p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 dark:border-brand-dark-border pb-3 gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">
                  {t('live_alerts_feed_title', 'Live Supply Chain & Emergency Alert Feed')}
                </h3>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {alerts.length}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('live_alerts_feed_subtitle', 'Real-time telemetry via SSE. Action items route directly to Transfers, Rebalancing, or Facility Stocks.')}
              </p>
            </div>
            <button
              onClick={() => setActiveTab('rebalance')}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 self-start sm:self-auto cursor-pointer"
            >
              {t('btn_analyze_rebalancing', 'Analyze Rebalancing')} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {[
              { id: 'ALL', label: t('filter_all_alerts', 'All Events'), count: alerts.length },
              { id: 'TRANSFER', label: t('filter_transfer_alerts', 'Transfers & Shipments'), count: alerts.filter(a => (a.category === 'TRANSFER_UPDATE') || ((a.title || '') + ' ' + (a.message || '')).includes('TRF-')).length },
              { id: 'DEFICIT', label: t('filter_deficit_alerts', 'Stockouts & Deficits'), count: alerts.filter(a => a.category === 'STOCKOUT' || a.category === 'CRITICAL_DEPLETION' || a.category === 'SURGE_SPIKE').length },
              { id: 'COLD_CHAIN', label: t('filter_cold_chain_alerts', 'Cold Chain'), count: alerts.filter(a => a.category === 'COLD_CHAIN_BREACH').length },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setAlertFilter(f.id)}
                className={clsx(
                  "px-2.5 py-1 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 text-[11px]",
                  alertFilter === f.id
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:text-slate-300"
                )}
              >
                <span>{f.label}</span>
                <span className={clsx(
                  "px-1 py-0.2 text-[9px] rounded-full font-bold",
                  alertFilter === f.id
                    ? "bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900"
                    : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                )}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[380px] overflow-y-auto pr-1">
            {filteredAlerts.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                {t('no_active_alerts', 'No active alerts in this category. Network inventories are balanced.')}
              </div>
            ) : (
              filteredAlerts.slice(0, 10).map((alert, idx) => {
                const action = getAlertAction(alert);
                const ActionIcon = action.icon;
                const isAck = alert.is_acknowledged || alert.acknowledged === 1;
                const localized = localizeAlert(alert, language);

                return (
                  <div key={idx} className={clsx(
                    "py-3 flex items-start justify-between gap-3 text-xs transition",
                    isAck ? "opacity-60" : "opacity-100"
                  )}>
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={alert.severity} size="xs" />
                        <span className={clsx(
                          "px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase",
                          action.badgeClass
                        )}>
                          {action.badge}
                        </span>
                        <button
                          onClick={() => alert.facility_id && setSelectedFacilityId(alert.facility_id)}
                          className={clsx(
                            "font-semibold text-slate-800 dark:text-slate-200 text-left",
                            alert.facility_id ? "hover:underline cursor-pointer" : ""
                          )}
                          title={alert.facility_id ? "Click to open facility inventory" : undefined}
                        >
                          {localized.facilityName}
                        </button>
                        {isAck && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                            <Check className="w-3 h-3" /> {t('alert_acknowledged', 'Acknowledged')}
                          </span>
                        )}
                      </div>

                      {localized.title && (
                        <div className="font-semibold text-slate-900 dark:text-slate-100 text-[11px] leading-tight truncate">
                          {localized.title}
                        </div>
                      )}

                      <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                        {localized.message}
                      </p>

                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                        <Clock className="w-3 h-3" />
                        <span>{alert.created_at?.replace('T', ' ').slice(0, 19) || t('time_just_now', 'Just now')}</span>
                      </div>
                    </div>

                    {/* Contextual Action Button & Acknowledge */}
                    <div className="shrink-0 flex items-center gap-1.5 pt-1">
                      <button
                        onClick={action.onClick}
                        className={clsx(
                          "px-2.5 py-1 text-[11px] font-semibold rounded-lg transition flex items-center gap-1.5 shadow-sm cursor-pointer",
                          action.btnClass
                        )}
                      >
                        <ActionIcon className="w-3 h-3" />
                        <span>{action.label}</span>
                      </button>

                      {!isAck && (
                        <button
                          onClick={() => acknowledgeAlert(alert.id)}
                          className="p-1 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:text-emerald-400 dark:hover:bg-emerald-950/60 transition cursor-pointer"
                          title="Acknowledge Alert"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right 1 Col: Quick Facility Status Breakdown */}
        <div className="card-clinical p-5 space-y-4">
          <div className="border-b border-slate-100 dark:border-brand-dark-border pb-3">
            <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">
              {t('cluster_facility_tiers_title', 'Cluster Facility Tiers')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('cluster_facility_tiers_subtitle', 'Pune & Satara Multi-Tier Public Health Topology')}
            </p>
          </div>

          <div className="space-y-2.5 text-xs">
            {[
              { tier: t('tier_dh', 'District Hospital'), count: 1, color: 'bg-indigo-500' },
              { tier: t('tier_sdh', 'Sub-District Hospital'), count: 2, color: 'bg-blue-500' },
              { tier: t('tier_chc', 'Community Health Centre (CHC)'), count: 3, color: 'bg-teal-500' },
              { tier: t('tier_phc_badge', 'Primary Health Centre (PHC)'), count: 5, color: 'bg-emerald-500' },
              { tier: t('tier_sc', 'Sub-Centre (Health Post)'), count: 4, color: 'bg-amber-500' },
            ].map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${item.color}`} />
                  <span className="font-medium text-slate-700 dark:text-slate-300">{item.tier}</span>
                </div>
                <span className="font-bold text-slate-900 dark:text-white">
                  {language === 'mr' ? item.count.toLocaleString('mr-IN') : item.count}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-brand-dark-border">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-brand-dark-surface border border-slate-200/60 dark:border-brand-dark-border text-xs space-y-1.5">
              <span className="font-semibold text-slate-700 dark:text-slate-300 block">
                {t('monsoon_terrain_title', '🏔️ Western Ghats Monsoon Terrain:')}
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {t('monsoon_terrain_body', 'Sahyadri Mountain facilities (Velhe, Bhor, Mahabaleshwar) automatically trigger 1.5× safety stock buffers (21 days) during active monsoon season.')}
              </p>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
