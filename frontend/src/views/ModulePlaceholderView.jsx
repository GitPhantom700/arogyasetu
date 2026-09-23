import React from 'react';
import { useUI } from '../context/UIContext';
import { Map, Cpu, Truck, ScanLine, Flame, Package, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';

export function ModulePlaceholderView({ tabId }) {
  const { setActiveTab } = useUI();

  const moduleConfig = {
    map: {
      title: 'Interactive Geospatial Command Map',
      badge: 'GIS Mapping System',
      icon: Map,
      description: 'Dynamic Leaflet map rendering all 15 rural healthcare facilities across Pune and Satara districts. Features color-coded inventory markers (Green: Adequate, Yellow: Low, Red: Critical Stockout), mountain road terrain impedance layers, and interactive facility slide-over drawers.',
      deliverables: [
        'Interactive OpenStreetMap / Leaflet cluster mapping',
        'Real-time color-coded pins synchronized with SSE events',
        'Facility stock inspection modal & deficit radar overlays',
        'Western Ghats terrain overlay & road route drawing'
      ],
      nextAction: 'Interactive Geospatial Command Map',
    },
    inventory: {
      title: 'Facility Stocks & Deficit Monitor',
      badge: 'Real-Time Inventory Hub',
      icon: Package,
      description: 'Comprehensive inventory ledger and depletion velocity analyzer across all 15 facilities and 10 essential medicines. Provides real-time Daily Average Consumption (DAC) and Days of Inventory Remaining (DIR).',
      deliverables: [
        'Live stock breakdown by facility tier and medicine category',
        'Dynamic burn rate and acute surge indicator table',
        'Cold-chain temperature requirement filters (+2°C to +8°C)',
        'Batch-level FEFO expiry timeline monitoring'
      ],
      nextAction: 'Facility Stocks & Deficit Monitor',
    },
    rebalance: {
      title: 'Gemini Autonomous Rebalancer & Route Dispatcher',
      badge: 'Autonomous Rebalancer',
      icon: Cpu,
      description: 'Full-screen clinical rebalancing cockpit. Discovers candidate donor facilities within 50 km, enforces non-cannibalization safety buffers (14d/21d monsoon), generates explainable medical SOAP rationales with Gemini, and dispatches transfers with 1-click authorization.',
      deliverables: [
        'Live network deficit radar with 1-click scenario analysis',
        'Multi-objective candidate donor ranking matrix',
        'Interactive transfer authorization modal with route dispatch',
        '100% enforced AI Safety Guardrail badges and clamping transparency'
      ],
      nextAction: 'Gemini Autonomous Rebalancer',
    },
    transfers: {
      title: 'Active Transfers & DSCSA Cryptographic Ledger',
      badge: 'DSCSA Ledger',
      icon: Truck,
      description: 'End-to-end tracking of all inter-facility medicine transfers through the complete state machine lifecycle (DRAFT ➔ APPROVED ➔ DISPATCHED ➔ IN_TRANSIT ➔ RECEIVED) with unbroken SHA-256 cryptographic proof blocks.',
      deliverables: [
        'Real-time transfer stepper with physical return and loss tracking',
        'Transit-aware FEFO batch allocation inspector',
        'Interactive DSCSA blockchain audit ledger modal with hash verification',
        'Digital delivery receipt generation'
      ],
      nextAction: 'Active Transfers & DSCSA Cryptographic Ledger',
    },
    scan: {
      title: 'Field Staff Register OCR Vision',
      badge: 'Multimodal Vision OCR',
      icon: ScanLine,
      description: 'Mobile-first paper register digitization portal powered by Google Gemini 2.5 Flash / 3.7 Flash Vision. Transcribes physical stock arrival challans, delivery vouchers, and handwritten logs into verified digital stock records.',
      deliverables: [
        'Drag-and-drop & mobile camera photo uploader',
        'Gemini Vision OCR extraction with strict Pydantic JSON schema',
        'RapidFuzz state medicine catalog matching & pharmacist review queue',
        'Single-click atomic commit with DSCSA receipt generation'
      ],
      nextAction: 'Field Staff Register OCR Vision',
    },
    crisis: {
      title: 'Monsoon Outbreak & Crisis Simulator',
      badge: 'Disaster Simulator',
      icon: Flame,
      description: 'Interactive crisis simulation control panel designed to stress-test regional healthcare supply chains during disaster surges (e.g. 400% spike in snakebites during Sahyadri monsoon flooding).',
      deliverables: [
        'Monsoon flood surge & landslide road closure simulator',
        'Acute disease outbreak injection (Water-borne illnesses / Gastro)',
        'Multi-facility cascading stockout stress test',
        'Emergency automated redistribution swarm execution'
      ],
      nextAction: 'Monsoon Outbreak & Crisis Simulator',
    }
  };

  const config = moduleConfig[tabId] || {
    title: 'Module Overview',
    badge: 'Operational Module',
    icon: Sparkles,
    description: 'Real-time public health logistics and inventory management system.',
    deliverables: [],
    nextAction: 'Command Center Active',
  };

  const Icon = config.icon;

  return (
    <div className="flex-1 h-full flex flex-col justify-center overflow-hidden py-4">
      <div className="card-clinical p-8 max-w-3xl w-full mx-auto space-y-6 animate-fade-in">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 shrink-0 border border-emerald-200 dark:border-emerald-800">
            <Icon className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display font-bold text-xl text-slate-900 dark:text-white">
                {config.title}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                {config.badge}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
              {config.description}
            </p>
          </div>
        </div>

        {config.deliverables.length > 0 && (
          <div className="border-t border-slate-100 dark:border-brand-dark-border pt-5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Core Architectural Deliverables
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {config.deliverables.map((d, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-slate-700 dark:text-slate-300 font-medium">{d}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-slate-100 dark:border-brand-dark-border pt-4 flex items-center justify-between">
          <div className="text-xs text-slate-400 font-medium">
            Status: <strong className="text-emerald-600 dark:text-emerald-400">{config.nextAction}</strong>
          </div>
          <button
            onClick={() => setActiveTab('overview')}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition flex items-center gap-1.5"
          >
            Return to Command Center <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
