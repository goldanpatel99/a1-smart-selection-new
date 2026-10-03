import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  X,
  Check,
  Coins,
  Zap,
  ShieldCheck,
  QrCode,
  Copy,
  Sparkles,
  MessageCircle,
  Clock,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

interface BuyPointsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BuyPointsModal: React.FC<BuyPointsModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, adminSettings, showToast } = useApp();
  const [selectedPackageId, setSelectedPackageId] = useState<string>('pkg-20');
  const [copiedUpi, setCopiedUpi] = useState(false);

  if (!isOpen) return null;

  const selectedPackage =
    adminSettings.pricingPackages.find((p) => p.id === selectedPackageId) ||
    adminSettings.pricingPackages[0];

  const baseRatePerPoint =
    adminSettings.pricingPackages.find((p) => p.points === 1)?.priceRupees ||
    (adminSettings.pricingPackages[0]?.priceRupees / adminSettings.pricingPackages[0]?.points) ||
    110;

  const UPI_ID = '7970641503@kotakbank';
  const PAYEE_NAME = 'Laily Patel';

  // UPI deep link
  const upiDeepLink = `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(
    PAYEE_NAME
  )}&am=${selectedPackage.priceRupees}&cu=INR&tn=${encodeURIComponent(
    `A1 Points ${selectedPackage.points} - ${currentUser?.studioName || 'Studio'}`
  )}`;

  // Dynamic QR Code generation URL
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(
    upiDeepLink
  )}`;

  // WhatsApp Pre-filled message for sending payment screenshot
  const whatsAppText = encodeURIComponent(
    `Namaste Goldan ji! Maine A1 Smart Selection ke liye payment kar diya hai:\n\n` +
      `• Studio Name: ${currentUser?.studioName || 'Studio'}\n` +
      `• Photographer Name: ${currentUser?.name || 'Photographer'}\n` +
      `• Registered Email: ${currentUser?.email || ''}\n` +
      `• Package: ${selectedPackage.name} (${selectedPackage.points} Points)\n` +
      `• Amount Paid: ₹${selectedPackage.priceRupees}\n` +
      `• Paid To UPI: ${UPI_ID}\n\n` +
      `Maine payment ka screenshot attach kar diya hai. Kripya verification karke mere account mein ${selectedPackage.points} points add kar dijiye.`
  );

  const whatsAppUrl = `https://wa.me/917970641503?text=${whatsAppText}`;

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(UPI_ID);
    setCopiedUpi(true);
    showToast('UPI ID copied to clipboard: 7970641503@kotakbank', 'success');
    setTimeout(() => setCopiedUpi(false), 2500);
  };

  const handleDoneWithScreenshot = () => {
    showToast(
      'Dhanyawad! Help Desk par screenshot aate hi 5-10 minute mein admin points credit kar denge.',
      'success'
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
        {/* Ambient Glow */}
        <div className="absolute top-0 right-1/4 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-white p-2 rounded-xl hover:bg-neutral-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold font-heading text-white">
              Buy Points for Your Studio
            </h2>
            <p className="text-xs text-neutral-400">
              Points se naye events banayein aur selection deadlines extend karein.
            </p>
          </div>
        </div>

        {/* Current Balance Bar */}
        <div className="my-5 p-3.5 bg-neutral-950/80 rounded-2xl border border-neutral-800 flex items-center justify-between">
          <div className="text-xs text-neutral-400">
            Current Studio Balance for{' '}
            <span className="font-semibold text-white">
              {currentUser?.studioName || 'Your Studio'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-lg font-mono font-extrabold ${
                (currentUser?.points || 0) === 0 ? 'text-rose-400' : 'text-amber-400'
              }`}
            >
              {currentUser?.points || 0} Points
            </span>
            {(currentUser?.points || 0) === 0 && (
              <span className="text-[11px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full font-medium">
                0 Balance
              </span>
            )}
          </div>
        </div>

        {/* Step 1: Package Options */}
        <div className="mb-2">
          <div className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold">
              1
            </span>
            <span>Select Points Package</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-6">
            {adminSettings.pricingPackages.map((pkg) => {
              const isSelected = selectedPackageId === pkg.id;
              const perEventCost = Math.round(pkg.priceRupees / Math.max(1, pkg.points));
              const autoSavings = Math.max(0, baseRatePerPoint * pkg.points - pkg.priceRupees);

              return (
                <div
                  key={pkg.id}
                  onClick={() => setSelectedPackageId(pkg.id)}
                  className={`relative p-5 rounded-2xl border cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/20 shadow-lg shadow-amber-500/10 scale-[1.02]'
                      : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  {pkg.isPopular ? (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow">
                      {pkg.savingsText || (autoSavings > 0 ? `Save ₹${autoSavings} 🔥` : 'Best Value 🔥')}
                    </div>
                  ) : autoSavings > 0 ? (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-neutral-800 text-emerald-400 border border-emerald-500/30 text-[9px] font-bold px-2 py-0.5 rounded-full shadow">
                      Save ₹{autoSavings}
                    </div>
                  ) : null}

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-neutral-400">{pkg.name}</span>
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          isSelected
                            ? 'border-amber-400 bg-amber-400 text-neutral-950'
                            : 'border-neutral-700'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>

                    <div className="flex items-baseline gap-2 my-1">
                      <span className="text-3xl font-extrabold text-white">
                        ₹{pkg.priceRupees.toLocaleString('en-IN')}
                      </span>
                      <span className="text-[11px] text-emerald-400 font-mono font-bold">
                        (₹{perEventCost}/event)
                      </span>
                    </div>

                    <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5 mb-2">
                      <Zap className="w-3.5 h-3.5" />
                      {pkg.points} {pkg.points === 1 ? 'Point' : 'Points'}
                      {autoSavings > 0 && (
                        <span className="text-[10px] text-neutral-400 font-normal">
                          • Save ₹{autoSavings}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-neutral-400 leading-snug">{pkg.tagline}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-neutral-800/80 text-[10px] text-neutral-500">
                    {adminSettings.pointsPerEvent || 1} Point = 1 Wedding Event
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 2: Official UPI Payment & Verification Section */}
        <div className="p-5 bg-neutral-950 rounded-2xl border border-neutral-800 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold">
                2
              </span>
              <span>Official UPI Payment & Verification</span>
            </div>
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-medium">
              Direct UPI Mode
            </span>
          </div>

          {/* Gateway Notice Box */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl mb-5 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-200/90 leading-relaxed">
              <strong>Notice:</strong> Online card/netbanking gateway verification process mein hai.
              Kripya niche diye gaye official <strong>Kotak Bank UPI ID</strong> ya <strong>QR Code</strong> par payment karke WhatsApp screenshot share karein. Admin verification ke baad <strong>5–10 minute mein</strong> points aapke balance mein add kar denge.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
            {/* Left: Dynamic QR Code Box */}
            <div className="flex flex-col items-center justify-center p-4 bg-neutral-900/90 border border-neutral-800 rounded-2xl text-center">
              <div className="bg-white p-2.5 rounded-xl shadow-lg mb-3">
                <img
                  src={qrCodeUrl}
                  alt={`UPI QR Code for ₹${selectedPackage.priceRupees}`}
                  className="w-44 h-44 object-contain"
                />
              </div>
              <div className="text-xs font-extrabold text-white">
                Scan to Pay ₹{selectedPackage.priceRupees.toLocaleString('en-IN')}
              </div>
              <p className="text-[10px] text-neutral-400 mt-1">
                Any UPI App (GPay • PhonePe • Paytm • BHIM • CRED)
              </p>
            </div>

            {/* Right: UPI Details & Copy */}
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">
                  Official Studio UPI ID
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-neutral-900 border border-neutral-700/80 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-amber-300 truncate">
                    {UPI_ID}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyUpi}
                    className="px-3.5 py-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors flex-shrink-0"
                  >
                    {copiedUpi ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Payee Name</label>
                <div className="bg-neutral-900/70 border border-neutral-800 rounded-xl px-3.5 py-2 text-xs font-semibold text-neutral-200">
                  {PAYEE_NAME}
                </div>
              </div>

              <div className="p-3 bg-neutral-900/80 border border-neutral-800/80 rounded-xl space-y-1.5 text-[11px] text-neutral-300">
                <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Fast Verification Workflow:</span>
                </div>
                <div>1. UPI App se ₹{selectedPackage.priceRupees} pay karein.</div>
                <div>2. Successful payment ka screenshot lein.</div>
                <div>3. Niche button par click karke WhatsApp par share karein.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: WhatsApp Action CTAs */}
        <div className="space-y-3">
          <a
            href={whatsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-4 px-6 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-extrabold text-sm sm:text-base rounded-2xl shadow-xl shadow-emerald-600/25 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2.5"
          >
            <MessageCircle className="w-5 h-5 fill-white" />
            <span>Send Payment Screenshot on WhatsApp (Help Desk)</span>
            <ExternalLink className="w-4 h-4 ml-1 opacity-80" />
          </a>

          <button
            type="button"
            onClick={handleDoneWithScreenshot}
            className="w-full py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold rounded-xl transition-colors"
          >
            I Have Sent The Screenshot (Done)
          </button>
        </div>

        {/* Business Trust & Customer Support */}
        <div className="mt-5 p-3.5 bg-neutral-950/90 rounded-2xl border border-neutral-800 text-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 font-semibold text-neutral-200 text-[11px]">
              <span className="text-emerald-400">✓ Est. From 2018 (Verified Studio Payment)</span>
              <span>• NEPOLIAN CINEMATIC STUDIO</span>
            </div>
            <div className="text-[10px] text-neutral-400 mt-0.5">
              Founder: <strong className="text-amber-400">Goldan Patel</strong> • Support: nepoliancinematicstudio@gmail.com
            </div>
          </div>
          <a
            href="https://wa.me/917970641503?text=Namaste%20Goldan%20ji,%20mujhe%20points%20recharge%20ke%20bare%20mein%20sahayata%20chahiye."
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950 border border-emerald-500/40 text-emerald-300 hover:text-white rounded-xl text-xs font-semibold transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Help Desk</span>
          </a>
        </div>
      </div>
    </div>
  );
};
