import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { X, Sliders, Shield, Save, Check, Eye } from 'lucide-react';

interface StudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StudioSettingsModal: React.FC<StudioSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { currentUser, updateStudioSettings } = useApp();

  const [studioName, setStudioName] = useState(currentUser?.studioName || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [watermarkText, setWatermarkText] = useState(
    currentUser?.watermarkText || currentUser?.studioName?.toUpperCase() || 'STUDIO PREVIEW'
  );
  const [watermarkPosition, setWatermarkPosition] = useState<
    'center' | 'bottom-right' | 'bottom-left' | 'top-right'
  >(currentUser?.watermarkPosition || 'center');
  const [watermarkOpacity, setWatermarkOpacity] = useState(
    currentUser?.watermarkOpacity || 0.35
  );
  const [defaultPhotosPerSheet, setDefaultPhotosPerSheet] = useState<number>(
    currentUser?.defaultPhotosPerSheet || 6
  );

  if (!isOpen || !currentUser) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateStudioSettings({
      studioName,
      phone,
      watermarkText,
      watermarkPosition,
      watermarkOpacity,
      defaultPhotosPerSheet: Number(defaultPhotosPerSheet) || 6,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-white p-2 rounded-xl hover:bg-neutral-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold font-heading text-white">
              Studio & Watermark Settings
            </h2>
            <p className="text-xs text-neutral-400">
              Apne studio ka branding aur client preview watermarking customize karein.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="mt-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1">
                Studio / Brand Name
              </label>
              <input
                type="text"
                required
                value={studioName}
                onChange={(e) => setStudioName(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1">
                Photographer WhatsApp Number (For Notifications)
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Album Sheet Estimator Default Formula */}
          <div className="p-4 bg-neutral-950/80 rounded-2xl border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-neutral-200">
                📖 Studio Default Album Sheet Estimator Formula
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Client gallery mein live calculate hoga kitne photos par kitni sheets banengi (Default: 6 photos = 1 sheet).
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <input
                type="number"
                min={1}
                max={20}
                value={defaultPhotosPerSheet}
                onChange={(e) => setDefaultPhotosPerSheet(Number(e.target.value))}
                className="w-16 bg-neutral-900 border border-neutral-700 rounded-xl px-2.5 py-1.5 text-sm font-mono text-center font-bold text-amber-300 focus:outline-none focus:border-amber-500"
              />
              <span className="text-xs text-neutral-300">photos / sheet</span>
            </div>
          </div>

          {/* Watermark Configuration */}
          <div className="p-4 bg-neutral-950/80 rounded-2xl border border-neutral-800">
            <h3 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              Automated Photo Watermark
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-neutral-400 mb-1">
                  Watermark Text Stamp
                </label>
                <input
                  type="text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  placeholder="e.g. ROYAL SHOTS PREVIEW"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white uppercase tracking-wider"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    Watermark Placement
                  </label>
                  <select
                    value={watermarkPosition}
                    onChange={(e: any) => setWatermarkPosition(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white"
                  >
                    <option value="center">Center (Rotated Diagonal - Recommended)</option>
                    <option value="bottom-right">Bottom Right Corner</option>
                    <option value="bottom-left">Bottom Left Corner</option>
                    <option value="top-right">Top Right Corner</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-neutral-400 mb-1">
                    <span>Opacity: {Math.round(watermarkOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={0.8}
                    step={0.05}
                    value={watermarkOpacity}
                    onChange={(e) => setWatermarkOpacity(parseFloat(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>
              </div>

              {/* Live Preview Box */}
              <div>
                <div className="text-[11px] font-semibold text-neutral-400 mb-1.5 flex items-center gap-1">
                  <Eye className="w-3 h-3 text-amber-400" />
                  Live Preview on Photo:
                </div>
                <div className="relative w-full h-44 rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800">
                  <img
                    src="https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=800&q=75"
                    alt="Sample preview"
                    className="w-full h-full object-cover opacity-80"
                  />
                  {watermarkText && (
                    <div
                      className={`absolute inset-0 flex pointer-events-none p-4 ${
                        watermarkPosition === 'center'
                          ? 'items-center justify-center'
                          : watermarkPosition === 'bottom-right'
                          ? 'items-end justify-end'
                          : watermarkPosition === 'bottom-left'
                          ? 'items-end justify-start'
                          : 'items-start justify-end'
                      }`}
                    >
                      <span
                        style={{ opacity: watermarkOpacity }}
                        className={`text-white font-extrabold uppercase tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] select-none ${
                          watermarkPosition === 'center'
                            ? '-rotate-12 text-xl sm:text-2xl border-2 border-white/40 px-4 py-2'
                            : 'text-xs sm:text-sm'
                        }`}
                      >
                        {watermarkText}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800 text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-bold text-sm shadow-lg shadow-amber-500/20 hover:scale-105 transition-all flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
