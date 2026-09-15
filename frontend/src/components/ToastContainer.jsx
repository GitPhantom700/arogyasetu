import React from 'react';
import { useAlerts } from '../context/AlertsContext';
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

export function ToastContainer() {
  const { toasts } = useAlerts();

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map(toast => {
        const isCritical = toast.type === 'critical' || toast.type === 'error';
        const isWarning = toast.type === 'warning';
        const isSuccess = toast.type === 'success';

        return (
          <div
            key={toast.id}
            className={clsx(
              'pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl shadow-lg border backdrop-blur-md transition-all duration-300 animate-slide-up',
              isCritical && 'bg-rose-50/95 dark:bg-rose-950/90 border-rose-300 dark:border-rose-900 text-rose-950 dark:text-rose-200',
              isWarning && 'bg-amber-50/95 dark:bg-amber-950/90 border-amber-300 dark:border-amber-900 text-amber-950 dark:text-amber-200',
              isSuccess && 'bg-emerald-50/95 dark:bg-emerald-950/90 border-emerald-300 dark:border-emerald-900 text-emerald-950 dark:text-emerald-200',
              !isCritical && !isWarning && !isSuccess && 'bg-white/95 dark:bg-slate-900/90 border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-200'
            )}
          >
            <div className="shrink-0 mt-0.5">
              {isCritical && <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />}
              {isWarning && <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
              {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
              {!isCritical && !isWarning && !isSuccess && <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
            </div>

            <div className="flex-1 text-xs">
              {toast.title && <h5 className="font-bold text-xs mb-0.5 leading-snug">{String(toast.title)}</h5>}
              <p className="leading-relaxed text-[11px] font-medium">{String(toast.message)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
