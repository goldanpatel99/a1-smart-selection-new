import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  X,
  User,
  Phone,
  Camera,
  Coins,
  AlertTriangle,
  ArrowRight,
  Sliders,
  Zap,
} from 'lucide-react';
import { PointTier } from '../types';

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenBuyPoints: (initialTier?: PointTier) => void;
}

export const CreateEventModal: React.FC<CreateEventModalProps> = ({
  isOpen,
  onClose,
  onOpenBuyPoints,
}) => {
  const { currentUser, createEvent, navigateTo } = useApp();

  const stdBalance =
    currentUser?.standardPoints !== undefined
      ? currentUser.standardPoints
      : currentUser?.points || 0;
  const prmBalance =
    currentUser?.premiumPoints !== undefined ? currentUser.premiumPoints : 0;

  // Auto-select tier: default to premium if photographer has premium points, else standard
  const [selectedTier, setSelectedTier] = useState<PointTier>(() =>
    prmBalance > 0 && stdBalance === 0 ? 'premium' : 'standard'
  );

  const [title, setTitle] = useState('');
  const [coupleName, setCoupleName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [eventDate, setEventDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [deadlineDays, setDeadlineDays] = useState(6);
  const [maxSelectionLimit, setMaxSelectionLimit] = useState<number | undefined>(80);
  const [limitEnabled, setLimitEnabled] = useState(false);
  const [photosPerSheet, setPhotosPerSheet] = useState<number>(
    currentUser?.defaultPhotosPerSheet || 6
  );

  if (!isOpen) return null;

  const hasStandardPoints = stdBalance >= 1;
  const hasPremiumPoints = prmBalance >= 1;
  const hasEnoughForSelectedTier =
    selectedTier === 'premium' ? hasPremiumPoints : hasStandardPoints;
  const hasAnyPoints = stdBalance > 0 || prmBalance > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !coupleName.trim()) return;

    const res = createEvent({
      title: title.trim(),
      coupleName: coupleName.trim(),
      clientPhone: clientPhone.trim() || undefined,
      clientEmail: clientEmail.trim() || undefined,
      eventDate,
      deadlineDays: Number(deadlineDays),
      maxSelectionLimit: limitEnabled ? Number(maxSelectionLimit) : undefined,
      photosPerSheet: Number(photosPerSheet) || 6,
      pointTier: selectedTier,
    });

    if (res.success && res.eventId) {
      setTitle('');
      setCoupleName('');
      setClientPhone('');
      setClientEmail('');
      setLimitEnabled(false);
      onClose();
      // Jump straight to upload photos page
      navigateTo('photo-upload', res.eventId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-white p-2 rounded-xl hover:bg-neutral-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header - Cleaned without extra tagline */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold font-heading text-white">Create New Event</h2>
          </div>
        </div>

        {/* 1. Point Tier Selection Cards (Standard 2,500 vs Premium 5,000) */}
        <div className="my-4">
          <label className="block text-xs font-semibold text-neutral-300 mb-2">
            Select Event Tier / Point to Use:
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {/* Standard Tier */}
            <div
              onClick={() => setSelectedTier('standard')}
              className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                selectedTier === 'standard'
                  ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/20 shadow-lg'
                  : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <Coins className="w-4 h-4 text-amber-400" />
                  <span>Standard Event</span>
                </div>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    stdBalance > 0
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {stdBalance} Pts
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                1 Standard Pt • <strong className="text-neutral-200">Max 2,500 Photos</strong>
              </p>
            </div>

            {/* Premium Tier (Energetic Electric Current Animation) */}
            <div
              onClick={() => setSelectedTier('premium')}
              className={`p-3.5 rounded-2xl border cursor-pointer transition-all relative overflow-hidden group ${
                selectedTier === 'premium'
                  ? 'bg-gradient-to-br from-purple-950/80 via-neutral-900 to-amber-950/60 border-amber-400 ring-2 ring-amber-400/40 shadow-xl shadow-amber-500/20'
                  : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              {/* Electric Current Moving Light Shimmer */}
              {selectedTier === 'premium' && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
                  <div className="absolute -inset-[100%] bg-[conic-gradient(from_0deg,transparent_0_340deg,rgba(251,191,36,0.6)_360deg)] animate-[spin_3s_linear_infinite] opacity-70" />
                  <div className="absolute inset-[1px] bg-neutral-950/90 rounded-2xl" />
                </div>
              )}
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-300">
                    <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400 relative drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                    </span>
                    <span>⚡ Premium Event</span>
                  </div>
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                      prmBalance > 0
                        ? 'bg-amber-500/30 text-amber-200 border border-amber-400/40'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {prmBalance} Pts
                  </span>
                </div>
                <p className="text-[11px] text-amber-200/90 font-medium">
                  1 Premium Pt • <strong className="text-white">Max 5,000 Photos</strong>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Cost Banner - Cleaned without repeating balance */}
        <div
          className={`mb-4 p-3.5 rounded-2xl border flex items-center justify-between ${
            hasEnoughForSelectedTier
              ? 'bg-neutral-950/80 border-neutral-800 text-neutral-300'
              : 'bg-rose-950/60 border-rose-500/50 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                hasEnoughForSelectedTier
                  ? selectedTier === 'premium'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-amber-500/10 text-amber-400'
                  : 'bg-rose-500/20 text-rose-400'
              }`}
            >
              {hasEnoughForSelectedTier ? (
                selectedTier === 'premium' ? <Zap className="w-4 h-4 fill-amber-400" /> : <Coins className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
            </div>
            <div>
              <div className="text-xs font-semibold">
                Cost:{' '}
                <span className="font-mono font-bold text-white">
                  1 {selectedTier === 'premium' ? 'Premium Point (5,000 photos)' : 'Standard Point (2,500 photos)'}
                </span>
              </div>
            </div>
          </div>

          {!hasEnoughForSelectedTier && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenBuyPoints(selectedTier);
              }}
              className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-bold text-xs rounded-xl shadow hover:scale-105 transition-all flex items-center gap-1"
            >
              Recharge <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {!hasAnyPoints && !hasEnoughForSelectedTier ? (
          <div className="p-5 bg-neutral-950/60 rounded-2xl border border-neutral-800/80 text-center my-4">
            <h4 className="text-sm font-bold text-neutral-200 mb-1">
              Points Balance Is 0
            </h4>
            <p className="text-xs text-neutral-400 mb-4 max-w-sm mx-auto">
              Naya wedding event banane ke liye recharge karein. Standard (2,500 photos) ya Premium (5,000 photos) points select karein.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenBuyPoints(selectedTier);
              }}
              className="py-3 px-6 bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-bold text-sm rounded-xl shadow-lg shadow-amber-500/20 hover:scale-105 transition-transform inline-flex items-center gap-2"
            >
              <Coins className="w-4 h-4" />
              Recharge Points
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1">
                Event Name / Title *
              </label>
              <input
                type="text"
                required
                placeholder="Wedding or Event Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Bride & Groom / Client Names *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-4 h-4 text-neutral-500" />
                  <input
                    type="text"
                    required
                    placeholder="Client Names"
                    value={coupleName}
                    onChange={(e) => setCoupleName(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Client WhatsApp Number (Optional)
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 w-4 h-4 text-neutral-500" />
                  <input
                    type="tel"
                    placeholder="Phone Number (Optional)"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* Selection Time Limit */}
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1">
                Selection Time Limit
              </label>
              <div className="w-full bg-neutral-950 border border-amber-500/40 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span className="text-sm font-bold text-amber-300 font-mono">6 Days</span>
                </div>
              </div>
              <p className="text-[10px] text-neutral-500 mt-1">
                Auto 6 days set. Baad mein extend karne ke liye +6 days ka 1 point lagega.
              </p>
            </div>

            {/* Selection Limit */}
            <div className="p-3.5 bg-neutral-950/70 border border-neutral-800/80 rounded-2xl">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>Photo Selection Limit</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={limitEnabled}
                    onChange={(e) => setLimitEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              {limitEnabled ? (
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={maxSelectionLimit}
                    onChange={(e) => setMaxSelectionLimit(Number(e.target.value))}
                    className="w-32 bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-1.5 text-sm text-white font-mono"
                  />
                  <span className="text-xs text-neutral-400">
                    Client cannot select more than {maxSelectionLimit} photos.
                  </span>
                </div>
              ) : (
                <p className="text-xs text-neutral-400">
                  Unlimited selection allowed (Client can choose as many as they want).
                </p>
              )}
            </div>

            {/* Album Sheet Estimator Formula Setting */}
            <div className="p-3.5 bg-neutral-950/70 border border-neutral-800/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
                  <span>📖 Album Sheet Estimator</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={photosPerSheet}
                  onChange={(e) => setPhotosPerSheet(Number(e.target.value))}
                  className="w-16 bg-neutral-900 border border-neutral-700 rounded-xl px-2 py-1.5 text-sm font-mono text-center font-bold text-amber-300 focus:outline-none focus:border-amber-500"
                />
                <span className="text-xs text-neutral-300">photos / sheet</span>
              </div>
            </div>

            {/* Bottom Button - Strictly: Create Event & Upload Photos */}
            <button
              type="submit"
              className="w-full mt-3 py-3.5 px-4 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300 hover:from-amber-400 hover:to-amber-200 text-neutral-950 font-extrabold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
            >
              <span>Create Event & Upload Photos</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
