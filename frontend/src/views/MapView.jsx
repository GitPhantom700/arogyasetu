import React, { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useUI } from '../context/UIContext';
import { StatusBadge } from '../components/StatusBadge';
import { RouteDispatchVisualizer } from '../components/RouteDispatchVisualizer';
import {
  Building2,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
  Search,
  Filter,
  Layers,
  ThermometerSnowflake,
  Bed,
  ArrowRight,
  Maximize2,
  Navigation,
  Truck,
  UserCheck,
  Phone
} from 'lucide-react';
import clsx from 'clsx';

// Centroid of Pune and Satara district healthcare cluster
const REGIONAL_CENTER = [18.1500, 73.9500];
const DEFAULT_ZOOM = 9;

// Module-level icon cache to prevent DOM node churn and memory leaks
const iconCache = new Map();

/**
 * Creates accessible SVG-based Leaflet DivIcons with status-coded pulse rings.
 * Reuses cached L.divIcon instances to eliminate marker recreation overhead during re-renders.
 */
function getClinicalPinIcon(status = 'ADEQUATE', tier = 'PHC') {
  const cacheKey = `${status}-${tier}`;
  if (iconCache.has(cacheKey)) {
    return iconCache.get(cacheKey);
  }

  let color = '#10b981'; // Emerald
  let pulseColor = 'rgba(16, 185, 129, 0.4)';
  let borderColor = '#059669';
  let badgeText = '✓';
  let textColor = '#ffffff'; // High contrast against emerald/red

  if (status === 'CRITICAL' || status === 'STOCKOUT') {
    color = '#ef4444'; // Red
    pulseColor = 'rgba(239, 68, 68, 0.5)';
    borderColor = '#dc2626';
    badgeText = '!';
    textColor = '#ffffff';
  } else if (status === 'WARNING' || status === 'LOW') {
    color = '#f59e0b'; // Amber
    pulseColor = 'rgba(245, 158, 11, 0.5)';
    borderColor = '#d97706';
    badgeText = '▲';
    textColor = '#0f172a'; // High contrast Slate 950 (WCAG AAA against amber #f59e0b)
  }

  const isHospital = tier === 'DH' || tier === 'District Hospital' || tier === 'SDH' || tier === 'Sub-District Hospital';
  const size = isHospital ? 40 : 34;

  const html = `
    <div style="position: relative; width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center;">
      ${status === 'CRITICAL' ? `
        <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background: ${pulseColor}; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      ` : ''}
      <div style="
        position: relative;
        width: ${size - 4}px;
        height: ${size - 4}px;
        border-radius: 50%;
        background: ${color};
        border: 2.5px solid #ffffff;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${textColor};
        font-weight: 900;
        font-size: ${isHospital ? '14px' : '12px'};
        font-family: sans-serif;
      ">
        ${badgeText}
      </div>
    </div>
  `;

  const icon = L.divIcon({
    html,
    className: 'custom-pin',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });

  iconCache.set(cacheKey, icon);
  return icon;
}

/**
 * Creates accessible SVG-based Leaflet DivIcon for dispatch transport vehicle.
 */
