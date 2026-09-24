import React from 'react';
import clsx from 'clsx';
import { useUI } from '../context/UIContext';
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

const STATUS_LABELS = {
  en: {
    CRITICAL: 'CRITICAL',
    STOCKOUT: 'STOCKOUT',
    EMERGENCY: 'EMERGENCY',
    WARNING: 'WARNING',
    LOW: 'LOW',
    NEAR_EXPIRY: 'NEAR EXPIRY',
    ADEQUATE: 'ADEQUATE',
    NORMAL: 'NORMAL',
    HEALTHY: 'HEALTHY',
    CLOSED: 'CLOSED',
    IN_TRANSIT: 'IN TRANSIT',
    DISPATCHED: 'DISPATCHED',
    APPROVED: 'APPROVED',
    RECEIVED: 'RECEIVED',
    EXPIRED: 'EXPIRED',
    DAMAGED: 'DAMAGED',
    WASTED: 'WASTED',
    QUARANTINED: 'QUARANTINED',
    COMPROMISED: 'COMPROMISED',
    THERMAL_BREACH: 'THERMAL BREACH',
    COLD_CHAIN_OK: 'COLD CHAIN OK',
    ILR_VERIFIED: 'ILR VERIFIED',
    LOCKED: 'LOCKED',
    INFO: 'INFO'
  },
  mr: {
    CRITICAL: 'गंभीर तुटवडा',
    STOCKOUT: 'साठा संपला',
    EMERGENCY: 'तातडीचे',
    WARNING: 'चेतावणी',
    LOW: 'कमी साठा',
    NEAR_EXPIRY: 'कालबाह्य जवळ',
    ADEQUATE: 'सुरक्षित साठा',
    NORMAL: 'सामान्य',
    HEALTHY: 'योग्य',
    CLOSED: 'बंद',
    IN_TRANSIT: 'वाहतुकीत',
    DISPATCHED: 'रवाना',
    APPROVED: 'मंजूर',
    RECEIVED: 'प्राप्त',
    EXPIRED: 'कालबाह्य',
    DAMAGED: 'खराब',
    WASTED: 'नुकसान',
    QUARANTINED: 'विलगीकरण',
    COMPROMISED: 'दूषित',
    THERMAL_BREACH: 'तापमान उल्लंघन',
    COLD_CHAIN_OK: 'शीत साखळी सुरक्षित',
    ILR_VERIFIED: 'आयएलआर प्रमाणित',
    LOCKED: 'सुरक्षित',
    INFO: 'माहिती'
  },
  hi: {
    CRITICAL: 'गंभीर कमी',
    STOCKOUT: 'स्टॉक समाप्त',
    EMERGENCY: 'आपातकालीन',
    WARNING: 'चेतावनी',
    LOW: 'कम स्टॉक',
    NEAR_EXPIRY: 'समाप्ति निकट',
    ADEQUATE: 'सुरक्षित स्टॉक',
    NORMAL: 'सामान्य',
    HEALTHY: 'उचित',
    CLOSED: 'बंद',
    IN_TRANSIT: 'मार्ग में',
    DISPATCHED: 'रवाना',
    APPROVED: 'स्वीकृत',
    RECEIVED: 'प्राप्त',
    EXPIRED: 'समाप्त',
    DAMAGED: 'क्षतिग्रस्त',
    WASTED: 'व्यर्थ',
    QUARANTINED: 'संगरोध',
    COMPROMISED: 'दूषित',
    THERMAL_BREACH: 'तापमान उल्लंघन',
    COLD_CHAIN_OK: 'कोल्ड चेन सुरक्षित',
    ILR_VERIFIED: 'आईएलआर सत्यापित',
    LOCKED: 'सुरक्षित',
    INFO: 'सूचना'
  }
};

/**
 * StatusBadge
 * High-contrast WCAG 2.1 AAA accessible clinical status badge (≥7:1 contrast ratio).
 * Features dedicated icons and accessible ARIA attributes for frontline healthcare workers.
 */
export function StatusBadge({ status, size = 'sm', className = '' }) {
  if (!status) return null;

  let language = 'en';
  try {
    const ui = useUI();
    if (ui?.language) language = ui.language;
  } catch (e) {
    // fallback to en
  }

  const normalized = String(status).toUpperCase();
  const localizedLabel = STATUS_LABELS[language]?.[normalized] || STATUS_LABELS.en[normalized] || normalized;

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
      <span>{localizedLabel}</span>
    </span>
  );
}

