import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Camera,
  Coins,
  Plus,
  Shield,
  User,
  LogOut,
  ChevronDown,
  Sparkles,
  ExternalLink,
  Sliders,
  Store,
  MessageCircle,
} from 'lucide-react';

interface NavbarProps {
  onOpenAuth: (mode: 'login' | 'signup' | 'admin') => void;
  onOpenBuyPoints: () => void;
  onOpenCreateEvent: () => void;
  onOpenSettings: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenAuth,
  onOpenBuyPoints,
  onOpenCreateEvent,
  onOpenSettings,
}) => {
  const {
    currentUser,
    users,
    currentView,
    navigateTo,
    logout,
    switchUser,
    events,
  } = useApp();

  const [showUserDropdown, setShowUserDropdown] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-neutral-950/80 backdrop-blur-xl border-b border-neutral-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <div
          onClick={() => navigateTo('landing')}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 via-amber-500 to-amber-300 p-0.5 shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform duration-200">
            <div className="w-full h-full bg-neutral-950 rounded-[10px] flex items-center justify-center">
              <Camera className="w-5 h-5 text-amber-400 group-hover:rotate-12 transition-transform" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-heading font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-neutral-100 to-amber-200 bg-clip-text text-transparent">
                A1 Smart Selection
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 font-medium">Wedding Photo Selection</p>
          </div>
        </div>

        {/* Center / Navigation Links */}
        <nav className="hidden md:flex items-center gap-2 text-sm font-medium">
          {currentView === 'landing' ? (
            <>
              <a
                href="#workflow"
                className="px-3 py-1.5 text-neutral-300 hover:text-white rounded-lg hover:bg-neutral-800/50 transition-colors"
              >
                Working
              </a>
              <a
                href="#pricing"
                className="px-3 py-1.5 text-neutral-300 hover:text-white rounded-lg hover:bg-neutral-800/50 transition-colors"
              >
                Pricing
              </a>
              <a
                href="#faq"
                className="px-3 py-1.5 text-neutral-300 hover:text-white rounded-lg hover:bg-neutral-800/50 transition-colors"
              >
                FAQ
              </a>
            </>
          ) : (
            <>
              {/* Only show Home if NOT logged in as photographer */}
              {(!currentUser || currentUser.role !== 'photographer') && (
                <button
                  onClick={() => navigateTo('landing')}
                  className="px-3 py-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800/50 transition-colors text-xs"
                >
                  Home
                </button>
              )}

              {currentUser && currentUser.role === 'admin' && (
                <button
                  onClick={() => navigateTo('admin-panel')}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${
                    currentView === 'admin-panel'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
                  }`}
                >
                  <Shield className="w-4 h-4 text-amber-400" />
                  Admin Panel
                </button>
              )}
            </>
          )}
        </nav>

        {/* Right CTA / Auth / User Menu */}
        <div className="flex items-center gap-2.5">
          {currentUser ? (
            <>
              {/* User Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-neutral-800/80 transition-colors border border-transparent hover:border-neutral-700"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center font-bold text-white text-xs">
                    {currentUser.role === 'admin' ? (
                      <Shield className="w-4 h-4" />
                    ) : (
                      currentUser.name.charAt(0)
                    )}
                  </div>
                  <span className="hidden sm:inline text-xs font-semibold text-neutral-200">
                    {currentUser.studioName || currentUser.name}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
                </button>

                {showUserDropdown && (
                  <div className="absolute right-0 mt-2 w-56 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-2 z-50">
                    <div className="px-3 py-2 border-b border-neutral-800">
                      <div className="font-semibold text-sm text-neutral-200 truncate">
                        {currentUser.name}
                      </div>
                      <div className="text-xs text-neutral-400 truncate">
                        {currentUser.studioName}
                      </div>
                      <div className="text-[11px] text-amber-400/80 font-mono mt-0.5">
                        {currentUser.email}
                      </div>
                    </div>

                    <div className="py-1">
                      {currentUser.role === 'photographer' && (
                        <button
                          onClick={() => {
                            onOpenSettings();
                            setShowUserDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg flex items-center gap-2"
                        >
                          <Sliders className="w-4 h-4 text-neutral-400" />
                          Studio & Watermark Settings
                        </button>
                      )}

                      {currentUser.role === 'admin' && (
                        <button
                          onClick={() => {
                            navigateTo('admin-panel');
                            setShowUserDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-amber-400 hover:bg-amber-500/10 rounded-lg flex items-center gap-2 font-semibold"
                        >
                          <Shield className="w-4 h-4" />
                          Master Admin Panel
                        </button>
                      )}
                    </div>

                    <div className="border-t border-neutral-800 pt-1">
                      <button
                        onClick={() => {
                          logout();
                          setShowUserDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 rounded-lg flex items-center gap-2"
                      >
                        <LogOut className="w-4 h-4" />
                        Log Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Logged Out CTAs */
            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenAuth('login')}
                className="text-xs font-semibold text-neutral-300 hover:text-white px-3 py-2 rounded-lg hover:bg-neutral-800/80 transition-colors"
              >
                Log In
              </button>
              <button
                onClick={() => onOpenAuth('signup')}
                className="text-xs font-bold text-neutral-950 bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-200 px-3.5 py-2 rounded-lg shadow-md shadow-amber-500/20 transition-all hover:scale-105"
              >
                Sign Up Free
              </button>
              <button
                onClick={() => onOpenAuth('admin')}
                className="text-xs text-neutral-500 hover:text-neutral-400 p-2 rounded-lg hover:bg-neutral-800/40"
                title="Admin Login"
              >
                <Shield className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
