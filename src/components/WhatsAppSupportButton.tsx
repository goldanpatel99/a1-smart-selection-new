import React, { useState } from 'react';
import { MessageCircle, Phone, Mail, Award, X, Sparkles, ExternalLink, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const WhatsAppSupportButton: React.FC = () => {
  const { currentView } = useApp();
  const [isOpen, setIsOpen] = useState(false);

  // Strictly bottom-right corner for photographers; do not disturb couples in client gallery
  if (currentView === 'client-gallery') return null;

  const whatsappNumber = '7970641503';
  const whatsappUrl = `https://wa.me/91${whatsappNumber}?text=${encodeURIComponent(
    'Namaste Goldan ji! Mujhe A1 Smart Selection ke bare mein customer support / query chahiye.'
  )}`;

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end print:hidden">
      {/* Popover Card */}
      {isOpen && (
        <div className="mb-3 w-80 sm:w-96 bg-neutral-900/95 backdrop-blur-xl border border-emerald-500/40 rounded-3xl p-5 shadow-2xl shadow-emerald-950/50 animate-in slide-in-from-bottom-5 fade-in">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 border-b border-neutral-800 pb-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center text-neutral-950 font-bold shadow-lg shadow-emerald-500/20">
                <MessageCircle className="w-5 h-5 fill-neutral-950" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-white font-heading">
                  Customer Support
                </h4>
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>Online on WhatsApp</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Business & Founder Details */}
          <div className="space-y-2.5 text-xs text-neutral-300 mb-4">
            <div className="p-3 bg-neutral-950 rounded-2xl border border-neutral-800/80 space-y-1.5">
              <div className="flex items-center justify-between text-neutral-400 text-[11px]">
                <span>Pro Founder:</span>
                <span className="text-amber-400 font-bold font-heading text-xs">
                  Goldan Patel
                </span>
              </div>
              <div className="flex items-center justify-between text-neutral-400 text-[11px]">
                <span>Associated by:</span>
                <span className="text-white font-bold">
                  NEPOLIAN CINEMATIC STUDIO
                </span>
              </div>
              <div className="flex items-center justify-between text-neutral-400 text-[11px]">
                <span>Experience & Trust:</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Est: From 2018 (Trusted Payment)
                </span>
              </div>
            </div>

            {/* Contact details */}
            <div className="space-y-1.5 px-1 text-[11px]">
              <div className="flex items-center gap-2 text-neutral-300">
                <Phone className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span>WhatsApp:</span>
                <strong className="text-white font-mono">+91 7970641503</strong>
              </div>
              <div className="flex items-center gap-2 text-neutral-300">
                <Mail className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <span className="truncate">nepoliancinematicstudio@gmail.com</span>
              </div>
            </div>

            {/* Our other brands */}
            <div className="p-2.5 bg-neutral-950/70 rounded-xl border border-neutral-800 text-[11px]">
              <div className="text-[10px] uppercase font-bold text-neutral-400 mb-1.5 tracking-wider">
                Our Other Brands:
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 rounded-md bg-neutral-900 border border-neutral-800 text-neutral-200">
                  NCS Studio
                </span>
                <span className="px-2 py-0.5 rounded-md bg-neutral-900 border border-neutral-800 text-neutral-200">
                  A1 Flip Book
                </span>
                <span className="px-2 py-0.5 rounded-md bg-neutral-900 border border-neutral-800 text-neutral-200">
                  A1 Designing Agency
                </span>
                <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 font-semibold">
                  A1 Smart Selection
                </span>
              </div>
            </div>
          </div>

          {/* Action button */}
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-neutral-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-4 h-4 fill-neutral-950" />
            <span>Chat on WhatsApp (7970641503)</span>
          </a>
        </div>
      )}

      {/* Main Floating Trigger Button */}
      <div className="flex items-center gap-2">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:inline-flex items-center gap-2 px-4 py-2.5 bg-neutral-900/90 hover:bg-neutral-800 border border-emerald-500/40 text-emerald-300 font-bold text-xs rounded-full shadow-xl hover:scale-105 transition-all"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>WhatsApp Help: 7970641503</span>
        </a>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="group relative flex items-center justify-center w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-gradient-to-tr from-emerald-600 via-emerald-500 to-emerald-400 text-white shadow-xl shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-110 active:scale-95 transition-all"
          title="Customer Support on WhatsApp"
        >
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 text-neutral-950 rounded-full text-[9px] font-extrabold flex items-center justify-center border border-neutral-900">
            1
          </span>
          <MessageCircle className="w-7 h-7 fill-white group-hover:rotate-12 transition-transform" />
        </button>
      </div>
    </div>
  );
};
