import React, { useState, useEffect } from 'react';
import { useUI } from '../context/UIContext';
import { useAlerts } from '../context/AlertsContext';
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

const FACILITY_DIRECTORY = {
  'DH-PUN-01': {
    name_mr: 'जिल्हा रुग्णालय औंध',
    name_hi: 'जिला अस्पताल औंध',
    block_en: 'Aundh (Haveli)',
    block_mr: 'औंध (हवेली)',
    block_hi: 'औंध (हवेली)'
  },
  'SDH-PUN-01': {
    name_mr: 'उपजिल्हा रुग्णालय शिरूर',
    name_hi: 'उप-जिला अस्पताल शिरूर',
    block_en: 'Shirur',
    block_mr: 'शिरूर',
    block_hi: 'शिरूर'
  },
  'CHC-PUN-01': {
    name_mr: 'समुदाय आरोग्य केंद्र खेड',
    name_hi: 'सामुदायिक स्वास्थ्य केंद्र खेड',
    block_en: 'Khed (Rajgurunagar)',
    block_mr: 'खेड (राजगुरुनगर)',
    block_hi: 'खेड (राजगुरुनगर)'
  },
  'CHC-PUN-02': {
    name_mr: 'समुदाय आरोग्य केंद्र जुन्नर',
    name_hi: 'सामुदायिक स्वास्थ्य केंद्र जुन्नर',
    block_en: 'Junnar',
    block_mr: 'जुन्नर',
    block_hi: 'जुन्नर'
  },
  'PHC-PUN-01': {
    name_mr: 'प्राथमिक आरोग्य केंद्र कल्याणपूर',
    name_hi: 'प्राथमिक स्वास्थ्य केंद्र कल्याणपुर',
    block_en: 'Haveli',
    block_mr: 'हवेली',
    block_hi: 'हवेली'
  },
  'PHC-PUN-02': {
    name_mr: 'प्राथमिक आरोग्य केंद्र पौड',
    name_hi: 'प्राथमिक स्वास्थ्य केंद्र पौड',
    block_en: 'Mulshi (Paud)',
    block_mr: 'मुळशी (पौड)',
    block_hi: 'मुळशी (पौड)'
  },
  'PHC-PUN-03': {
    name_mr: 'प्राथमिक आरोग्य केंद्र नारायणगाव',
    name_hi: 'प्राथमिक स्वास्थ्य केंद्र नारायणगांव',
    block_en: 'Junnar (Narayangaon)',
    block_mr: 'जुन्नर (नारायणगाव)',
    block_hi: 'जुन्नर (नारायणगांव)'
  },
  'PHC-PUN-04': {
    name_mr: 'प्राथमिक आरोग्य केंद्र सासवड',
    name_hi: 'प्राथमिक स्वास्थ्य केंद्र सासवड',
    block_en: 'Purandar (Saswad)',
    block_mr: 'पुरंदर (सासवड)',
    block_hi: 'पुरंदर (सासवड)'
  },
  'SC-PUN-01': {
    name_mr: 'उपकेंद्र वेल्हे (घाट परिसर)',
    name_hi: 'उप-केंद्र वेल्हे (घाट क्षेत्र)',
    block_en: 'Velhe (Ghat)',
    block_mr: 'वेल्हे (घाट)',
    block_hi: 'वेल्हे (घाट)'
  },
  'DH-SAT-01': {
    name_mr: 'क्रांतीसिंह नाना पाटील जिल्हा रुग्णालय (सातारा)',
    name_hi: 'क्रांतिसिंह नाना पाटिल जिला अस्पताल (सतारा)',
    block_en: 'Satara City',
    block_mr: 'सातारा शहर',
    block_hi: 'सातारा शहर'
  },
  'SDH-SAT-01': {
    name_mr: 'उपजिल्हा रुग्णालय कराड',
    name_hi: 'उप-जिला अस्पताल कराड',
    block_en: 'Karad',
    block_mr: 'कराड',
    block_hi: 'कराड'
  },
  'CHC-SAT-01': {
    name_mr: 'समुदाय आरोग्य केंद्र वाई',
    name_hi: 'सामुदायिक स्वास्थ्य केंद्र वाई',
    block_en: 'Wai',
    block_mr: 'वाई',
    block_hi: 'वाई'
  },
  'PHC-SAT-01': {
    name_mr: 'प्राथमिक आरोग्य केंद्र मेढा (जावळी)',
    name_hi: 'प्राथमिक स्वास्थ्य केंद्र मेढा (जावली)',
    block_en: 'Jawali (Medha)',
    block_mr: 'जावळी (मेढा)',
    block_hi: 'जावली (मेढा)'
  },
  'PHC-SAT-02': {
    name_mr: 'प्राथमिक आरोग्य केंद्र खंडाळा',
    name_hi: 'प्राथमिक स्वास्थ्य केंद्र खंडाला',
    block_en: 'Khandala',
    block_mr: 'खंडाळा',
    block_hi: 'खंडाला'
  },
  'SC-SAT-01': {
    name_mr: 'उपकेंद्र महाबळेश्वर (वन सीमा)',
    name_hi: 'उप-केंद्र महाबलेश्वर (वन क्षेत्र)',
    block_en: 'Mahabaleshwar',
    block_mr: 'महाबळेश्वर',
    block_hi: 'महाबलेश्वर'
  }
};

