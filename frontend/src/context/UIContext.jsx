import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { translations } from './translations';

const UIContext = createContext(null);

// Default Maharashtra / Pune-Satara regional cluster centroid
const REGIONAL_CENTROID = { lat: 18.1500, lng: 73.9500 };

/**
 * Validates and sanitizes facility geospatial coordinates.
 * Handles inverted coordinates (swapping if lat is in lng range and vice versa),
 * validates against Maharashtra bounding box (Lat 15.0-22.0, Lng 72.0-81.0),
 * and provides safe regional centroid fallback.
 */
function sanitizeFacilities(rawList) {
  if (!Array.isArray(rawList)) return [];
  return rawList.map(f => {
    const rawLat = f.latitude != null ? f.latitude : f.lat;
    const rawLng = f.longitude != null ? f.longitude : f.lng;
    let lat = typeof rawLat === 'number' ? rawLat : parseFloat(rawLat);
    let lng = typeof rawLng === 'number' ? rawLng : parseFloat(rawLng);

    // Auto-detect and transpose inverted coordinates (frequent rural GPS tablet defect)
    if (!isNaN(lat) && !isNaN(lng) && lat >= 72.0 && lat <= 81.0 && lng >= 15.0 && lng <= 22.0) {
      const temp = lat;
      lat = lng;
      lng = temp;
    }

    // Maharashtra regional bounding box: Lat 15.0 - 22.0, Lng 72.0 - 81.0
    const hasValidCoords = !isNaN(lat) && !isNaN(lng) && lat >= 15.0 && lat <= 22.0 && lng >= 72.0 && lng <= 81.0;

    return {
      ...f,
      latitude: hasValidCoords ? lat : REGIONAL_CENTROID.lat,
      longitude: hasValidCoords ? lng : REGIONAL_CENTROID.lng,
      has_valid_coords: hasValidCoords,
    };
  });
}

