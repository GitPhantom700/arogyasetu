import React, { useState } from 'react';
import { useUI } from '../context/UIContext';
import { useAlerts } from '../context/AlertsContext';
import { api } from '../services/api';
import {
  ShieldCheck,
  X,
  AlertTriangle,
  Truck,
  Building2,
  Calendar,
  ThermometerSnowflake,
  ArrowRight,
  Clock,
  CheckCircle2,
  Lock,
  UserCheck,
  FileText
} from 'lucide-react';
import clsx from 'clsx';

export function RebalanceAuthModal() {
  const {
    isAuthModalOpen,
    closeAuthModal,
    recommendationToAuth,
    facilityMap,
    refreshData,
    setActiveTransferRoute,
    setActiveTab
  } = useUI();
  const { showToast } = useAlerts();

  const [authorizerName, setAuthorizerName] = useState('Dr. Ramesh Patil');
  const [authorizerRole, setAuthorizerRole] = useState('Civil Surgeon & District Health Officer');
  const [coldChainVerified, setColdChainVerified] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  if (!isAuthModalOpen || !recommendationToAuth) return null;

  const rec = recommendationToAuth;
  const donor = facilityMap.get(rec.donor_facility_id);
  const recipient = facilityMap.get(rec.recipient_facility_id);

  const requiresColdChain = Boolean(rec.requires_cold_chain);
  const isGhatTerrain = donor?.terrain_type === 'GHAT_MOUNTAIN' || recipient?.terrain_type === 'GHAT_MOUNTAIN';

  const handleAuthorize = async () => {
    if (requiresColdChain && !coldChainVerified) {
      showToast('You must confirm cold-chain integrity before authorizing biologicals transfer', 'warning');
      return;
    }

    if (!authorizerName.trim()) {
      showToast('Authorizing officer name is required for DSCSA audit compliance', 'warning');
      return;
    }

    try {
      setSubmitting(true);

      const payload = {
        destination_facility_id: rec.recipient_facility_id,
        source_facility_id: rec.donor_facility_id,
        medicine_id: rec.medicine_id,
        quantity: rec.recommended_quantity,
        allocated_batches: rec.allocated_batches || [],
        auto_approve: true,
        reason: `Emergency AI Rebalance: Outbreak triage for ${recipient?.name || 'PHC'}. Authorized by ${authorizerName} (${authorizerRole})`,
        ai_rationale: rec.ai_reasoning || rec.clinical_rationale || 'Peer-to-peer rebalancing authorized by clinical officer',
      };

      const result = await api.applyRebalance(payload);

      showToast(
        `Transfer ${result.transfer_code} successfully authorized & soft-reserved!`,
        'success',
        'Transfer Authorized'
      );

      // Refresh telemetry & cache
      await refreshData();

      // Configure active animated route object for the map visualizer
      const routeData = {
        transfer_id: result.transfer_id,
        transfer_code: result.transfer_code,
        status: result.status || 'APPROVED',
        source_facility_id: rec.donor_facility_id,
        source_facility_name: donor?.name,
        source_lat: donor?.latitude,
        source_lng: donor?.longitude,
        destination_facility_id: rec.recipient_facility_id,
        destination_facility_name: recipient?.name,
        destination_lat: recipient?.latitude,
        destination_lng: recipient?.longitude,
        medicine_name: rec.medicine_name,
        quantity: rec.recommended_quantity,
        unit: rec.unit || 'units',
        distance_km: rec.distance_km || result.distance_km,
        estimated_transit_hours: rec.estimated_transit_hours || result.estimated_transit_hours,
        requires_cold_chain: requiresColdChain,
        is_ghat_terrain: isGhatTerrain,
        allocated_batches: rec.allocated_batches || [],
      };

      setActiveTransferRoute(routeData);
      closeAuthModal();

      // Prompt user to view animated dispatch on map
      setActiveTab('map');
    } catch (err) {
      console.error('[RebalanceAuthModal] Failed to apply transfer:', err);
      showToast(err.message || 'Failed to authorize transfer order', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white dark:bg-brand-dark-card border border-slate-200 dark:border-brand-dark-border rounded-2xl shadow-2xl overflow-hidden my-8">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 dark:border-brand-dark-border flex items-center justify-between bg-slate-50/50 dark:bg-brand-dark-surface/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                Redistribution Order Authorization
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Peer-to-Peer Inter-PHC Transfer • Official Clinical Sign-Off
              </p>
            </div>
          </div>

          <button
            onClick={closeAuthModal}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-xs">

          {/* Route Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-center">
            
            {/* Donor Node */}
            <div className="md:col-span-5 p-4 rounded-xl border border-slate-200 dark:border-brand-dark-border bg-slate-50/60 dark:bg-brand-dark-surface/30 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Origin / Sourcing Donor
              </span>
              <h4 className="font-bold text-xs text-slate-900 dark:text-white leading-tight">
                {donor?.name || 'Donor Facility'}
              </h4>
              <span className="text-[11px] text-slate-500 block">
                {donor?.facility_code} • Tier: {donor?.tier || 'DH'}
              </span>
              <div className="pt-2 mt-2 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Retained Buffer:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {rec.donor_post_transfer_dir != null
                    ? `${rec.donor_post_transfer_dir.toFixed(1)} Days Safe`
                    : '≥ 14 Days Safe'}
                </span>
              </div>
            </div>

            {/* Middle Transit Connector */}
            <div className="md:col-span-1 flex flex-col items-center justify-center py-1">
              <div className="p-2 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/60">
                <Truck className="w-4 h-4" />
              </div>
            </div>

            {/* Recipient Node */}
            <div className="md:col-span-5 p-4 rounded-xl border border-rose-200/80 dark:border-rose-900/60 bg-rose-50/20 dark:bg-rose-950/10 space-y-1">
              <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider block">
                Destination / Triage Deficit
              </span>
              <h4 className="font-bold text-xs text-slate-900 dark:text-white leading-tight">
                {recipient?.name || 'Recipient Facility'}
              </h4>
              <span className="text-[11px] text-slate-500 block">
                {recipient?.facility_code} • Deficit Triage
              </span>
              <div className="pt-2 mt-2 border-t border-rose-200/60 dark:border-rose-900/40 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Status:</span>
                <span className="font-bold text-rose-600 dark:text-rose-400">
                  Critical Shortage
                </span>
              </div>
            </div>

          </div>

          {/* Allocation & Terrain Physics Card */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-brand-dark-border bg-white dark:bg-brand-dark-card space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-brand-dark-border pb-2">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                Redistribution Allocation Summary
              </span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                {rec.recommended_quantity} {rec.unit || 'units'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
              <div>
                <span className="text-slate-400 block">Medicine:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{rec.medicine_name}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Road Distance:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{rec.distance_km?.toFixed(1) || '0.0'} km</span>
              </div>
              <div>
                <span className="text-slate-400 block">Estimated Transit:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {rec.estimated_transit_hours?.toFixed(1) || '1.0'} hrs
                  {rec.monsoon_mode ? ' (1.5x)' : ''}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Terrain Impedance:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {isGhatTerrain ? 'Ghats (25 km/h)' : 'Plains (45 km/h)'}
                </span>
              </div>
            </div>

            {/* Allocated Batches FEFO Breakdown */}
            {rec.allocated_batches?.length > 0 ? (
              <div className="pt-2 border-t border-slate-100 dark:border-brand-dark-border">
                <span className="text-[10px] text-slate-400 block mb-1">
                  FEFO Allocated Batches:
                </span>
                <div className="space-y-1">
                  {rec.allocated_batches.map((b, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800 font-mono text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-700 dark:text-slate-300">{b.batch_number}</span>
                        <span className="text-slate-400">• Exp: {b.expiry_date}</span>
                      </div>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {b.allocated_quantity || b.quantity} {rec.unit || 'units'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="pt-2 border-t border-slate-100 dark:border-brand-dark-border">
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/40 text-[11px] text-indigo-900 dark:text-indigo-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>
                    <strong>Automated FEFO Allocation at Dispatch Dock:</strong> Earliest expiring active batches ({rec.recommended_quantity} {rec.unit || 'units'}) will be atomically locked and verified upon physical dispatch.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Clinical Checkpoints */}
          <div className="space-y-2">
            <h5 className="font-bold text-[11px] text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Clinical & Logistical Safety Checks
            </h5>

            {/* Cold Chain Verification Check */}
            {requiresColdChain && (
              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-cyan-200 dark:border-cyan-900/60 bg-cyan-50/40 dark:bg-cyan-950/20 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={coldChainVerified}
                  onChange={(e) => setColdChainVerified(e.target.checked)}
                  className="mt-0.5 rounded border-cyan-400 text-cyan-600 focus:ring-cyan-500 w-4 h-4 cursor-pointer"
                />
                <div className="space-y-0.5">
                  <span className="font-bold text-cyan-900 dark:text-cyan-200 flex items-center gap-1.5">
                    <ThermometerSnowflake className="w-3.5 h-3.5 text-cyan-600" />
                    <span>Cold-Chain Protocol Verified (+2°C to +8°C Active ILR)</span>
                  </span>
                  <p className="text-[10px] text-cyan-700 dark:text-cyan-300 leading-tight">
                    I confirm vehicle is equipped with conditioned ice-pack vaccine carrier and temperature monitoring log.
                  </p>
                </div>
              </label>
            )}

            {/* Invariant Assurance Box */}
            <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-[11px] text-emerald-800 dark:text-emerald-200">
                <strong>Non-Cannibalization Invariant:</strong> Donor will retain at least 14 days of Daily Average Consumption (DAC) reserve.
              </span>
            </div>
          </div>

          {/* Authorizing Official Credentials */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-brand-dark-border">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-slate-500" />
              <span className="font-bold text-slate-800 dark:text-slate-200">
                Authorizing Health Officer Sign-Off
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                  Designated Officer Name
                </label>
                <input
                  type="text"
                  value={authorizerName}
                  onChange={(e) => setAuthorizerName(e.target.value)}
                  className="w-full p-2 rounded-xl bg-slate-100 dark:bg-brand-dark-surface border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium focus:ring-1 focus:ring-emerald-500"
                  placeholder="e.g. Dr. Ramesh Patil"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                  Designation / Role
                </label>
                <input
                  type="text"
                  value={authorizerRole}
                  onChange={(e) => setAuthorizerRole(e.target.value)}
                  className="w-full p-2 rounded-xl bg-slate-100 dark:bg-brand-dark-surface border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium focus:ring-1 focus:ring-emerald-500"
                  placeholder="e.g. Civil Surgeon / DHO"
                />
              </div>
            </div>
          </div>

        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-slate-100 dark:border-brand-dark-border bg-slate-50/50 dark:bg-brand-dark-surface/40 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={closeAuthModal}
            disabled={submitting}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold transition text-xs"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleAuthorize}
            disabled={submitting || (requiresColdChain && !coldChainVerified)}
            className={clsx(
              'px-5 py-2 rounded-xl font-bold text-xs text-white shadow-md transition flex items-center gap-2',
              submitting || (requiresColdChain && !coldChainVerified)
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500'
            )}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{submitting ? 'Committing Soft Reservation...' : 'Authorize & Soft-Reserve Stock'}</span>
          </button>
        </div>

      </div>
    </div>
  );
}
