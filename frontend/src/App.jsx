import React from 'react';
import { AppProvider, useUI } from './context/AppContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { SafetyModal } from './components/SafetyModal';
import { ToastContainer } from './components/ToastContainer';
import { FacilitySlideOver } from './components/FacilitySlideOver';
import { RebalanceAuthModal } from './components/RebalanceAuthModal';
import { OverviewView } from './views/OverviewView';
import { MapView } from './views/MapView';
import { RebalanceView } from './views/RebalanceView';
import { FieldStaffPortalView } from './views/FieldStaffPortalView';
import { CrisisSimulatorView } from './views/CrisisSimulatorView';
import { TransfersLedgerView } from './views/TransfersLedgerView';
import { FacilityStocksView } from './views/FacilityStocksView';
import { ModulePlaceholderView } from './views/ModulePlaceholderView';
import clsx from 'clsx';

function DashboardContent() {
  const {
    activeTab,
    selectedFacilityId,
    setSelectedFacilityId,
    facilityMap,
    facilityStatusMap,
    setActiveTab
  } = useUI();

  const selectedFacility = selectedFacilityId ? facilityMap.get(selectedFacilityId) : null;
  const selectedStatus = selectedFacilityId ? facilityStatusMap[selectedFacilityId] : null;

  return (
    <div className="flex h-screen flex-col bg-[#f8fafc] dark:bg-brand-dark-surface overflow-hidden">
      {/* Top Header */}
      <Header />

      {/* Main Application Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar />

        {/* Dynamic Viewport Container (Guarantees explicit boundaries for Leaflet in Phase 4) */}
        <main className={clsx(
          "flex-1 overflow-y-auto transition-all",
          activeTab === 'map' ? "h-full flex flex-col p-2 sm:p-4 overflow-hidden" : "p-4 sm:p-6 lg:p-8"
        )}>
          <div className={clsx(
            "w-full",
            activeTab === 'map' ? "flex-1 h-full flex flex-col overflow-hidden" : "max-w-7xl mx-auto"
          )}>
            {activeTab === 'overview' ? (
              <OverviewView />
            ) : activeTab === 'map' ? (
              <MapView />
            ) : activeTab === 'inventory' ? (
              <FacilityStocksView />
            ) : activeTab === 'rebalance' ? (
              <RebalanceView />
            ) : activeTab === 'transfers' ? (
              <TransfersLedgerView />
            ) : activeTab === 'scan' ? (
              <FieldStaffPortalView />
            ) : activeTab === 'crisis' ? (
              <CrisisSimulatorView />
            ) : (
              <ModulePlaceholderView tabId={activeTab} />
            )}
          </div>
        </main>
      </div>

      {/* Slide-Over Facility Batch Inventory Drawer */}
      {selectedFacilityId && (
        <FacilitySlideOver
          facilityId={selectedFacilityId}
          facility={selectedFacility}
          status={selectedStatus}
          onClose={() => setSelectedFacilityId(null)}
          onNavigateRebalance={(facId) => {
            setSelectedFacilityId(null);
            setActiveTab('rebalance');
          }}
        />
      )}

      {/* Global Modals & Notifications */}
      <RebalanceAuthModal />
      <SafetyModal />
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <DashboardContent />
    </AppProvider>
  );
}
