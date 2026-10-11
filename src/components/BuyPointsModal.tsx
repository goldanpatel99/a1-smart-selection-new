import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  X,
  Check,
  Coins,
  Zap,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  CreditCard,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { razorpayService } from '../services/razorpayService';
import { PointTier, PricingPackage } from '../types';

interface BuyPointsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTier?: PointTier;
}

export const BuyPointsModal: React.FC<BuyPointsModalProps> = ({
  isOpen,
  onClose,
  initialTier = 'standard',
}) => {
  const { currentUser, adminSettings, buyPoints, showToast } = useApp();
  const [activeTier, setActiveTier] = useState<PointTier>(initialTier);
  const [selectedPackageId, setSelectedPackageId] = useState<string>(() => {
    const defaultPkg =
      adminSettings.pricingPackages.find((p) => p.tier === initialTier && p.points === 5) ||
      adminSettings.pricingPackages.find((p) => p.tier === initialTier);
    return defaultPkg?.id || 'pkg-std-5';
  });

  const [isProcessingRazorpay, setIsProcessingRazorpay] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [successReceipt, setSuccessReceipt] = useState<{
    points: number;
    tier: PointTier;
    amount: number;
    paymentId: string;
    packageName: string;
    photosLimit: number;
  } | null>(null);

  if (!isOpen) return null;

  // Filter packages by active tier
  const tierPackages = adminSettings.pricingPackages.filter(
    (p) => (p.tier || 'standard') === activeTier
  );

  // Active selected package
  const selectedPackage: PricingPackage =
    adminSettings.pricingPackages.find((p) => p.id === selectedPackageId) ||
    tierPackages[1] ||
    tierPackages[0] ||
    adminSettings.pricingPackages[0];

  const handleTabChange = (tier: PointTier) => {
    setActiveTier(tier);
    setPaymentError(null);
    const popularInTier =
      adminSettings.pricingPackages.find((p) => p.tier === tier && p.isPopular) ||
      adminSettings.pricingPackages.find((p) => p.tier === tier);
    if (popularInTier) {
      setSelectedPackageId(popularInTier.id);
    }
  };

  /**
   * 1-Click Razorpay Checkout
   */
  const handleRazorpayPay = async () => {
    if (!currentUser) {
      showToast('Please login to buy points', 'error');
      return;
    }

    if (!selectedPackage) {
      showToast('Please select a package first', 'error');
      return;
    }

    setIsProcessingRazorpay(true);
    setPaymentError(null);

    try {
      await razorpayService.startCheckout({
        amountRupees: selectedPackage.priceRupees,
        points: selectedPackage.points,
        packageName: selectedPackage.name,
        packageId: selectedPackage.id,
        userId: currentUser.id,
        userName: currentUser.name,
        userEmail: currentUser.email,
        userPhone: currentUser.phone,
        studioName: currentUser.studioName || 'NEPOLIAN CINEMATIC STUDIO',
        onSuccess: async (paymentId, orderId) => {
          setIsProcessingRazorpay(false);
          setPaymentError(null);
          await buyPoints(selectedPackage.id, 'Razorpay', { paymentId, orderId });
          setSuccessReceipt({
            points: selectedPackage.points,
            tier: selectedPackage.tier || activeTier,
            amount: selectedPackage.priceRupees,
            paymentId,
            packageName: selectedPackage.name,
            photosLimit: selectedPackage.photosLimit || (selectedPackage.tier === 'premium' ? 5000 : 2500),
          });
        },
        onError: (errMsg) => {
          setIsProcessingRazorpay(false);
          setPaymentError(errMsg);
          showToast(errMsg, 'error');
        },
      });
    } catch (err: any) {
      setIsProcessingRazorpay(false);
      const errMsg = err?.message || 'Payment initiation failed. Please try again.';
      setPaymentError(errMsg);
      showToast(errMsg, 'error');
    }
  };

  const handleClose = () => {
    setSuccessReceipt(null);
    setPaymentError(null);
    onClose();
  };

  const stdBalance =
    currentUser?.standardPoints !== undefined ? currentUser.standardPoints : currentUser?.points || 0;
  const prmBalance =
    currentUser?.premiumPoints !== undefined ? currentUser.premiumPoints : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
        {/* Background Ambient Glow */}
        {activeTier === 'premium' ? (
          <>
            <div className="absolute top-0 right-1/4 w-80 h-80 bg-amber-500/15 rounded-full blur-3xl pointer-events-none animate-pulse" />
            <div className="absolute top-10 left-10 w-48 h-48 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
          </>
        ) : (
          <div className="absolute top-0 right-1/4 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        )}

        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-white p-2 rounded-xl hover:bg-neutral-800 transition-colors z-20"
        >
          <X className="w-5 h-5" />
        </button>

        {/* SUCCESS RECEIPT SCREEN */}
        {successReceipt ? (
          <div className="text-center py-6 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Payment Verified • Points Added Instantly</span>
            </div>

            <h2 className="text-3xl font-extrabold text-white font-heading">
              +{successReceipt.points}{' '}
              {successReceipt.tier === 'premium' ? 'Premium Points' : 'Standard Points'}
            </h2>
            <p className="text-xs text-neutral-300 mt-1.5 max-w-md mx-auto">
              Payment complete! Har point se aap{' '}
              <strong
                className={
                  successReceipt.tier === 'premium'
                    ? 'text-amber-300 font-bold'
                    : 'text-amber-400 font-bold'
                }
              >
                {successReceipt.photosLimit.toLocaleString()} photos
              </strong>{' '}
              upload kar sakte hain. Studio balance update ho chuka hai.
            </p>

            {/* Receipt Summary Card */}
            <div className="my-6 p-4 bg-neutral-950/80 rounded-2xl border border-neutral-800 max-w-md mx-auto text-left text-xs space-y-2.5">
              <div className="flex justify-between py-1 border-b border-neutral-900">
                <span className="text-neutral-400">Package:</span>
                <span className="font-bold text-white">{successReceipt.packageName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-900">
                <span className="text-neutral-400">Point Type:</span>
                <span
                  className={`font-bold capitalize ${
                    successReceipt.tier === 'premium' ? 'text-amber-300' : 'text-amber-400'
                  }`}
                >
                  {successReceipt.tier === 'premium'
                    ? '⚡ Premium (5,000 photos/pt)'
                    : 'Standard (2,500 photos/pt)'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-900">
                <span className="text-neutral-400">Amount Paid:</span>
                <span className="font-bold text-emerald-400 font-mono text-sm">
                  ₹{successReceipt.amount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-900">
                <span className="text-neutral-400">Transaction ID:</span>
                <span className="font-mono text-neutral-300 text-[11px] truncate max-w-[200px]">
                  {successReceipt.paymentId}
                </span>
              </div>
              <div className="flex justify-between py-1 pt-2 text-xs">
                <span className="font-bold text-neutral-300">Updated Balance:</span>
                <span className="font-bold font-mono text-white">
                  {currentUser?.standardPoints || 0} Std / {currentUser?.premiumPoints || 0} Prem
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="py-3.5 px-8 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-neutral-950 font-extrabold text-sm rounded-2xl shadow-xl shadow-amber-500/20 transition-all hover:scale-105"
            >
              Continue & Create Events
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-colors ${
                  activeTier === 'premium'
                    ? 'bg-gradient-to-br from-amber-500 to-purple-600 text-white shadow-lg shadow-amber-500/20'
                    : 'bg-amber-500/20 border border-amber-500/30 text-amber-400'
                }`}
              >
                {activeTier === 'premium' ? (
                  <Zap className="w-5 h-5 fill-amber-300 text-amber-300 animate-pulse" />
                ) : (
                  <Coins className="w-5 h-5 text-amber-400" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold font-heading text-white">
                    Recharge Points
                  </h2>
                  {activeTier === 'premium' && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider uppercase bg-gradient-to-r from-amber-400 to-purple-400 text-neutral-950 shadow-sm animate-pulse">
                      ⚡ HIGH VOLTAGE
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-400">
                  Select your point type and pack • Instant auto credit
                </p>
              </div>
            </div>

            {/* Current Balance Bar */}
            <div className="my-3.5 p-3.5 bg-neutral-950/80 rounded-2xl border border-neutral-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <span className="text-neutral-400">Studio: </span>
                <span className="font-semibold text-white">
                  {currentUser?.studioName || 'Your Studio'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/25">
                  <span className="text-[11px] text-neutral-400">Standard:</span>
                  <span className="font-mono font-bold text-amber-400">{stdBalance} Pts</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-500/10 border border-purple-500/25">
                  <span className="text-[11px] text-neutral-400">Premium:</span>
                  <span className="font-mono font-bold text-purple-300">{prmBalance} Pts</span>
                </div>
              </div>
            </div>

            {/* Tier Switcher Tabs */}
            <div className="grid grid-cols-2 gap-2 p-1.5 bg-neutral-950 rounded-2xl border border-neutral-800 mb-4">
              {/* Tab 1: Standard Point (2,500 photos @ ₹149) */}
              <button
                type="button"
                onClick={() => handleTabChange('standard')}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  activeTier === 'standard'
                    ? 'bg-neutral-800 text-amber-400 border border-amber-500/30 shadow'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-900/60'
                }`}
              >
                <Coins className="w-4 h-4 text-amber-400" />
                <div className="text-left">
                  <div className="leading-tight">Standard Point</div>
                  <div className="text-[10px] text-neutral-400 font-normal">
                    2,500 photos / pt • ₹149/pt
                  </div>
                </div>
              </button>

              {/* Tab 2: Premium Point (Energetic Electric Current Animation @ ₹249) */}
              <button
                type="button"
                onClick={() => handleTabChange('premium')}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 relative overflow-hidden group ${
                  activeTier === 'premium'
                    ? 'bg-gradient-to-r from-purple-950/90 via-neutral-900 to-amber-950/90 text-white border-2 border-amber-400 shadow-xl shadow-amber-500/25 ring-2 ring-amber-400/40'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-900/60'
                }`}
              >
                {/* Electric Current Moving Light Shimmer */}
                {activeTier === 'premium' && (
                  <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
                    <div className="absolute -inset-[100%] bg-[conic-gradient(from_0deg,transparent_0_340deg,rgba(251,191,36,0.6)_360deg)] animate-[spin_3s_linear_infinite] opacity-80" />
                    <div className="absolute inset-[1px] bg-neutral-950/90 rounded-xl" />
                  </div>
                )}
                <div className="relative z-10 flex items-center gap-2">
                  <span className="relative flex h-4 w-4 items-center justify-center">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <Zap className="w-4 h-4 text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
                  </span>
                  <div className="text-left">
                    <div className="flex items-center gap-1.5 leading-tight">
                      <span className="text-amber-300 font-extrabold">⚡ Premium Point</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-500/30 text-amber-200 border border-amber-400/40 font-mono">
                        5K PHOTOS
                      </span>
                    </div>
                    <div className="text-[10px] text-amber-200/80 font-normal">
                      5,000 photos / pt • ₹249/pt
                    </div>
                  </div>
                </div>
              </button>
            </div>

            {/* 3 Variations Grid */}
            <div className="mb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {tierPackages.map((pkg) => {
                  const isSelected = selectedPackageId === pkg.id;
                  const perPointRate = Math.round(pkg.priceRupees / pkg.points);

                  return (
                    <div
                      key={pkg.id}
                      onClick={() => {
                        setSelectedPackageId(pkg.id);
                        setPaymentError(null);
                      }}
                      className={`relative p-4 rounded-2xl border cursor-pointer transition-all duration-200 flex flex-col justify-between overflow-hidden ${
                        isSelected
                          ? activeTier === 'premium'
                            ? 'bg-gradient-to-br from-purple-950/60 via-neutral-900 to-amber-950/50 border-amber-400 ring-2 ring-amber-400/50 shadow-2xl shadow-amber-500/20 scale-[1.02]'
                            : 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/20 shadow-lg shadow-amber-500/10 scale-[1.02]'
                          : 'bg-neutral-950/70 border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      {/* Popular / Savings Badge */}
                      {pkg.savingsText && (
                        <div
                          className={`absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow ${
                            activeTier === 'premium'
                              ? 'bg-gradient-to-r from-amber-400 to-purple-400 text-neutral-950'
                              : 'bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950'
                          }`}
                        >
                          {pkg.savingsText}
                        </div>
                      )}

                      <div>
                        {/* Top: Points & Check */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            {activeTier === 'premium' ? (
                              <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                            ) : (
                              <Coins className="w-4 h-4 text-amber-400" />
                            )}
                            <span className="text-sm font-bold text-white">
                              {pkg.points} {pkg.points === 1 ? 'Point' : 'Points'}
                            </span>
                          </div>

                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                              isSelected
                                ? activeTier === 'premium'
                                  ? 'border-amber-400 bg-amber-400 text-neutral-950'
                                  : 'border-amber-400 bg-amber-400 text-neutral-950'
                                : 'border-neutral-700'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </div>

                        {/* Price */}
                        <div className="my-2">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
                              ₹{pkg.priceRupees.toLocaleString('en-IN')}
                            </span>
                            {pkg.originalPriceRupees && pkg.originalPriceRupees > pkg.priceRupees && (
                              <span className="text-xs text-neutral-500 line-through font-mono">
                                ₹{pkg.originalPriceRupees}
                              </span>
                            )}
                          </div>
                          {pkg.points > 1 && (
                            <div className="text-[11px] text-neutral-400">
                              (₹{perPointRate}/point)
                            </div>
                          )}
                        </div>

                        {/* Photos Access Pill */}
                        <div
                          className={`mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                            activeTier === 'premium'
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                              : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                          }`}
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>
                            {(pkg.photosLimit * pkg.points).toLocaleString()} Photos Total
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-neutral-900 text-[11px] text-neutral-400">
                        {pkg.points} {pkg.points === 1 ? 'Event' : 'Events'} • {pkg.photosLimit.toLocaleString()} photos / event
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected Package Breakdown Summary */}
            <div className="mb-4 p-4 bg-neutral-950 rounded-2xl border border-neutral-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <span>Selected: {selectedPackage.name}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        activeTier === 'premium'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {activeTier === 'premium' ? '5,000 photos/pt' : '2,500 photos/pt'}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-0.5">{selectedPackage.tagline}</p>
                </div>
                <div className="text-left sm:text-right">
                  <div className="text-xs text-neutral-400">Total Payable:</div>
                  <div className="text-2xl font-mono font-extrabold text-amber-400">
                    ₹{selectedPackage.priceRupees.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Button */}
            <div className="space-y-3">
              <button
                type="button"
                disabled={isProcessingRazorpay}
                onClick={handleRazorpayPay}
                className="w-full py-4 px-6 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300 hover:from-amber-400 hover:to-amber-200 text-neutral-950 font-extrabold text-base rounded-2xl shadow-xl shadow-amber-500/20 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2.5 disabled:opacity-50"
              >
                {isProcessingRazorpay ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Processing Payment...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    <span>
                      Pay ₹{selectedPackage.priceRupees.toLocaleString('en-IN')} (UPI / Cards / NetBanking)
                    </span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </div>

            {/* Payment Error Banner with Clean Retry */}
            {paymentError && (
              <div className="mt-3.5 p-3.5 bg-rose-950/40 border border-rose-500/40 rounded-2xl animate-in fade-in space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-rose-200">Payment Interrupted</h4>
                    <p className="text-[11px] text-rose-300/90 mt-0.5">{paymentError}</p>
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleRazorpayPay}
                    className="py-2 px-4 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retry Payment</span>
                  </button>
                </div>
              </div>
            )}

            {/* Clean Secure Gateway Badge without WhatsApp */}
            <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-neutral-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Razorpay 256-bit SSL Verified Gateway • 100% Secure Checkout</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
