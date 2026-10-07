import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  X,
  Check,
  Coins,
  Zap,
  ShieldCheck,
  Sparkles,
  MessageCircle,
  AlertCircle,
  CreditCard,
  CheckCircle2,
  Lock,
  ArrowRight,
  RefreshCw,
  HelpCircle,
  RotateCcw,
} from 'lucide-react';
import { razorpayService } from '../services/razorpayService';

interface BuyPointsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BuyPointsModal: React.FC<BuyPointsModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, adminSettings, buyPoints, showToast } = useApp();
  const [selectedPackageId, setSelectedPackageId] = useState<string>('pkg-20');
  const [isProcessingRazorpay, setIsProcessingRazorpay] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [successReceipt, setSuccessReceipt] = useState<{
    points: number;
    amount: number;
    paymentId: string;
    packageName: string;
  } | null>(null);

  if (!isOpen) return null;

  const selectedPackage =
    adminSettings.pricingPackages.find((p) => p.id === selectedPackageId) ||
    adminSettings.pricingPackages[0];

  const baseRatePerPoint =
    adminSettings.pricingPackages.find((p) => p.points === 1)?.priceRupees ||
    (adminSettings.pricingPackages[0]?.priceRupees / adminSettings.pricingPackages[0]?.points) ||
    110;

  // WhatsApp Support deep-link for payment issue / assistance
  const generateSupportWhatsAppUrl = (issueDetail?: string) => {
    const text = encodeURIComponent(
      `Namaste Goldan ji! Mujhe A1 Smart Selection points purchase karne mein assistance chahiye:\n\n` +
        `• Studio: ${currentUser?.studioName || 'Studio'}\n` +
        `• Photographer: ${currentUser?.name || 'Photographer'}\n` +
        `• Registered Email: ${currentUser?.email || ''}\n` +
        `• Phone: ${currentUser?.phone || ''}\n` +
        `• Selected Package: ${selectedPackage.name} (${selectedPackage.points} Points - ₹${selectedPackage.priceRupees})\n` +
        (issueDetail ? `• Issue / Error: ${issueDetail}\n\n` : `\n`) +
        `Kripya meri help karein.`
    );
    return `https://wa.me/917970641503?text=${text}`;
  };

  /**
   * 100% Automated 1-Click Razorpay Checkout
   */
  const handleRazorpayPay = async () => {
    if (!currentUser) {
      showToast('Please login to buy points', 'error');
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
          // Credit points instantly in state and Cloud Firestore
          await buyPoints(selectedPackage.id, 'Razorpay', { paymentId, orderId });
          setSuccessReceipt({
            points: selectedPackage.points,
            amount: selectedPackage.priceRupees,
            paymentId,
            packageName: selectedPackage.name,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-3xl p-5 sm:p-8 shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
        {/* Ambient Glow */}
        <div className="absolute top-0 right-1/4 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <button
          onClick={handleClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-white p-2 rounded-xl hover:bg-neutral-800 transition-colors z-20"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 1. SUCCESS RECEIPT SCREEN */}
        {successReceipt ? (
          <div className="text-center py-6 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Payment Verified & Points Credited Instantly</span>
            </div>

            <h2 className="text-3xl font-extrabold text-white font-heading">
              +{successReceipt.points} Points Added!
            </h2>
            <p className="text-xs text-neutral-300 mt-1 max-w-md mx-auto">
              Aapka payment successfully complete ho gaya hai. Studio account balance mein{' '}
              <strong className="text-amber-400">{successReceipt.points} points</strong> live credit ho chuke hain.
            </p>

            {/* Receipt Summary Card */}
            <div className="my-6 p-4 bg-neutral-950/80 rounded-2xl border border-neutral-800 max-w-md mx-auto text-left text-xs space-y-2.5">
              <div className="flex justify-between py-1 border-b border-neutral-900">
                <span className="text-neutral-400">Package:</span>
                <span className="font-bold text-white">{successReceipt.packageName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-900">
                <span className="text-neutral-400">Amount Paid:</span>
                <span className="font-bold text-emerald-400 font-mono text-sm">
                  ₹{successReceipt.amount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-900">
                <span className="text-neutral-400">Payment Gateway:</span>
                <span className="font-bold text-amber-300">Razorpay (Live 256-bit SSL)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-neutral-900">
                <span className="text-neutral-400">Transaction ID:</span>
                <span className="font-mono text-neutral-300 text-[11px] truncate max-w-[200px]">
                  {successReceipt.paymentId}
                </span>
              </div>
              <div className="flex justify-between py-1 pt-2 text-sm">
                <span className="font-bold text-neutral-300">New Studio Balance:</span>
                <span className="font-bold text-amber-400 font-mono text-base">
                  {currentUser?.points || 0} Points
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
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-2xl font-bold font-heading text-white">
                  Recharge Points
                </h2>
                <p className="text-xs text-neutral-400">
                  Instant point credit
                </p>
              </div>
            </div>

            {/* Current Balance Bar */}
            <div className="my-4 p-3.5 bg-neutral-950/80 rounded-2xl border border-neutral-800 flex items-center justify-between">
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

            {/* Package Selection */}
            <div className="mb-4">
              <div className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold">
                    1
                  </span>
                  <span>Select Points Package</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                {adminSettings.pricingPackages.map((pkg) => {
                  const isSelected = selectedPackageId === pkg.id;

                  return (
                    <div
                      key={pkg.id}
                      onClick={() => {
                        setSelectedPackageId(pkg.id);
                        setPaymentError(null);
                      }}
                      className={`relative p-4 rounded-2xl border cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/20 shadow-lg shadow-amber-500/10 scale-[1.02]'
                          : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      {pkg.isPopular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow">
                          {pkg.savingsText || 'Best Value 🔥'}
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
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

                        <div className="my-1.5">
                          <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
                            ₹{pkg.priceRupees.toLocaleString('en-IN')}
                          </span>
                        </div>

                        <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5" />
                          <span>{pkg.points} {pkg.points === 1 ? 'Point' : 'Points'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Secure Payment Checkout Box */}
            <div className="p-5 bg-neutral-950 rounded-2xl border border-amber-500/30 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-extrabold text-white">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Secure Payment</span>
                </div>

                <div className="text-2xl font-extrabold text-amber-400 font-mono">
                  ₹{selectedPackage.priceRupees.toLocaleString('en-IN')}
                </div>
              </div>

              {/* Main 1-Click Pay Button */}
              <button
                type="button"
                disabled={isProcessingRazorpay}
                onClick={handleRazorpayPay}
                className="w-full py-4 px-6 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-neutral-950 font-extrabold text-sm sm:text-base rounded-2xl shadow-xl shadow-amber-500/25 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2.5 disabled:opacity-60 disabled:cursor-not-allowed group"
              >
                {isProcessingRazorpay ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin text-neutral-950" />
                    <span>Opening Secure Window...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    <span>
                      Pay ₹{selectedPackage.priceRupees.toLocaleString('en-IN')}
                    </span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </div>

            {/* Payment Issue / Failure Banner & WhatsApp Support */}
            {paymentError ? (
              <div className="mt-4 p-4 bg-rose-950/40 border border-rose-500/40 rounded-2xl animate-in fade-in space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-rose-200">
                      Payment Issue / Transaction Interrupted
                    </h4>
                    <p className="text-[11px] text-rose-300/90 mt-0.5">
                      {paymentError}
                    </p>
                    <p className="text-[11px] text-neutral-300 mt-1">
                      Agar aapke bank se paise kat gaye hain aur points nahi jude, ya payment mein koi technical issue aa raha hai, toh turant niche diye gaye button se <strong>WhatsApp par contact karein</strong>. Hamari team turant check karke points add kar degi.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                  <a
                    href={generateSupportWhatsAppUrl(paymentError)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all"
                  >
                    <MessageCircle className="w-4 h-4 fill-white" />
                    <span>Contact on WhatsApp (+91 7970641503)</span>
                  </a>

                  <button
                    type="button"
                    onClick={handleRazorpayPay}
                    className="w-full sm:w-auto py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retry Payment</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Dedicated Help / WhatsApp Card (Always Visible) */
              <div className="mt-4 p-3.5 bg-neutral-950/80 rounded-2xl border border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
                    <MessageCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-white text-[11px]">
                      Payment mein koi issue ya transaction fail ho gaya?
                    </div>
                    <div className="text-[10px] text-neutral-400 mt-0.5">
                      Agar bank se amount deduct ho gaya ho ya error aaye, WhatsApp par turant help lein:
                    </div>
                  </div>
                </div>

                <a
                  href={generateSupportWhatsAppUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-md transition-all hover:scale-105"
                >
                  <MessageCircle className="w-3.5 h-3.5 fill-white" />
                  <span>Contact on WhatsApp</span>
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
