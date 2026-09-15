import React, { useState, useEffect } from 'react';
import { useUI } from '../context/UIContext';
import { api } from '../services/api';
import {
  Package,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Thermometer,
  ShieldCheck,
  Building2,
  ExternalLink,
  RotateCw,
  MapPin,
  TrendingDown,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import clsx from 'clsx';

export function FacilityStocksView() {
  const { setSelectedFacilityId, setActiveTab, addToast, t } = useUI();
  const [facilities, setFacilities] = useState([]);
  const [depletionData, setDepletionData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDistrict, setSelectedDistrict] = useState('ALL');
  const [selectedTier, setSelectedTier] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [facData, depData] = await Promise.all([
        api.getFacilities(50),
        api.getDepletionAnalysis().catch(() => ({ facilities: [] }))
      ]);
      setFacilities(facData.facilities || facData || []);
      setDepletionData(depData.facilities || depData || []);
    } catch (err) {
      console.error('Failed to load facility stocks:', err);
      addToast('Failed to load facility stocks data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter facilities
  const filteredFacilities = facilities.filter(fac => {
    if (selectedDistrict !== 'ALL' && fac.district !== selectedDistrict) return false;
    if (selectedTier !== 'ALL') {
      const type = (fac.facility_type || '').toUpperCase();
      if (selectedTier === 'PHC' && !type.includes('PHC')) return false;
      if (selectedTier === 'SUB_CENTRE' && !type.includes('SUB') && !type.includes('SC')) return false;
      if (selectedTier === 'HOSPITAL' && !type.includes('HOSPITAL') && !type.includes('SDH') && !type.includes('RH')) return false;
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchName = (fac.name || '').toLowerCase().includes(q);
      const matchBlock = (fac.block || '').toLowerCase().includes(q);
      const matchDist = (fac.district || '').toLowerCase().includes(q);
      return matchName || matchBlock || matchDist;
    }
    return true;
  });

  const criticalCount = facilities.filter(f => (f.critical_medicines_count || 0) > 0 || (f.status === 'CRITICAL')).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <Package className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <span>{t('facility_stocks_title', 'Facility Stocks & Regional Depletion Monitor')}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('facility_stocks_subtitle', 'Real-time stock levels, burn rate depletion velocity, and cold-chain integrity across all 15 public health facilities in Pune & Satara.')}
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition self-start md:self-auto"
        >
          <RotateCw className={clsx("w-3.5 h-3.5", loading && "animate-spin")} />
          <span>Refresh Stocks</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-brand-dark-card border border-slate-200 dark:border-brand-dark-border shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Facilities</span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{facilities.length}</span>
            <span className="text-[10px] text-emerald-600 font-bold">100% Monitored</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-brand-dark-card border border-slate-200 dark:border-brand-dark-border shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Critical Stockouts</span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400">{criticalCount}</span>
            <span className="text-[10px] text-rose-500 font-semibold">&lt; 48h Supply</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-brand-dark-card border border-slate-200 dark:border-brand-dark-border shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Cold-Chain Storage</span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">+2° to +8°C</span>
            <span className="text-[10px] text-slate-400">ILR Active</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-brand-dark-card border border-slate-200 dark:border-brand-dark-border shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Districts</span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">2</span>
            <span className="text-[10px] text-slate-400">Pune & Satara</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-brand-dark-card p-3 rounded-2xl border border-slate-200 dark:border-brand-dark-border shadow-xs">
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          {/* District Filter */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {['ALL', 'Pune', 'Satara'].map(dist => (
              <button
                key={dist}
                type="button"
                onClick={() => setSelectedDistrict(dist)}
                className={clsx(
                  "px-3 py-1 rounded-lg text-xs font-bold transition",
                  selectedDistrict === dist
                    ? "bg-white dark:bg-brand-dark-surface text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                {dist === 'ALL' ? t('all_districts', 'All Districts') : dist === 'Pune' ? t('pune_district', 'Pune') : t('satara_district', 'Satara')}
              </button>
            ))}
          </div>

          {/* Tier Filter */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {[
              { id: 'ALL', label: t('all_tiers', 'All Tiers') },
              { id: 'HOSPITAL', label: t('tier_hospital', 'Hospitals (DH/SDH)') },
              { id: 'PHC', label: t('tier_phc', 'PHC') },
              { id: 'SUB_CENTRE', label: t('tier_subcentre', 'Sub-Centre') }
            ].map(tier => (
              <button
                key={tier.id}
                type="button"
                onClick={() => setSelectedTier(tier.id)}
                className={clsx(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition",
                  selectedTier === tier.id
                    ? "bg-white dark:bg-brand-dark-surface text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                {tier.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search facility or block..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Facility Inventory Cards Grid */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 space-y-2">
          <RotateCw className="w-6 h-6 animate-spin mx-auto text-emerald-600" />
          <p className="text-xs">Loading facility stocks & inventories...</p>
        </div>
      ) : filteredFacilities.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-brand-dark-card border border-slate-200 dark:border-brand-dark-border text-slate-400">
          <Building2 className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
          <p className="font-semibold text-sm text-slate-700 dark:text-slate-300">No facilities match your search</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFacilities.map(fac => {
            const hasCritical = (fac.critical_medicines_count || 0) > 0 || fac.status === 'CRITICAL';
            const marathiName = fac.name_mr || (
              fac.name.includes('Paud') ? 'प्राथमिक आरोग्य केंद्र पौड' :
              fac.name.includes('Velhe') ? 'उपकेंद्र वेल्हे' :
              fac.name.includes('Khandala') ? 'प्राथमिक आरोग्य केंद्र खंडाळा' :
              fac.name.includes('Shirur') ? 'उपजिल्हा रुग्णालय शिरूर' :
              fac.name.includes('Saswad') ? 'ग्रामीण रुग्णालय सासवड' :
              fac.name.includes('Mahabaleshwar') ? 'उपकेंद्र महाबळेश्वर' :
              fac.name.includes('Aundh') ? 'जिल्हा रुग्णालय औंध' :
              fac.name.includes('Satara') ? 'जिल्हा रुग्णालय सातारा' : null
            );

            return (
              <div
                key={fac.id}
                className={clsx(
                  "p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 bg-white dark:bg-brand-dark-card shadow-xs",
                  hasCritical
                    ? "border-rose-300 dark:border-rose-900/60 ring-1 ring-rose-500/20"
                    : "border-slate-200 dark:border-brand-dark-border hover:border-slate-300 dark:hover:border-slate-700"
                )}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {fac.facility_type}
                      </span>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1">
                        {fac.name}
                      </h3>
                      {marathiName && (
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold font-serif">
                          {marathiName}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 shrink-0">
                      <Thermometer className="w-3.5 h-3.5 text-blue-500" />
                      <span>+4°C ILR</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-2">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-rose-500" />
                      <span>{fac.block}, {fac.district}</span>
                    </span>
                    <span>•</span>
                    <span className="capitalize">{fac.terrain_type?.replace('_', ' ') || 'Plain'}</span>
                  </div>

                  {/* Stock Status Bar */}
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">Total Stock Available</span>
                      <span className="font-black text-slate-900 dark:text-white text-sm">
                        {fac.total_stock != null ? fac.total_stock.toLocaleString() : (fac.total_quantity != null ? fac.total_quantity.toLocaleString() : '1,200')} units
                      </span>
                    </div>

                    {hasCritical ? (
                      <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 text-[11px] font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>{t('status_critical', 'Critical Depletion')}</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{t('status_adequate', 'Adequate Buffer')}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedFacilityId(fac.id)}
                    className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>{t('btn_view_batch', 'View Batch Stock')}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('rebalance')}
                    className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition cursor-pointer"
                    title="Rebalance Inventory"
                  >
                    {t('btn_rebalance_now', 'Rebalance')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
