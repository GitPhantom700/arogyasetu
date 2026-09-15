import React from 'react';
import clsx from 'clsx';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Truck,
  ShieldCheck,
  ShieldAlert,
  CalendarX,
  Trash2,
  ThermometerSnowflake,
  Info
} from 'lucide-react';

/**
 * StatusBadge
 * High-contrast WCAG 2.1 AAA accessible clinical status badge (≥7:1 contrast ratio).
 * Features dedicated icons and accessible ARIA attributes for frontline healthcare workers.
 */
export function StatusBadge({ status, size = 'sm', className = '' }) {
  if (!status) return null;

  const normalized = String(status).toUpperCase();

  // Minimum 12px (text-xs) to prevent sub-12px unreadability on low-cost mobile field monitors
  const sizeClasses = {
    xs: 'px-2 py-0.5 text-xs font-medium',
    sm: 'px-2.5 py-0.5 text-xs font-semibold',
    md: 'px-3 py-1 text-sm font-bold',
  };

  const iconSizes = {
    xs: 'w-3 h-3',
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
  };

  const iconClass = iconSizes[size] || iconSizes.sm;

  let colorClasses = 'bg-slate-100 text-slate-950 border-2 border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-500';
  let IconComponent = Info;

  if (normalized === 'CRITICAL' || normalized === 'STOCKOUT' || normalized === 'EMERGENCY') {
    // WCAG AAA: Bold ⚠️ shape + deep crimson text + 2px high-contrast border for Sahyadri sunlight legibility
    colorClasses = 'bg-rose-50 text-rose-950 border-2 border-rose-600 dark:bg-rose-950 dark:text-rose-100 dark:border-rose-500 font-extrabold shadow-sm';
    IconComponent = AlertTriangle;
  } else if (normalized === 'QUARANTINED' || normalized === 'COMPROMISED' || normalized === 'THERMAL_BREACH') {
    colorClasses = 'bg-purple-50 text-purple-950 border-2 border-purple-600 dark:bg-purple-950 dark:text-purple-100 dark:border-purple-500 font-bold';
    IconComponent = ThermometerSnowflake;
  } else if (normalized === 'EXPIRED') {
    colorClasses = 'bg-red-100 text-red-950 border-2 border-red-700 dark:bg-red-950 dark:text-red-100 dark:border-red-600 font-bold';
    IconComponent = CalendarX;
  } else if (normalized === 'WASTED' || normalized === 'DAMAGED') {
    colorClasses = 'bg-stone-100 text-stone-950 border-2 border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:border-stone-500 font-bold';
    IconComponent = Trash2;
  } else if (normalized === 'WARNING' || normalized === 'LOW' || normalized === 'NEAR_EXPIRY') {
    colorClasses = 'bg-amber-50 text-amber-950 border-2 border-amber-600 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-500 font-bold';
    IconComponent = AlertTriangle;
  } else if (normalized === 'ADEQUATE' || normalized === 'NORMAL' || normalized === 'HEALTHY' || normalized === 'CLOSED') {
    colorClasses = 'bg-emerald-50 text-emerald-950 border-2 border-emerald-600 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-500 font-bold';
    IconComponent = CheckCircle2;
  } else if (normalized === 'COLD_CHAIN_OK' || normalized === 'ILR_VERIFIED' || normalized === 'LOCKED') {
    colorClasses = 'bg-cyan-50 text-cyan-950 border-2 border-cyan-600 dark:bg-cyan-950 dark:text-cyan-100 dark:border-cyan-500 font-bold';
    IconComponent = ShieldCheck;
  } else if (normalized === 'IN_TRANSIT' || normalized === 'DISPATCHED') {
    colorClasses = 'bg-blue-50 text-blue-950 border-2 border-blue-600 dark:bg-blue-950 dark:text-blue-100 dark:border-blue-500 font-bold';
    IconComponent = Truck;
  } else if (normalized === 'APPROVED' || normalized === 'RECEIVED') {
    colorClasses = 'bg-teal-50 text-teal-950 border-2 border-teal-600 dark:bg-teal-950 dark:text-teal-100 dark:border-teal-500 font-bold';
    IconComponent = ShieldCheck;
  }

  return (
    <span
      role="status"
      aria-label={`Status: ${normalized}`}
      title={`Clinical Status: ${normalized}`}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full select-none tracking-tight',
        sizeClasses[size] || sizeClasses.sm,
        colorClasses,
        className
      )}
    >
      <IconComponent className={clsx(iconClass, 'shrink-0 stroke-[2.5]')} aria-hidden="true" />
      <span>{normalized}</span>
    </span>
  );
}

