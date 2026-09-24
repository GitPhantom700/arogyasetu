import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { StatusBadge } from './StatusBadge';
import {
  ShieldCheck,
  Bell,
  Sun,
  Moon,
  RotateCw,
  Radio,
  CheckCircle2,
  Check,
  Building2,
  Pill,
  Layers,
  AlertTriangle,
  Wifi,
  WifiOff,
  X,
  Truck,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import clsx from 'clsx';

export function Header() {
  const {
    theme,
    toggleTheme,
    language,
    setLanguage,
    t,
    stats,
    isSSEConnected,
    alerts,
    unreadAlertsCount,
    acknowledgeAlert,
    setIsSafetyModalOpen,
    refreshData,
    loading,
    crisisStatus,
    setActiveTab,
    setSelectedFacilityId,
    setSelectedDeficitId,
    setTransferSearchTerm
  } = useApp();

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationsRef = useRef(null);

  const [isSimulatedOffline, setIsSimulatedOffline] = useState(() => {
    return typeof window !== 'undefined' ? Boolean(window.__PRANAVAHINI_OFFLINE_SIMULATED__) : false;
  });
  const [isOnline, setIsOnline] = useState(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);

  // Close notifications dropdown on click outside or Escape key
  useEffect(() => {
    function handleClickOutside(event) {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setIsNotificationsOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsNotificationsOpen(false);
      }
    }
    if (isNotificationsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isNotificationsOpen]);

  const handleMarkAllAsRead = () => {
    const unread = (alerts || []).filter(a => !a.is_acknowledged && a.acknowledged !== 1);
    unread.forEach(a => acknowledgeAlert(a.id));
  };

  // Monitor offline queue and network state
  useEffect(() => {
    const updateQueueCount = () => {
      try {
        const queue = JSON.parse(localStorage.getItem('pranavahini_offline_dispense_queue') || '[]');
        setOfflineQueueCount(queue.length);
      } catch {
        setOfflineQueueCount(0);
      }
    };

    updateQueueCount();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('storage', updateQueueCount);

    const interval = setInterval(updateQueueCount, 1500);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('storage', updateQueueCount);
      clearInterval(interval);
    };
  }, []);

  const toggleSimulatedOffline = () => {
    const next = !isSimulatedOffline;
    if (typeof window !== 'undefined') {
      window.__PRANAVAHINI_OFFLINE_SIMULATED__ = next;
    }
    setIsSimulatedOffline(next);
    if (!next) {
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new Event('pranavahini:flush_offline_queue'));
    }
  };

  const triggerSyncNow = () => {
    window.dispatchEvent(new Event('pranavahini:flush_offline_queue'));
  };

  return (
    <header className="sticky top-0 z-30 bg-white/90 dark:bg-brand-dark-card/90 backdrop-blur-md border-b border-slate-200/80 dark:border-brand-dark-border px-6 py-3 transition-colors">
      <div className="flex items-center justify-between gap-4">
        
        {/* Brand & Network Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden shadow-md shadow-emerald-500/20 border border-teal-500/30 bg-white flex items-center justify-center flex-shrink-0">
            <img
              src="/logo.jpg"
              alt="PranaVahini Logo"
              className="w-full h-full object-cover"
              onError={(e) => {
                if (!e.currentTarget.dataset.retried) {
                  e.currentTarget.dataset.retried = 'true';
                  e.currentTarget.src = '/static/logo.jpg';
                } else {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement.classList.add('bg-gradient-to-tr', 'from-emerald-600', 'to-teal-500', 'text-white');
                  e.currentTarget.parentElement.innerHTML = '<span class="font-display font-black text-xl tracking-tight">PV</span>';
                }
              }}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-bold text-lg text-slate-900 dark:text-white tracking-tight leading-none">
                {t('brand_name', 'PranaVahini')}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                {t('brand_subtitle', 'Command Center')}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
              {t('brand_region', 'Maharashtra Rural Health Supply Chain • Pune & Satara Network')}
            </p>
          </div>
        </div>

        {/* Live Network Health Telemetry Pill */}
        <div className="hidden lg:flex items-center gap-5 px-4 py-1.5 rounded-xl bg-slate-100/70 dark:bg-brand-dark-surface/70 border border-slate-200/60 dark:border-brand-dark-border text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-2">
            <span className={isSSEConnected ? "h-2 w-2 rounded-full bg-emerald-500 animate-pulse" : "h-2 w-2 rounded-full bg-amber-500"} />
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {isSSEConnected ? t('network_live', 'Network Live') : 'Reconnecting...'}
            </span>
          </div>
          <div className="h-3 w-px bg-slate-300 dark:bg-slate-700" />
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <span><strong>{stats?.total_facilities ?? 15}</strong> {t('total_facilities', 'Facilities')}</span>
          </div>
          <div className="h-3 w-px bg-slate-300 dark:bg-slate-700" />
          <div className="flex items-center gap-1.5">
            <Pill className="w-3.5 h-3.5 text-slate-400" />
            <span><strong>{stats?.total_medicines ?? 10}</strong> {t('total_medicines', 'Medicines')}</span>
          </div>
          <div className="h-3 w-px bg-slate-300 dark:bg-slate-700" />
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span><strong>{stats?.total_batches ?? 166}</strong> {t('total_batches', 'Batches')}</span>
          </div>
        </div>

        {/* Action Controls & Badges */}
        <div className="flex items-center gap-2.5">
          
          {/* Rural Network Sync & Offline Simulation Drill Pill */}
          <div
            className={clsx(
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all shadow-xs select-none',
              isSimulatedOffline
                ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700'
                : !isOnline
                  ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-900 dark:text-rose-200 border-rose-300 dark:border-rose-700'
                  : 'bg-slate-100/80 dark:bg-brand-dark-surface/80 text-slate-700 dark:text-slate-300 border-slate-200/80 dark:border-brand-dark-border'
            )}
          >
            <div className="flex items-center gap-1.5">
              {isSimulatedOffline || !isOnline ? (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
              ) : (
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              )}
              <span className="font-bold text-[11px]">
                {isSimulatedOffline ? t('offline_drill', 'Offline Drill') : isOnline ? t('network_sync', 'Network Sync') : t('network_offline', 'Offline')}
              </span>
            </div>

            {offlineQueueCount > 0 && (
              <button
                type="button"
                onClick={triggerSyncNow}
                className="px-2 py-0.5 rounded-full bg-amber-200 hover:bg-amber-300 dark:bg-amber-800 dark:hover:bg-amber-700 text-amber-950 dark:text-amber-100 font-bold text-[10px] flex items-center gap-1 transition cursor-pointer"
                title="Flush pending offline dispensing queue to SQLite"
              >
                <RotateCw className="w-2.5 h-2.5 animate-spin" />
                <span>Sync ({offlineQueueCount})</span>
              </button>
            )}

            {/* Offline Simulation Drill Toggle */}
            <button
              type="button"
              onClick={toggleSimulatedOffline}
              className={clsx(
                'p-1 rounded-md transition cursor-pointer flex items-center justify-center',
                isSimulatedOffline
                  ? 'bg-amber-300 dark:bg-amber-800 text-amber-950 dark:text-white'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              )}
              title={
                isSimulatedOffline
                  ? 'Simulated Offline Mode is ACTIVE. Click to restore online connectivity.'
                  : 'Simulate Rural Connectivity Loss (Drill offline dispensing & queueing)'
              }
              aria-label="Toggle rural offline connectivity drill"
            >
              {isSimulatedOffline ? (
                <WifiOff className="w-3.5 h-3.5 text-amber-950 dark:text-amber-100" />
              ) : (
                <Wifi className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* Active Crisis Emergency Pill */}
          {crisisStatus?.is_active && (
            <button
              onClick={() => setActiveTab('crisis')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-950/80 dark:hover:bg-red-900/80 dark:text-red-300 border border-red-300 dark:border-red-800 shadow-sm transition animate-pulse cursor-pointer"
              title="Click to view Active Crisis Simulation & Swarm Dispatch"
            >
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              <span className="hidden sm:inline">{t('pill_crisis_sim', 'CRISIS SIM:')}</span>
              <span className="truncate max-w-[120px] md:max-w-[180px]">
                {crisisStatus.active_scenario_id === 'MONSOON_FLOOD_SOUTH_SATARA'
                  ? (t('scenario_monsoon_title') || crisisStatus.active_scenario_title)
                  : crisisStatus.active_scenario_id === 'LEPTOSPIROSIS_PUNE_GHATS'
                    ? (t('scenario_lepto_title') || crisisStatus.active_scenario_title)
                    : crisisStatus.active_scenario_id === 'HEATWAVE_PLAINS_SHIRUR'
                      ? (t('scenario_heatwave_title') || crisisStatus.active_scenario_title)
                      : crisisStatus.active_scenario_id === 'RABIES_CANINE_CLUSTER'
                        ? (t('scenario_rabies_title') || crisisStatus.active_scenario_title)
                        : (crisisStatus.scenario_name || crisisStatus.active_scenario_title || t('active_outbreak_label', 'Active Outbreak'))}
              </span>
              <span className="px-1.5 py-0.2 rounded-full bg-red-600 text-white text-[10px] font-extrabold">
                {crisisStatus.intensity_multiplier || crisisStatus.intensity || 1}x
              </span>
            </button>
          )}

          {/* AI Safety Pill (Opens Modal) */}
          <button
            onClick={() => setIsSafetyModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100/90 hover:bg-emerald-200 text-emerald-950 dark:bg-emerald-950/70 dark:hover:bg-emerald-900/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/80 shadow-sm transition"
            title="Open AI Safety Architecture & Circuit Telemetry"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span>{t('ai_safety', 'AI Safety')}</span>
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-200 dark:bg-emerald-800 text-[10px] font-bold text-emerald-950 dark:text-emerald-100">
              {t('ai_guarded', '100% Guarded')}
            </span>
          </button>

          {/* Interactive Notifications Bell & Popover */}
          <div className="relative" ref={notificationsRef}>
            <button
              onClick={() => setIsNotificationsOpen(prev => !prev)}
              className={clsx(
                "p-2 rounded-lg transition relative cursor-pointer",
                isNotificationsOpen
                  ? "bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
              )}
              title={`${unreadAlertsCount} active alerts`}
              aria-label="Toggle notifications dropdown"
            >
              <Bell className="w-4 h-4" />
              {unreadAlertsCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white shadow-sm">
                  {unreadAlertsCount > 9 ? '9+' : unreadAlertsCount}
                </span>
              )}
            </button>

            {/* Notifications Dropdown Panel */}
            {isNotificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-brand-dark-card border border-slate-200 dark:border-brand-dark-border shadow-2xl z-50 overflow-hidden animate-fade-in">
                {/* Panel Header */}
                <div className="p-3.5 border-b border-slate-100 dark:border-brand-dark-border flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                    <h4 className="font-display font-bold text-xs text-slate-900 dark:text-white">
                      {t('notifications_title', 'Notifications')}
                    </h4>
                    {unreadAlertsCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 border border-red-200/60 dark:border-red-800/40">
                        {unreadAlertsCount} {t('unread_suffix', 'unread')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadAlertsCount > 0 && (
                      <button
                        onClick={handleMarkAllAsRead}
                        className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-semibold cursor-pointer"
                      >
                        {t('mark_all_read', 'Mark all read')}
                      </button>
                    )}
                    <button
                      onClick={() => setIsNotificationsOpen(false)}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                      aria-label="Close notifications"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Panel Body / Alert List */}
                <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                  {(!alerts || alerts.length === 0) ? (
                    <div className="p-8 text-center text-xs text-slate-400 space-y-1">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2 opacity-80" />
                      <p className="font-semibold text-slate-700 dark:text-slate-300">{t('no_active_alerts', 'No active alerts')}</p>
                      <p>{t('network_inventories_balanced', 'Network inventories are currently balanced.')}</p>
                    </div>
                  ) : (
                    alerts.slice(0, 12).map((alert, idx) => {
                      const isAck = alert.is_acknowledged || alert.acknowledged === 1;
                      const cat = alert.category || '';
                      const text = (alert.title || '') + ' ' + (alert.message || '');
                      const trfMatch = text.match(/TRF-[A-Z0-9-]+/i);
                      const transferCode = trfMatch ? trfMatch[0] : null;

                      return (
                        <div
                          key={alert.id || idx}
                          className={clsx(
                            "p-3 text-xs transition space-y-1.5",
                            isAck
                              ? "opacity-60 bg-slate-50/40 dark:bg-slate-900/20"
                              : "bg-white dark:bg-brand-dark-card hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <StatusBadge status={alert.severity} size="xs" />
                              <span className="font-semibold text-slate-900 dark:text-white text-[11px]">
                                {alert.facility_name || 'Regional Public Health Network'}
                              </span>
                            </div>
                            {!isAck && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  acknowledgeAlert(alert.id);
                                }}
                                className="p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 transition cursor-pointer"
                                title="Acknowledge Alert"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {alert.title && (
                            <div className="font-semibold text-slate-800 dark:text-slate-200 text-[11px] leading-tight">
                              {alert.title}
                            </div>
                          )}

                          <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                            {alert.message}
                          </p>

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[10px] text-slate-400 font-mono">
                              {alert.created_at?.replace('T', ' ').slice(0, 16) || 'Just now'}
                            </span>

                            {/* Quick Action Routing */}
                            {(cat === 'TRANSFER_UPDATE' || transferCode) ? (
                              <button
                                onClick={() => {
                                  if (transferCode) setTransferSearchTerm(transferCode);
                                  setActiveTab('transfers');
                                  setIsNotificationsOpen(false);
                                }}
                                className="px-2 py-0.5 text-[10px] font-semibold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 transition flex items-center gap-1 cursor-pointer"
                              >
                                <Truck className="w-2.5 h-2.5" />
                                <span>View Transfer</span>
                              </button>
                            ) : (cat === 'STOCKOUT' || cat === 'CRITICAL_DEPLETION' || cat === 'SURGE_SPIKE') ? (
                              <button
                                onClick={() => {
                                  if (alert.facility_id) {
                                    setSelectedDeficitId(alert.facility_id);
                                    setSelectedFacilityId(alert.facility_id);
                                  }
                                  setActiveTab('rebalance');
                                  setIsNotificationsOpen(false);
                                }}
                                className="px-2 py-0.5 text-[10px] font-semibold rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 transition flex items-center gap-1 cursor-pointer"
                              >
                                <Sparkles className="w-2.5 h-2.5" />
                                <span>Rebalance</span>
                              </button>
                            ) : alert.facility_id ? (
                              <button
                                onClick={() => {
                                  setSelectedFacilityId(alert.facility_id);
                                  setIsNotificationsOpen(false);
                                }}
                                className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 transition flex items-center gap-1 cursor-pointer"
                              >
                                <Building2 className="w-2.5 h-2.5" />
                                <span>Inspect</span>
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Panel Footer */}
                <div className="p-2.5 border-t border-slate-100 dark:border-brand-dark-border bg-slate-50/50 dark:bg-slate-800/30 text-center">
                  <button
                    onClick={() => {
                      setActiveTab('overview');
                      setIsNotificationsOpen(false);
                    }}
                    className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center justify-center gap-1 w-full cursor-pointer py-0.5"
                  >
                    <span>View Live Feed in Command Center</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Manual Refresh */}
          <button
            onClick={refreshData}
            disabled={loading}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Refresh Server Telemetry"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>

          {/* Language Selector Pill: [ EN | मराठी | हिन्दी ] */}
          <div className="flex items-center p-0.5 rounded-xl bg-slate-100/90 dark:bg-brand-dark-surface/90 border border-slate-200 dark:border-brand-dark-border text-xs font-semibold shadow-xs">
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={clsx(
                'px-2.5 py-1 rounded-lg transition text-xs font-bold cursor-pointer',
                language === 'en'
                  ? 'bg-white dark:bg-brand-dark-card text-emerald-700 dark:text-emerald-400 shadow-sm border border-slate-200/80 dark:border-brand-dark-border'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              )}
              title="English (Default)"
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLanguage('mr')}
              className={clsx(
                'px-2.5 py-1 rounded-lg transition text-xs font-bold cursor-pointer',
                language === 'mr'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              )}
              title="मराठी (महाराष्ट्र शासन - Maharashtra State Official Language)"
            >
              मराठी
            </button>
            <button
              type="button"
              onClick={() => setLanguage('hi')}
              className={clsx(
                'px-2.5 py-1 rounded-lg transition text-xs font-bold cursor-pointer',
                language === 'hi'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              )}
              title="हिन्दी (राष्ट्रीय स्वास्थ्य मिशन - National Health Mission)"
            >
              हिन्दी
            </button>
          </div>

          {/* Dark / Light Mode Switcher */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>

        </div>

      </div>
    </header>
  );
}
