import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { X, Sliders, Shield, Save, Check, Eye, Download, ExternalLink } from 'lucide-react';

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
  const [studioTagline, setStudioTagline] = useState(
    currentUser?.studioTagline || 'Luxury Wedding Stories & Timeless Cinematic Films'
  );
  const [studioAddress, setStudioAddress] = useState(
    currentUser?.studioAddress || 'Prayagraj / Delhi NCR • Available Worldwide'
  );
  const [studioInstagram, setStudioInstagram] = useState(
    currentUser?.studioInstagram || '@nepoliancinematicstudio'
  );
  const [studioBookingPhone, setStudioBookingPhone] = useState(
    currentUser?.studioBookingPhone || currentUser?.phone || '+91 7970641503'
  );
  const [enableAntiScreenshot, setEnableAntiScreenshot] = useState(
    currentUser?.enableAntiScreenshot !== false
  );
  const [watermarkText, setWatermarkText] = useState(
    currentUser?.watermarkText || currentUser?.studioName?.toUpperCase() || 'STUDIO PREVIEW'
  );
  const [watermarkPosition, setWatermarkPosition] = useState<
    'center' | 'bottom-right' | 'bottom-left' | 'top-right'
  >(currentUser?.watermarkPosition || 'bottom-right');
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
      studioTagline,
      studioAddress,
      studioInstagram,
      studioBookingPhone,
      enableAntiScreenshot,
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
          {/* Section: 100% White-Label Studio Branding */}
          <div className="p-4 bg-neutral-950/80 rounded-2xl border border-amber-500/20">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                100% White-Label Studio Identity
              </h3>
            </div>
            <p className="text-[11px] text-neutral-400 mb-3">
              Yeh sabhi details client gallery ke header aur footer mein aapke private brand ke roop mein dikhengi.
            </p>

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
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Studio Tagline / Luxury Slogan
                </label>
                <input
                  type="text"
                  value={studioTagline}
                  onChange={(e) => setStudioTagline(e.target.value)}
                  placeholder="e.g. Luxury Wedding Stories & Cinematic Films"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Instagram Handle
                </label>
                <input
                  type="text"
                  value={studioInstagram}
                  onChange={(e) => setStudioInstagram(e.target.value)}
                  placeholder="@your_studio_name"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Studio Location / Address
                </label>
                <input
                  type="text"
                  value={studioAddress}
                  onChange={(e) => setStudioAddress(e.target.value)}
                  placeholder="e.g. Prayagraj / Delhi NCR • Worldwide"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Client Booking Inquiry WhatsApp Number
                </label>
                <input
                  type="tel"
                  required
                  value={studioBookingPhone}
                  onChange={(e) => setStudioBookingPhone(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Anti-Screenshot Protection Toggle */}
              <div className="flex items-center justify-between p-3 bg-neutral-900 rounded-xl border border-neutral-800">
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-amber-400" />
                    <span>Anti-Screenshot Security</span>
                  </div>
                  <p className="text-[10px] text-neutral-400 mt-0.5">
                    Client ke phone number ka diagonal security watermark photo par float karega.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEnableAntiScreenshot(!enableAntiScreenshot)}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                    enableAntiScreenshot ? 'bg-amber-500' : 'bg-neutral-800'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      enableAntiScreenshot ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
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

          {/* Section: Netlify & Web Hosting Deployment Export */}
          <div className="p-4 bg-gradient-to-br from-neutral-950 via-neutral-900 to-cyan-950/20 rounded-2xl border border-cyan-500/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                  Netlify / Web Hosting Deployment ZIP
                </h3>
              </div>
              <span className="text-[10px] text-cyan-300 bg-cyan-500/20 border border-cyan-500/30 px-2 py-0.5 rounded font-mono">
                1-Click Ready
              </span>
            </div>
            <p className="text-[11px] text-neutral-300 mb-3">
              Netlify (<a href="https://app.netlify.com/drop" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline font-semibold">app.netlify.com/drop</a>), Hostinger, ya cPanel par upload karne ke liye pre-built production ZIP download karein:
            </p>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <a
                href="/download-netlify-build"
                download="a1smartselection-netlify-deploy.zip"
                className="py-2.5 px-3.5 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-neutral-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-cyan-500/20"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Netlify Deploy ZIP (~365 KB)</span>
              </a>

              <a
                href="/download-source-zip"
                download="a1smartselection-full-source.zip"
                className="py-2.5 px-3.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors border border-neutral-700"
              >
                <Download className="w-3.5 h-3.5 text-neutral-400" />
                <span>Source Code ZIP</span>
              </a>
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
