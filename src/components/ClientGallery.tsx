import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  Heart,
  Calendar,
  Clock,
  Sparkles,
  Share2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
  MessageCircle,
  ArrowLeft,
  Check,
  Filter,
  Eye,
  Camera,
  BookOpen,
  Music,
  Wifi,
  WifiOff,
  ShieldCheck,
  Instagram,
  PhoneCall,
  Image as ImageIcon,
} from 'lucide-react';
import { DynamicSecurityWatermark } from './DynamicSecurityWatermark';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { getClientGalleryUrl } from '../utils/domainConfig';

export const ClientGallery: React.FC = () => {
  const { activeEvent, users, togglePhotoSelection, submitClientSelection, showToast, navigateTo } = useApp();

  const [activeFolderId, setActiveFolderId] = useState<string>('all');
  const [filterMode, setFilterMode] = useState<'all' | 'selected' | 'unselected'>('all');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(activeEvent?.status === 'completed');
  const [clientNotes, setClientNotes] = useState(activeEvent?.clientNotes || '');
  const [copiedLink, setCopiedLink] = useState(false);

  // Offline Mode & Slow Network Auto-Saver
  const { isOnline, pendingCount, isSyncing, enqueuePhotoSync } = useOfflineSync(showToast);

  // Find photographer for 100% white-label branding
  const photographer = activeEvent
    ? users.find((u) => u.id === activeEvent.photographerId)
    : undefined;

  useEffect(() => {
    if (activeEvent?.status === 'completed') {
      setIsSubmitted(true);
    }
  }, [activeEvent?.status]);

  // Anti-Theft Security: Disable Right-Click, Image Dragging & Print/Save Shortcuts
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      showToast('🛡️ Selection Preview Protected • Direct downloading is disabled by studio.', 'info');
    };

    const handleDragStart = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'p')) {
        e.preventDefault();
        showToast('🛡️ Page saving and printing is disabled for preview protection.', 'info');
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('dragstart', handleDragStart);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('dragstart', handleDragStart);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showToast]);

  // Filter visible folders only
  const allPhotos = activeEvent?.photos || [];
  const allFolders = activeEvent?.folders || [];

  const effectiveFolders = useMemo(() => {
    if (allFolders.length > 0) return allFolders;
    if (allPhotos.length === 0) return [];
    const folderNames = Array.from(new Set(allPhotos.map((p) => (p.folderName || 'Photos').trim())));
    return folderNames.map((name, idx) => ({
      id: `fld-auto-${idx}-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      visible: true,
      order: idx,
    }));
  }, [allFolders, allPhotos]);

  const visibleFolders = effectiveFolders.filter((f) => f.visible !== false);

  // Filtered photos
  const filteredPhotos = useMemo(() => {
    return allPhotos.filter((photo) => {
      // Folder filter
      if (activeFolderId !== 'all') {
        const matchesId = photo.folderId === activeFolderId;
        const matchedFld = visibleFolders.find((f) => f.id === activeFolderId);
        const matchesName = matchedFld && photo.folderName && photo.folderName.toLowerCase().trim() === matchedFld.name.toLowerCase().trim();
        if (!matchesId && !matchesName) return false;
      }
      // Status filter
      if (filterMode === 'selected' && !photo.isSelected) return false;
      if (filterMode === 'unselected' && photo.isSelected) return false;
      return true;
    });
  }, [allPhotos, activeFolderId, filterMode, visibleFolders]);

  const selectedCount = allPhotos.filter((p) => p.isSelected).length;
  const maxLimit = activeEvent?.maxSelectionLimit;
  const isLimitReached = !!maxLimit && selectedCount >= maxLimit;

  // Live Album Estimator (1 Sheet = 1 Page, e.g. 6 photos = 1 sheet)
  const photosPerSheet = activeEvent?.photosPerSheet || 6;
  const estimatedSheets = selectedCount > 0 ? Math.ceil(selectedCount / photosPerSheet) : 0;
  const estimatedPages = estimatedSheets; // 1 sheet = 1 page as requested

  // Live ticking countdown timer (Days, Hours, Minutes, Seconds)
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
  }>(() => {
    if (!activeEvent?.deadlineDate) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: false };
    }
    const deadlineTime = new Date(`${activeEvent.deadlineDate}T23:59:59`).getTime();
    const now = Date.now();
    const diff = Math.max(0, deadlineTime - now);
    return {
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
      seconds: Math.floor((diff % (1000 * 60)) / 1000),
      isExpired: diff <= 0,
    };
  });

  useEffect(() => {
    if (!activeEvent?.deadlineDate) return;
    const tick = () => {
      const deadlineTime = new Date(`${activeEvent.deadlineDate}T23:59:59`).getTime();
      const now = Date.now();
      const diff = deadlineTime - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
        return;
      }

      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
        isExpired: false,
      });
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [activeEvent?.deadlineDate]);

  // Keyboard navigation for Lightbox
  useEffect(() => {
    if (!activeEvent) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowRight' && lightboxIndex < filteredPhotos.length - 1) {
        setLightboxIndex(lightboxIndex + 1);
      }
      if (e.key === 'ArrowLeft' && lightboxIndex > 0) {
        setLightboxIndex(lightboxIndex - 1);
      }
      if (e.key === ' ' || e.key === 'h' || e.key === 'H') {
        const photo = filteredPhotos[lightboxIndex];
        if (photo) {
          togglePhotoSelection(activeEvent.id, photo.id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, filteredPhotos, activeEvent?.id, togglePhotoSelection]);

  const handleFinishSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEvent) return;
    submitClientSelection(activeEvent.id, clientNotes);
    setIsSubmitted(true);
    setShowFinishModal(false);
  };

  const handleWhatsAppPhotographer = () => {
    if (!activeEvent) return;
    const text = encodeURIComponent(
      `Namaste! Humne "${activeEvent.title}" ke photos ki selection complete kar li hai (Total: ${selectedCount} photos selected).\n\nNotes: ${clientNotes || 'Sabhi selected photos album ke liye final hain.'}\n\nKripya check karke confirmation dein. Dhanyawaad!`
    );
    const targetPhone = (activeEvent.studioPhone || activeEvent.clientPhone || '').replace(/[^0-9]/g, '');
    const waUrl = targetPhone ? `https://wa.me/${targetPhone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleShareGallery = () => {
    if (!activeEvent) return;
    const url = getClientGalleryUrl(activeEvent.slug || activeEvent.id);
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    showToast('🔗 Gallery link copied! Share with family or partner.', 'success');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Calculate days left
  const daysLeft = useMemo(() => {
    if (!activeEvent?.deadlineDate) return 0;
    const deadline = new Date(activeEvent.deadlineDate).getTime();
    const now = new Date().getTime();
    const diff = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }, [activeEvent?.deadlineDate]);

  if (!activeEvent) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4 text-center">
        <div className="max-w-md p-8 bg-neutral-900 border border-neutral-800 rounded-3xl shadow-xl">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-4">
            <Camera className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Private Client Gallery</h2>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Aapka wedding event link filhaal available nahi hai ya complete ho chuka hai. Kripya apne studio/photographer se contact karein.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 pb-28">
      {/* Interactive Demo Mode Top Banner */}
      {activeEvent.id === 'demo-sample-event' && (
        <div className="bg-gradient-to-r from-amber-500/20 via-amber-400/10 to-amber-500/20 border-b border-amber-500/40 px-4 py-3 sticky top-0 z-50 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-center gap-2 mx-auto sm:mx-0">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            </span>
            <span>
              <strong>Client Gallery Interactive Demo:</strong> Keval 4 sample photos showcase (Haldi, Sangeet, Wedding, Reception). Photo par Heart ❤️ tap karein selection test karne ke liye!
            </span>
          </div>
          <button
            onClick={() => navigateTo('landing')}
            className="mx-auto sm:mx-0 px-3.5 py-1.5 bg-amber-500 text-neutral-950 font-bold rounded-xl text-xs hover:bg-amber-400 transition shadow"
          >
            ← Back to Home
          </button>
        </div>
      )}

      {/* Hero Header */}
      <div className="relative py-12 px-4 sm:px-6 lg:px-8 text-center border-b border-neutral-800/80 bg-gradient-to-b from-neutral-900/80 to-neutral-950">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold mb-3">
            <Camera className="w-3.5 h-3.5" />
            <span>Captured by {activeEvent.studioName}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold font-heading text-white tracking-tight">
            {activeEvent.coupleName}
          </h1>
          <p className="text-sm sm:text-base text-neutral-400 mt-1.5 font-medium">
            {activeEvent.title}
          </p>

          {/* Live Countdown Timer */}
          <div className="flex items-center justify-center gap-3 mt-4 text-xs">
            {/* Live Ticking Countdown Box */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-neutral-900 border border-amber-500/40 text-amber-300 font-mono shadow-md">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              {timeLeft.isExpired ? (
                <span className="text-rose-400 font-bold font-sans">Deadline Expired</span>
              ) : (
                <span className="flex items-center gap-1 font-bold">
                  <span>Time Left:</span>
                  <span className="text-white bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800">
                    {String(timeLeft.days).padStart(2, '0')}d
                  </span>
                  <span>:</span>
                  <span className="text-white bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800">
                    {String(timeLeft.hours).padStart(2, '0')}h
                  </span>
                  <span>:</span>
                  <span className="text-white bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800">
                    {String(timeLeft.minutes).padStart(2, '0')}m
                  </span>
                  <span>:</span>
                  <span className="text-rose-400 bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800 animate-pulse">
                    {String(timeLeft.seconds).padStart(2, '0')}s
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* Instructions note */}
          <p className="mt-4 text-xs text-neutral-400 max-w-lg mx-auto bg-neutral-900/60 border border-neutral-800 rounded-2xl py-2 px-4">
            💡 Apni pasand ki photos par <span className="text-rose-400 font-bold">❤️ Heart</span> tap karein. Sabhi selections apne-aap save hoti rehti hain.
          </p>

          {/* Live Album Estimator Notice Banner (1 Sheet = 1 Page) */}
          <div className="mt-3 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-neutral-900/90 border border-amber-500/30 text-xs text-neutral-300 shadow">
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>
              Album Guide: <strong className="text-amber-300 font-mono">≈{photosPerSheet} Photos = 1 Sheet</strong> (1 Page)
            </span>
            {selectedCount > 0 && (
              <span className="text-neutral-400 font-medium hidden sm:inline">
                • Current: <strong className="text-white font-mono">{selectedCount}</strong> selected = <strong className="text-amber-300 font-mono">~{estimatedSheets} Sheets ({estimatedPages} Pages)</strong>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Sticky Selection Counter Bar */}
      <div className="sticky top-0 z-30 bg-neutral-950/90 backdrop-blur-xl border-b border-neutral-800 px-4 py-3 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Left: Counter, Quota, Live Countdown & Live Album Estimator */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 w-full sm:w-auto justify-between sm:justify-start">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-500">
                <Heart className="w-4 h-4 fill-rose-500" />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1">
                  <span>{selectedCount}</span>
                  {maxLimit && <span className="text-neutral-400">/ {maxLimit}</span>}
                  <span className="text-neutral-300 font-normal">Selected</span>
                </div>
                <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Auto-saved</span>
                </div>
              </div>
            </div>

            {/* Quota indicator bar */}
            {maxLimit && (
              <div className="w-24 sm:w-32 h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    selectedCount >= maxLimit
                      ? 'bg-rose-500'
                      : 'bg-gradient-to-r from-amber-400 to-rose-500'
                  }`}
                  style={{ width: `${Math.min(100, (selectedCount / maxLimit) * 100)}%` }}
                />
              </div>
            )}

            {/* Sticky Live Countdown Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs font-mono">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              {timeLeft.isExpired ? (
                <span className="text-rose-400 font-bold font-sans text-[11px]">Expired</span>
              ) : (
                <span className="text-amber-300 font-bold">
                  {timeLeft.days}d {timeLeft.hours}h {timeLeft.minutes}m {timeLeft.seconds}s
                </span>
              )}
            </div>

            {/* Live Album Sheet Estimator Badge (1 Sheet = 1 Page) */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900 border border-amber-500/30 text-xs shadow-sm">
              <BookOpen className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <div className="flex items-baseline gap-1.5">
                <span className="font-extrabold text-amber-300 font-mono">
                  ~{estimatedSheets} Sheets
                </span>
                <span className="text-[11px] text-neutral-400">
                  ({estimatedPages} Pages)
                </span>
                <span className="text-[10px] text-neutral-500 hidden lg:inline">
                  • {photosPerSheet} photos = 1 sheet
                </span>
              </div>
            </div>
          </div>

          {/* Right: Offline Status & Submit Button */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {/* Offline Auto-Saver Status Pill */}
            <div
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-mono flex items-center gap-1.5 border transition-all ${
                !isOnline
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30 animate-pulse'
                  : pendingCount > 0
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}
              title={!isOnline ? 'Offline mode active - saved locally' : 'Sync status'}
            >
              {!isOnline ? (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                  <span className="font-sans font-bold">Offline Saved</span>
                </>
              ) : pendingCount > 0 || isSyncing ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  <span>Syncing ({pendingCount})...</span>
                </>
              ) : (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden xl:inline">Cloud Synced</span>
                </>
              )}
            </div>

            <button
              onClick={handleShareGallery}
              className="px-3.5 py-2.5 rounded-xl font-bold text-xs bg-neutral-900 hover:bg-neutral-850 text-neutral-300 hover:text-white border border-neutral-800 flex items-center gap-1.5 transition-all cursor-pointer shadow"
              title="Copy gallery link to share with family or partner"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Share</span>
                </>
              )}
            </button>

            <button
              onClick={() => setShowFinishModal(true)}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all ${
                isSubmitted
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300 hover:from-amber-400 hover:to-amber-200 text-neutral-950 shadow-amber-500/20 hover:scale-105'
              }`}
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>{isSubmitted ? '✓ Selection Finished' : 'Finish & Submit'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Filter & Folders Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {/* Folders navigation tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => setActiveFolderId('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeFolderId === 'all'
                ? 'bg-amber-500 text-neutral-950 shadow'
                : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300'
            }`}
          >
            <span>All Folders</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                activeFolderId === 'all' ? 'bg-black/20 text-neutral-950 font-mono' : 'bg-neutral-800'
              }`}
            >
              {allPhotos.length}
            </span>
          </button>

          {visibleFolders.map((folder) => {
            const folderCount = allPhotos.filter((p) => p.folderId === folder.id).length;
            const folderSelected = allPhotos.filter(
              (p) => p.folderId === folder.id && p.isSelected
            ).length;
            const isCurrent = activeFolderId === folder.id;

            return (
              <button
                key={folder.id}
                onClick={() => setActiveFolderId(folder.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-2 ${
                  isCurrent
                    ? 'bg-amber-500 text-neutral-950 shadow'
                    : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300'
                }`}
              >
                <span>{folder.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    isCurrent ? 'bg-black/20 text-neutral-950' : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {folderSelected > 0 ? `❤️ ${folderSelected}/` : ''}
                  {folderCount}
                </span>
              </button>
            );
          })}
        </div>

        {/* Status Filters: All / Selected / Unselected */}
        <div className="flex items-center justify-between mt-4 pb-2 border-b border-neutral-800">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-neutral-400 hidden sm:inline">Filter:</span>
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                filterMode === 'all'
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              All Photos ({allPhotos.length})
            </button>
            <button
              onClick={() => setFilterMode('selected')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1 ${
                filterMode === 'selected'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'text-neutral-400 hover:text-rose-400'
              }`}
            >
              <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
              <span>Selected Only ({selectedCount})</span>
            </button>
            <button
              onClick={() => setFilterMode('unselected')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                filterMode === 'unselected'
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Unselected ({allPhotos.length - selectedCount})
            </button>
          </div>

          <div className="text-xs text-neutral-500">
            Showing {filteredPhotos.length} photos
          </div>
        </div>

        {/* Photo Gallery Grid */}
        {filteredPhotos.length === 0 ? (
          allPhotos.length === 0 && (activeEvent.photosCount || 0) > 0 ? (
            <div className="text-center py-20 bg-neutral-900/30 rounded-3xl border border-neutral-800/80 my-8">
              <Sparkles className="w-10 h-10 text-amber-400 animate-pulse mx-auto mb-3" />
              <p className="text-sm font-bold text-white mb-1">Loading Photos From Cloud...</p>
              <p className="text-xs text-neutral-400">
                Wedding photos are syncing from Cloud Firestore ({activeEvent.photosCount} photos).
              </p>
            </div>
          ) : (
            <div className="text-center py-20 bg-neutral-900/30 rounded-3xl border border-neutral-800/80 my-8">
              <Heart className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
              <p className="text-sm font-bold text-white mb-1">No Photos Found</p>
              <p className="text-xs text-neutral-400">
                {filterMode === 'selected'
                  ? 'Aapne is category mein abhi tak koi photo select nahi ki hai.'
                  : 'No photos in this folder.'}
              </p>
            </div>
          )
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-4 my-6">
            {filteredPhotos.map((photo, index) => {
              const isSelected = photo.isSelected;

              return (
                <div
                  key={photo.id}
                  onClick={() => setLightboxIndex(index)}
                  className={`group relative rounded-2xl overflow-hidden aspect-[4/5] bg-neutral-900 border-2 select-none cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? 'border-rose-500 ring-2 ring-rose-500/30 shadow-lg shadow-rose-500/10'
                      : 'border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  {(photo.thumbnailUrl || photo.url) ? (
                    <img
                      src={(photo.thumbnailUrl || photo.url) || undefined}
                      alt={photo.filename}
                      loading="lazy"
                      decoding="async"
                      onContextMenu={(e) => e.preventDefault()}
                      onDragStart={(e) => e.preventDefault()}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 select-none pointer-events-none"
                      style={{ WebkitTouchCallout: 'none' }}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-900 text-neutral-600">
                      <ImageIcon className="w-8 h-8 opacity-40 mb-1" />
                      <span className="text-[10px] font-mono text-neutral-500">{photo.filename}</span>
                    </div>
                  )}

                  {/* Studio Logo Watermark in Bottom-Right Corner Only */}
                  {photographer?.enableAntiScreenshot !== false && (
                    <DynamicSecurityWatermark
                      studioName={activeEvent.studioName}
                      clientPhone={activeEvent.clientPhone}
                    />
                  )}

                  {/* Gradient shadow */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

                  {/* Folder Tag */}
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-semibold text-neutral-300 z-20">
                    {photo.folderName}
                  </div>

                  {/* Big Heart Tap Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePhotoSelection(activeEvent.id, photo.id);
                      enqueuePhotoSync(activeEvent.id, photo.id, {
                        isSelected: !photo.isSelected,
                        selectedAt: !photo.isSelected ? new Date().toISOString() : undefined,
                      });
                    }}
                    className={`absolute top-2 right-2 w-10 h-10 rounded-full flex items-center justify-center transition-all z-20 ${
                      isSelected
                        ? 'bg-rose-500 text-white scale-110 shadow-lg shadow-rose-500/50'
                        : 'bg-black/60 text-white hover:bg-black/80 hover:scale-110'
                    }`}
                  >
                    <Heart
                      className={`w-5 h-5 transition-transform ${
                        isSelected ? 'fill-white stroke-white scale-110' : 'stroke-white'
                      }`}
                    />
                  </button>

                  {/* Fullscreen icon */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIndex(index);
                    }}
                    className="absolute bottom-10 right-2 p-1.5 rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all z-20"
                    title="Zoom Fullscreen"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Filename footer */}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                    <span className="text-[11px] font-mono text-white font-medium truncate drop-shadow">
                      {photo.filename}
                    </span>
                    {isSelected && (
                      <span className="text-[10px] text-rose-400 font-bold whitespace-nowrap">
                        ✓ Selected
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox / Zoom Modal */}
      {lightboxIndex !== null && filteredPhotos[lightboxIndex] && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between animate-in fade-in select-none">
          {/* Lightbox Topbar */}
          <div className="p-4 flex items-center justify-between text-white z-10 bg-gradient-to-b from-black/80 to-transparent">
            <div>
              <div className="text-sm font-mono font-bold">
                {filteredPhotos[lightboxIndex].filename}
              </div>
              <div className="text-xs text-neutral-400">
                {filteredPhotos[lightboxIndex].folderName} • Photo {lightboxIndex + 1} of{' '}
                {filteredPhotos.length}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Lightbox Heart Button */}
              <button
                type="button"
                onClick={() =>
                  togglePhotoSelection(activeEvent.id, filteredPhotos[lightboxIndex].id)
                }
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  filteredPhotos[lightboxIndex].isSelected
                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/40'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-white'
                }`}
              >
                <Heart
                  className={`w-4 h-4 ${
                    filteredPhotos[lightboxIndex].isSelected ? 'fill-white' : ''
                  }`}
                />
                <span>
                  {filteredPhotos[lightboxIndex].isSelected ? 'Selected (❤️)' : 'Tap to Select'}
                </span>
              </button>

              <button
                onClick={() => setLightboxIndex(null)}
                className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Lightbox Center Image View with Touch Swiping */}
          <div
            className="relative flex-1 flex items-center justify-center p-2 sm:p-4 overflow-hidden touch-pan-y"
            onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
            onTouchEnd={(e) => {
              if (touchStartX === null) return;
              const touchEndX = e.changedTouches[0].clientX;
              const diff = touchStartX - touchEndX;
              if (diff > 40 && lightboxIndex < filteredPhotos.length - 1) {
                setLightboxIndex(lightboxIndex + 1); // Swiped Left -> Forward
              } else if (diff < -40 && lightboxIndex > 0) {
                setLightboxIndex(lightboxIndex - 1); // Swiped Right -> Backward
              }
              setTouchStartX(null);
            }}
          >
            {/* Prev arrow (Desktop & Tablet) */}
            {lightboxIndex > 0 && (
              <button
                onClick={() => setLightboxIndex(lightboxIndex - 1)}
                className="absolute left-2 sm:left-6 p-3 sm:p-4 rounded-full bg-black/60 hover:bg-black/90 text-white backdrop-blur-md transition-all hover:scale-110 z-20 shadow-xl border border-white/10"
                title="Previous Photo (Left Arrow)"
              >
                <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7" />
              </button>
            )}

            <div className="relative max-h-[82vh] max-w-[95vw] overflow-hidden rounded-2xl shadow-2xl flex items-center justify-center">
              {filteredPhotos[lightboxIndex]?.url ? (
                <img
                  src={filteredPhotos[lightboxIndex].url}
                  alt={filteredPhotos[lightboxIndex].filename}
                  onContextMenu={(e) => e.preventDefault()}
                  onDragStart={(e) => e.preventDefault()}
                  className="max-h-[80vh] sm:max-h-[82vh] max-w-[94vw] object-contain rounded-2xl transition-all select-none"
                  style={{ WebkitTouchCallout: 'none' }}
                />
              ) : (
                <div className="p-12 text-center text-neutral-500">
                  <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">Image preview not available</p>
                </div>
              )}

              {/* Clean Studio Watermark in Bottom-Right Corner Only */}
              {photographer?.enableAntiScreenshot !== false && (
                <DynamicSecurityWatermark
                  studioName={activeEvent.studioName}
                  clientPhone={activeEvent.clientPhone}
                />
              )}
            </div>

            {/* Next arrow (Desktop & Tablet) */}
            {lightboxIndex < filteredPhotos.length - 1 && (
              <button
                onClick={() => setLightboxIndex(lightboxIndex + 1)}
                className="absolute right-2 sm:right-6 p-3 sm:p-4 rounded-full bg-black/60 hover:bg-black/90 text-white backdrop-blur-md transition-all hover:scale-110 z-20 shadow-xl border border-white/10"
                title="Next Photo (Right Arrow)"
              >
                <ChevronRight className="w-6 h-6 sm:w-7 sm:h-7" />
              </button>
            )}
          </div>

          {/* Lightbox Bottom Interactive Navigation Dock */}
          <div className="p-3 sm:p-4 bg-gradient-to-t from-black via-black/90 to-transparent flex flex-col sm:flex-row items-center justify-between gap-3 text-white z-10">
            {/* Mobile Navigation Controls */}
            <div className="flex items-center justify-center gap-3 w-full sm:w-auto">
              <button
                disabled={lightboxIndex === 0}
                onClick={() => setLightboxIndex(lightboxIndex - 1)}
                className="px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-800 disabled:opacity-40 text-xs font-semibold flex items-center gap-1 hover:bg-neutral-800"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Prev</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  togglePhotoSelection(activeEvent.id, filteredPhotos[lightboxIndex].id)
                }
                className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  filteredPhotos[lightboxIndex].isSelected
                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/50'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-white'
                }`}
              >
                <Heart
                  className={`w-4 h-4 ${
                    filteredPhotos[lightboxIndex].isSelected ? 'fill-white' : ''
                  }`}
                />
                <span>
                  {filteredPhotos[lightboxIndex].isSelected ? 'Selected (❤️)' : 'Tap to Select (❤️)'}
                </span>
              </button>

              <button
                disabled={lightboxIndex === filteredPhotos.length - 1}
                onClick={() => setLightboxIndex(lightboxIndex + 1)}
                className="px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-800 disabled:opacity-40 text-xs font-semibold flex items-center gap-1 hover:bg-neutral-800"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="text-[11px] text-neutral-400 font-mono text-center sm:text-right hidden sm:block">
              Swipe or use Arrow Keys: Next/Prev • Space: Heart • Esc: Close
            </div>
          </div>
        </div>
      )}

      {/* Floating Bottom Bar for Mobile Phone Experience */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-neutral-950/95 backdrop-blur-xl border-t border-neutral-800 p-3 shadow-2xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-rose-500/20 text-rose-500 flex items-center justify-center">
            <Heart className="w-4 h-4 fill-rose-500" />
          </div>
          <div>
            <div className="text-xs font-bold text-white font-mono">
              {selectedCount} {maxLimit ? `/ ${maxLimit}` : ''} Selected
            </div>
            <div className="text-[10px] text-amber-300 font-mono">
              ~{estimatedSheets} Sheets ({estimatedPages} Pages)
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowFinishModal(true)}
          disabled={selectedCount === 0}
          className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-extrabold text-xs rounded-xl shadow-lg disabled:opacity-50 flex items-center gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Finish & Submit</span>
        </button>
      </div>

      {/* Finish Selection Modal */}
      {showFinishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
            <button
              onClick={() => setShowFinishModal(false)}
              className="absolute top-5 right-5 text-neutral-400 hover:text-white p-2 rounded-xl hover:bg-neutral-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-500 mb-4">
              <Heart className="w-6 h-6 fill-rose-500" />
            </div>

            <h3 className="text-xl font-bold font-heading text-white mb-1">
              Confirm Photo Selection
            </h3>
            <p className="text-xs text-neutral-400 mb-4">
              Aapne total <span className="text-amber-400 font-bold">{selectedCount} photos</span>{' '}
              select kiye hain. Kya aap final submit karna chahte hain?
            </p>

            <form onSubmit={handleFinishSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Photographer ke liye Special Notes / Album Instructions (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Cover photo ke liye DSC_6201 best hai, ya koi editing request..."
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Estimated Album Size Display */}
              <div className="p-3.5 bg-neutral-950/80 rounded-2xl border border-amber-500/30 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-neutral-300 font-semibold">
                  <BookOpen className="w-4 h-4 text-amber-400" />
                  <span>Estimated Album Size:</span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-extrabold text-amber-300 text-sm">
                    ~{estimatedSheets} Sheets ({estimatedSheets} Pages)
                  </span>
                  <div className="text-[10px] text-neutral-500">
                    (1 Sheet = 1 Page • {photosPerSheet} photos = 1 sheet)
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-neutral-950/70 rounded-2xl border border-neutral-800 text-xs text-neutral-300 space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Photographer will be notified instantly</span>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Submit karne ke baad photographer aapki selected photos ko print/album design ke
                  liye extract kar lenge.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowFinishModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-neutral-800 text-xs font-bold text-neutral-400 hover:text-white"
                >
                  Keep Selecting
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-extrabold text-xs shadow-lg shadow-amber-500/20 hover:scale-105 transition-all"
                >
                  Yes, Finish & Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submission Success Screen */}
      {isSubmitted && !showFinishModal && (
        <div className="max-w-xl mx-auto my-8 p-6 bg-emerald-950/40 border border-emerald-500/40 rounded-3xl text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-emerald-200">
            Selection Submitted Successfully!
          </h3>
          <p className="text-xs text-emerald-300/80 mt-1 max-w-md mx-auto">
            Aapne {selectedCount} photos select kiye hain. Photographer ko direct WhatsApp par notify
            karne ke liye niche diye button par click karein.
          </p>

          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              onClick={handleWhatsAppPhotographer}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs rounded-xl shadow flex items-center gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Send WhatsApp Confirmation</span>
            </button>
          </div>
        </div>
      )}

      {/* 100% White-Label Studio Luxury Footer */}
      <footer className="mt-20 border-t border-neutral-900 bg-neutral-950 py-12 px-4 sm:px-6 lg:px-8 text-center select-none">
        <div className="max-w-3xl mx-auto space-y-5">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold">
            <Camera className="w-3.5 h-3.5 text-amber-400" />
            <span>Photography & Cinematography</span>
          </div>

          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold font-heading text-white tracking-wide">
              {activeEvent.studioName}
            </h2>
            <p className="text-xs text-neutral-400 mt-1 max-w-md mx-auto">
              {photographer?.studioTagline || 'Luxury Wedding Stories & Timeless Cinematic Films'}
            </p>
            {photographer?.studioAddress && (
              <p className="text-[11px] text-neutral-500 mt-1 font-mono">
                📍 {photographer.studioAddress}
              </p>
            )}
          </div>

          {/* Word-of-mouth & Wedding Guest Inquiry Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <a
              href={`https://wa.me/${(photographer?.studioBookingPhone || activeEvent.clientPhone || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                `Hello ${activeEvent.studioName}, I viewed the wedding gallery of ${activeEvent.coupleName} on your portal and would like to inquire about wedding photography packages.`
              )}`}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all hover:scale-105"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Book {activeEvent.studioName} on WhatsApp</span>
            </a>

            {photographer?.studioInstagram && (
              <a
                href={`https://instagram.com/${photographer.studioInstagram.replace('@', '')}`}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white font-semibold text-xs rounded-xl flex items-center gap-2 transition-colors"
              >
                <Instagram className="w-3.5 h-3.5 text-pink-400" />
                <span>Follow {photographer.studioInstagram}</span>
              </a>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 text-[11px] text-neutral-400 pt-4 border-t border-neutral-900 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Private & Confidential Selection Gallery • Copyright © {new Date().getFullYear()} {activeEvent.studioName}</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
