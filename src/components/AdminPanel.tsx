import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Shield,
  Coins,
  Users,
  Camera,
  Key,
  Plus,
  Minus,
  Edit2,
  Trash2,
  Save,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  ArrowLeft,
  AlertCircle,
  TrendingUp,
  Eye,
  EyeOff,
  Copy,
  Check,
  MessageCircle,
  HardDrive,
  Cloud,
  Database,
  Ban,
  UserCheck,
  AlertTriangle,
  Loader2,
  Globe,
  ExternalLink,
  Zap,
  Download,
} from 'lucide-react';
import { User, AdminSettings, PointTier } from '../types';
import { getBaseAppUrl, CUSTOM_DOMAIN } from '../utils/domainConfig';
import { firebaseService } from '../services/firebaseService';
import { RETENTION_DAYS } from '../config/retention';

export const AdminPanel: React.FC = () => {
  const {
    users,
    events,
    transactions,
    adminSettings,
    adminAddPoints,
    adminResetPassword,
    adminUpdateSettings,
    adminUpdateOwnCredentials,
    adminToggleBlockPhotographer,
    adminDeletePhotographer,
    adminResetAllStoredData,
    navigateTo,
    showToast,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'photographers' | 'pricing' | 'transactions'>('photographers');

  // Modals / point adjustment states
  const [selectedUserForPoints, setSelectedUserForPoints] = useState<User | null>(null);
  const [pointsAdjustment, setPointsAdjustment] = useState<number>(5);
  const [pointsTierToAdjust, setPointsTierToAdjust] = useState<PointTier>('standard');
  const [adjustmentReason, setAdjustmentReason] = useState<string>('Free Welcome Grant');

  // Block & Delete photographer states
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [userToBlock, setUserToBlock] = useState<User | null>(null);
  const [blockReasonInput, setBlockReasonInput] = useState('');

  // Reset all stored testing data state
  const [showResetDataModal, setShowResetDataModal] = useState(false);
  const [isResettingData, setIsResettingData] = useState(false);

  // Reset password & credentials management
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [tempPasswordModal, setTempPasswordModal] = useState<{ user: User; pass: string } | null>(null);
  const [customPasswordInput, setCustomPasswordInput] = useState<string>('');

  // R2 Base64 Migration state
  const [isMigratingBase64, setIsMigratingBase64] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<{ total: number; current: number } | null>(null);

  const handleMigrateBase64ToR2 = async () => {
    setIsMigratingBase64(true);
    let totalMigrated = 0;
    try {
      const allEventsWithBase64 = events.filter((e) =>
        e.photos && e.photos.some((p) => p.url?.startsWith('data:') || p.thumbnailUrl?.startsWith('data:'))
      );

      if (allEventsWithBase64.length === 0) {
        showToast('All photos are already on Cloudflare R2! No legacy base64 photos found.', 'success');
        setIsMigratingBase64(false);
        return;
      }

      let totalBase64 = 0;
      allEventsWithBase64.forEach((e) => {
        totalBase64 += e.photos.filter((p) => p.url?.startsWith('data:') || p.thumbnailUrl?.startsWith('data:')).length;
      });
      setMigrationProgress({ total: totalBase64, current: 0 });

      for (const event of allEventsWithBase64) {
        const base64Photos = event.photos.filter((p) => p.url?.startsWith('data:') || p.thumbnailUrl?.startsWith('data:'));
        const CHUNK_SIZE = 5;
        for (let i = 0; i < base64Photos.length; i += CHUNK_SIZE) {
          const chunk = base64Photos.slice(i, i + CHUNK_SIZE);
          const presignPayload = chunk.map((p) => ({
            photoId: p.id,
            type: 'full',
            contentType: 'image/jpeg',
            extension: 'jpg',
          }));

          const res = await fetch('/api/r2-presign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId: event.id, files: presignPayload }),
          });

          if (!res.ok) continue;
          const { urls } = await res.json();
          const updatedChunk: any[] = [];

          for (const p of chunk) {
            const presigned = urls?.find((u: any) => u.photoId === p.id);
            if (presigned) {
              const arr = p.url.split(',');
              const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
              const bstr = atob(arr[1]);
              let n = bstr.length;
              const u8arr = new Uint8Array(n);
              while (n--) u8arr[n] = bstr.charCodeAt(n);
              const blob = new Blob([u8arr], { type: mime });

              await fetch(presigned.uploadUrl, {
                method: 'PUT',
                body: blob,
                headers: { 'Content-Type': mime },
              });

              updatedChunk.push({
                ...p,
                url: presigned.publicUrl,
                thumbnailUrl: presigned.publicUrl,
                r2Key: presigned.key,
              });
              totalMigrated++;
              setMigrationProgress((prev) => (prev ? { ...prev, current: totalMigrated } : null));
            }
          }

          if (updatedChunk.length > 0) {
            await firebaseService.savePhotos(event.id, updatedChunk);
          }
        }
      }

      showToast(`Migration complete! Successfully moved ${totalMigrated} photos to Cloudflare R2.`, 'success');
    } catch (err: any) {
      console.error('Migration error:', err);
      showToast(`Migration error: ${err.message}`, 'error');
    } finally {
      setIsMigratingBase64(false);
      setMigrationProgress(null);
    }
  };

  // Admin Self-Credentials Modification Modal State
  const adminUser = users.find((u) => u.role === 'admin');
  const [showAdminCredsModal, setShowAdminCredsModal] = useState(false);
  const [showDomainModal, setShowDomainModal] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [copiedDns, setCopiedDns] = useState<string | null>(null);
  const [adminEmailInput, setAdminEmailInput] = useState(adminUser?.email || 'admin@a1smartselection.com');
  const [adminPassInput, setAdminPassInput] = useState('');
  const [showAdminPasswordPlain, setShowAdminPasswordPlain] = useState(false);

  const handleSaveAdminCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmailInput.trim()) {
      showToast('Admin email empty nahi ho sakta!', 'error');
      return;
    }
    const ok = await adminUpdateOwnCredentials(adminEmailInput.trim(), adminPassInput.trim());
    if (ok) {
      setShowAdminCredsModal(false);
    }
  };

  const handleConfirmBlock = () => {
    if (!userToBlock) return;
    adminToggleBlockPhotographer(userToBlock.id, blockReasonInput);
    setUserToBlock(null);
    setBlockReasonInput('');
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    setIsDeletingUser(true);
    try {
      await adminDeletePhotographer(userToDelete.id);
      setUserToDelete(null);
    } finally {
      setIsDeletingUser(false);
    }
  };

  const handleConfirmResetData = async () => {
    setIsResettingData(true);
    try {
      await adminResetAllStoredData();
      setShowResetDataModal(false);
    } finally {
      setIsResettingData(false);
    }
  };

  const toggleShowPassword = (userId: string) => {
    setShowPasswords((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    showToast('Copied to clipboard!', 'success');
    setTimeout(() => setCopiedField(null), 2000);
  };

  const sendCredentialsWhatsApp = (user: User) => {
    const cleanPhone = (user.phone || '').replace(/[^0-9]/g, '');
    const message = encodeURIComponent(
      `Hello ${user.name},\n\nA1 Smart Selection Studio Account:\n• Studio: ${user.studioName}\n• Login ID (Email): ${user.email}\n\nLogin URL: ${getBaseAppUrl()}\n(Use Forgot Password on the studio login page to reset password).\nThank you!`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  const handleOpenPasswordModal = (user: User) => {
    const currentPass = '••••••••';
    setCustomPasswordInput(currentPass);
    setTempPasswordModal({ user, pass: currentPass });
  };

  const handleSaveCustomPassword = async (userId: string) => {
    await adminResetPassword(userId);
    showToast('Password reset link sent to photographer email!', 'success');
  };

  const handleGenerateNewPassword = async (userId: string) => {
    await adminResetPassword(userId);
    showToast('Password reset link sent to photographer email!', 'success');
  };

  // Editable pricing settings
  const [settingsForm, setSettingsForm] = useState<AdminSettings>(() => ({
    ...adminSettings,
    pricingPackages: (adminSettings.pricingPackages || []).map((p) => ({ ...p })),
  }));

  const photographers = users.filter((u) => u.role === 'photographer');
  const totalEvents = events.length;
  const totalPhotos = events.reduce((sum, e) => sum + (e.photos ? e.photos.length : (e.photosCount || 0)), 0);
  const totalRevenue = transactions
    .filter((t) => t.amountRupees)
    .reduce((sum, t) => sum + (t.amountRupees || 0), 0);

  // Cloudflare 10 GB Free Tier Storage Status Calculation
  const CLOUDFLARE_TOTAL_GB = 10.0;
  const CLOUDFLARE_TOTAL_BYTES = 10 * 1024 * 1024 * 1024;

  let totalStorageBytes = 0;
  let activePreviewsCount = 0;
  let purgedEventsCount = 0;

  events.forEach((evt) => {
    if (evt.isStoragePurged) {
      purgedEventsCount++;
    } else {
      activePreviewsCount++;
      if (evt.photos && evt.photos.length > 0) {
        evt.photos.forEach((p) => {
          totalStorageBytes += p.sizeBytes && p.sizeBytes > 0 ? p.sizeBytes : 185000;
        });
      }
    }
  });

  const usedMB = totalStorageBytes / (1024 * 1024);
  const usedGB = totalStorageBytes / (1024 * 1024 * 1024);
  const remainingGB = Math.max(0, CLOUDFLARE_TOTAL_GB - usedGB);
  const usedPercent = Math.min(100, Math.max(usedMB > 0 ? 0.2 : 0, (totalStorageBytes / CLOUDFLARE_TOTAL_BYTES) * 100));
  const usedText = usedMB >= 1024 ? `${usedGB.toFixed(2)} GB` : `${usedMB.toFixed(1)} MB`;

  const handleApplyPoints = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForPoints) return;
    adminAddPoints(selectedUserForPoints.id, Number(pointsAdjustment), adjustmentReason, pointsTierToAdjust);
    setSelectedUserForPoints(null);
  };

  const handleResetPassword = async (user: User) => {
    const tempPass = await adminResetPassword(user.id);
    setTempPasswordModal({ user, pass: tempPass });
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    adminUpdateSettings(settingsForm);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-neutral-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 text-[10px] font-mono font-bold uppercase tracking-wider">
              SUPER ADMIN CONSOLE
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-white mt-1">
            A1 Master Administration
          </h1>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          <button
            onClick={() => setShowDomainModal(true)}
            className="px-3.5 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
            title="Configure Hostinger Custom Domain a1smartselection.sbs"
          >
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            <span>Domain: a1smartselection.sbs</span>
          </button>

          <button
            onClick={() => setShowDeployModal(true)}
            className="px-3.5 py-2 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
            title="Download Netlify Ready ZIP or Full Source Code"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Netlify / Web ZIP</span>
          </button>

          <button
            onClick={() => {
              setAdminEmailInput(adminUser?.email || 'admin@a1smartselection.com');
              setAdminPassInput('');
              setShowAdminCredsModal(true);
            }}
            className="px-3.5 py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Key className="w-3.5 h-3.5" />
            <span>Modify Admin ID & Pass</span>
          </button>

          <button
            onClick={() => setShowResetDataModal(true)}
            className="px-3.5 py-2 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 hover:text-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
            title="Wipe and reset all test data to start fresh"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
            <span>Reset Stored Test Data</span>
          </button>

          <button
            onClick={() => navigateTo('dashboard')}
            className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 rounded-xl text-xs font-semibold flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Exit to Studio View</span>
          </button>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-6">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>Photographers</span>
            <Users className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono mt-1">
            {photographers.length}
          </div>
          <p className="text-[11px] text-neutral-500 mt-1">Registered studios</p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>Total Events</span>
            <Camera className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono mt-1">
            {totalEvents}
          </div>
          <p className="text-[11px] text-neutral-500 mt-1">{totalPhotos} photo previews</p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>Points In Circulation</span>
            <Coins className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-400 font-mono mt-1">
            {photographers.reduce((sum, p) => sum + p.points, 0)} pts
          </div>
          <p className="text-[11px] text-neutral-500 mt-1">Total active balance</p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>Gross Revenue</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono mt-1">
            ₹{totalRevenue.toLocaleString('en-IN')}
          </div>
          <p className="text-[11px] text-neutral-500 mt-1">Points recharge sales</p>
        </div>
      </div>

      {/* Cloudflare 10 GB Free Cloud Storage Status Bar */}
      <div className="p-5 bg-gradient-to-br from-neutral-900 to-neutral-950 border border-neutral-800 rounded-3xl mb-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold text-white font-heading">
                  Cloudflare Free Cloud Storage
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/30 text-[10px] font-mono font-bold uppercase">
                  10 GB Free Tier
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleMigrateBase64ToR2}
              disabled={isMigratingBase64}
              className="px-3.5 py-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap transition-all shadow-md shadow-orange-500/20"
            >
              {isMigratingBase64 ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                  <span>
                    Migrating... {migrationProgress ? `(${migrationProgress.current}/${migrationProgress.total})` : ''}
                  </span>
                </>
              ) : (
                <>
                  <Cloud className="w-3.5 h-3.5 text-white" />
                  <span>Migrate Old Base64 Photos to R2</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                showToast(
                  `Server cron job automatically enforces the ${RETENTION_DAYS}-day retention policy daily. Previews older than ${RETENTION_DAYS} days are safely purged from R2 storage.`,
                  'info'
                );
              }}
              className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>{RETENTION_DAYS}-Day Auto Retention Policy</span>
            </button>
          </div>
        </div>

        {/* Live Storage Gauge & Progress Bar */}
        <div className="mt-4 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-orange-400" />
              <span className="text-neutral-300 font-semibold">Storage Used:</span>
              <span className="font-mono font-extrabold text-white text-sm">
                {usedText}
              </span>
              <span className="text-neutral-500 font-mono">/ 10.00 GB Total</span>
            </div>

            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-emerald-400 font-bold bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-lg">
                ✓ {remainingGB.toFixed(2)} GB Baki Hai
              </span>
              <span className="text-neutral-400">({usedPercent.toFixed(1)}% full)</span>
            </div>
          </div>

          {/* Visual Progress Bar (0 to 10 GB) */}
          <div className="relative w-full h-3 bg-neutral-950 rounded-full overflow-hidden border border-neutral-800 p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-500 shadow-sm ${
                usedPercent >= 85
                  ? 'bg-gradient-to-r from-amber-500 to-rose-500 shadow-rose-500/20'
                  : usedPercent >= 60
                  ? 'bg-gradient-to-r from-amber-500 to-amber-400 shadow-amber-500/20'
                  : 'bg-gradient-to-r from-orange-500 via-amber-400 to-emerald-400 shadow-emerald-500/20'
              }`}
              style={{ width: `${Math.max(1, usedPercent)}%` }}
            />
          </div>

          {/* 3-Point Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 text-[11px]">
            <div className="p-2.5 bg-neutral-950/70 rounded-xl border border-neutral-800/80 flex items-center justify-between">
              <span className="text-neutral-400">Total Photos in Storage:</span>
              <span className="font-mono font-bold text-white">{totalPhotos} Photos</span>
            </div>
            <div className="p-2.5 bg-neutral-950/70 rounded-xl border border-neutral-800/80 flex items-center justify-between">
              <span className="text-neutral-400">Active 50-Day Preview Events:</span>
              <span className="font-mono font-bold text-emerald-400">{activePreviewsCount} Events</span>
            </div>
            <div className="p-2.5 bg-neutral-950/70 rounded-xl border border-neutral-800/80 flex items-center justify-between">
              <span className="text-neutral-400">50-Day Auto Purged Events:</span>
              <span className="font-mono font-bold text-amber-300">{purgedEventsCount} Events (Safe)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-800 pb-3 mb-6">
        <button
          onClick={() => setActiveTab('photographers')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === 'photographers'
              ? 'bg-neutral-800 text-white shadow'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          Manage Photographers ({photographers.length})
        </button>
        <button
          onClick={() => setActiveTab('pricing')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === 'pricing'
              ? 'bg-neutral-800 text-white shadow'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          Points & Package Pricing (₹)
        </button>
        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === 'transactions'
              ? 'bg-neutral-800 text-white shadow'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          All System Transactions ({transactions.length})
        </button>
      </div>

      {/* Tab 1: Manage Photographers */}
      {activeTab === 'photographers' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-white font-heading">
                Photographers & Studios Directory
              </h3>
            </div>
          </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-400 uppercase text-[10px] tracking-wider">
                    <th className="pb-3">Photographer / Studio</th>
                    <th className="pb-3">Login ID & Password (Credentials)</th>
                    <th className="pb-3">Contact (Phone)</th>
                    <th className="pb-3 text-center">Events</th>
                    <th className="pb-3 text-center">Points Balance</th>
                    <th className="pb-3">Joined Date</th>
                    <th className="pb-3 text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
                  {photographers.map((user) => {
                    const userEventsCount = events.filter((e) => e.photographerId === user.id).length;

                    return (
                      <tr key={user.id} className="hover:bg-neutral-800/40 transition-colors">
                        <td className="py-4">
                          <div className="flex items-center gap-2">
                            <div className="font-bold text-white text-sm">{user.name}</div>
                            {user.isBlocked ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-bold">
                                <Ban className="w-3 h-3 text-rose-400" />
                                <span>Blocked</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                <span>Active</span>
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-amber-400 font-medium">
                            {user.studioName}
                          </div>
                          {user.isBlocked && user.blockedReason && (
                            <div className="text-[10px] text-rose-400/90 italic mt-0.5 max-w-xs">
                              Reason: {user.blockedReason}
                            </div>
                          )}
                        </td>

                        {/* Login ID & Password (Credentials) */}
                        <td className="py-4 font-mono">
                          {/* Login ID */}
                          <div className="flex items-center gap-1.5 text-xs text-white">
                            <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider font-sans bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                              ID
                            </span>
                            <span className="select-all font-mono text-neutral-200">{user.email}</span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(user.email, `id-${user.id}`)}
                              className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors"
                              title="Copy Login ID"
                            >
                              {copiedField === `id-${user.id}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          {/* Password with Eye Toggle & Actions */}
                          <div className="flex items-center gap-1.5 text-xs mt-1.5">
                            <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider font-sans bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-700">
                              AUTH
                            </span>
                            <span className="font-mono text-neutral-400 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800 text-[11px]">
                              Firebase Auth (Encrypted)
                            </span>
                            <button
                              type="button"
                              onClick={() => handleOpenPasswordModal(user)}
                              className="p-1 text-amber-400 hover:text-amber-300 rounded hover:bg-neutral-800 transition-colors"
                              title="Send Password Reset Email"
                            >
                              <Key className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => sendCredentialsWhatsApp(user)}
                              className="p-1 text-emerald-400 hover:text-emerald-300 rounded hover:bg-emerald-950/40 transition-colors ml-1"
                              title="Send Studio Info via WhatsApp"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                        <td className="py-4 font-mono text-neutral-400">
                          <div>{user.phone}</div>
                        </td>
                        <td className="py-4 text-center font-mono font-bold text-neutral-200">
                          {userEventsCount}
                        </td>
                        <td className="py-4 text-center">
                          <div className="inline-flex flex-col items-center gap-1 font-mono text-xs">
                            <span
                              className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold"
                              title="Standard Points (2,500 photos access/point)"
                            >
                              {user.standardPoints !== undefined ? user.standardPoints : (user.points || 0)} Std
                            </span>
                            <span
                              className="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30 font-bold flex items-center gap-0.5"
                              title="Premium Points (5,000 photos access/point)"
                            >
                              <Zap className="w-2.5 h-2.5 text-amber-300" />
                              {user.premiumPoints || 0} Prem
                            </span>
                          </div>
                        </td>
                        <td className="py-4 text-neutral-400 font-mono text-[11px]">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              onClick={() => setSelectedUserForPoints(user)}
                              className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold rounded-xl text-xs flex items-center gap-1 transition-colors"
                              title="Add or Deduct Points"
                            >
                              <Coins className="w-3.5 h-3.5" />
                              <span>Points</span>
                            </button>

                            <button
                              onClick={() => handleOpenPasswordModal(user)}
                              className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white rounded-xl text-xs flex items-center gap-1 font-semibold transition-colors border border-neutral-700"
                              title="View & Edit Password"
                            >
                              <Key className="w-3.5 h-3.5 text-amber-400" />
                              <span>Pass</span>
                            </button>

                            {/* Temporary Block / Unblock Button */}
                            <button
                              onClick={() => {
                                setUserToBlock(user);
                                setBlockReasonInput(user.blockedReason || '');
                              }}
                              className={`px-2.5 py-1.5 rounded-xl text-xs flex items-center gap-1 font-bold transition-colors border ${
                                user.isBlocked
                                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
                                  : 'bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border-amber-600/40'
                              }`}
                              title={user.isBlocked ? 'Click to Unblock Photographer' : 'Click to Temporarily Block Photographer'}
                            >
                              {user.isBlocked ? (
                                <>
                                  <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Unblock</span>
                                </>
                              ) : (
                                <>
                                  <Ban className="w-3.5 h-3.5 text-amber-400" />
                                  <span>Block</span>
                                </>
                              )}
                            </button>

                            {/* Permanent Delete Button */}
                            <button
                              onClick={() => setUserToDelete(user)}
                              className="px-2.5 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 hover:text-rose-200 rounded-xl text-xs flex items-center gap-1 font-bold transition-colors border border-rose-500/30"
                              title="Permanently Delete Photographer and all associated data"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
        </div>
      )}

      {/* Tab 2: Pricing Settings */}
      {activeTab === 'pricing' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-xl">
            <h3 className="text-base font-bold text-white font-heading mb-1">
              Platform Point Rules
            </h3>
            <p className="text-xs text-neutral-400 mb-5">
              Set how many points are charged for event creation and deadline extensions.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Points Deducted Per Event Creation
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={settingsForm.pointsPerEvent}
                  onChange={(e) =>
                    setSettingsForm((prev) => ({
                      ...prev,
                      pointsPerEvent: Number(e.target.value),
                    }))
                  }
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
                />
                <span className="text-[11px] text-neutral-500 mt-1 block">
                  Default: 1 Point (Photographers need 1 point to create an event)
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Points Deducted Per 30-Day Extension
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={settingsForm.pointsPerExtension}
                  onChange={(e) =>
                    setSettingsForm((prev) => ({
                      ...prev,
                      pointsPerExtension: Number(e.target.value),
                    }))
                  }
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
                />
                <span className="text-[11px] text-neutral-500 mt-1 block">
                  Default: 1 Point
                </span>
              </div>
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-xl">
            <h3 className="text-base font-bold text-white font-heading mb-1">
              Pricing Packages Configuration (₹)
            </h3>
            <p className="text-xs text-neutral-400 mb-5">
              Customize the package prices and point allocations available to photographers.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {settingsForm.pricingPackages.map((pkg, index) => (
                <div
                  key={pkg.id}
                  className="p-4 bg-neutral-950 rounded-2xl border border-neutral-800 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                      Package {index + 1}
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        pkg.tier === 'premium'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {pkg.tier === 'premium' ? '⚡ Premium (5k photos)' : 'Standard (2.5k photos)'}
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] text-neutral-400 mb-1">
                      Package Name
                    </label>
                    <input
                      type="text"
                      value={pkg.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSettingsForm((prev) => ({
                          ...prev,
                          pricingPackages: prev.pricingPackages.map((p, i) =>
                            i === index ? { ...p, name: val } : p
                          ),
                        }));
                      }}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-neutral-400 mb-1">
                        Price (₹)
                      </label>
                      <input
                        type="number"
                        value={pkg.priceRupees}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSettingsForm((prev) => ({
                            ...prev,
                            pricingPackages: prev.pricingPackages.map((p, i) =>
                              i === index ? { ...p, priceRupees: val } : p
                            ),
                          }));
                        }}
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-xs font-mono text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-neutral-400 mb-1">
                        Points
                      </label>
                      <input
                        type="number"
                        value={pkg.points}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSettingsForm((prev) => ({
                            ...prev,
                            pricingPackages: prev.pricingPackages.map((p, i) =>
                              i === index ? { ...p, points: val } : p
                            ),
                          }));
                        }}
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-xs font-mono text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-neutral-400 mb-1">
                      Tagline / Notes
                    </label>
                    <input
                      type="text"
                      value={pkg.tagline}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSettingsForm((prev) => ({
                          ...prev,
                          pricingPackages: prev.pricingPackages.map((p, i) =>
                            i === index ? { ...p, tagline: val } : p
                          ),
                        }));
                      }}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-bold text-xs rounded-xl shadow hover:scale-105 transition-all flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Save Admin Pricing Rules</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Tab 3: System Transactions */}
      {activeTab === 'transactions' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-xl">
          <h3 className="text-base font-bold text-white font-heading mb-4">
            Complete Points Ledger & Audit Trail
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-400 uppercase text-[10px] tracking-wider">
                  <th className="pb-3">Timestamp</th>
                  <th className="pb-3">User</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Description</th>
                  <th className="pb-3">Payment</th>
                  <th className="pb-3 text-right">Points</th>
                  <th className="pb-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-neutral-800/30">
                    <td className="py-3 text-neutral-400">
                      {new Date(tx.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 text-white font-sans">{tx.userEmail}</td>
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
                    <td className="py-3 font-sans text-neutral-200">{tx.description}</td>
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
        </div>
      )}

      {/* Modal: Admin Add / Deduct Points */}
      {selectedUserForPoints && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
            <h3 className="text-xl font-bold font-heading text-white mb-1">
              Adjust Points Balance
            </h3>
            <p className="text-xs text-neutral-400 mb-4">
              Photographer:{' '}
              <span className="text-white font-semibold">{selectedUserForPoints.name}</span> (
              {selectedUserForPoints.studioName})
            </p>

            <div className="p-3 bg-neutral-950 rounded-2xl border border-neutral-800 mb-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-400">Standard Balance (2.5k photos):</span>
                <span className="font-mono font-bold text-amber-400">
                  {selectedUserForPoints.standardPoints !== undefined ? selectedUserForPoints.standardPoints : (selectedUserForPoints.points || 0)} Pts
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-purple-300 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" />
                  Premium Balance (5k photos):
                </span>
                <span className="font-mono font-bold text-purple-300">
                  {selectedUserForPoints.premiumPoints || 0} Pts
                </span>
              </div>
            </div>

            <form onSubmit={handleApplyPoints} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Select Point Type To Adjust
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPointsTierToAdjust('standard')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      pointsTierToAdjust === 'standard'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                        : 'bg-neutral-950 text-neutral-400 border border-neutral-800 hover:text-white'
                    }`}
                  >
                    <Coins className="w-3.5 h-3.5" />
                    <span>Standard (2.5k)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPointsTierToAdjust('premium')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      pointsTierToAdjust === 'premium'
                        ? 'bg-purple-500/20 text-purple-200 border border-purple-500/50'
                        : 'bg-neutral-950 text-neutral-400 border border-neutral-800 hover:text-white'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Premium (5k)</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Points To Add / Deduct (Use - for deduct)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPointsAdjustment((p) => p - 1)}
                    className="p-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    required
                    value={pointsAdjustment}
                    onChange={(e) => setPointsAdjustment(Number(e.target.value))}
                    className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-center text-sm font-mono font-bold text-white focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setPointsAdjustment((p) => p + 1)}
                    className="p-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setPointsAdjustment(1)}
                    className="flex-1 py-1 bg-neutral-950 hover:bg-neutral-800 text-[11px] font-mono text-neutral-300 rounded-lg border border-neutral-800"
                  >
                    +1 Pt (1 Event)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPointsAdjustment(5)}
                    className="flex-1 py-1 bg-neutral-950 hover:bg-neutral-800 text-[11px] font-mono text-neutral-300 rounded-lg border border-neutral-800"
                  >
                    +5 Pts
                  </button>
                  <button
                    type="button"
                    onClick={() => setPointsAdjustment(20)}
                    className="flex-1 py-1 bg-neutral-950 hover:bg-neutral-800 text-[11px] font-mono text-neutral-300 rounded-lg border border-neutral-800"
                  >
                    +20 Pts
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Reason / Internal Note
                </label>
                <input
                  type="text"
                  required
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  placeholder="e.g. Free Welcome Grant, Festival Offer"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedUserForPoints(null)}
                  className="px-4 py-2 rounded-xl border border-neutral-800 text-xs font-bold text-neutral-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-bold text-xs shadow hover:scale-105 transition-all"
                >
                  Save Points Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View & Edit Photographer Credentials */}
      {tempPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-neutral-800">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Photographer Credentials</h3>
                <p className="text-xs text-neutral-400">
                  {tempPasswordModal.user.name} ({tempPasswordModal.user.studioName})
                </p>
              </div>
            </div>

            {/* Login ID / Email */}
            <div className="mb-4">
              <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                Photographer Login ID (Email)
              </label>
              <div className="flex items-center gap-2 p-2.5 bg-neutral-950 rounded-xl border border-neutral-800">
                <span className="font-mono text-sm text-white flex-1 select-all">
                  {tempPasswordModal.user.email}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(tempPasswordModal.user.email, 'modal-id')}
                  className="px-2.5 py-1 bg-neutral-850 hover:bg-neutral-800 text-neutral-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  {copiedField === 'modal-id' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>Copy ID</span>
                </button>
              </div>
            </div>

            {/* Password Field */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => handleGenerateNewPassword(tempPasswordModal.user.id)}
                  className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Auto-Generate</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customPasswordInput}
                  onChange={(e) => setCustomPasswordInput(e.target.value)}
                  placeholder="Enter custom password"
                  className="flex-1 bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-xl px-3 py-2.5 font-mono font-bold text-base text-amber-300 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(customPasswordInput, 'modal-pass')}
                  className="px-3 py-2.5 bg-neutral-850 hover:bg-neutral-800 text-neutral-300 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors border border-neutral-800"
                  title="Copy Password"
                >
                  {copiedField === 'modal-pass' ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">
                Aap manchaha password type kar sakte hain ya Auto-Generate daba sakte hain.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleSaveCustomPassword(tempPasswordModal.user.id)}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-1.5"
              >
                <Key className="w-4 h-4" />
                <span>Send Password Reset Email</span>
              </button>

              <button
                type="button"
                onClick={() => sendCredentialsWhatsApp(tempPasswordModal.user)}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Send Studio Info on WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => setTempPasswordModal(null)}
                className="w-full py-2 bg-neutral-850 hover:bg-neutral-800 text-neutral-300 font-semibold text-xs rounded-xl transition-colors"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin ID & Password Self-Modification Modal */}
      {showAdminCredsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md bg-neutral-900 border border-amber-500/30 rounded-3xl p-6 sm:p-7 shadow-2xl overflow-hidden">
            <button
              onClick={() => setShowAdminCredsModal(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white p-2 rounded-xl hover:bg-neutral-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white font-heading">
                  Modify Admin Login ID & Password
                </h3>
                <span className="text-[10px] text-emerald-400 font-mono">
                  Super Admin Credentials Security
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveAdminCreds} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Admin Login ID (Email / Username)
                </label>
                <input
                  type="text"
                  required
                  value={adminEmailInput}
                  onChange={(e) => setAdminEmailInput(e.target.value)}
                  placeholder="e.g. admin@a1smartselection.com"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-neutral-300">
                    Admin Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAdminPasswordPlain(!showAdminPasswordPlain)}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1"
                  >
                    {showAdminPasswordPlain ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showAdminPasswordPlain ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
                <input
                  type={showAdminPasswordPlain ? 'text' : 'password'}
                  required
                  value={adminPassInput}
                  onChange={(e) => setAdminPassInput(e.target.value)}
                  placeholder="Enter secure password"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                />
                <p className="text-[11px] text-neutral-500 mt-1">
                  Yahan se apna naya private login ID aur password save kar lein. Agli baar isi se login hoga.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowAdminCredsModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-neutral-800 text-xs font-semibold text-neutral-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 text-neutral-950 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Secure Credentials</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Temporary Block / Unblock Confirmation Modal */}
      {userToBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-7 shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                  userToBlock.isBlocked
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}
              >
                {userToBlock.isBlocked ? (
                  <UserCheck className="w-5 h-5" />
                ) : (
                  <Ban className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white font-heading">
                  {userToBlock.isBlocked
                    ? 'Unblock Photographer Account'
                    : 'Temporarily Block Photographer'}
                </h3>
                <span className="text-xs text-neutral-400">
                  {userToBlock.studioName} ({userToBlock.name})
                </span>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed mb-4">
              {userToBlock.isBlocked
                ? 'Kya aap is photographer ko unblock karna chahte hain? Unblock hone ke baad ye photographer turant studio login kar sakega.'
                : 'Account block karne par photographer studio login nahi kar payega. Aap kabhi bhi yahan se wapas unblock kar sakte hain.'}
            </p>

            {!userToBlock.isBlocked && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Block Reason (Optional - Visible to Photographer on login attempt)
                </label>
                <input
                  type="text"
                  value={blockReasonInput}
                  onChange={(e) => setBlockReasonInput(e.target.value)}
                  placeholder="e.g. Account verification required / Please contact admin"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => {
                  setUserToBlock(null);
                  setBlockReasonInput('');
                }}
                className="px-4 py-2.5 rounded-xl border border-neutral-800 text-xs font-semibold text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBlock}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all flex items-center gap-1.5 ${
                  userToBlock.isBlocked
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-neutral-950 shadow-emerald-500/20'
                    : 'bg-amber-500 hover:bg-amber-400 text-neutral-950 shadow-amber-500/20'
                }`}
              >
                {userToBlock.isBlocked ? (
                  <>
                    <UserCheck className="w-4 h-4" />
                    <span>Confirm Unblock</span>
                  </>
                ) : (
                  <>
                    <Ban className="w-4 h-4" />
                    <span>Confirm Block</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Photographer Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md bg-neutral-900 border border-rose-500/40 rounded-3xl p-6 sm:p-7 shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white font-heading">
                  Permanently Delete Photographer?
                </h3>
                <span className="text-[10px] text-rose-400 font-mono">
                  DANGER • IRREVERSIBLE ACTION
                </span>
              </div>
            </div>

            <div className="bg-neutral-950 p-3 rounded-2xl border border-neutral-800 space-y-1 mb-4 text-xs font-mono">
              <div className="text-white font-bold">{userToDelete.name}</div>
              <div className="text-amber-400">{userToDelete.studioName}</div>
              <div className="text-neutral-400 text-[11px]">{userToDelete.email}</div>
              <div className="text-neutral-500 text-[11px]">
                Events: {events.filter((e) => e.photographerId === userToDelete.id).length} | Points: {userToDelete.points}
              </div>
            </div>

            <p className="text-xs text-rose-300/90 leading-relaxed mb-5">
              ⚠️ Warning: Is photographer ka account, login access, aur iske sabhi wedding events permanently delete ho jayenge. Yeh action irreversible hai aur data wapas recover nahi hoga.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-800">
              <button
                type="button"
                disabled={isDeletingUser}
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-neutral-800 text-xs font-semibold text-neutral-400 hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingUser}
                onClick={handleConfirmDelete}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeletingUser ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Yes, Permanently Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Super Admin Wipe All Testing Data Modal */}
      {showResetDataModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-lg bg-neutral-900 border border-rose-500/40 rounded-3xl p-6 sm:p-7 shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white font-heading">
                  Reset All Stored Test Data & Storage
                </h3>
                <span className="text-[10px] text-amber-400 font-mono font-bold">
                  CLEAN SLATE FOR REAL PRODUCTION PHOTOGRAPHERS
                </span>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-neutral-300 leading-relaxed mb-5">
              <p>
                Yeh action testing purpose ke dauran banaye gaye sabhi test data ko complete wipe kar dega:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-neutral-400">
                <li>Sabhi sample/testing wedding events aur galleries delete ho jayengi</li>
                <li>Sabhi uploaded test photo previews storage se remove ho jayenge</li>
                <li>Sabhi dummy/testing photographer accounts remove ho jayenge</li>
                <li>Testing point recharge transactions wipe ho jayenge</li>
                <li className="text-emerald-400 font-semibold">
                  Aapka Admin Account bilkul secure rahega aur login chalta rahega
                </li>
              </ul>
              <p className="text-[11px] text-neutral-500 italic pt-1">
                Iske baad website 100% brand-new ho jayegi taaki naye real photographers ka personal account fresh 0 points ke sath register kar sakein.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-neutral-800">
              <button
                type="button"
                disabled={isResettingData}
                onClick={() => setShowResetDataModal(false)}
                className="px-4 py-2.5 rounded-xl border border-neutral-800 text-xs font-semibold text-neutral-400 hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isResettingData}
                onClick={handleConfirmResetData}
                className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isResettingData ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Resetting System Data...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Wipe & Reset Everything Now</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hostinger Custom Domain a1smartselection.sbs DNS & Redirection Guide Modal */}
      {showDomainModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-xl w-full p-6 sm:p-7 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span>Hostinger Domain Setup</span>
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      a1smartselection.sbs
                    </span>
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Connect your purchased Hostinger domain to this live platform.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDomainModal(false)}
                className="text-neutral-500 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {/* Method 1: Hostinger Web Forwarding / Stealth Redirect (Easiest & Fastest, 2 Minutes) */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-emerald-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Option 1: Hostinger Domain Redirection (Recommended - 2 Min)
                  </span>
                  <span className="text-[10px] text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded">Fastest</span>
                </div>
                <p className="text-xs text-neutral-300 mt-1.5 leading-relaxed">
                  Hostinger hPanel me jakar <strong className="text-white">a1smartselection.sbs</strong> ko is live web application URL par redirect set karein:
                </p>

                <div className="mt-2.5 p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-between gap-2">
                  <div className="font-mono text-[11px] text-amber-300 truncate">
                    {window.location.origin}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.origin);
                      setCopiedDns('origin');
                      showToast('Live App URL copied!', 'success');
                      setTimeout(() => setCopiedDns(null), 2000);
                    }}
                    className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-white rounded text-xs font-semibold flex items-center gap-1 flex-shrink-0"
                  >
                    {copiedDns === 'origin' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedDns === 'origin' ? 'Copied' : 'Copy URL'}</span>
                  </button>
                </div>

                <div className="mt-3 text-[11px] text-neutral-400 space-y-1">
                  <div>1. Hostinger hPanel login karein &gt; <strong>Domains</strong> &gt; <strong>a1smartselection.sbs</strong> par click karein.</div>
                  <div>2. Left menu me <strong>"Redirects"</strong> (Domain Forwarding) par jayein.</div>
                  <div>3. Target URL me copy kiya gaya URL paste karein aur <strong>Create</strong> dabayein.</div>
                </div>
              </div>

              {/* Method 2: Hostinger DNS CNAME Record */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Option 2: DNS Records (CNAME Setup)
                </span>
                <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                  Agar aap subdomain (jaise <strong className="text-white">app.a1smartselection.sbs</strong>) ya Cloudflare proxy use karna chahte hain:
                </p>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-neutral-800 text-neutral-400 text-[11px]">
                        <th className="pb-1.5">Type</th>
                        <th className="pb-1.5">Name / Host</th>
                        <th className="pb-1.5">Target Value</th>
                        <th className="pb-1.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-900 text-neutral-200">
                      <tr>
                        <td className="py-2 text-amber-400 font-bold">CNAME</td>
                        <td className="py-2">@ (or www)</td>
                        <td className="py-2 text-neutral-300 truncate max-w-[180px]">
                          {window.location.hostname}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(window.location.hostname);
                              setCopiedDns('cname');
                              showToast('CNAME Target copied!', 'success');
                              setTimeout(() => setCopiedDns(null), 2000);
                            }}
                            className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 rounded text-[11px] text-white"
                          >
                            {copiedDns === 'cname' ? 'Copied' : 'Copy'}
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-neutral-800 flex items-center justify-between">
              <span className="text-[11px] text-neutral-500">
                Hostinger DNS propagation 10-30 min le sakta hai.
              </span>
              <button
                type="button"
                onClick={() => setShowDomainModal(false)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-semibold"
              >
                Done / Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Netlify & Web Deployment ZIP Download Modal */}
      {showDeployModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center flex-shrink-0">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span>Download Project ZIP for Netlify</span>
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      Ready to Deploy
                    </span>
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Netlify Drop, Hostinger, ya cPanel par deploy karne ke liye zip download karein.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDeployModal(false)}
                className="text-neutral-500 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {/* Option 1: Netlify Drop 1-Click ZIP (Pre-built production dist) */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-neutral-950 via-neutral-900 to-cyan-950/20 border border-cyan-500/40 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                    Option 1: Netlify Deploy ZIP (Production Ready dist)
                  </span>
                  <span className="text-[10px] font-bold text-cyan-300 bg-cyan-500/20 border border-cyan-500/30 px-2.5 py-0.5 rounded-full">
                    Recommended for Netlify
                  </span>
                </div>
                <p className="text-xs text-neutral-300 mt-2 leading-relaxed">
                  Isme pre-compiled production build files hain jisme <strong className="text-white">_redirects</strong> aur <strong className="text-white">netlify.toml</strong> pehle se set hain taaki Netlify par refresh karne par 404 error na aaye.
                </p>

                <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <a
                    href="/download-netlify-build"
                    download="a1smartselection-netlify-deploy.zip"
                    className="flex-1 py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-neutral-950 font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Netlify Deploy ZIP (~365 KB)</span>
                  </a>

                  <a
                    href="https://app.netlify.com/drop"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-3 px-4 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors border border-neutral-700"
                  >
                    <span>Open Netlify Drop</span>
                    <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
                  </a>
                </div>

                {/* Netlify 3-Step Guide */}
                <div className="mt-4 p-3.5 rounded-xl bg-neutral-950/90 border border-neutral-800 text-[11px] text-neutral-300 space-y-1.5">
                  <div className="font-bold text-cyan-300 flex items-center gap-1.5 mb-1">
                    <span>⚡ Netlify par 10 Second me Upload Karne ka Tareeqa:</span>
                  </div>
                  <div>1. Upar <strong>"Download Netlify Deploy ZIP"</strong> button dabakar file download karein.</div>
                  <div>2. Naye tab me <strong>app.netlify.com/drop</strong> kholein (free account login karein).</div>
                  <div>3. Download hui <strong>a1smartselection-netlify-deploy.zip</strong> file ko drag &amp; drop karein.</div>
                  <div className="text-emerald-400 font-semibold pt-1">
                    ✓ Done! Aapki website turant live ho jayegi free HTTPS/SSL ke saath!
                  </div>
                </div>
              </div>

              {/* Option 2: Full Source Code ZIP */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <Cloud className="w-3.5 h-3.5" />
                    Option 2: Complete Source Code ZIP
                  </span>
                  <span className="text-[10px] text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded">
                    GitHub / Developers
                  </span>
                </div>
                <p className="text-xs text-neutral-300 mt-1.5 leading-relaxed">
                  Agar aap GitHub repository me code push karna chahte hain ya local computer me VS Code me open karna chahte hain:
                </p>

                <div className="mt-3 flex items-center gap-3">
                  <a
                    href="/download-source-zip"
                    download="a1smartselection-full-source.zip"
                    className="py-2.5 px-4 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 font-bold text-xs rounded-xl flex items-center gap-2 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Full Source Code ZIP (~175 KB)</span>
                  </a>
                </div>
              </div>

              {/* Direct URLs info */}
              <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-850 text-xs">
                <span className="text-[11px] text-neutral-400 font-semibold block mb-1">
                  Direct Browser Download Links:
                </span>
                <div className="font-mono text-[11px] text-neutral-300 space-y-1">
                  <div className="truncate flex items-center justify-between gap-2 p-1.5 rounded bg-neutral-900">
                    <span className="truncate">{window.location.origin}/download-netlify-build</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/download-netlify-build`);
                        showToast('Link copied to clipboard!', 'success');
                      }}
                      className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[10px] rounded"
                    >
                      Copy Link
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-neutral-800 flex items-center justify-between">
              <span className="text-[11px] text-neutral-500">
                100% Client-Side + Firebase Live Sync Ready.
              </span>
              <button
                type="button"
                onClick={() => setShowDeployModal(false)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
