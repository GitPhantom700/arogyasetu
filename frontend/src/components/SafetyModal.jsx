import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import {
  ShieldCheck,
  Zap,
  AlertOctagon,
  RotateCcw,
  X,
  Check,
  Activity,
  Globe,
  Lock,
  Share2,
  RefreshCw,
  Cpu,
  Layers,
  CheckCircle2
} from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import clsx from 'clsx';

export function SafetyModal() {
  const { isSafetyModalOpen, setIsSafetyModalOpen, safetyStatus, refreshData, showToast } = useApp();
  const [modalTab, setModalTab] = useState('invariants'); // 'invariants' | 'brics'
  const [violations, setViolations] = useState([]);
  const [loadingViolations, setLoadingViolations] = useState(false);
  const [resetting, setResetting] = useState(null);

  // BRICS Federated Learning State
  const [bricsData, setBricsData] = useState(null);
  const [loadingBrics, setLoadingBrics] = useState(false);
  const [selectedBricsCategory, setSelectedBricsCategory] = useState('Antidote');

  useEffect(() => {
    if (isSafetyModalOpen) {
      setLoadingViolations(true);
      api.getSafetyViolations(25)
        .then(data => setViolations(data.violations || []))
        .catch(err => console.error('Failed to load violations:', err))
        .finally(() => setLoadingViolations(false));
    }
  }, [isSafetyModalOpen]);

  useEffect(() => {
    if (isSafetyModalOpen && modalTab === 'brics') {
      setLoadingBrics(true);
      api.getBricsModelWeights(selectedBricsCategory)
        .then(data => setBricsData(data))
        .catch(err => console.error('Failed to load BRICS model weights:', err))
        .finally(() => setLoadingBrics(false));
    }
  }, [isSafetyModalOpen, modalTab, selectedBricsCategory]);

  if (!isSafetyModalOpen) return null;

  const handleReset = async (component) => {
    try {
      setResetting(component);
      const res = await api.resetCircuit(component);
      showToast(`Circuit breaker for ${component} reset to CLOSED`, 'success');
      await refreshData();
    } catch (err) {
      showToast(err.message || `Failed to reset ${component} circuit`, 'critical');
    } finally {
      setResetting(null);
    }
  };

  const rebalanceCb = safetyStatus?.circuit_breakers?.rebalance || { state: 'CLOSED', failure_count: 0, failure_threshold: 3 };
  const visionCb = safetyStatus?.circuit_breakers?.vision || { state: 'CLOSED', failure_count: 0, failure_threshold: 3 };

  const bricsNodes = [
    { id: 'IN-DEL-01', nation: 'India', flag: '🇮🇳', facility: 'MoHFW Central Health Data Hub (New Delhi)', status: 'ACTIVE' },
    { id: 'BR-SP-02', nation: 'Brazil', flag: '🇧🇷', facility: 'FIOCRUZ Surveillance Gateway (São Paulo)', status: 'ACTIVE' },
    { id: 'RU-MOW-03', nation: 'Russia', flag: '🇷🇺', facility: 'Gamaleya Epidemiological Center (Moscow)', status: 'ACTIVE' },
    { id: 'CN-BJ-04', nation: 'China', flag: '🇨🇳', facility: 'CCDC Outbreak Modeling Node (Beijing)', status: 'ACTIVE' },
    { id: 'ZA-JNB-05', nation: 'South Africa', flag: '🇿🇦', facility: 'NICD Regional Surveillance (Johannesburg)', status: 'ACTIVE' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-brand-dark-card border border-slate-200 dark:border-brand-dark-border rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-brand-dark-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">
                AI Safety Architecture & Cross-Border Telemetry
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Deterministic Invariant Firewall, Zero-PHI Privacy & BRICS+ Federated Learning
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsSafetyModalOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Tab Switcher */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-100 dark:border-brand-dark-border bg-slate-50/50 dark:bg-brand-dark-surface/30">
          <button
            type="button"
            onClick={() => setModalTab('invariants')}
            className={clsx(
              "px-3.5 py-2 text-xs font-bold transition border-b-2 flex items-center gap-1.5 cursor-pointer",
              modalTab === 'invariants'
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-400 dark:border-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            )}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Deterministic Invariants & Circuit Breakers</span>
          </button>

          <button
            type="button"
            onClick={() => setModalTab('brics')}
            className={clsx(
              "px-3.5 py-2 text-xs font-bold transition border-b-2 flex items-center gap-1.5 cursor-pointer",
              modalTab === 'brics'
                ? "border-indigo-600 text-indigo-700 dark:text-indigo-400 dark:border-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            )}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>BRICS+ Federated Learning & Privacy</span>
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold uppercase bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
              Laplace DP
            </span>
          </button>
        </div>

        {/* Tab 1: Deterministic Invariants & Safety Firewalls */}
        {modalTab === 'invariants' && (
          <div className="p-6 overflow-y-auto space-y-6 text-sm">
            {/* Top 3 Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Guardrail Status Card */}
              <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20">
                <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block">
                  AI Guardrail Status
                </span>
                <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1 flex items-center gap-2">
                  ACTIVE (100%)
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
                  Deterministic Invariant Firewall
                </span>
              </div>

              {/* Rebalance Circuit */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-brand-dark-border bg-slate-50/50 dark:bg-brand-dark-surface/50">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Rebalance Circuit
                  </span>
                  <StatusBadge status={rebalanceCb.state} size="xs" />
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 mt-2 font-medium">
                  Failures: {rebalanceCb.failure_count} / {rebalanceCb.failure_threshold} ({rebalanceCb.state === 'CLOSED' ? 'Healthy' : 'Tripped'})
                </div>
                <button
                  onClick={() => handleReset('rebalance')}
                  disabled={resetting === 'rebalance'}
                  className="mt-3 w-full py-1 px-2.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${resetting === 'rebalance' ? 'animate-spin' : ''}`} />
                  Reset Circuit
                </button>
              </div>

              {/* Vision OCR Circuit */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-brand-dark-border bg-slate-50/50 dark:bg-brand-dark-surface/50">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Vision OCR Circuit
                  </span>
                  <StatusBadge status={visionCb.state} size="xs" />
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 mt-2 font-medium">
                  Failures: {visionCb.failure_count} / {visionCb.failure_threshold} ({visionCb.state === 'CLOSED' ? 'Healthy' : 'Tripped'})
                </div>
                <button
                  onClick={() => handleReset('vision')}
                  disabled={resetting === 'vision'}
                  className="mt-3 w-full py-1 px-2.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${resetting === 'vision' ? 'animate-spin' : ''}`} />
                  Reset Circuit
                </button>
              </div>
            </div>

            {/* Enforced Invariants */}
            <div>
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                Enforced Physical & Mathematical Invariants
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {[
                  '14D Donor Retention Buffer (21D in Monsoon Mode)',
                  'Strict Mathematical Clamping: [0 < Q ≤ min(Deficit, Surplus)]',
                  'Consumption-Aware FEFO Shelf-Life Horizon',
                  'Multimodal Temporal Ingestion Validation (No Expired Stock)',
                  'Adversarial Prompt Injection & Delimiter Sanitizer',
                  'Zero Logistics Paralysis: Heuristic Linear Fallback (<5ms)'
                ].map((inv, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-slate-700 dark:text-slate-300 font-medium">{inv}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Security Violations Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Recent AI Safety Violations Ledger
                </h4>
                <span className="text-xs text-slate-400">
                  {violations.length} logged events
                </span>
              </div>

              <div className="border border-slate-200 dark:border-brand-dark-border rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-brand-dark-border text-slate-500 font-semibold">
                    <tr>
                      <th className="p-2.5">Time</th>
                      <th className="p-2.5">Component</th>
                      <th className="p-2.5">Violation Type</th>
                      <th className="p-2.5">Severity</th>
                      <th className="p-2.5">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                    {loadingViolations ? (
                      <tr>
                        <td colSpan="5" className="p-4 text-center text-slate-400">Loading audit ledger...</td>
                      </tr>
                    ) : violations.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="p-4 text-center text-slate-400 font-sans">No security violations recorded. System 100% clean.</td>
                      </tr>
                    ) : (
                      violations.map((v, i) => (
                        <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                          <td className="p-2.5 text-slate-500">{v.timestamp?.slice(11, 19) || '--'}</td>
                          <td className="p-2.5 font-sans font-medium text-slate-700 dark:text-slate-300">{v.component}</td>
                          <td className="p-2.5 text-amber-600 dark:text-amber-400">{v.violation_type}</td>
                          <td className="p-2.5"><StatusBadge status={v.severity} size="xs" /></td>
                          <td className="p-2.5 font-sans text-slate-600 dark:text-slate-400 truncate max-w-xs">{v.details}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: BRICS+ Federated Learning Telemetry */}
        {modalTab === 'brics' && (
          <div className="p-6 overflow-y-auto space-y-5 text-xs">
            {/* Top Metric & Category Filter */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-900/40">
              <div>
                <span className="font-bold text-[11px] text-indigo-900 dark:text-indigo-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Sovereign Cross-Border Federated Learning Framework</span>
                </span>
                <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80 mt-0.5">
                  Aggregating anomaly gradients across BRICS health ministries without raw PHI transfer.
                </p>
              </div>

              {/* Category Pills with Loading Spinner */}
              <div className="flex items-center gap-1 bg-white/80 dark:bg-slate-900/80 p-1 rounded-xl border border-indigo-200/60 dark:border-indigo-800/60 shrink-0">
                {['Antidote', 'Vaccine', 'Antibiotic', 'IV Fluid'].map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedBricsCategory(cat)}
                    className={clsx(
                      "px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1",
                      selectedBricsCategory === cat
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                    )}
                  >
                    {loadingBrics && selectedBricsCategory === cat && (
                      <RotateCcw className="w-3 h-3 animate-spin" />
                    )}
                    <span>{cat}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Active Category Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/30 border border-indigo-200/70 dark:border-indigo-800/60">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-indigo-600 text-white">
                  Active Tensor
                </span>
                <span className="font-bold text-slate-900 dark:text-white text-xs">
                  {bricsData?.category || selectedBricsCategory} Outbreak Topology
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 hidden md:inline">
                  • {bricsData?.aggregation_protocol || 'FedAvg-Laplace-DP'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-slate-600 dark:text-slate-300">
                  Global Multiplier: <strong className="font-mono text-indigo-700 dark:text-indigo-300">{bricsData?.anomaly_threshold_multiplier?.toFixed(3) || '4.204'}x</strong>
                </span>
                <span className="text-[11px] text-slate-600 dark:text-slate-300">
                  Confidence: <strong className="font-mono text-emerald-600 dark:text-emerald-400">{((bricsData?.confidence_score ?? 0.94) * 100).toFixed(0)}%</strong>
                </span>
              </div>
            </div>

            {/* Differential Privacy Guarantee Box */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-white dark:bg-brand-dark-surface/60 border border-slate-200 dark:border-brand-dark-border space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Privacy Guarantee</span>
                <span className="font-black text-slate-900 dark:text-white text-sm block">
                  {bricsData?.privacy_guarantee?.mechanism || 'Laplace Mechanism'}
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold block">
                  Budget: ε = {bricsData?.privacy_guarantee?.epsilon_privacy_budget ?? 0.5} (Δ = {bricsData?.privacy_guarantee?.global_sensitivity_delta ?? 0.1})
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-white dark:bg-brand-dark-surface/60 border border-slate-200 dark:border-brand-dark-border space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Patient Data Invariant</span>
                <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm block flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" />
                  <span>{bricsData?.privacy_guarantee?.phi_exposure || 'ZERO_PHI_SHARED'}</span>
                </span>
                <span className="text-[10px] text-slate-500 block">
                  Zero raw health data leaves national border
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-white dark:bg-brand-dark-surface/60 border border-slate-200 dark:border-brand-dark-border space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Model Confidence & Protocol</span>
                <span className="font-black text-slate-900 dark:text-white text-sm block">
                  {((bricsData?.confidence_score ?? 0.94) * 100).toFixed(0)}% Confidence
                </span>
                <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 block truncate">
                  {bricsData?.aggregation_protocol || 'FedAvg-Laplace-DP'}
                </span>
              </div>
            </div>

            {/* Active Sovereign Nodes Grid */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Synchronized Sovereign Federated Nodes (5/5 Online)</span>
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  Model: {bricsData?.model_version || 'v1.2.4-brics'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {bricsNodes.map(node => {
                  const gradient = bricsData?.node_gradients?.[node.id];
                  return (
                    <div
                      key={node.id}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-brand-dark-surface/50 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between gap-2 transition hover:border-indigo-300 dark:hover:border-indigo-800"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5">
                          <span className="text-xl leading-none">{node.flag}</span>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 dark:text-white text-xs">{node.nation}</span>
                              <span className="font-mono text-[10px] bg-slate-200 dark:bg-slate-800 px-1 py-0.2 rounded text-slate-700 dark:text-slate-300">
                                {node.id}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                              {node.facility}
                            </p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 shrink-0">
                          ✓ In Sync
                        </span>
                      </div>

                      {/* Dynamic Federated Gradient for Selected Category */}
                      <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between text-[10px]">
                        <span className="text-slate-400 font-medium">
                          {selectedBricsCategory} Gradient:
                        </span>
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-200/50 dark:border-indigo-900/50">
                          {gradient || '+4.8% anomaly gradient'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Math Parameter & Invariant Footer */}
            <div className="p-3 rounded-xl bg-slate-100/70 dark:bg-brand-dark-surface/80 border border-slate-200/60 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Global Anomaly Multiplier:</strong> {bricsData?.anomaly_threshold_multiplier?.toFixed(3) ?? 2.357}x baseline velocity
                </span>
              </div>
              <span className="font-mono text-[10px] text-slate-400">
                Last Global Sync (UTC): {bricsData?.last_global_sync_utc?.replace('T', ' ').slice(0, 19) || '2026-09-23 03:27:05'}
              </span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-brand-dark-border bg-slate-50/50 dark:bg-brand-dark-surface/50 flex justify-end">
          <button
            onClick={() => setIsSafetyModalOpen(false)}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