function getVehiclePinIcon(status = 'APPROVED') {
  const isMoving = status === 'IN_TRANSIT' || status === 'DISPATCHED';
  const color = status === 'RECEIVED' ? '#10b981' : status === 'IN_TRANSIT' ? '#0284c7' : '#6366f1';
  const html = `
    <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
      ${isMoving ? `
        <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background: ${color}; opacity: 0.4; animation: ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      ` : ''}
      <div style="
        position: relative;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: ${color};
        border: 2px solid #ffffff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
          <path d="M15 18H9"/>
          <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
          <circle cx="17" cy="18" r="2"/>
          <circle cx="7" cy="18" r="2"/>
        </svg>
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'vehicle-pulse-pin',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

/**
 * Controller component allowing programmatic map re-centering and bounding
 */
function MapController({ center, zoom, bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [80, 80], maxZoom: 12, animate: true });
    } else if (center) {
      map.setView(center, zoom || DEFAULT_ZOOM, { animate: true });
    }
  }, [center, zoom, bounds, map]);
  return null;
}

export function MapView() {
  const {
    facilities,
    facilityStatusMap,
    setSelectedFacilityId,
    setActiveTab,
    activeTransferRoute,
    theme,
    crisisStatus
  } = useUI();

  const [districtFilter, setDistrictFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [mapCenter, setMapCenter] = useState(REGIONAL_CENTER);
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);

  // Filter facilities based on user selection
  const filteredFacilities = useMemo(() => {
    return facilities.filter(f => {
      const matchesDistrict = districtFilter === 'ALL' || f.district?.toUpperCase() === districtFilter;
      const status = facilityStatusMap[f.id] || 'ADEQUATE';
      const matchesStatus = statusFilter === 'ALL' || status === statusFilter;
      const matchesSearch = !searchQuery || 
        f.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.facility_code?.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesDistrict && matchesStatus && matchesSearch;
    });
  }, [facilities, districtFilter, statusFilter, searchQuery, facilityStatusMap]);

  // Compute curved route conduit and vehicle position for active transfer
  const routeGeometry = useMemo(() => {
    if (
      !activeTransferRoute ||
      typeof activeTransferRoute.source_lat !== 'number' ||
      typeof activeTransferRoute.source_lng !== 'number' ||
      typeof activeTransferRoute.destination_lat !== 'number' ||
      typeof activeTransferRoute.destination_lng !== 'number'
    ) {
      return null;
    }

    const p1 = [activeTransferRoute.source_lat, activeTransferRoute.source_lng];
    const p2 = [activeTransferRoute.destination_lat, activeTransferRoute.destination_lng];

    // Compute realistic mountain pass curvature using bearing-orthogonal vector projection
    const isGhat = Boolean(activeTransferRoute.is_ghat_terrain);
    const dLat = p2[0] - p1[0];
    const dLng = p2[1] - p1[1];
    const dist = Math.sqrt(dLat * dLat + dLng * dLng) || 0.001;
    // Orthogonal normal vector [-dLng, dLat]
    const normalLat = -dLng / dist;
    const normalLng = dLat / dist;
    const curveMagnitude = isGhat ? Math.min(dist * 0.25, 0.04) : Math.min(dist * 0.15, 0.02);

    const midLat = (p1[0] + p2[0]) / 2 + normalLat * curveMagnitude;
    const midLng = (p1[1] + p2[1]) / 2 + normalLng * curveMagnitude;
    const mid = [midLat, midLng];
    const waypoints = [p1, mid, p2];

    // Vehicle position along route based on operational status
    let vehiclePos = p1;
    const st = activeTransferRoute.status;
    if (st === 'DISPATCHED') {
      vehiclePos = [(p1[0] + mid[0]) / 2, (p1[1] + mid[1]) / 2];
    } else if (st === 'IN_TRANSIT') {
      vehiclePos = mid;
    } else if (st === 'RECEIVED') {
      vehiclePos = p2;
    }

    const bounds = L.latLngBounds(waypoints);

    return {
      p1,
      mid,
      p2,
      waypoints,
      vehiclePos,
      bounds
    };
  }, [activeTransferRoute]);

  // Aggregate statistics for the filter bar
  const metrics = useMemo(() => {
    let critical = 0;
    let warning = 0;
    let adequate = 0;

    facilities.forEach(f => {
      const s = facilityStatusMap[f.id] || 'ADEQUATE';
      if (s === 'CRITICAL') critical++;
      else if (s === 'WARNING') warning++;
      else adequate++;
    });

    return { total: facilities.length, critical, warning, adequate };
  }, [facilities, facilityStatusMap]);

  const handleResetView = () => {
    setMapCenter(REGIONAL_CENTER);
    setMapZoom(DEFAULT_ZOOM);
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden relative">
      
      {/* Top Filter & Metric Control Bar */}
      <div className="z-20 bg-white/90 dark:bg-brand-dark-card/90 backdrop-blur-md border-b border-slate-200 dark:border-brand-dark-border p-3 px-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        
        {/* Search & Filters */}
        <div className="flex items-center gap-2.5 flex-wrap flex-1">
          {/* Search Input */}
          <div className="relative min-w-[200px] max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search facility name or code..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-brand-dark-surface border border-slate-200 dark:border-brand-dark-border text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* District Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-brand-dark-surface p-0.5 rounded-xl border border-slate-200 dark:border-brand-dark-border text-xs">
            {['ALL', 'PUNE', 'SATARA'].map(d => (
              <button
                key={d}
                onClick={() => setDistrictFilter(d)}
                className={clsx(
                  'px-2.5 py-1 rounded-lg font-semibold text-[11px] transition',
                  districtFilter === d
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                )}
              >
                {d === 'ALL' ? 'All Districts' : d}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-brand-dark-surface p-0.5 rounded-xl border border-slate-200 dark:border-brand-dark-border text-xs">
            {[
              { id: 'ALL', label: 'All Status' },
              { id: 'CRITICAL', label: `🔴 ${metrics.critical} Critical` },
              { id: 'WARNING', label: `🟡 ${metrics.warning} Low` },
              { id: 'ADEQUATE', label: `🟢 ${metrics.adequate} Safe` },
            ].map(s => (
              <button
                key={s.id}
                onClick={() => setStatusFilter(s.id)}
                className={clsx(
                  'px-2.5 py-1 rounded-lg font-semibold text-[11px] transition',
                  statusFilter === s.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right Action: Re-center & Counter */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline font-medium">
            Showing <strong>{filteredFacilities.length}</strong> of {facilities.length} nodes
          </span>

          <button
            onClick={handleResetView}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition"
            title="Reset Map to Regional View"
          >
            <Navigation className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Reset View</span>
          </button>
        </div>

      </div>

      {/* Map Canvas Container */}
      <div className="flex-1 w-full h-full relative overflow-hidden bg-slate-100 dark:bg-slate-950">
        
        {/* Floating Crisis Outbreak Banner */}
        {crisisStatus?.is_active && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] w-[92%] max-w-2xl bg-red-950/90 dark:bg-red-950/95 text-white border-2 border-red-500 rounded-2xl p-3 shadow-2xl backdrop-blur-md flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-center gap-3">
              <span className="flex h-3 w-3 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <div>
                <div className="text-[11px] font-black tracking-wider uppercase text-red-300 flex items-center gap-2">
                  <span>🚨 Outbreak Simulation Active</span>
                  <span className="px-1.5 py-0.5 rounded bg-red-800 text-[10px] font-mono font-bold text-red-100">
                    {crisisStatus.intensity_multiplier}x Surge
                  </span>
                </div>
                <div className="text-xs font-semibold text-white truncate max-w-sm sm:max-w-md">
                  {crisisStatus.scenario_name || 'Emergency Outbreak'}: {(crisisStatus.affected_facility_ids || []).length} Facilities in Critical Deficit
                </div>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('crisis')}
              className="shrink-0 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-md transition"
            >
              Swarm Rebalance →
            </button>
          </div>
        )}

        <MapContainer
          center={REGIONAL_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom={true}
          className="w-full h-full"
        >
          <MapController center={mapCenter} zoom={mapZoom} bounds={routeGeometry?.bounds} />

          {/* Standard OpenStreetMap Tiles */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={18}
          />

          {/* Active Transfer Animated Route Conduit */}
          {routeGeometry && (
            <>
              {/* Outer Glow Conduit */}
              <Polyline
                positions={routeGeometry.waypoints}
                pathOptions={{
                  color: activeTransferRoute.requires_cold_chain ? '#06b6d4' : '#10b981',
                  weight: 8,
                  opacity: 0.35,
                  lineCap: 'round',
                }}
              />

              {/* Inner Animated Dash Flow Conduit */}
              <Polyline
                positions={routeGeometry.waypoints}
                pathOptions={{
                  color: activeTransferRoute.requires_cold_chain ? '#0891b2' : '#059669',
                  weight: 3.5,
                  dashArray: '10, 10',
                  className: 'leaflet-route-flow',
                  opacity: 0.95,
                  lineCap: 'round',
                }}
              />

              {/* Animated Moving Vehicle Marker */}
              <Marker
                position={routeGeometry.vehiclePos}
                icon={getVehiclePinIcon(activeTransferRoute.status)}
                zIndexOffset={1000}
              >
                <Tooltip direction="top" offset={[0, -18]} permanent opacity={0.95}>
                  <div className="text-[10px] font-bold py-0.5 px-1.5 bg-slate-900/90 text-white rounded-md flex items-center gap-1 shadow-md border border-slate-700">
                    <Truck className="w-3 h-3 text-emerald-400" />
                    <span>{activeTransferRoute.transfer_code}: {activeTransferRoute.status}</span>
                  </div>
                </Tooltip>
              </Marker>
            </>
          )}

          {/* Facility Pin Markers */}
          {filteredFacilities.map(fac => {
            // Defend against Leaflet crashes from null, malformed, or NaN coordinates
            if (
              typeof fac.latitude !== 'number' ||
              typeof fac.longitude !== 'number' ||
              isNaN(fac.latitude) ||
              isNaN(fac.longitude)
            ) {
              return null;
            }

            const status = facilityStatusMap[fac.id] || 'ADEQUATE';
            const icon = getClinicalPinIcon(status, fac.tier_type || fac.tier);
            const position = [fac.latitude, fac.longitude];

            return (
              <Marker
                key={fac.id}
                position={position}
                icon={icon}
                eventHandlers={{
                  click: () => {
                    setSelectedFacilityId(fac.id);
                  }
                }}
              >
                {/* Hover Tooltip */}
                <Tooltip direction="top" offset={[0, -20]} opacity={0.95}>
                  <div className="text-xs p-1">
                    <strong className="block">{fac.name}</strong>
                    <span className="text-[10px] text-slate-500">{fac.tier_type || fac.tier} • {fac.district}</span>
                  </div>
                </Tooltip>

                {/* Click Popup Card */}
                <Popup className="clinical-popup">
                  <div className="p-3.5 min-w-[240px] space-y-2.5">
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                      <div>
                        <h4 className="font-bold text-xs text-slate-900 dark:text-white leading-tight">
                          {fac.name}
                        </h4>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                          {fac.facility_code} • {fac.district}
                        </span>
                      </div>
                      <StatusBadge status={status} size="xs" />
                    </div>

                    {/* Bed Capacity Telemetry Breakdown */}
                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <Bed className="w-3 h-3 text-blue-500" />
                          <span>Bed Availability</span>
                        </span>
                        <span className="font-mono text-slate-700 dark:text-slate-200">
                          {fac.tier === 'SC' ? 'Day Triage (0 Beds)' : `${fac.total_beds ?? 20} Total`}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
                        <div className="p-1 rounded bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 font-mono">
                          <span className="text-[9px] text-slate-400 block">Total</span>
                          <span className="font-bold text-slate-900 dark:text-white">{fac.tier === 'SC' ? 0 : (fac.total_beds ?? 20)}</span>
                        </div>
                        <div className="p-1 rounded bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 font-mono text-blue-700 dark:text-blue-300">
                          <span className="text-[9px] text-blue-500 block">ICU</span>
                          <span className="font-bold">{fac.icu_beds ?? (fac.tier === 'DH' ? 30 : fac.tier === 'SDH' ? 10 : 0)}</span>
                        </div>
                        <div className="p-1 rounded bg-teal-50/60 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-900 font-mono text-teal-700 dark:text-teal-300">
                          <span className="text-[9px] text-teal-500 block">Oxygen</span>
                          <span className="font-bold">{fac.oxygen_beds ?? (fac.tier === 'DH' ? 40 : fac.tier === 'SDH' ? 20 : 2)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 truncate">
                        <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate">{fac.contact_person ? fac.contact_person.split(' ')[0] + ' ' + (fac.contact_person.split(' ')[1] || '') : 'Dr. S. Kadam'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                        <ThermometerSnowflake className={clsx("w-3.5 h-3.5", fac.has_cold_chain ? "text-teal-500" : "text-slate-400")} />
                        <span>{fac.has_cold_chain ? 'Active ILR' : 'No ILR'}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <button
                        onClick={() => setSelectedFacilityId(fac.id)}
                        className="w-full px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <span>Inspect Live Stock</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Map Legend Overlay (Bottom-Left) */}
        <div className="absolute bottom-5 left-5 z-20 pointer-events-none">
          <div className="pointer-events-auto p-3 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-lg text-xs space-y-2">
            <h5 className="font-bold text-[11px] text-slate-700 dark:text-slate-200 uppercase tracking-wider">
              Network Severity Index
            </h5>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-red-500 border border-white shadow-xs shrink-0" />
                <span className="text-slate-700 dark:text-slate-300">Critical Stockout (0 stock or &lt; safety floor)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-amber-500 border border-white shadow-xs shrink-0" />
                <span className="text-slate-700 dark:text-slate-300">Warning (Low stock &lt; 7 days DIR)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-emerald-500 border border-white shadow-xs shrink-0" />
                <span className="text-slate-700 dark:text-slate-300">Adequate Inventory Buffer</span>
              </div>
            </div>
          </div>
        </div>

        {/* Floating Route Dispatch Lifecycle Stepper */}
        <RouteDispatchVisualizer />

      </div>

    </div>
  );
}
