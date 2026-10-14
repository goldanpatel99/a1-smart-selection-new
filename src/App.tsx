import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/Navbar';
import { LandingPage } from './components/LandingPage';
import { Dashboard } from './components/Dashboard';
import { PhotoUploadPage } from './components/PhotoUploadPage';
import { ClientGallery } from './components/ClientGallery';
import { SelectionResultsPage } from './components/SelectionResultsPage';
import { AdminPanel } from './components/AdminPanel';
import { AuthModal } from './components/AuthModal';
import { BuyPointsModal } from './components/BuyPointsModal';
import { CreateEventModal } from './components/CreateEventModal';
import { StudioSettingsModal } from './components/StudioSettingsModal';
import { ToastContainer } from './components/Toast';
import { WhatsAppSupportButton } from './components/WhatsAppSupportButton';
import { PointTier } from './types';

function AppContent() {
  const { currentView, currentUser, activeEvent } = useApp();

  // Dynamic Browser Tab Title for SEO and polished UX
  useEffect(() => {
    if (currentView === 'client-gallery') {
      const title = activeEvent?.coupleName || activeEvent?.title || 'Wedding Gallery';
      document.title = `${title} | A1 Smart Selection`;
    } else if (currentView === 'dashboard') {
      document.title = 'Studio Dashboard | A1 Smart Selection';
    } else if (currentView === 'photo-upload') {
      document.title = 'Upload Photos | A1 Smart Selection';
    } else if (currentView === 'selection-results') {
      document.title = 'Selection Results | A1 Smart Selection';
    } else if (currentView === 'admin-panel') {
      document.title = 'Admin Portal | A1 Smart Selection';
    } else {
      document.title = 'A1 Smart Selection | Studio Client Portal';
    }
  }, [currentView, activeEvent]);

  // Modal states
  const [authModal, setAuthModal] = useState<{ isOpen: boolean; mode: 'login' | 'signup' | 'admin' }>({
    isOpen: false,
    mode: 'login',
  });
  const [buyPointsModal, setBuyPointsModal] = useState<{ isOpen: boolean; tier?: PointTier }>({
    isOpen: false,
    tier: 'standard',
  });
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Security Guard: Check if protected page requires active authenticated session
  const isProtectedView =
    currentView === 'dashboard' ||
    currentView === 'photo-upload' ||
    currentView === 'selection-results' ||
    currentView === 'admin-panel';

  const isUnauthorized = isProtectedView && !currentUser;
  const isUnauthorizedAdmin = currentView === 'admin-panel' && currentUser?.role !== 'admin';

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      {/* Hide regular navigation in client gallery view for an ultra-clean client experience */}
      {currentView !== 'client-gallery' && (
        <Navbar
          onOpenAuth={(mode) => setAuthModal({ isOpen: true, mode })}
          onOpenBuyPoints={() => setBuyPointsModal({ isOpen: true, tier: 'standard' })}
          onOpenCreateEvent={() => setCreateEventOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {/* Main Page View Routing */}
      <main className="flex-1">
        {/* If user is not logged in but trying to view protected pages, prompt login cleanly */}
        {isUnauthorized ? (
          <div className="max-w-md mx-auto px-4 py-24 text-center animate-in fade-in">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold font-heading text-white">Security: Session Required</h2>
            <p className="text-sm text-neutral-400 mt-2 mb-6">
              Browser close ya logout ke baad access karne ke liye apna Studio Password enter karein.
            </p>
            <button
              onClick={() => setAuthModal({ isOpen: true, mode: currentView === 'admin-panel' ? 'admin' : 'login' })}
              className="px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-bold text-sm rounded-xl shadow-lg hover:scale-105 transition-all"
            >
              Sign In to Continue
            </button>
          </div>
        ) : isUnauthorizedAdmin ? (
          <div className="max-w-md mx-auto px-4 py-24 text-center animate-in fade-in">
            <h2 className="text-2xl font-bold text-rose-400">Access Denied</h2>
            <p className="text-sm text-neutral-400 mt-2 mb-6">
              Yeh section keval Master Admin ke liye reserved hai.
            </p>
            <button
              onClick={() => setAuthModal({ isOpen: true, mode: 'admin' })}
              className="px-6 py-2.5 bg-neutral-800 text-white rounded-xl text-xs font-semibold"
            >
              Admin Login
            </button>
          </div>
        ) : (
          <>
            {currentView === 'landing' && (
              <LandingPage
                onOpenAuth={(mode) => setAuthModal({ isOpen: true, mode })}
                onOpenBuyPoints={() => setBuyPointsModal({ isOpen: true, tier: 'standard' })}
                onOpenCreateEvent={() => setCreateEventOpen(true)}
              />
            )}

            {currentView === 'dashboard' && (
              <Dashboard
                onOpenBuyPoints={() => setBuyPointsModal({ isOpen: true, tier: 'standard' })}
                onOpenCreateEvent={() => setCreateEventOpen(true)}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            )}

            {currentView === 'photo-upload' && <PhotoUploadPage />}

            {currentView === 'client-gallery' && <ClientGallery />}

            {currentView === 'selection-results' && <SelectionResultsPage />}

            {currentView === 'admin-panel' && <AdminPanel />}
          </>
        )}
      </main>

      {/* Global Modals */}
      <AuthModal
        isOpen={authModal.isOpen}
        onClose={() => setAuthModal({ isOpen: false, mode: 'login' })}
        initialMode={authModal.mode}
      />

      <BuyPointsModal
        isOpen={buyPointsModal.isOpen}
        onClose={() => setBuyPointsModal((p) => ({ ...p, isOpen: false }))}
        initialTier={buyPointsModal.tier || 'standard'}
      />

      <CreateEventModal
        isOpen={createEventOpen}
        onClose={() => setCreateEventOpen(false)}
        onOpenBuyPoints={(tier) => setBuyPointsModal({ isOpen: true, tier: tier || 'standard' })}
      />

      <StudioSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Floating WhatsApp Help Button */}
      <WhatsAppSupportButton />

      {/* Toasts */}
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
