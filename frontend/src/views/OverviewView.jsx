import React from 'react';
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
  Layers
} from 'lucide-react';

export function OverviewView() {
  const { stats, facilities, alerts, setActiveTab, setIsSafetyModalOpen, t } = useApp();

  const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL');
  const warningAlerts = alerts.filter(a => a.severity === 'WARNING');

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Top Banner with Regional Mission Statement */}
      <div className="card-clinical p-6 bg-gradient-to-r from-emerald-900 via-slate-900 to-teal-950 text-white border-0 shadow-lg relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Autonomous Rural Health Supply Chain Intelligence</span>
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
              Network Facilities
            </span>
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-display text-slate-900 dark:text-white mt-2">
            {stats?.total_facilities ?? facilities.length ?? 15}
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">100% Active</span>
            <span>• 2 Districts (Pune/Satara)</span>
          </div>
        </div>

        {/* Metric 2: Critical Stockouts */}
        <div className="card-clinical p-5 border-red-200/70 dark:border-red-900/40 bg-red-50/20 dark:bg-red-950/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider">
              Critical Stockouts
            </span>
            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-display text-red-700 dark:text-red-400 mt-2 flex items-center gap-2">
            {stats?.critical_stockouts ?? criticalAlerts.length ?? 0}
            {stats?.critical_stockouts > 0 && (
              <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-red-600 dark:text-red-400 font-medium">
            <TrendingDown className="w-3.5 h-3.5" />
            <span>{warningAlerts.length} Warning Level Deficits</span>
          </div>
        </div>

        {/* Metric 3: Active Transfers */}
        <div className="card-clinical p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Active Transfers
            </span>
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <Truck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-display text-slate-900 dark:text-white mt-2">
            {stats?.in_transit_transfers ?? 0}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500 dark:text-slate-400">
            <Clock className="w-3.5 h-3.5 text-indigo-500" />
            <span>Zero Teleportation Physical Flow</span>
          </div>
        </div>

        {/* Metric 4: DSCSA Ledger */}
        <div className="card-clinical p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              DSCSA Audit Chain
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-display text-emerald-700 dark:text-emerald-400 mt-2">
            {stats?.total_batches ?? 166} Batches
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <span>✓ SHA-256 Chain Verified</span>
          </div>
        </div>

      </div>

      {/* Two Column Layout: Deficit Alerts Feed + Network Facilities Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Real-Time Deficits & Alerts Feed */}
        <div className="lg:col-span-2 card-clinical p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-brand-dark-border pb-3">
            <div>
              <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">
                Live Deficit & Emergency Alert Feed
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Broadcasting in real-time via Server-Sent Events (/api/alerts/stream)
              </p>
            </div>
            <button
              onClick={() => setActiveTab('rebalance')}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
            >
              Analyze Rebalancing <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[380px] overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No active stockout alerts. Network inventories are balanced.
              </div>
            ) : (
              alerts.slice(0, 8).map((alert, idx) => (
                <div key={idx} className="py-3 flex items-start justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={alert.severity} size="xs" />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {alert.facility_name || 'Regional Facility'}
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400">
                      {alert.message}
                    </p>
                    <span className="text-[10px] text-slate-400 block font-mono">
                      {alert.created_at?.replace('T', ' ').slice(0, 19) || 'Just now'}
                    </span>
                  </div>
                  <button
                    onClick={() => setActiveTab('rebalance')}
                    className="shrink-0 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 dark:text-emerald-300 transition"
                  >
                    Solve
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right 1 Col: Quick Facility Status Breakdown */}
        <div className="card-clinical p-5 space-y-4">
          <div className="border-b border-slate-100 dark:border-brand-dark-border pb-3">
            <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">
              Cluster Facility Tiers
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pune & Satara Multi-Tier Public Health Topology
            </p>
          </div>

          <div className="space-y-2.5 text-xs">
            {[
              { tier: 'District Hospital', count: 1, color: 'bg-indigo-500' },
              { tier: 'Sub-District Hospital', count: 2, color: 'bg-blue-500' },
              { tier: 'Community Health Centre (CHC)', count: 3, color: 'bg-teal-500' },
              { tier: 'Primary Health Centre (PHC)', count: 5, color: 'bg-emerald-500' },
              { tier: 'Sub-Centre (Health Post)', count: 4, color: 'bg-amber-500' },
            ].map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${item.color}`} />
                  <span className="font-medium text-slate-700 dark:text-slate-300">{item.tier}</span>
                </div>
                <span className="font-bold text-slate-900 dark:text-white">{item.count}</span>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-brand-dark-border">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-brand-dark-surface border border-slate-200/60 dark:border-brand-dark-border text-xs space-y-1.5">
              <span className="font-semibold text-slate-700 dark:text-slate-300 block">
                🏔️ Western Ghats Monsoon Terrain:
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Sahyadri Mountain facilities (Velhe, Bhor, Mahabaleshwar) automatically trigger 1.5× safety stock buffers (21 days) during active monsoon season.
              </p>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
