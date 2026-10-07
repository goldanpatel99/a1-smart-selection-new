import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  X,
  Calendar,
  User,
  Phone,
  Mail,
  Camera,
  Coins,
  AlertTriangle,
  ArrowRight,
  Sliders,
} from 'lucide-react';

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenBuyPoints: () => void;
}

export const CreateEventModal: React.FC<CreateEventModalProps> = ({
  isOpen,
  onClose,
  onOpenBuyPoints,
}) => {
  const { currentUser, createEvent, navigateTo, adminSettings } = useApp();

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
  const [coupleStory, setCoupleStory] = useState('');
  const [photosPerSheet, setPhotosPerSheet] = useState<number>(
    currentUser?.defaultPhotosPerSheet || 6
  );

  if (!isOpen) return null;

  const currentPoints = currentUser?.points || 0;
  const cost = adminSettings.pointsPerEvent;
  const hasEnoughPoints = currentPoints >= cost;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !coupleName || !clientPhone) return;

    const res = createEvent({
      title,
      coupleName,
      clientPhone,
      clientEmail: clientEmail || undefined,
      eventDate,
      deadlineDays: Number(deadlineDays),
      maxSelectionLimit: limitEnabled ? Number(maxSelectionLimit) : undefined,
      photosPerSheet: Number(photosPerSheet) || 6,
      coupleStory: coupleStory.trim() || undefined,
    });

    if (res.success && res.eventId) {
      setTitle('');
      setCoupleName('');
      setClientPhone('');
      setClientEmail('');
      setCoupleStory('');
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

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold font-heading text-white">Create New Event</h2>
            <p className="text-xs text-neutral-400">
              Naya wedding event banayein aur photo folders upload karein.
            </p>
          </div>
        </div>

        {/* Cost & Balance Banner */}
        <div
          className={`my-4 p-4 rounded-2xl border flex items-center justify-between ${
            hasEnoughPoints
              ? 'bg-neutral-950/80 border-neutral-800 text-neutral-300'
              : 'bg-rose-950/60 border-rose-500/50 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                hasEnoughPoints ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/20 text-rose-400'
              }`}
            >
              {hasEnoughPoints ? (
                <Coins className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="text-xs font-semibold">
                Event Creation Cost:{' '}
                <span className="font-mono text-amber-400">1 Point</span>
              </div>
              <div className="text-[11px] opacity-80">
                Your Studio Balance:{' '}
                <span className="font-mono font-bold">{currentPoints} Points</span>
              </div>
            </div>
          </div>

          {!hasEnoughPoints && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenBuyPoints();
              }}
              className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-bold text-xs rounded-xl shadow hover:scale-105 transition-all flex items-center gap-1"
            >
              Buy Points <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {!hasEnoughPoints ? (
          <div className="p-5 bg-neutral-950/60 rounded-2xl border border-neutral-800/80 text-center my-4">
            <h4 className="text-sm font-bold text-neutral-200 mb-1">
              Points Balance Is 0
            </h4>
            <p className="text-xs text-neutral-400 mb-4 max-w-sm mx-auto">
              Naya wedding event banane ke liye recharge karein.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenBuyPoints();
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
                placeholder="e.g. Sharma Wedding 2026 ya Kapoor Sangeet & Reception"
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
                    placeholder="e.g. Aarav & Priya"
                    value={coupleName}
                    onChange={(e) => setCoupleName(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Client WhatsApp Number *
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 w-4 h-4 text-neutral-500" />
                  <input
                    type="tel"
                    required
                    placeholder="+91 98765 43210"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1">
                Selection Deadline
              </label>
              <div className="w-full bg-neutral-950 border border-amber-500/40 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span className="text-sm font-bold text-amber-300 font-mono">6 Days</span>
                  <span className="text-[10px] uppercase font-bold text-neutral-400 bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded">
                    Strictly Automatic
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-neutral-500 mt-1">
                Auto 6 days set. Baad mein extend karne ke liye +6 days ka 1 point lagega.
              </p>
            </div>

            {/* Selection Limit (Album quota) */}
            <div className="p-3.5 bg-neutral-950/70 border border-neutral-800/80 rounded-2xl">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  Photo Selection Limit (Album Quota)
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

            {/* Romantic Couple Story / Welcome Note (Optional) */}
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1">
                Couple Story / Welcome Message (Optional)
              </label>
              <textarea
                rows={2}
                value={coupleStory}
                onChange={(e) => setCoupleStory(e.target.value)}
                placeholder='e.g. "Two souls with but a single thought, two hearts that beat as one. Welcome to our sacred wedding memories!"'
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500 resize-none"
              />
              <p className="text-[10px] text-neutral-500 mt-0.5">
                Client gallery open karte waqt background music ke sath romantic welcome screen par show hoga.
              </p>
            </div>

            {/* Album Sheet Estimator Formula Setting */}
            <div className="p-3.5 bg-neutral-950/70 border border-neutral-800/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
                  <span>📖 Album Sheet Estimator</span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-mono">
                    Default: 6 Photos = 1 Sheet
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Client gallery mein live dikhega: kitne photos par lagbhag kitni sheets (pages) banengi.
                </p>
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

            <button
              type="submit"
              className="w-full mt-3 py-3.5 px-4 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300 hover:from-amber-400 hover:to-amber-200 text-neutral-950 font-bold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
            >
              <span>Create Event & Upload Photos ({cost} {cost === 1 ? 'Point' : 'Points'})</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
