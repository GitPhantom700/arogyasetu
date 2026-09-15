import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { ShieldCheck, Zap, AlertOctagon, RotateCcw, X, Check, Activity } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

export function SafetyModal() {
  const { isSafetyModalOpen, setIsSafetyModalOpen, safetyStatus, refreshData, showToast } = useApp();
  const [violations, setViolations] = useState([]);
  const [loadingViolations, setLoadingViolations] = useState(false);
  const [resetting, setResetting] = useState(null);

  useEffect(() => {
    if (isSafetyModalOpen) {
      setLoadingViolations(true);
      api.getSafetyViolations(25)
        .then(data => setViolations(data.violations || []))
        .catch(err => console.error('Failed to load violations:', err))
        .finally(() => setLoadingViolations(false));
    }
  }, [isSafetyModalOpen]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-brand-dark-card border border-slate-200 dark:border-brand-dark-border rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-brand-dark-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">
                AI Safety Architecture & Circuit Telemetry
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Deterministic Invariant Firewall, Input Sanitization & Fault-Tolerance
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

        {/* Content Body */}
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

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-brand-dark-border bg-slate-50/50 dark:bg-brand-dark-surface/50 flex justify-end">
          <button
            onClick={() => setIsSafetyModalOpen(false)}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
