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
    return localStorage.getItem('pranavahini_lang') || localStorage.getItem('arogya_lang') || 'en';
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
    return localStorage.getItem('pranavahini_theme') || localStorage.getItem('arogya_theme') || 'light';
  });

  // Navigation & Layout
  const [activeTab, setActiveTab] = useState('overview');
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

    // First, seed from depletion analysis (handles both depletionData.items and depletionData.facilities)
    const depList = Array.isArray(depletionData?.items)
      ? depletionData.items
      : (Array.isArray(depletionData?.facilities) ? depletionData.facilities : []);

    depList.forEach(item => {
      const facId = item.facility_id;
      if (!facId) return;
      const numId = Number(facId);
      const strId = String(facId);
      const current = map[numId] || map[strId];
      if (item.status === 'CRITICAL' || (item.critical_count || 0) > 0) {
        map[numId] = 'CRITICAL';
        map[strId] = 'CRITICAL';
      } else if ((item.status === 'WARNING' || (item.warning_count || 0) > 0) && current !== 'CRITICAL') {
        map[numId] = 'WARNING';
        map[strId] = 'WARNING';
      } else if (!current) {
        map[numId] = 'ADEQUATE';
        map[strId] = 'ADEQUATE';
      }
    });

    // Overlay any live SSE alert overrides
    Object.keys(statusOverrides).forEach(facId => {
      map[facId] = statusOverrides[facId];
      map[Number(facId)] = statusOverrides[facId];
      map[String(facId)] = statusOverrides[facId];
    });

    return map;
  }, [depletionData, statusOverrides]);

  // Dynamic status update trigger for real-time SSE alerts
  const updateFacilityStatus = useCallback((facilityId, newStatus) => {
    if (!facilityId) return;
    setStatusOverrides(prev => ({
      ...prev,
      [facilityId]: newStatus,
    }));
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
