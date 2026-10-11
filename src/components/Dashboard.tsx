import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  Coins,
  Plus,
  Camera,
  Heart,
  Share2,
  ExternalLink,
  Upload,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  History,
  Trash2,
  Copy,
  ChevronRight,
  Sparkles,
  ArrowUpRight,
  Filter,
  SlidersHorizontal,
  Check,
  Edit3,
  X,
  Save,
  Sliders,
  MessageCircle,
  User,
  Building,
  Phone,
  Mail,
  LogOut,
  ShieldCheck,
  Store,
  HardDrive,
  Zap,
} from 'lucide-react';
import { WeddingEvent } from '../types';
import { getClientGalleryUrl } from '../utils/domainConfig';

interface DashboardProps {
  onOpenBuyPoints: () => void;
  onOpenCreateEvent: () => void;
  onOpenSettings?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  onOpenBuyPoints,
  onOpenCreateEvent,
  onOpenSettings,
}) => {
  const {
    currentUser,
    events,
    transactions,
    adminSettings,
    navigateTo,
    deleteEvent,
    extendDeadline,
    updateEvent,
    showToast,
    logout,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'events' | 'transactions'>('events');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [copiedEventId, setCopiedEventId] = useState<string | null>(null);
  const [nowTime, setNowTime] = useState(Date.now());

  // Periodically refresh countdown so photographer sees live time left
  useEffect(() => {
    const timer = setInterval(() => setNowTime(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const getEventTimeLeft = (deadlineDateStr: string, status: string) => {
    if (status === 'completed') {
      return { text: 'Selection Finished', isCompleted: true, isUrgent: false, isExpired: false };
    }

    const deadline = new Date(`${deadlineDateStr}T23:59:59`).getTime();
    const diff = deadline - nowTime;

    if (diff <= 0 || status === 'expired') {
      return { text: 'Deadline Expired', isCompleted: false, isUrgent: true, isExpired: true };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    let text = '';
    if (days > 0) {
      text = `${days}d ${hours}h left`;
    } else if (hours > 0) {
      text = `${hours}h ${minutes}m left`;
    } else {
      text = `${Math.max(1, minutes)}m left`;
    }

    return {
      text,
      days,
      hours,
      minutes,
      isUrgent: days <= 1,
      isExpired: false,
      isCompleted: false,
    };
  };

  // Edit Event Modal State
  const [editingEvent, setEditingEvent] = useState<WeddingEvent | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCouple, setEditCouple] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEventDate, setEditEventDate] = useState('');
  const [editDeadlineDate, setEditDeadlineDate] = useState('');
  const [editStatus, setEditStatus] = useState<'draft' | 'active' | 'completed' | 'expired'>('active');
  const [editLimitEnabled, setEditLimitEnabled] = useState(false);
  const [editMaxLimit, setEditMaxLimit] = useState<number>(80);
  const [editPhotosPerSheet, setEditPhotosPerSheet] = useState<number>(6);

  // Filter events for this photographer (or all if admin viewing dashboard)
  const myEvents = events.filter((e) =>
    currentUser?.role === 'admin'
      ? true
      : e.photographerId === currentUser?.id ||
        (Boolean(currentUser?.email) && (e as any).photographerEmail?.toLowerCase() === currentUser?.email?.toLowerCase())
  );

  const filteredEvents = myEvents.filter((e) => {
    if (filterStatus === 'all') return true;
    return e.status === filterStatus;
  });

  const myTransactions = transactions.filter((t) =>
    currentUser?.role === 'admin' ? true : t.userId === currentUser?.id
  );

  const totalPhotos = myEvents.reduce(
    (acc, e) => acc + Math.max(e.photosCount || 0, e.photos ? e.photos.length : 0),
    0
  );
  const completedEvents = myEvents.filter((e) => e.status === 'completed').length;

  const handleCopyLink = (event: typeof myEvents[0]) => {
    const url = getClientGalleryUrl(event.slug || event.id);
    navigator.clipboard.writeText(url);
    setCopiedEventId(event.id);
    showToast(`Client link copied: ${url}`, 'success');
    setTimeout(() => setCopiedEventId(null), 2500);
  };

  const handleWhatsAppShare = (event: typeof myEvents[0]) => {
    const url = getClientGalleryUrl(event.slug || event.id);
    let phoneDigits = (event.clientPhone || '').replace(/[^0-9]/g, '');
    if (phoneDigits.length === 10) {
      phoneDigits = '91' + phoneDigits;
    }
    const text = encodeURIComponent(
      `Namaste ${event.coupleName}! 🙏\n\n` +
      `Aapke wedding photos ("${event.title}") selection ke liye ready hain!\n\n` +
      `Kripya niche diye gaye link par click karke apni manpasand photos heart (❤️) karke select karein:\n\n` +
      `🔗 Client Gallery Link:\n${url}\n\n` +
      `⏳ Selection Deadline: ${event.deadlineDate}\n` +
      `📸 Studio: ${event.studioName}\n\n` +
      `Selection complete hone ke baad gallery mein "Submit Final Selection" button par click kar dein. Dhanyawad!`
    );
    showToast(`WhatsApp chat opening for ${event.coupleName}...`, 'success');
    window.open(`https://wa.me/${phoneDigits}?text=${text}`, '_blank');
  };

  const handleExtend = (eventId: string) => {
    const pts = adminSettings.pointsPerExtension || 1;
    if (confirm(`Extend deadline by 6 days? This will cost ${pts} ${pts === 1 ? 'point' : 'points'}.`)) {
      extendDeadline(eventId, 6);
    }
  };

  const handleDelete = (eventId: string, title: string) => {
    if (confirm(`Are you sure you want to delete event "${title}"?`)) {
      deleteEvent(eventId);
    }
  };

  const handleOpenEdit = (event: WeddingEvent) => {
    setEditingEvent(event);
    setEditTitle(event.title);
    setEditCouple(event.coupleName);
    setEditPhone(event.clientPhone || '');
    setEditEventDate(event.eventDate || '');
    setEditDeadlineDate(event.deadlineDate || '');
    setEditStatus(event.status);
    setEditLimitEnabled(!!event.maxSelectionLimit);
    setEditMaxLimit(event.maxSelectionLimit || 80);
    setEditPhotosPerSheet(event.photosPerSheet || 6);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent) return;

    updateEvent(editingEvent.id, {
      title: editTitle.trim(),
      coupleName: editCouple.trim(),
      clientPhone: editPhone.trim(),
      eventDate: editEventDate,
      deadlineDate: editDeadlineDate,
      status: editStatus,
      maxSelectionLimit: editLimitEnabled ? Number(editMaxLimit) : undefined,
      photosPerSheet: Number(editPhotosPerSheet) || 6,
    });

    setEditingEvent(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* 0 Points Warning Banner */}
      {(currentUser?.points || 0) === 0 && (
        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-rose-950/80 via-neutral-900 to-amber-950/40 border border-rose-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-400 flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-rose-200">
                Aapka Balance: 0 Points
              </div>
              <p className="text-xs text-neutral-300 mt-0.5">
                Naya wedding event banane ke liye recharge karein.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenBuyPoints}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-bold text-xs rounded-xl shadow hover:scale-105 transition-all whitespace-nowrap self-start sm:self-auto"
          >
            Recharge Points
          </button>
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT PROFILE & STUDIO SIDEBAR PANEL (Permanent / Regular Visibility) */}
        <aside className="lg:col-span-4 xl:col-span-3 space-y-4 lg:sticky lg:top-24">
          {/* Dashboard Header Button at Top of Left Panel */}
          <div className="flex items-center gap-2.5 px-4 py-3 bg-neutral-900 border border-amber-500/40 rounded-2xl text-amber-300 font-bold text-sm shadow-lg">
            <Store className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="font-heading tracking-wide">Studio Dashboard</span>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 shadow-xl">
            {/* Photographer Identity */}
            <div className="flex items-center gap-3 pb-4 border-b border-neutral-800">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center font-extrabold text-white text-lg shadow-md shadow-amber-500/20">
                {currentUser?.name?.charAt(0) || 'P'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-white text-sm truncate font-heading">
                    {currentUser?.name || 'Photographer'}
                  </h3>
                  <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                </div>
                <p className="text-xs text-amber-400 font-semibold truncate">
                  {currentUser?.studioName || 'Studio Owner'}
                </p>
                <span className="text-[10px] text-neutral-500 font-mono">
                  Verified Studio Partner
                </span>
              </div>
            </div>

            {/* Contact Details */}
            <div className="py-3.5 space-y-2 border-b border-neutral-800 text-xs">
              <div className="flex items-center gap-2 text-neutral-300">
                <Mail className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0" />
                <span className="truncate text-[11px] text-neutral-400">{currentUser?.email}</span>
              </div>
              <div className="flex items-center gap-2 text-neutral-300">
                <Phone className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0" />
                <span className="text-[11px] text-neutral-400 font-mono">
                  {currentUser?.phone || '+91 7970641503'}
                </span>
              </div>
            </div>

            {/* Primary Action: Create New Event (Only single place) */}
            <div className="mt-4 pt-1">
              <button
                type="button"
                onClick={onOpenCreateEvent}
                className="w-full py-2.5 px-3 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-neutral-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-1.5 hover:scale-[1.02]"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Create New Event (1 Pt)</span>
              </button>
            </div>

            {/* Studio Watermark & Branding Details */}
            <div className="mt-4 p-3.5 bg-neutral-950/60 rounded-2xl border border-neutral-800 space-y-2 text-xs">
              <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-300">
                <span className="flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>Watermark & Branding</span>
                </span>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="text-amber-400 hover:text-amber-300 text-[10px] font-bold uppercase underline"
                  >
                    Edit
                  </button>
                )}
              </div>

              <div className="bg-neutral-900/80 p-2.5 rounded-xl border border-neutral-800/80 space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-neutral-400">Watermark:</span>
                  <span className="font-mono text-neutral-200 font-semibold truncate max-w-[130px]">
                    "{currentUser?.watermarkText || currentUser?.studioName?.toUpperCase() || 'PREVIEW'}"
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Position:</span>
                  <span className="capitalize text-neutral-200 font-medium">
                    {currentUser?.watermarkPosition || 'bottom-right'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Sheet Formula:</span>
                  <span className="text-amber-300 font-semibold">
                    {currentUser?.defaultPhotosPerSheet || 6} Photos / Sheet
                  </span>
                </div>
              </div>
            </div>

            {/* Settings & Logout Actions */}
            <div className="mt-4 pt-4 border-t border-neutral-800 space-y-2">
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="w-full py-2 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5"
                >
                  <Sliders className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Studio & Watermark Settings</span>
                </button>
              )}

              <button
                type="button"
                onClick={logout}
                className="w-full py-2 px-3 bg-neutral-900 hover:bg-rose-950/40 text-neutral-400 hover:text-rose-300 border border-neutral-800 hover:border-rose-500/30 font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout Studio</span>
              </button>
            </div>

            {/* Storage Policy Notice (Moved below about studio panel) */}
            <div className="mt-4 p-3 rounded-2xl bg-neutral-950/80 border border-neutral-800/90 text-[11px] text-neutral-400 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-neutral-300">
                <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <span>Storage Policy:</span>
              </div>
              <p className="text-[10px] text-neutral-400 leading-relaxed">
                Uploaded preview photos cloud par 50 din tak rehti hain. Client ka final selection record 1 year tak safe save rahega.
              </p>
            </div>
          </div>
        </aside>

        {/* RIGHT MAIN CONTENT AREA */}
        <section className="lg:col-span-8 xl:col-span-9 space-y-6">
          {/* Top Title */}
          <div className="pb-4 border-b border-neutral-800">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs uppercase tracking-wider font-semibold text-neutral-400">
                Studio Events & Client Selections
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-white">
              {currentUser?.studioName || 'My Studio'}
            </h1>
          </div>

      {/* Clean 3-Card Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {/* Points Card - Clearly displaying Standard (2.5k) and Premium (5k) point balances */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span className="font-semibold">Studio Points Balance</span>
            <div className="flex items-center gap-1">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <Zap className="w-3.5 h-3.5 text-purple-400" />
            </div>
          </div>

          <div className="my-3 grid grid-cols-2 gap-2">
            {/* Standard Balance */}
            <div className="p-2 rounded-xl bg-neutral-950/80 border border-amber-500/20">
              <div className="text-[10px] text-neutral-400 flex items-center gap-1">
                <Coins className="w-3 h-3 text-amber-400" />
                <span>Standard (2.5k)</span>
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-xl font-mono font-extrabold text-amber-400">
                  {currentUser?.standardPoints !== undefined ? currentUser.standardPoints : (currentUser?.points || 0)}
                </span>
                <span className="text-[10px] text-neutral-500">pts</span>
              </div>
            </div>

            {/* Premium Balance */}
            <div className="p-2 rounded-xl bg-gradient-to-br from-purple-950/40 to-neutral-950 border border-purple-500/30">
              <div className="text-[10px] text-purple-300 flex items-center gap-1">
                <Zap className="w-3 h-3 text-amber-400 fill-amber-400 animate-pulse" />
                <span className="font-semibold">⚡ Premium (5k)</span>
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-xl font-mono font-extrabold text-purple-300">
                  {currentUser?.premiumPoints || 0}
                </span>
                <span className="text-[10px] text-neutral-500">pts</span>
              </div>
            </div>
          </div>

          <button
            onClick={onOpenBuyPoints}
            className="w-full py-2 px-3 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-neutral-950 font-bold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>Recharge Points</span>
          </button>
        </div>

        {/* Events Count */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span className="font-semibold">Total Wedding Events</span>
            <Camera className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="my-3">
            <span className="text-3xl font-mono font-extrabold text-white">
              {myEvents.length}
            </span>
            <span className="text-xs text-neutral-400 ml-1.5">events</span>
          </div>
          <div className="text-xs text-neutral-500">
            {completedEvents} Selection Finished
          </div>
        </div>

        {/* Photos Uploaded */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span className="font-semibold">Photos Uploaded</span>
            <Upload className="w-4 h-4 text-amber-400" />
          </div>
          <div className="my-3">
            <span className="text-3xl font-mono font-extrabold text-white">
              {totalPhotos}
            </span>
            <span className="text-xs text-neutral-400 ml-1.5">previews</span>
          </div>
          <div className="text-xs text-neutral-500">Compressed previews</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-3 mb-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('events')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeTab === 'events'
                ? 'bg-neutral-800 text-white shadow'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Events List ({myEvents.length})
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
              activeTab === 'transactions'
                ? 'bg-neutral-800 text-white shadow'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5 text-amber-400" />
            Points History ({myTransactions.length})
          </button>
        </div>

        {activeTab === 'events' && (
          <div className="flex items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 text-neutral-300 text-xs rounded-xl px-3 py-1.5 focus:outline-none"
            >
              <option value="all">All Status</option>
              <option value="active">Active (Selecting)</option>
              <option value="completed">Completed (Submitted)</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        )}
      </div>

      {/* Events Tab Content */}
      {activeTab === 'events' && (
        <>
          {filteredEvents.length === 0 ? (
            <div className="text-center py-16 px-4 bg-neutral-900/50 border border-neutral-800 rounded-3xl">
              <Camera className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-white mb-1">No Events Found</h3>
              <p className="text-xs text-neutral-400 max-w-sm mx-auto mb-5">
                Aapne abhi tak koi wedding event nahi banaya hai. Naya event banayein aur client ko link bhejein.
              </p>
              <button
                onClick={onOpenCreateEvent}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-bold text-xs rounded-xl shadow hover:scale-105 transition-all inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Create First Event ({adminSettings.pointsPerEvent || 1} {adminSettings.pointsPerEvent === 1 ? 'Point' : 'Points'})
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredEvents.map((event) => {
                const photosList = event.photos || [];
                const foldersList = event.folders || [];
                const selectedCount = Math.max(
                  event.selectedCount || 0,
                  photosList.filter((p) => p.isSelected).length,
                  (event.selectedPhotoIds || []).length
                );
                const totalPhotos = Math.max(event.photosCount || 0, photosList.length);
                const isCopied = copiedEventId === event.id;
                const timeLeftInfo = getEventTimeLeft(event.deadlineDate, event.status);

                return (
                  <div
                    key={event.id}
                    className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700/80 rounded-3xl p-5 sm:p-6 transition-all shadow-lg flex flex-col justify-between"
                  >
                    <div>
                      {/* Top status bar & Edit trigger */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                              event.status === 'completed'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : event.status === 'expired'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {event.status === 'completed'
                              ? '✓ Selection Completed'
                              : event.status === 'expired'
                              ? 'Expired'
                              : 'Client Selecting'}
                          </span>

                          {/* Time Left Badge */}
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                              timeLeftInfo.isCompleted
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : timeLeftInfo.isExpired
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : timeLeftInfo.isUrgent
                                ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40 animate-pulse'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            <Clock className="w-3 h-3 text-amber-400" />
                            <span>{timeLeftInfo.text}</span>
                          </span>

                          {event.maxSelectionLimit && (
                            <span className="text-[10px] font-mono bg-neutral-950 px-2 py-0.5 rounded text-neutral-400">
                              Limit: {event.maxSelectionLimit}
                            </span>
                          )}
                        </div>

                        {/* Full Control: Edit Event Button */}
                        <button
                          onClick={() => handleOpenEdit(event)}
                          className="px-2.5 py-1 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-xs font-semibold text-neutral-300 hover:text-white flex items-center gap-1 transition-colors"
                          title="Full Edit Event Details"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                          <span>Edit</span>
                        </button>
                      </div>

                      {/* Title & Couple */}
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-bold text-white font-heading">
                            {event.title}
                          </h3>
                          <p className="text-xs text-amber-400 font-semibold mt-0.5">
                            Client: {event.coupleName} ({event.clientPhone})
                          </p>
                        </div>
                        {Boolean(event.coverPhotoUrl && event.coverPhotoUrl.trim()) && (
                          <img
                            src={event.coverPhotoUrl}
                            alt="Cover"
                            className="w-14 h-14 rounded-xl object-cover border border-neutral-700 flex-shrink-0"
                          />
                        )}
                      </div>

                      {/* Folder & Deadline Meta Bar with Time Left */}
                      <div className="my-3.5 p-3 bg-neutral-950/70 rounded-2xl border border-neutral-800 text-xs space-y-1.5">
                        <div className="flex items-center justify-between text-neutral-400">
                          <span className="flex items-center gap-1 font-mono">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            Deadline: <span className="text-white font-bold">{event.deadlineDate}</span>
                          </span>
                          <span
                            className={`font-mono text-xs font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                              timeLeftInfo.isCompleted
                                ? 'text-emerald-400 bg-emerald-950/60'
                                : timeLeftInfo.isExpired
                                ? 'text-rose-400 bg-rose-950/60'
                                : timeLeftInfo.isUrgent
                                ? 'text-rose-300 bg-rose-950/70 border border-rose-500/40 animate-pulse'
                                : 'text-amber-300 bg-amber-950/60'
                            }`}
                          >
                            <span>⏳ {timeLeftInfo.text}</span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1 border-t border-neutral-800/80">
                          <span>{foldersList.length} Folders</span>
                          <span>{totalPhotos} Photos Uploaded</span>
                          <span className="text-rose-400 font-bold">
                            ❤️ {selectedCount} Selected
                          </span>
                        </div>

                        {/* 50-Day Storage Lifecycle (Kitne din huye / 50 dino me se) */}
                        {(() => {
                          const eventCreatedMs = new Date(event.createdAt || Date.now()).getTime();
                          const daysPassed = Math.max(0, Math.floor((nowTime - eventCreatedMs) / (24 * 60 * 60 * 1000)));
                          const daysCompleted = Math.min(50, daysPassed);
                          const daysRemaining = Math.max(0, 50 - daysPassed);
                          const storagePercent = Math.min(100, Math.round((daysCompleted / 50) * 100));

                          return (
                            <div className="pt-2 border-t border-neutral-800/80 space-y-1.5">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-neutral-400 flex items-center gap-1 font-medium">
                                  <HardDrive className="w-3.5 h-3.5 text-orange-400" />
                                  <span>Cloudflare Storage:</span>
                                </span>
                                {event.isStoragePurged || daysPassed >= 50 ? (
                                  <span className="font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded text-[10px] border border-amber-500/20">
                                    50/50 Din Puray (Previews Purged • Selections Safe)
                                  </span>
                                ) : (
                                  <div className="flex items-center gap-1 font-mono text-[11px]">
                                    <span className="text-white font-extrabold">{daysCompleted}/50</span>
                                    <span className="text-neutral-400 font-sans">dino me se</span>
                                    <span className="text-emerald-400 font-semibold text-[10px]">({daysRemaining}d bache)</span>
                                  </div>
                                )}
                              </div>

                              {/* Visual 50-Day Progress Bar */}
                              <div className="w-full h-1.5 bg-neutral-900 rounded-full overflow-hidden border border-neutral-800">
                                <div
                                  className={`h-full transition-all duration-300 rounded-full ${
                                    daysPassed >= 50 || event.isStoragePurged
                                      ? 'bg-amber-500'
                                      : daysPassed >= 40
                                      ? 'bg-rose-500'
                                      : 'bg-gradient-to-r from-orange-500 to-emerald-400'
                                  }`}
                                  style={{ width: `${Math.max(2, storagePercent)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {event.clientNotes && (
                        <div className="mb-4 p-2.5 bg-neutral-950 rounded-xl border border-neutral-800 text-[11px] text-neutral-300 italic">
                          "{event.clientNotes}"
                        </div>
                      )}
                    </div>

                    {/* Action buttons footer */}
                    <div className="pt-3 border-t border-neutral-800 space-y-2.5">
                      {/* 1-Click WhatsApp Direct Share with Client Name */}
                      <button
                        onClick={() => handleWhatsAppShare(event)}
                        className="w-full py-2.5 px-3 bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-600/20 hover:scale-[1.01] active:scale-[0.99]"
                      >
                        <MessageCircle className="w-4 h-4 fill-white" />
                        <span>WhatsApp to {event.coupleName}</span>
                        <span className="text-[10px] text-emerald-100 font-mono font-normal opacity-90">
                          ({event.clientPhone})
                        </span>
                      </button>

                      <div className="grid grid-cols-3 gap-2">
                        {/* Copy Link */}
                        <button
                          onClick={() => handleCopyLink(event)}
                          className={`py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors border ${
                            isCopied
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border-neutral-800'
                          }`}
                        >
                          {isCopied ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-amber-400" />
                              <span>Copy Link</span>
                            </>
                          )}
                        </button>

                        {/* Upload / Manage Photos - 1 Click Instant Open */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigateTo('photo-upload', event.id);
                          }}
                          className="py-2 px-2.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 hover:text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all hover:scale-[1.02] shadow-sm cursor-pointer"
                          title="Upload wedding photos into folders"
                        >
                          <Upload className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                          <span>Upload ({totalPhotos})</span>
                        </button>

                        {/* Results & .BAT Download */}
                        <button
                          onClick={() => navigateTo('selection-results', event.id)}
                          className="py-2 px-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          <span>Results ({selectedCount})</span>
                        </button>
                      </div>

                      {/* Sub-actions: 6 Days extension button & Delete */}
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-800/80">
                        <button
                          type="button"
                          onClick={() => handleExtend(event.id)}
                          className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 hover:scale-[1.02] shadow-sm"
                          title="Extend Deadline by +6 Days (Costs 1 Point)"
                        >
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span>+6 Days Extend (1 Pt)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(event.id, event.title)}
                          className="text-neutral-500 hover:text-rose-400 text-xs flex items-center gap-1 transition-colors px-2 py-1 rounded-lg hover:bg-rose-950/20"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Transactions Tab Content */}
      {activeTab === 'transactions' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-xl overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-white font-heading">
              Points Ledger & History
            </h3>
          </div>

          {myTransactions.length === 0 ? (
            <p className="text-xs text-neutral-400 py-8 text-center">
              No transactions recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-400 uppercase text-[10px] tracking-wider">
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Description</th>
                    <th className="pb-3">Method / Notes</th>
                    <th className="pb-3 text-right">Points</th>
                    <th className="pb-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 font-mono text-neutral-300">
                  {myTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-neutral-800/40">
                      <td className="py-3 text-neutral-400">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                            tx.type === 'credit'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {tx.type}
                        </span>
                      </td>
                      <td className="py-3 font-sans text-white">{tx.description}</td>
                      <td className="py-3 text-neutral-400 font-sans">
                        {tx.paymentMethod || 'System'}
                        {tx.amountRupees ? ` (₹${tx.amountRupees})` : ''}
                      </td>
                      <td
                        className={`py-3 text-right font-bold ${
                          tx.type === 'credit' ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {tx.type === 'credit' ? `+${tx.amount}` : `-${tx.amount}`}
                      </td>
                      <td className="py-3 text-right text-amber-300 font-bold">
                        {tx.balanceAfter} pts
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  </div>

      {/* FULL CONTROL: Edit Event Modal */}
      {editingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setEditingEvent(null)}
              className="absolute top-5 right-5 text-neutral-400 hover:text-white p-2 rounded-xl hover:bg-neutral-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Edit3 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold font-heading text-white">
                  Edit Event Details
                </h2>
                <p className="text-xs text-neutral-400">
                  Full control over event configuration, dates, and client settings.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Event Title
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Couple / Client Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editCouple}
                    onChange={(e) => setEditCouple(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Client WhatsApp Phone
                  </label>
                  <input
                    type="tel"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Selection Deadline Date
                </label>
                <input
                  type="date"
                  value={editDeadlineDate}
                  onChange={(e) => setEditDeadlineDate(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-amber-300 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Event Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e: any) => setEditStatus(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="active">Active (Client can select photos)</option>
                  <option value="completed">Completed (Selection finalized by client)</option>
                  <option value="expired">Expired (Selection closed)</option>
                  <option value="draft">Draft (Not yet shared)</option>
                </select>
              </div>

              {/* Selection Limit */}
              <div className="p-3.5 bg-neutral-950/70 border border-neutral-800/80 rounded-2xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-amber-400" />
                    Photo Selection Limit
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editLimitEnabled}
                      onChange={(e) => setEditLimitEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>

                {editLimitEnabled ? (
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={2000}
                      value={editMaxLimit}
                      onChange={(e) => setEditMaxLimit(Number(e.target.value))}
                      className="w-32 bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-1.5 text-sm text-white font-mono"
                    />
                    <span className="text-xs text-neutral-400">
                      Client cannot select more than {editMaxLimit} photos.
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
                    <span>📖 Album Sheet Estimator Formula</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={editPhotosPerSheet}
                    onChange={(e) => setEditPhotosPerSheet(Number(e.target.value))}
                    className="w-16 bg-neutral-900 border border-neutral-700 rounded-xl px-2.5 py-1.5 text-sm font-mono text-center font-bold text-amber-300 focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-xs text-neutral-300">photos / sheet</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setEditingEvent(null)}
                  className="px-4 py-2.5 rounded-xl border border-neutral-800 text-xs font-bold text-neutral-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-bold text-xs rounded-xl shadow hover:scale-105 transition-all flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
