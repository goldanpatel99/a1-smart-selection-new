import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { WeddingEvent } from '../types';
import {
  Heart,
  Zap,
  FolderSync,
  Terminal,
  ShieldCheck,
  CheckCircle2,
  Coins,
  ArrowRight,
  Sparkles,
  ChevronRight,
  Share2,
  Clock,
  Layers,
  HelpCircle,
  Laptop,
  Check,
  Phone,
  Mail,
  MessageCircle,
  Building2,
  HardDrive,
  Send,
  Cpu,
  Headphones,
  FileText,
  Flame,
} from 'lucide-react';
import { downloadFile, generateBatScript } from '../utils/batGenerator';
import { downloadExportWithWorker } from '../utils/batWorkerExport';

interface LandingPageProps {
  onOpenAuth: (mode: 'login' | 'signup' | 'admin') => void;
  onOpenBuyPoints: () => void;
  onOpenCreateEvent: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenAuth,
  onOpenBuyPoints,
  onOpenCreateEvent,
}) => {
  const { currentUser, events, navigateTo, adminSettings } = useApp();

  // Dynamic pricing auto-calculation based on admin settings
  const minStartingRate =
    adminSettings.pricingPackages.length > 0
      ? Math.min(...adminSettings.pricingPackages.map((p) => p.priceRupees))
      : 110;

  const basePricePerPoint =
    adminSettings.pricingPackages.find((p) => p.points === 1)?.priceRupees ||
    (adminSettings.pricingPackages[0]?.priceRupees / adminSettings.pricingPackages[0]?.points) ||
    110;

  // Demo interactive state on landing page
  const [demoSelected, setDemoSelected] = useState<Record<string, boolean>>({
    'demo-1': true,
    'demo-2': true,
  });

  const demoPhotos = [
    {
      id: 'demo-1',
      name: 'DSC_4011.JPG',
      folder: 'Haldi',
      url: 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=600&q=75',
    },
    {
      id: 'demo-2',
      name: 'DSC_5101.JPG',
      folder: 'Sangeet',
      url: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=600&q=75',
    },
    {
      id: 'demo-3',
      name: 'DSC_6201.JPG',
      folder: 'Wedding',
      url: 'https://images.unsplash.com/photo-1591604466107-ec97de577aff?auto=format&fit=crop&w=600&q=75',
    },
    {
      id: 'demo-4',
      name: 'DSC_7301.JPG',
      folder: 'Reception',
      url: 'https://images.unsplash.com/photo-1469371670807-013ccf25f16a?auto=format&fit=crop&w=600&q=75',
    },
  ];

  const toggleDemoHeart = (id: string) => {
    setDemoSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const sampleEvent = events[0];

  const handleDownloadDemoBat = () => {
    const selectedDemoItems = demoPhotos.filter((p) => demoSelected[p.id]);
    const mockDemoEvent: WeddingEvent = {
      id: 'evt-demo',
      slug: 'sample-wedding',
      title: 'Sample Wedding Showcase',
      coupleName: 'Aarav & Priya',
      clientPhone: '+91 98765 43210',
      photographerId: 'demo',
      studioName: 'Royal Shutter Studios',
      status: 'completed',
      eventDate: '2026-10-18',
      deadlineDate: '2026-10-30',
      folders: [
        { id: 'f1', name: 'Haldi', visible: true, order: 0 },
        { id: 'f2', name: 'Sangeet', visible: true, order: 1 },
        { id: 'f3', name: 'Wedding', visible: true, order: 2 },
        { id: 'f4', name: 'Reception', visible: true, order: 3 },
      ],
      photos: selectedDemoItems.map((p) => ({
        id: p.id,
        filename: p.name,
        originalName: p.name,
        folderId: p.folder,
        folderName: p.folder,
        url: p.url,
        isSelected: true,
        uploadedAt: new Date().toISOString(),
      })),
      createdAt: new Date().toISOString(),
    };

    downloadExportWithWorker('GENERATE_BAT', mockDemoEvent)
      .catch(() => {
        const batContent = generateBatScript(mockDemoEvent);
        downloadFile(batContent, `A1_Copy_Interactive_Demo.bat`, 'text/plain');
      });
  };

  return (
    <div className="relative overflow-hidden">
      {/* Hero Section */}
      <section className="relative pt-12 pb-20 sm:pt-20 sm:pb-28">
        {/* Glow gradients */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[450px] bg-gradient-to-tr from-amber-600/20 via-amber-500/15 to-transparent rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto">
            {/* AI Powered & AI Integrated Tag */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-amber-500/15 via-purple-500/15 to-emerald-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold mb-6 shadow-sm">
              <span className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-neutral-950 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 shadow-sm">
                <Sparkles className="w-3 h-3 fill-neutral-950" />
                AI Powered
              </span>
              <span className="text-neutral-200">⚡ AI Integrated Smart Architecture</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-extrabold font-heading tracking-tight leading-[1.15] text-white">
              Smartest Photo Selection Tool{' '}
              <span className="bg-gradient-to-r from-amber-400 via-amber-300 to-amber-200 bg-clip-text text-transparent font-serif italic text-3xl sm:text-5xl">
                (Easy)
              </span>
            </h1>

            <p className="mt-6 text-base sm:text-lg text-neutral-300 leading-relaxed font-normal max-w-2xl mx-auto">
              Na WhatsApp par photo numbers lene ka jhanjhat, na Google Drive ke slow links. Select photo like watching Instagram status.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5">
              {currentUser ? (
                <button
                  onClick={() => navigateTo('dashboard')}
                  className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300 hover:from-amber-400 hover:to-amber-200 text-neutral-950 font-extrabold text-base rounded-2xl shadow-xl shadow-amber-500/25 transition-all hover:scale-105 flex items-center justify-center gap-2"
                >
                  <span>Go to Studio Dashboard</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={() => onOpenAuth('signup')}
                  className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300 hover:from-amber-400 hover:to-amber-200 text-neutral-950 font-extrabold text-base rounded-2xl shadow-xl shadow-amber-500/25 transition-all hover:scale-105 flex items-center justify-center gap-2"
                >
                  <span>Create Studio Account</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              )}

              {sampleEvent && (
                <button
                  onClick={() => navigateTo('client-gallery', sampleEvent.id)}
                  className="w-full sm:w-auto px-6 py-4 bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-700/80 text-white font-semibold text-base rounded-2xl transition-all flex items-center justify-center gap-2"
                >
                  <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
                  <span>Try Client Gallery Demo</span>
                </button>
              )}
            </div>

            {/* Micro value props with auto-calculated rates */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-neutral-400">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>No Storage Needed (Safe on PC)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>
                  {adminSettings.pointsPerEvent || 1} Event = {adminSettings.pointsPerEvent || 1} Point
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>8 Hours WhatsApp Helpdesk</span>
              </div>
            </div>
          </div>

          {/* Interactive Interactive Preview Card */}
          <div className="mt-14 max-w-4xl mx-auto bg-neutral-900/90 border border-neutral-800 rounded-3xl p-5 sm:p-7 shadow-2xl backdrop-blur-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wider font-semibold text-amber-400">
                    Interactive Live Demo
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                </div>
                <h3 className="text-xl font-bold font-heading text-white">
                  Try Tapping The Hearts (❤️) Below:
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <div className="px-3.5 py-1.5 bg-neutral-950 rounded-xl border border-neutral-800 text-xs font-mono font-bold text-amber-300">
                  {Object.values(demoSelected).filter(Boolean).length} of 4 Selected
                </div>
                <button
                  onClick={handleDownloadDemoBat}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 shadow"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  Test Auto-Copy Demo
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 pt-5">
              {demoPhotos.map((photo) => {
                const isLiked = !!demoSelected[photo.id];
                return (
                  <div
                    key={photo.id}
                    onClick={() => toggleDemoHeart(photo.id)}
                    className={`group relative rounded-2xl overflow-hidden aspect-[4/5] cursor-pointer transition-all duration-300 border-2 select-none ${
                      isLiked
                        ? 'border-rose-500 ring-2 ring-rose-500/20 scale-[0.99]'
                        : 'border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <img
                      src={photo.url}
                      alt={photo.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />

                    {/* Folder Badge */}
                    <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-semibold text-neutral-300 uppercase tracking-wider">
                      {photo.folder}
                    </div>

                    {/* Heart Button */}
                    <button
                      type="button"
                      className={`absolute top-2.5 right-2.5 w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                        isLiked
                          ? 'bg-rose-500 text-white scale-110 shadow-lg shadow-rose-500/50'
                          : 'bg-black/50 text-white hover:bg-black/70 hover:scale-105'
                      }`}
                    >
                      <Heart
                        className={`w-5 h-5 transition-transform ${
                          isLiked ? 'fill-white stroke-white scale-110' : 'stroke-white'
                        }`}
                      />
                    </button>

                    {/* Filename */}
                    <div className="absolute bottom-2.5 left-2.5 right-2.5">
                      <p className="text-[11px] font-mono text-neutral-200 truncate font-semibold">
                        {photo.name}
                      </p>
                      <p className="text-[10px] text-amber-400">
                        {isLiked ? '✓ Selected for Album' : 'Tap to select'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Key Benefits / Khaas Fayde Section */}
      <section className="py-16 sm:py-24 bg-gradient-to-b from-neutral-950 via-neutral-900/40 to-neutral-950 border-t border-neutral-800/80 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Photographers Ke Zaroori Fayde</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-extrabold font-heading text-white">
              Kyun Hai Ye Sabse Best?
            </h2>
            <p className="text-sm sm:text-base text-neutral-400 mt-3">
              Wedding season mein bina kisi headache ke photos select karwayein aur ghanto ka time bachayein.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* 1. No Storage Need */}
            <div className="p-6 rounded-3xl bg-neutral-900/80 border border-neutral-800 hover:border-amber-500/50 transition-all hover:scale-[1.02] group shadow-lg">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 group-hover:rotate-6 transition-transform">
                <HardDrive className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white font-heading">
                No Storage Needed
              </h3>
              <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                Aapki original RAW & High-Res photos aapke hi computer/hard drive mein safe rehti hain. Google Drive ya cloud storage ka koi extra kharch nahi!
              </p>
            </div>

            {/* 2. No Photo Transfer Headache */}
            <div className="p-6 rounded-3xl bg-neutral-900/80 border border-neutral-800 hover:border-amber-500/50 transition-all hover:scale-[1.02] group shadow-lg">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4 group-hover:rotate-6 transition-transform">
                <Send className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white font-heading">
                No Photo Transfer Headache
              </h3>
              <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                Client ko 50GB-100GB data bhejne, WeTransfer link expire hone ya pendrive courier karne ka jhanjhat hamesha ke liye khatam.
              </p>
            </div>

            {/* 3. No Big Files Photo Upload */}
            <div className="p-6 rounded-3xl bg-neutral-900/80 border border-neutral-800 hover:border-amber-500/50 transition-all hover:scale-[1.02] group shadow-lg">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 mb-4 group-hover:rotate-6 transition-transform">
                <Cpu className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white font-heading">
                No Big Files Upload
              </h3>
              <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                Browser mein hi instant lightweight previews bante hain. Ghanto ka heavy upload ab sirf 1-2 minute mein fast finish ho jata hai.
              </p>
            </div>

            {/* 4. Zero Crashes */}
            <div className="p-6 rounded-3xl bg-neutral-900/80 border border-neutral-800 hover:border-amber-500/50 transition-all hover:scale-[1.02] group shadow-lg">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 group-hover:rotate-6 transition-transform">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white font-heading">
                Zero Crashes (100% Smooth)
              </h3>
              <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                Client chahe 3,000 photos dekhe ya 10,000 photos, gallery phone par 60FPS smooth chalti hai bina kisi crash ya hanging ke.
              </p>
            </div>

            {/* 5. 8 Hours Helpdesk on WhatsApp */}
            <div className="p-6 rounded-3xl bg-neutral-900/80 border border-neutral-800 hover:border-emerald-500/50 transition-all hover:scale-[1.02] group shadow-lg">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 group-hover:rotate-6 transition-transform">
                <Headphones className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white font-heading">
                8 Hours WhatsApp Help Desk
              </h3>
              <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                Customer support dedicated WhatsApp Help Desk par available hai. Points recharge, setup ya guidance ke liye quick instant reply.
              </p>
            </div>

            {/* 6. 1-Click Auto Copy System */}
            <div className="p-6 rounded-3xl bg-neutral-900/80 border border-neutral-800 hover:border-amber-500/50 transition-all hover:scale-[1.02] group shadow-lg">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 group-hover:rotate-6 transition-transform">
                <Terminal className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white font-heading">
                1-Click Auto Copier
              </h3>
              <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                Client submit karte hi instant auto-copy script milti hai. Double click karte hi selected photos second bhar mein alag folder mein copy ho jaati hain.
              </p>
            </div>

            {/* 7. Instant Lightroom Filter Code */}
            <div className="p-6 rounded-3xl bg-neutral-900/80 border border-neutral-800 hover:border-purple-500/50 transition-all hover:scale-[1.02] group shadow-lg">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-4 group-hover:rotate-6 transition-transform">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white font-heading">
                Lightroom Search Code
              </h3>
              <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                Lightroom users ke liye 1-click filename search string milti hai. Search box mein paste karte hi selected photos filter ho jaati hain.
              </p>
            </div>

            {/* 8. Smart Album Sheet Estimator */}
            <div className="p-6 rounded-3xl bg-neutral-900/80 border border-neutral-800 hover:border-rose-500/50 transition-all hover:scale-[1.02] group shadow-lg">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4 group-hover:rotate-6 transition-transform">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white font-heading">
                Album Sheet Estimator
              </h3>
              <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                Client ko live estimate milta hai ki kitni photos par album ke kitne pages banenge. Studio owner formula khud customize kar sakta hai.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works / Workflow Section */}
      <section id="workflow" className="py-20 bg-neutral-950/60 border-t border-neutral-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs uppercase font-bold text-amber-400 tracking-wider">
              Step-by-Step Architecture
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold font-heading text-white mt-2">
              Working
            </h2>
            <p className="text-sm text-neutral-400 mt-2">
              Wedding photographers aur unke clients ke liye duniya ka sabse aasan workflow.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-7 relative group hover:border-amber-500/50 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-extrabold text-xl font-mono mb-5">
                01
              </div>
              <h3 className="text-lg font-bold text-white mb-2 font-heading">
                Folder Upload (1 Point)
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed mb-4">
                Photographer naya event banata hai (1 point lagta hai). Ceremony, Haldi, Reception
                folders drag & drop karta hai. Sirf compressed preview jata hai, original high-res photos
                aapke computer pe hi safe rehti hain.
              </p>
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                <FolderSync className="w-4 h-4" />
                <span>Auto-watermark & compress</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-7 relative group hover:border-amber-500/50 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 font-extrabold text-xl font-mono mb-5">
                02
              </div>
              <h3 className="text-lg font-bold text-white mb-2 font-heading">
                Client Heart (❤️) Tap
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed mb-4">
                Client ko direct WhatsApp link milta hai. Bina kisi password ya app download ke,
                wo phone par photos dekhte hain, heart tap karke album ke liye select karte hain.
                Live counter dikhta hai kitni photos select hui hain.
              </p>
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-400">
                <Heart className="w-4 h-4 fill-rose-400" />
                <span>Zero login friction for client</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-7 relative group hover:border-amber-500/50 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-extrabold text-xl font-mono mb-5">
                03
              </div>
              <h3 className="text-lg font-bold text-white mb-2 font-heading">
                Instant 1-Click Copy
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed mb-4">
                Client jaise hi finish karta hai, photographer ko notification milta hai. Photographer
                1 click mein automated copy script download karta hai, original photos wale folder mein daal kar
                double-click karta hai, aur sabhi selected photos automatically alag folder mein copy ho jaati hain!
              </p>
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <Terminal className="w-4 h-4" />
                <span>Instant automated file copying</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing / Points Section */}
      <section id="pricing" className="py-20 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold mb-3">
              <Coins className="w-3.5 h-3.5" />
              <span>Simple Points Model</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold font-heading text-white">
              Pay Only When You Have a Wedding
            </h2>
            <p className="text-sm text-neutral-400 mt-2">
              Koi monthly recurring charges nahi. Har event banane ke liye sirf {adminSettings.pointsPerEvent || 1} point lagta hai.
              Client ke liye 100% Free!
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {adminSettings.pricingPackages.map((pkg) => {
              const perEventCost = Math.round(pkg.priceRupees / Math.max(1, pkg.points));
              const autoSavings = Math.max(0, (basePricePerPoint * pkg.points) - pkg.priceRupees);

              return (
                <div
                  key={pkg.id}
                  className={`relative bg-neutral-900 border rounded-3xl p-7 flex flex-col justify-between transition-all ${
                    pkg.isPopular
                      ? 'border-amber-500 ring-2 ring-amber-500/30 shadow-2xl shadow-amber-500/10 scale-105'
                      : 'border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  {pkg.isPopular ? (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 text-xs font-extrabold uppercase tracking-wider px-3 py-1 rounded-full shadow">
                      {pkg.savingsText || (autoSavings > 0 ? `Save ₹${autoSavings} 🔥` : 'Best Value 🔥')}
                    </div>
                  ) : autoSavings > 0 ? (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-neutral-800 text-emerald-400 border border-emerald-500/30 text-xs font-bold px-3 py-0.5 rounded-full shadow">
                      Save ₹{autoSavings}
                    </div>
                  ) : null}

                  <div>
                    <h3 className="text-lg font-bold text-white font-heading">{pkg.name}</h3>
                    <p className="text-xs text-neutral-400 mt-1">{pkg.tagline}</p>

                    <div className="my-5">
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-extrabold text-white">
                          ₹{pkg.priceRupees.toLocaleString('en-IN')}
                        </span>
                        <span className="text-xs text-neutral-400">/ one-time</span>
                      </div>
                      <div className="text-xs text-emerald-400 font-semibold mt-1 flex items-center gap-1.5">
                        <span>⚡ ₹{perEventCost} per event</span>
                        {autoSavings > 0 && (
                          <span className="text-[11px] text-amber-300 font-mono">
                            (Save ₹{autoSavings})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-3 bg-neutral-950 rounded-2xl border border-neutral-800 mb-6">
                      <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                        <Coins className="w-4 h-4" />
                        <span>{pkg.points} Points Included</span>
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-1">
                        {Math.floor(pkg.points / (adminSettings.pointsPerEvent || 1))} Full Wedding Events create kar sakte hain.
                      </div>
                    </div>

                  <ul className="space-y-2.5 text-xs text-neutral-300">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>Unlimited photo preview uploads</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>Automated 1-Click copy script & Lightroom export</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>Lightroom search code export</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>Custom Studio Watermark</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>Points Never Expire</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (currentUser) {
                      onOpenBuyPoints();
                    } else {
                      onOpenAuth('signup');
                    }
                  }}
                  className={`w-full mt-8 py-3 px-4 rounded-xl font-bold text-xs transition-all ${
                    pkg.isPopular
                      ? 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-neutral-950 shadow-lg shadow-amber-500/20'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-white'
                  }`}
                >
                  {currentUser ? `Buy ${pkg.points} Points` : 'Signup & Buy Points'}
                </button>
              </div>
            );
          })}
          </div>

          {/* Points rule callout */}
          <div className="mt-12 p-4 max-w-2xl mx-auto bg-neutral-900/80 border border-neutral-800 rounded-2xl flex items-center justify-between gap-4 text-xs text-neutral-400">
            <div>
              <span className="font-semibold text-neutral-200">Rule Summary:</span> Naye
              photographer signup par balance <span className="text-white font-mono">0 Points</span>{' '}
              hota hai. Naya event = 1 point. Deadline 30 din extend = 1 point.
            </div>
            <button
              onClick={() => onOpenAuth('admin')}
              className="text-neutral-500 hover:text-amber-400 font-medium whitespace-nowrap"
            >
              Admin Login →
            </button>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 bg-neutral-950/60 border-t border-neutral-800/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-extrabold font-heading text-white">
              Aksar Pooche Jaane Wale Sawaal (FAQ)
            </h2>
            <p className="text-sm text-neutral-400 mt-2">
              A1 Smart Selection ke baare mein zaroori jankari
            </p>
          </div>

          <div className="space-y-4">
            <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-2xl">
              <h4 className="text-sm font-bold text-white mb-2">
                1. Kya meri original High-Resolution photos server pe upload hoti hain?
              </h4>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Nahi! Browser aapke computer par hi preview ko lightweight aur watermarked banata hai.
                Aapki original 30MB-50MB ki high-res RAW/JPEG photos aapke hi computer/hard drive mein
                rehti hain. Server pe sirf fast preview jata hai taaki client bina lag ke photos dekh sake.
              </p>
            </div>

            <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-2xl">
              <h4 className="text-sm font-bold text-white mb-2">
                2. Auto-copy script kaise kaam karti hai?
              </h4>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Jab client selection complete kar leta hai, toh aapko ek instant automated script milti hai.
                Aap us script ko apne original photos wale folder mein daalte hain aur double-click karte hain.
                Wo script automatically selected photo filenames dhoondhti hai aur unhe "Selected_Photos"
                folder mein copy kar deti hai. 2 ghante ka manual selection kaam 5 second mein ho jaata hai!
              </p>
            </div>

            <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-2xl">
              <h4 className="text-sm font-bold text-white mb-2">
                3. Kya Client ko koi software ya app download karni padegi?
              </h4>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Bilkul nahi! Client WhatsApp link par click karta hai aur seedha phone ke browser
                (Chrome, Safari) mein gallery open ho jaati hai bina kisi login ya registration ke.
              </p>
            </div>

            <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-2xl">
              <h4 className="text-sm font-bold text-white mb-2">
                4. Naye photographer account mein starting mein kitne points milte hain?
              </h4>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Starting mein har naye photographer ke 0 points hote hain. Aap apni zaroorat ke anusaar
                1 point (₹110), 5 points (₹520) ya 20 points (₹1,990) UPI se recharge kar sakte hain.
                Admin chahe toh admin portal se free points bhi add kar sakta hai.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Comprehensive Business & Founder Trust Section */}
      <footer className="border-t border-neutral-800 bg-neutral-950 text-neutral-400 text-xs pt-16 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {/* Top Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 pb-10 border-b border-neutral-800/80">
            {/* Col 1: Brand & Association */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-heading font-extrabold text-white text-lg">
                  A1 Smart Selection
                </span>
                <span className="text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded">
                  PRO
                </span>
              </div>
              <p className="text-neutral-400 text-xs leading-relaxed">
                India's fastest wedding photo selection & automated sorting platform for professional photographers.
              </p>
              <div className="pt-2">
                <div className="text-[11px] text-neutral-500 uppercase tracking-wider font-semibold">
                  Associated by:
                </div>
                <div className="text-sm font-extrabold text-white font-heading mt-0.5">
                  NEPOLIAN CINEMATIC STUDIO
                </div>
                <div className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold mt-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Est: From 2018 (Trusted Payment)</span>
                </div>
              </div>
            </div>

            {/* Col 2: Leadership & Founder */}
            <div className="space-y-3">
              <h4 className="text-xs uppercase tracking-wider font-bold text-neutral-200">
                Leadership & Vision
              </h4>
              <div className="p-3.5 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-neutral-500">
                    Pro Founder
                  </span>
                  <div className="text-base font-extrabold text-amber-400 font-heading">
                    Goldan Patel
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Founder & Creative Director at Nepolian Cinematic Studio. Serving wedding photographers across India since 2018.
                  </p>
                </div>
              </div>
            </div>

            {/* Col 3: Customer Support & WhatsApp Help */}
            <div className="space-y-3">
              <h4 className="text-xs uppercase tracking-wider font-bold text-neutral-200">
                Customer Support & Help Desk
              </h4>
              <p className="text-[11px] text-neutral-400">
                Koi bhi problem, points recharge query ya custom features ke liye turant sampark karein:
              </p>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-neutral-300">
                  <MessageCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>Support: </span>
                  <a
                    href="https://wa.me/917970641503?text=Namaste%20Goldan%20ji,%20mujhe%20A1%20Smart%20Selection%20ke%20bare%20mein%20sahayata%20chahiye."
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-emerald-400 hover:text-emerald-300"
                  >
                    WhatsApp Help Desk
                  </a>
                </div>
                <div className="flex items-center gap-2 text-neutral-300">
                  <Mail className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <a
                    href="mailto:nepoliancinematicstudio@gmail.com"
                    className="text-neutral-300 hover:text-white truncate"
                  >
                    nepoliancinematicstudio@gmail.com
                  </a>
                </div>
              </div>
              <a
                href="https://wa.me/917970641503?text=Namaste%20Goldan%20ji,%20mujhe%20A1%20Smart%20Selection%20ke%20bare%20mein%20sahayata%20chahiye."
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 transition-all"
              >
                <MessageCircle className="w-4 h-4 fill-white" />
                <span>WhatsApp Help Desk</span>
              </a>
            </div>

            {/* Col 4: Our Other Brands */}
            <div className="space-y-3">
              <h4 className="text-xs uppercase tracking-wider font-bold text-neutral-200">
                Our Other Brands
              </h4>
              <p className="text-[11px] text-neutral-400">
                Nepolian Cinematic Studio Group of Creative Ventures:
              </p>
              <div className="space-y-1.5">
                <div className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">NCS Studio</span>
                  <span className="text-[10px] text-neutral-500 font-mono">Cinematography</span>
                </div>
                <div className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">A1 Flip Book</span>
                  <span className="text-[10px] text-neutral-500 font-mono">Album Design</span>
                </div>
                <div className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">A1 Designing Agency</span>
                  <span className="text-[10px] text-neutral-500 font-mono">Creative Media</span>
                </div>
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs">
                  <span className="font-bold text-amber-300">A1 Smart Selection</span>
                  <span className="text-[10px] text-amber-400 font-mono">Photo Selection</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
            <div className="text-neutral-500 text-center sm:text-left">
              © 2018–2026 <strong className="text-neutral-300">NEPOLIAN CINEMATIC STUDIO</strong>. All rights reserved. Founded by <strong className="text-amber-400">Goldan Patel</strong>.
            </div>

            <div className="flex items-center gap-6">
              <button
                onClick={() => onOpenAuth('login')}
                className="hover:text-white transition-colors"
              >
                Photographer Login
              </button>
              <button
                onClick={() => onOpenAuth('signup')}
                className="hover:text-white transition-colors"
              >
                New Studio Signup
              </button>
              <button
                onClick={() => onOpenAuth('admin')}
                className="hover:text-amber-400 transition-colors flex items-center gap-1"
              >
                Admin Portal
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
