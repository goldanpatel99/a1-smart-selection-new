import React, { useState } from 'react';
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

function AppContent() {
  const { currentView } = useApp();

  // Modal states
  const [authModal, setAuthModal] = useState<{ isOpen: boolean; mode: 'login' | 'signup' | 'admin' }>({
    isOpen: false,
    mode: 'login',
  });
  const [buyPointsOpen, setBuyPointsOpen] = useState(false);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      {/* Hide regular navigation in client gallery view for an ultra-clean client experience */}
      {currentView !== 'client-gallery' && (
        <Navbar
          onOpenAuth={(mode) => setAuthModal({ isOpen: true, mode })}
          onOpenBuyPoints={() => setBuyPointsOpen(true)}
          onOpenCreateEvent={() => setCreateEventOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {/* Main Page View Routing */}
      <main className="flex-1">
        {currentView === 'landing' && (
          <LandingPage
            onOpenAuth={(mode) => setAuthModal({ isOpen: true, mode })}
            onOpenBuyPoints={() => setBuyPointsOpen(true)}
            onOpenCreateEvent={() => setCreateEventOpen(true)}
          />
        )}

        {currentView === 'dashboard' && (
          <Dashboard
            onOpenBuyPoints={() => setBuyPointsOpen(true)}
            onOpenCreateEvent={() => setCreateEventOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}

        {currentView === 'photo-upload' && <PhotoUploadPage />}

        {currentView === 'client-gallery' && <ClientGallery />}

        {currentView === 'selection-results' && <SelectionResultsPage />}

        {currentView === 'admin-panel' && <AdminPanel />}
      </main>

      {/* Global Modals */}
      <AuthModal
        isOpen={authModal.isOpen}
        onClose={() => setAuthModal({ isOpen: false, mode: 'login' })}
        initialMode={authModal.mode}
      />

      <BuyPointsModal
        isOpen={buyPointsOpen}
        onClose={() => setBuyPointsOpen(false)}
      />

      <CreateEventModal
        isOpen={createEventOpen}
        onClose={() => setCreateEventOpen(false)}
        onOpenBuyPoints={() => setBuyPointsOpen(true)}
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