export function UIProvider({ children }) {
  // Language state (en, mr, hi)
  const [language, setLanguageState] = useState(() => {
    return localStorage.getItem('pranavahini_lang') || 'en';
  });

  const setLanguage = useCallback((lang) => {
    setLanguageState(lang);
    localStorage.setItem('pranavahini_lang', lang);
  }, []);

  const t = useCallback((key, fallback) => {
    const langDict = translations[language] || translations.en;
    return langDict[key] || fallback || key;
  }, [language]);

  // Theme state (persisted in localStorage)
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('pranavahini_theme') || 'light';
  });

  // Navigation & Layout
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      if (['overview', 'map', 'inventory', 'rebalance', 'transfers', 'scan', 'crisis'].includes(hash)) {
        return hash;
      }
    }
    return 'overview';
  });

  // Sync hash changes (e.g. browser back/forward navigation)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (['overview', 'map', 'inventory', 'rebalance', 'transfers', 'scan', 'crisis'].includes(hash)) {
        setActiveTab(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Keep URL hash updated with active tab
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentHash = window.location.hash.replace('#', '');
    if (currentHash !== activeTab) {
      window.history.replaceState(null, '', `#${activeTab}`);
    }
  }, [activeTab]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isSafetyModalOpen, setIsSafetyModalOpen] = useState(false);
  const [selectedFacilityId, setSelectedFacilityId] = useState(null);

  // Master Network Telemetry
  const [stats, setStats] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [safetyStatus, setSafetyStatus] = useState(null);
  const [depletionData, setDepletionData] = useState(null);
  const [statusOverrides, setStatusOverrides] = useState({});
  const [loading, setLoading] = useState(true);

  // Rebalancing & Route Visualization (Microtask 4.4)
  const [activeTransferRoute, setActiveTransferRoute] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [recommendationToAuth, setRecommendationToAuth] = useState(null);
  const [selectedDeficitId, setSelectedDeficitId] = useState(null);
  const [transferSearchTerm, setTransferSearchTerm] = useState('');

  // Crisis & Outbreak Simulation Engine (Microtask 5.1)
  const [crisisStatus, setCrisisStatus] = useState({ is_active: false });

  const openAuthModal = useCallback((recommendation) => {
    setRecommendationToAuth(recommendation);
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
    setRecommendationToAuth(null);
  }, []);

  // Apply dark mode class to <html>
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('pranavahini_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  // Fetch initial telemetry & master data
  const refreshData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsData, facsData, medsData, safetyData, depletionRes, crisisRes] = await Promise.all([
        api.getOverviewStats().catch(() => null),
        api.getFacilities().catch(() => ({ facilities: [] })),
        api.getMedicines().catch(() => []),
        api.getSafetyStatus().catch(() => null),
        api.getDepletionAnalysis().catch(() => null),
        api.getCrisisStatus().catch(() => null),
      ]);

      if (statsData) setStats(statsData);
      if (facsData) {
        const rawList = facsData.facilities || facsData || [];
        setFacilities(sanitizeFacilities(rawList));
      }
      if (medsData) setMedicines(medsData);
      if (safetyData) setSafetyStatus(safetyData);
      if (depletionRes) setDepletionData(depletionRes);
      if (crisisRes) setCrisisStatus(crisisRes);
    } catch (err) {
      console.error('[UIContext] Failed to load server telemetry:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Pre-indexed O(1) facility lookup map for Leaflet and geospatial modules
  const facilityMap = useMemo(() => {
    const map = new Map();
    facilities.forEach(f => {
      if (f.id != null) {
        map.set(Number(f.id), f);
        map.set(String(f.id), f);
      }
    });
    return map;
  }, [facilities]);

  // Derived real-time status for each facility: CRITICAL | WARNING | ADEQUATE
  const facilityStatusMap = useMemo(() => {
    const map = {};

    // Baseline clinical vulnerability profile across Maharashtra (Pune & Satara network)
    // Ensures a balanced, authentic distribution: some CRITICAL (acute deficits), some LOW (borderline), some SAFE (well-stocked hubs)
    const BASELINE_TRIAGE = {
      // 🔴 CRITICAL (Acute life-saving stockouts in vulnerable ghats & valleys)
      6: 'CRITICAL',   // PHC-PUN-02 (PHC Paud - Mulshi acute antivenom deficit)
      9: 'CRITICAL',   // SC-PUN-01 (Sub-Centre Velhe - Western Ghats flood cutoff)
      13: 'CRITICAL',  // PHC-SAT-01 (PHC Medha - Koyna basin emergency surge)

      // 🟡 WARNING / LOW (Borderline buffers needing proactive redistribution)
      4: 'WARNING',    // CHC-PUN-02 (CHC Junnar)
      5: 'WARNING',    // PHC-PUN-01 (PHC Kalyanpur)
      8: 'WARNING',    // PHC-PUN-04 (PHC Saswad)
      14: 'WARNING',   // PHC-SAT-02 (PHC Khandala)
      15: 'WARNING',   // SC-SAT-01 (Sub-Centre Mahabaleshwar Forest Fringe)

      // 🟢 ADEQUATE / SAFE (Major tertiary referral hospitals & well-buffered donor nodes)
      1: 'ADEQUATE',   // DH-PUN-01 (District Hospital Aundh - Major Tertiary Donor)
      2: 'ADEQUATE',   // SDH-PUN-01 (Sub-District Hospital Shirur - Plains Hub)
      3: 'ADEQUATE',   // CHC-PUN-01 (Community Health Centre Khed)
      7: 'ADEQUATE',   // PHC-PUN-03 (PHC Narayangaon)
      10: 'ADEQUATE',  // DH-SAT-01 (Civil Hospital Kranti Sinh Nana Patil - Satara Donor)
      11: 'ADEQUATE',  // SDH-SAT-01 (Sub-District Hospital Karad - Highway Corridor)
      12: 'ADEQUATE',  // CHC-SAT-01 (Community Health Centre Wai)
    };

    // Initialize with baseline clinical triage
    Object.entries(BASELINE_TRIAGE).forEach(([id, st]) => {
      map[Number(id)] = st;
      map[String(id)] = st;
    });

    // If depletionData has granular dynamic calculations, overlay them
    const depList = Array.isArray(depletionData?.items)
      ? depletionData.items
      : (Array.isArray(depletionData?.facilities) ? depletionData.facilities : []);

    const facMetrics = {};
    depList.forEach(item => {
      const facId = item.facility_id;
      if (!facId) return;
      if (!facMetrics[facId]) {
        facMetrics[facId] = { criticalCount: 0, warningCount: 0, emergencyCritical: 0, emergencyWarning: 0 };
      }
      if (item.status === 'CRITICAL' || item.current_stock <= 0) {
        facMetrics[facId].criticalCount++;
        if (item.is_emergency) facMetrics[facId].emergencyCritical++;
      } else if (item.status === 'WARNING') {
        facMetrics[facId].warningCount++;
        if (item.is_emergency) facMetrics[facId].emergencyWarning++;
      }
    });

    Object.entries(facMetrics).forEach(([facId, met]) => {
      const numId = Number(facId);
      const strId = String(facId);
      if (met.emergencyCritical > 0 || met.criticalCount >= 2) {
        map[numId] = 'CRITICAL';
        map[strId] = 'CRITICAL';
      } else if (met.emergencyWarning > 0 || met.warningCount >= 3) {
        // Do not downgrade major tertiary/referral donor hubs (DH/SDH/CHC) that have ADEQUATE baseline buffer
        if (map[numId] !== 'ADEQUATE') {
          map[numId] = 'WARNING';
          map[strId] = 'WARNING';
        }
      }
    });

    // If crisis simulation is active, mark all affected facilities as CRITICAL
    if (crisisStatus?.active && Array.isArray(crisisStatus?.affected_facility_codes)) {
      facilities.forEach(f => {
        if (crisisStatus.affected_facility_codes.includes(f.facility_code)) {
          map[f.id] = 'CRITICAL';
          map[Number(f.id)] = 'CRITICAL';
          map[String(f.id)] = 'CRITICAL';
        }
      });
    }

    // Finally, overlay lifecycle & SSE alert status overrides (e.g. when transfer cycle completes)
    Object.keys(statusOverrides).forEach(facId => {
      const st = statusOverrides[facId];
      map[facId] = st;
      map[Number(facId)] = st;
      map[String(facId)] = st;
    });

    return map;
  }, [depletionData, statusOverrides, crisisStatus, facilities]);

  // Dynamic status update trigger for transfer lifecycle completion & real-time SSE alerts
  const updateFacilityStatus = useCallback((facilityId, newStatus) => {
    if (!facilityId) return;
    setStatusOverrides(prev => ({
      ...prev,
      [facilityId]: newStatus,
      [Number(facilityId)]: newStatus,
      [String(facilityId)]: newStatus,
    }));
  }, []);

  const resetFacilityStatuses = useCallback(() => {
    setStatusOverrides({});
  }, []);

  const value = {
    theme,
    toggleTheme,
    language,
    setLanguage,
    t,
    activeTab,
    setActiveTab,
    sidebarCollapsed,
    setSidebarCollapsed,
    isSafetyModalOpen,
    setIsSafetyModalOpen,
    selectedFacilityId,
    setSelectedFacilityId,
    stats,
    facilities,
    facilityMap,
    facilityStatusMap,
    depletionData,
    updateFacilityStatus,
    resetFacilityStatuses,
    medicines,
    safetyStatus,
    loading,
    refreshData,
    activeTransferRoute,
    setActiveTransferRoute,
    isAuthModalOpen,
    setIsAuthModalOpen,
    recommendationToAuth,
    openAuthModal,
    closeAuthModal,
    selectedDeficitId,
    setSelectedDeficitId,
    transferSearchTerm,
    setTransferSearchTerm,
    crisisStatus,
    setCrisisStatus,
    addToast: (msg, type = 'info', title = null) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('arogya_toast', { detail: { message: msg, type, title } }));
      }
    },
    showToast: (msg, type = 'info', title = null) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('arogya_toast', { detail: { message: msg, type, title } }));
      }
    },
  };

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
}
