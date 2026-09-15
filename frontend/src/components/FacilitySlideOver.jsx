import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import { StatusBadge } from './StatusBadge';
import {
  X,
  Building2,
  ThermometerSnowflake,
  Bed,
  Layers,
  ArrowRight,
  AlertTriangle,
  Calendar,
  Pill,
  ShieldCheck,
  RotateCw
} from 'lucide-react';
import clsx from 'clsx';

export function FacilitySlideOver({ facilityId, facility, status, onClose, onNavigateRebalance }) {
  const [inventory, setInventory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Manual refresh trigger
  const fetchInventory = useCallback(async () => {
    if (!facilityId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await api.getFacilityInventory(facilityId);
      setInventory(data);
    } catch (err) {
      console.error('[FacilitySlideOver] Failed to fetch inventory:', err);
      setError('Failed to load facility stock records.');
    } finally {
      setLoading(false);
    }
  }, [facilityId]);

  // Asynchronous load with cleanup guard against race conditions
  useEffect(() => {
    let ignore = false;

    async function load() {
      if (!facilityId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await api.getFacilityInventory(facilityId);
        if (!ignore) {
          setInventory(data);
          setLoading(false);
        }
      } catch (err) {
        console.error('[FacilitySlideOver] Failed to fetch inventory:', err);
        if (!ignore) {
          setError('Failed to load facility stock records.');
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      ignore = true;
    };
  }, [facilityId]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!facilityId) return null;

  const fac = facility || inventory?.facility || {};
  // Handle backend schema: data.inventory contains the array of medicine stock items
  const items = inventory?.inventory || inventory?.items || [];
  const criticalItems = items.filter(item => {
    const qty = item.total_quantity != null ? item.total_quantity : (item.total_stock || 0);
    return qty <= (item.min_safety_stock || 0);
  });
  const totalBatchesCount = inventory?.total_batches ?? items.reduce((acc, i) => acc + (i.batches?.length || 0), 0);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-fade-in"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-xl bg-white dark:bg-brand-dark-card shadow-2xl border-l border-slate-200 dark:border-brand-dark-border flex flex-col transform transition-transform duration-300 ease-out animate-slide-left">
          
          {/* Header */}
          <div className="p-6 border-b border-slate-200 dark:border-brand-dark-border bg-slate-50/70 dark:bg-brand-dark-surface/50">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-display font-bold text-xl text-slate-900 dark:text-white">
                    {fac.name || inventory?.facility_name || `Facility #${facilityId}`}
                  </h3>
                  <StatusBadge status={status || 'ADEQUATE'} size="xs" />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {fac.facility_code || inventory?.facility_code} • {fac.tier_type || fac.tier || 'Primary Health Centre'} • {fac.district || 'Pune'} District
                </p>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                title="Close Drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Badges Bar */}
            <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-2">
                <ThermometerSnowflake className={clsx("w-4 h-4 shrink-0", fac.has_cold_chain ? "text-teal-600 dark:text-teal-400" : "text-slate-400")} />
                <div>
                  <span className="text-[10px] text-slate-400 block leading-tight">Cold Chain</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {fac.has_cold_chain ? 'Active ILR' : 'None'}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-2">
                <Bed className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 block leading-tight">Bed Capacity</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {fac.total_beds ?? 20} Beds
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 block leading-tight">Batches Active</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {totalBatchesCount}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Critical Warning Banner if Stockouts Exist */}
          {criticalItems.length > 0 && (
            <div className="px-6 py-3 bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-900/60 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-rose-900 dark:text-rose-200 font-semibold">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>{criticalItems.length} Emergency Deficit{criticalItems.length > 1 ? 's' : ''} Identified</span>
              </div>
              <button
                onClick={() => onNavigateRebalance(facilityId)}
                className="px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] transition shadow-xs flex items-center gap-1"
              >
                <span>Rebalance</span> <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Main Inventory Content Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Live Essential Stock Inventory ({items.length} Medicines)
              </h4>
              <button
                onClick={fetchInventory}
                disabled={loading}
                className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
              >
                <RotateCw className={clsx("w-3 h-3", loading && "animate-spin")} />
                <span>Refresh</span>
              </button>
            </div>

            {loading ? (
              <div className="py-16 text-center space-y-3">
                <div className="w-8 h-8 mx-auto border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-400 font-medium">Fetching batch ledger from SQLite...</p>
              </div>
            ) : error ? (
              <div className="p-4 rounded-xl bg-rose-50 text-rose-800 text-xs border border-rose-200 text-center">
                {error}
              </div>
            ) : items.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No active medicine batches recorded for this facility.
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item, idx) => {
                  const quantity = item.total_quantity != null ? item.total_quantity : (item.total_stock || 0);
                  const isDepleted = quantity <= (item.min_safety_stock || 0);
                  const isEmergency = Boolean(item.is_emergency);

                  return (
                    <div
                      key={idx}
                      className={clsx(
                        'p-4 rounded-xl border transition-all text-xs',
                        isDepleted
                          ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60'
                          : 'bg-slate-50/60 dark:bg-brand-dark-surface/40 border-slate-200/80 dark:border-brand-dark-border'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {item.medicine_name}
                            </span>
                            {isEmergency && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                                Emergency
                              </span>
                            )}
                            {item.requires_cold_chain ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                                ❄️ +2°C–+8°C
                              </span>
                            ) : null}
                          </div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {item.category} • Safety Floor: {item.min_safety_stock} {item.unit}
                          </span>
                        </div>

                        <div className="text-right shrink-0">
                          <div className={clsx(
                            'font-bold text-sm font-display',
                            isDepleted ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
                          )}>
                            {quantity} {item.unit}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {item.batches?.length || 0} active batch{item.batches?.length === 1 ? '' : 'es'}
                          </span>
                        </div>
                      </div>

                      {/* Batches breakdown list */}
                      {item.batches && item.batches.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-800/80 space-y-1.5">
                          {item.batches.map((b, bIdx) => (
                            <div key={bIdx} className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 bg-white/70 dark:bg-slate-900/60 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                                  {b.batch_number}
                                </span>
                                <span className="text-slate-400">•</span>
                                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                  <Calendar className="w-3 h-3" />
                                  Exp: {b.expiry_date}
                                </span>
                              </div>
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {b.quantity_available} {item.unit}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Drawer Footer Actions */}
          <div className="p-4 border-t border-slate-200 dark:border-brand-dark-border bg-slate-50/70 dark:bg-brand-dark-surface/50 flex items-center justify-between gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
            >
              Close
            </button>

            <button
              onClick={() => onNavigateRebalance(facilityId)}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition flex items-center gap-2"
            >
              <span>Launch Gemini Rebalancer</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
