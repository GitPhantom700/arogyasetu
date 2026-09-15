import React from 'react';
import { useUI } from '../context/UIContext';
import {
  LayoutDashboard,
  Map,
  Package,
  Cpu,
  Truck,
  ScanLine,
  Flame,
  ChevronLeft,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';
import clsx from 'clsx';

export function Sidebar() {
  const {
    activeTab,
    setActiveTab,
    sidebarCollapsed,
    setSidebarCollapsed,
    stats,
    crisisStatus,
    t
  } = useUI();

  const navItems = [
    {
      id: 'overview',
      label: t('nav_overview', 'Command Center'),
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'map',
      label: t('nav_map', 'Geospatial Map'),
      icon: Map,
      badge: 'Day 13',
      badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    },
    {
      id: 'inventory',
      label: t('nav_inventory', 'Facility Stocks'),
      icon: Package,
      badge: stats?.critical_stockouts > 0 ? `${stats.critical_stockouts} Crit` : null,
      badgeColor: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
    },
    {
      id: 'rebalance',
      label: t('nav_rebalance', 'AI Rebalancer'),
      icon: Cpu,
      badge: 'Gemini',
      badgeColor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
    },
    {
      id: 'transfers',
      label: t('nav_transfers', 'Transfers & Ledger'),
      icon: Truck,
      badge: stats?.in_transit_transfers > 0 ? `${stats.in_transit_transfers} Transit` : null,
      badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    },
    {
      id: 'scan',
      label: t('nav_scan', 'Field Portal & OCR'),
      icon: ScanLine,
      badge: 'Day 14',
      badgeColor: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
    },
    {
      id: 'crisis',
      label: t('nav_crisis', 'Crisis Simulator'),
      icon: Flame,
      badge: crisisStatus?.is_active ? 'ACTIVE' : 'Phase 5',
      badgeColor: crisisStatus?.is_active
        ? 'bg-red-600 text-white animate-pulse'
        : 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
    },
  ];

  return (
    <aside
      className={clsx(
        'relative flex flex-col bg-white dark:bg-brand-dark-card border-r border-slate-200/80 dark:border-brand-dark-border transition-all duration-300 select-none z-20',
        sidebarCollapsed ? 'w-20' : 'w-64'
      )}
    >
      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={clsx(
                'w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl font-medium text-xs transition-all duration-200 group text-left relative',
                isActive
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 shadow-sm border border-emerald-200/80 dark:border-emerald-800/60 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-brand-dark-surface/60'
              )}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <Icon className={clsx(
                'w-5 h-5 shrink-0 transition-colors',
                isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
              )} />

              {!sidebarCollapsed && (
                <div className="flex-1 flex items-center justify-between truncate">
                  <span className="truncate">{item.label}</span>
                  {item.badge && (
                    <span className={clsx(
                      'px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider',
                      item.badgeColor || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    )}>
                      {item.badge}
                    </span>
                  )}
                </div>
              )}

              {/* Active edge indicator */}
              {isActive && (
                <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-emerald-600 dark:bg-emerald-400" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse Toggle Footer */}
      <div className="p-3 border-t border-slate-200/80 dark:border-brand-dark-border flex items-center justify-between">
        {!sidebarCollapsed && (
          <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
            v1.0.0 • React + Vite
          </div>
        )}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={clsx(
            'p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition',
            sidebarCollapsed && 'mx-auto'
          )}
          title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