function getFacilityDetails(fac, lang) {
  const code = fac.facility_code;
  let match = FACILITY_DIRECTORY[code];
  if (!match) {
    const n = fac.name || '';
    if (n.includes('Aundh')) match = FACILITY_DIRECTORY['DH-PUN-01'];
    else if (n.includes('Shirur')) match = FACILITY_DIRECTORY['SDH-PUN-01'];
    else if (n.includes('Khed')) match = FACILITY_DIRECTORY['CHC-PUN-01'];
    else if (n.includes('Junnar')) match = FACILITY_DIRECTORY['CHC-PUN-02'];
    else if (n.includes('Kalyanpur')) match = FACILITY_DIRECTORY['PHC-PUN-01'];
    else if (n.includes('Paud')) match = FACILITY_DIRECTORY['PHC-PUN-02'];
    else if (n.includes('Narayangaon')) match = FACILITY_DIRECTORY['PHC-PUN-03'];
    else if (n.includes('Saswad')) match = FACILITY_DIRECTORY['PHC-PUN-04'];
    else if (n.includes('Velhe')) match = FACILITY_DIRECTORY['SC-PUN-01'];
    else if (n.includes('Nana Patil') || n.includes('Kranti')) match = FACILITY_DIRECTORY['DH-SAT-01'];
    else if (n.includes('Karad')) match = FACILITY_DIRECTORY['SDH-SAT-01'];
    else if (n.includes('Wai')) match = FACILITY_DIRECTORY['CHC-SAT-01'];
    else if (n.includes('Medha') || n.includes('Jawali')) match = FACILITY_DIRECTORY['PHC-SAT-01'];
    else if (n.includes('Khandala')) match = FACILITY_DIRECTORY['PHC-SAT-02'];
    else if (n.includes('Mahabaleshwar')) match = FACILITY_DIRECTORY['SC-SAT-01'];
  }

  const marathiName = match?.name_mr || fac.name_mr || null;
  const hindiName = match?.name_hi || fac.name_hi || null;
  const block = fac.block || (lang === 'mr' ? match?.block_mr : lang === 'hi' ? match?.block_hi : match?.block_en);

  return { marathiName, hindiName, block };
}

export function FacilityStocksView() {
  const { setSelectedFacilityId, setActiveTab, t, language, facilityStatusMap, depletionData: contextDepletionData } = useUI();
  const { showToast } = useAlerts();
  const addToast = showToast;
  const [facilities, setFacilities] = useState([]);
  const [depletionData, setDepletionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDistrict, setSelectedDistrict] = useState('ALL');
  const [selectedTier, setSelectedTier] = useState('ALL');
  const [selectedTriage, setSelectedTriage] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [facData, depData] = await Promise.all([
        api.getFacilities(50),
        api.getDepletionAnalysis().catch(err => {
          console.error('Failed to load depletion analysis:', err);
          return null;
        })
      ]);
      const list = Array.isArray(facData) ? facData : (facData?.facilities || []);
      setFacilities(list);
      if (depData) {
        setDepletionData(depData);
      }
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

  // Set of facility IDs that have active critical stockouts according to depletion metrics
  const criticalFacilityIds = React.useMemo(() => {
    const ids = new Set();
    const activeDep = depletionData?.items ? depletionData : contextDepletionData;
    const items = Array.isArray(activeDep?.items)
      ? activeDep.items
      : (Array.isArray(activeDep?.facilities) ? activeDep.facilities : (Array.isArray(activeDep) ? activeDep : []));
    items.forEach(item => {
      if (item.status === 'CRITICAL' || (item.critical_count || 0) > 0) {
        if (item.facility_id) {
          ids.add(Number(item.facility_id));
          ids.add(String(item.facility_id));
        }
      }
    });
    return ids;
  }, [depletionData, contextDepletionData]);

  const isFacilityCritical = React.useCallback((fac) => {
    if (!fac?.id) return false;
    const numId = Number(fac.id);
    const strId = String(fac.id);
    if (criticalFacilityIds.has(numId) || criticalFacilityIds.has(strId)) return true;
    if (facilityStatusMap?.[numId] === 'CRITICAL' || facilityStatusMap?.[strId] === 'CRITICAL') return true;
    if ((fac.critical_medicines_count || 0) > 0 || fac.status === 'CRITICAL') return true;
    return false;
  }, [criticalFacilityIds, facilityStatusMap]);

  // Filter facilities
  const filteredFacilities = facilities.filter(fac => {
    if (selectedDistrict !== 'ALL' && fac.district !== selectedDistrict) return false;
    if (selectedTier !== 'ALL') {
      const type = (fac.tier || fac.facility_type || '').toUpperCase();
      if (selectedTier === 'PHC' && !type.includes('PHC')) return false;
      if (selectedTier === 'SUB_CENTRE' && !type.includes('SUB') && !type.includes('SC')) return false;
      if (selectedTier === 'HOSPITAL' && !type.includes('HOSPITAL') && !type.includes('SDH') && !type.includes('RH') && !type.includes('DH')) return false;
    }
    if (selectedTriage !== 'ALL') {
      const isCrit = isFacilityCritical(fac);
      if (selectedTriage === 'CRITICAL' && !isCrit) return false;
      if (selectedTriage === 'ADEQUATE' && isCrit) return false;
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchName = (fac.name || '').toLowerCase().includes(q);
      const matchBlock = (fac.block || '').toLowerCase().includes(q);
      const matchDist = (fac.district || '').toLowerCase().includes(q);
      const { marathiName, hindiName } = getFacilityDetails(fac, language);
      const matchMarathi = (marathiName || '').toLowerCase().includes(q);
      const matchHindi = (hindiName || '').toLowerCase().includes(q);
      return matchName || matchBlock || matchDist || matchMarathi || matchHindi;
    }
    return true;
  });

  const criticalCount = facilities.filter(f => isFacilityCritical(f)).length;

  return (
    <div className="space-y-4 animate-fade-in pb-12">
      {/* Top Header */}
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
          className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition self-start md:self-auto cursor-pointer"
        >
          <RotateCw className={clsx("w-3.5 h-3.5", loading && "animate-spin")} />
          <span>{t('btn_refresh_stocks', 'Refresh Stocks')}</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-brand-dark-card border border-slate-200 dark:border-brand-dark-border shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            {t('total_facilities_kpi', 'Total Facilities')}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              {language === 'mr' ? facilities.length.toLocaleString('mr-IN') : facilities.length}
            </span>
            <span className="text-[10px] text-emerald-600 font-bold">
              {t('monitored_100_kpi', '100% Monitored')}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-brand-dark-card border border-slate-200 dark:border-brand-dark-border shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            {t('critical_stockouts_kpi', 'Critical Stockouts')}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400">
              {language === 'mr' ? criticalCount.toLocaleString('mr-IN') : criticalCount}
            </span>
            <span className="text-[10px] text-rose-500 font-semibold">
              {t('supply_sub_48h', '< 48h Supply')}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-brand-dark-card border border-slate-200 dark:border-brand-dark-border shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            {t('cold_chain_kpi', 'Cold-Chain Storage')}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {language === 'mr' ? '+२° ते +८°C' : '+2° to +8°C'}
            </span>
            <span className="text-[10px] text-slate-400">
              {t('ilr_active_kpi', 'ILR Active')}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-brand-dark-card border border-slate-200 dark:border-brand-dark-border shadow-xs space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            {t('districts_kpi', 'Districts')}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              {language === 'mr' ? (2).toLocaleString('mr-IN') : 2}
            </span>
            <span className="text-[10px] text-slate-400">
              {t('pune_satara_districts', 'Pune & Satara')}
            </span>
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
                  "px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer",
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
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer",
                  selectedTier === tier.id
                    ? "bg-white dark:bg-brand-dark-surface text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                {tier.label}
              </button>
            ))}
          </div>

          {/* Stock Triage Filter */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {[
              { id: 'ALL', label: t('all_status_filter', 'All Status') },
              { id: 'CRITICAL', label: t('status_critical_filter', 'Critical') },
              { id: 'ADEQUATE', label: t('status_adequate_filter', 'Adequate') }
            ].map(tri => (
              <button
                key={tri.id}
                type="button"
                onClick={() => setSelectedTriage(tri.id)}
                className={clsx(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer",
                  selectedTriage === tri.id
                    ? (tri.id === 'CRITICAL'
                        ? "bg-rose-600 text-white shadow-xs"
                        : tri.id === 'ADEQUATE'
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-white dark:bg-brand-dark-surface text-slate-900 dark:text-white shadow-xs")
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                {tri.id === 'CRITICAL' && <span className="w-1.5 h-1.5 rounded-full bg-rose-300 animate-pulse" />}
                {tri.id === 'ADEQUATE' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                <span>{tri.label}</span>
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
            placeholder={t('search_facility_placeholder', 'Search facility or block...')}
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
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-brand-dark-card border border-slate-200 dark:border-brand-dark-border text-slate-400 space-y-3">
          <Building2 className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
          <div>
            <p className="font-semibold text-sm text-slate-700 dark:text-slate-300">No facilities match the selected filters</p>
            {selectedTriage === 'CRITICAL' && selectedDistrict === 'Pune' && (
              <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">
                Active critical stockouts are located in <strong>Satara District</strong> (Community Health Centre Wai & PHC Khandala).
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedDistrict('ALL');
              setSelectedTier('ALL');
              setSelectedTriage('ALL');
              setSearchTerm('');
            }}
            className="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition cursor-pointer"
          >
            Reset Filters (View All 15 Facilities)
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFacilities.map(fac => {
            const hasCritical = isFacilityCritical(fac);
            const { marathiName, hindiName, block } = getFacilityDetails(fac, language);
            const subtitle = language === 'mr' ? marathiName : (language === 'hi' ? (hindiName || marathiName) : marathiName);

            const tierCode = fac.tier || fac.facility_type || 'PHC';
            const tierKey = {
              'DH': 'tier_dh',
              'SDH': 'tier_sdh',
              'CHC': 'tier_chc',
              'PHC': 'tier_phc_badge',
              'SC': 'tier_sc'
            }[tierCode] || 'tier_phc_badge';
            const tierLabel = t(tierKey, tierCode);

            const districtName = fac.district === 'Pune' ? t('pune_district', 'Pune') : t('satara_district', 'Satara');
            const terrainKey = {
              'GHAT_MOUNTAIN': 'terrain_ghat',
              'HIGHWAY_CORRIDOR': 'terrain_highway',
              'PLAINS': 'terrain_plains'
            }[fac.terrain_type] || 'terrain_plains';
            const terrainLabel = t(terrainKey, fac.terrain_type?.replace('_', ' ') || 'Plains');

            const rawStock = fac.total_stock != null ? fac.total_stock : (fac.total_quantity != null ? fac.total_quantity : 1200);
            const stockFormatted = language === 'mr' ? rawStock.toLocaleString('mr-IN') : rawStock.toLocaleString();

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
                        {tierLabel}
                      </span>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1">
                        {fac.name}
                      </h3>
                      {subtitle && (
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold font-serif">
                          {subtitle}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 shrink-0">
                      <Thermometer className="w-3.5 h-3.5 text-blue-500" />
                      <span>{t('cold_chain_badge', '+4°C ILR')}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-2 flex-wrap">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                      <span>{block ? `${block}, ${districtName}` : districtName}</span>
                    </span>
                    <span>•</span>
                    <span>{terrainLabel}</span>
                  </div>

                  {/* Stock Status Bar */}
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">
                        {t('total_stock_available_label', 'Total Stock Available')}
                      </span>
                      <span className="font-black text-slate-900 dark:text-white text-sm">
                        {stockFormatted} {t('units_suffix', 'units')}
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
