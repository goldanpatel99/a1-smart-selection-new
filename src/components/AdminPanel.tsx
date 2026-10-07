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
} from 'lucide-react';
import { User, AdminSettings } from '../types';

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
    runStorageAutoClean,
    navigateTo,
    showToast,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'photographers' | 'pricing' | 'transactions'>('photographers');

  // Modals / point adjustment states
  const [selectedUserForPoints, setSelectedUserForPoints] = useState<User | null>(null);
  const [pointsAdjustment, setPointsAdjustment] = useState<number>(5);
  const [adjustmentReason, setAdjustmentReason] = useState<string>('Free Welcome Grant');

  // Reset password & credentials management
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [tempPasswordModal, setTempPasswordModal] = useState<{ user: User; pass: string } | null>(null);
  const [customPasswordInput, setCustomPasswordInput] = useState<string>('');

  // Admin Self-Credentials Modification Modal State
  const adminUser = users.find((u) => u.role === 'admin');
  const [showAdminCredsModal, setShowAdminCredsModal] = useState(false);
  const [adminEmailInput, setAdminEmailInput] = useState(adminUser?.email || 'admin@a1smartselection.com');
  const [adminPassInput, setAdminPassInput] = useState(adminUser?.password || 'admin');
  const [showAdminPasswordPlain, setShowAdminPasswordPlain] = useState(false);

  const handleSaveAdminCreds = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmailInput.trim() || !adminPassInput.trim()) {
      showToast('Admin email aur password empty nahi ho sakte!', 'error');
      return;
    }
    const ok = adminUpdateOwnCredentials(adminEmailInput.trim(), adminPassInput.trim());
    if (ok) {
      setShowAdminCredsModal(false);
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
    const pass = user.password || '123456';
    const message = encodeURIComponent(
      `Hello ${user.name},\n\nA1 Smart Selection Studio Credentials:\n• Studio: ${user.studioName}\n• Login ID (Email): ${user.email}\n• Password: ${pass}\n\nLogin URL: ${window.location.origin}\nThank you!`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  const handleOpenPasswordModal = (user: User) => {
    const currentPass = user.password || '123456';
    setCustomPasswordInput(currentPass);
    setTempPasswordModal({ user, pass: currentPass });
  };

  const handleSaveCustomPassword = (userId: string) => {
    if (!customPasswordInput.trim()) {
      showToast('Password cannot be empty!', 'error');
      return;
    }
    const updatedPass = adminResetPassword(userId, customPasswordInput.trim());
    if (tempPasswordModal) {
      setTempPasswordModal({ ...tempPasswordModal, pass: updatedPass });
    }
  };

  const handleGenerateNewPassword = (userId: string) => {
    const generated = `A1-${Math.floor(100000 + Math.random() * 900000)}`;
    setCustomPasswordInput(generated);
    const updatedPass = adminResetPassword(userId, generated);
    if (tempPasswordModal) {
      setTempPasswordModal({ ...tempPasswordModal, pass: updatedPass });
    }
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
    adminAddPoints(selectedUserForPoints.id, Number(pointsAdjustment), adjustmentReason);
    setSelectedUserForPoints(null);
  };

  const handleResetPassword = (user: User) => {
    const tempPass = adminResetPassword(user.id);
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

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={() => {
              setAdminEmailInput(adminUser?.email || 'admin@a1smartselection.com');
              setAdminPassInput(adminUser?.password || 'admin');
              setShowAdminCredsModal(true);
            }}
            className="px-3.5 py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Key className="w-3.5 h-3.5" />
            <span>Modify Admin ID & Pass</span>
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

          <button
            onClick={() => {
              const count = runStorageAutoClean();
              showToast(
                count > 0
                  ? `${count} events older than 50 days successfully cleaned!`
                  : 'All events are currently within 50 days policy or already optimized.',
                'success'
              );
            }}
            className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap self-start sm:self-auto transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Run 50-Day Auto Purge</span>
          </button>
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
                          <div className="font-bold text-white text-sm">{user.name}</div>
                          <div className="text-xs text-amber-400 font-medium">
                            {user.studioName}
                          </div>
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
                              PASS
                            </span>
                            <span className="font-mono font-bold text-amber-300 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800 select-all">
                              {showPasswords[user.id] ? (user.password || '123456') : '••••••••'}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleShowPassword(user.id)}
                              className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors"
                              title={showPasswords[user.id] ? 'Hide Password' : 'Show Password'}
                            >
                              {showPasswords[user.id] ? (
                                <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(user.password || '123456', `pass-${user.id}`)}
                              className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors"
                              title="Copy Password"
                            >
                              {copiedField === `pass-${user.id}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => sendCredentialsWhatsApp(user)}
                              className="p-1 text-emerald-400 hover:text-emerald-300 rounded hover:bg-emerald-950/40 transition-colors ml-1"
                              title="Send ID & Password via WhatsApp"
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
                          <span
                            className={`font-mono font-extrabold text-sm px-2.5 py-1 rounded-full ${
                              user.points === 0
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {user.points} pts
                          </span>
                        </td>
                        <td className="py-4 text-neutral-400 font-mono text-[11px]">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setSelectedUserForPoints(user)}
                              className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold rounded-xl text-xs flex items-center gap-1 transition-colors"
                            >
                              <Coins className="w-3.5 h-3.5" />
                              <span>Add / Edit Points</span>
                            </button>

                            <button
                              onClick={() => handleOpenPasswordModal(user)}
                              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white rounded-xl text-xs flex items-center gap-1 font-semibold transition-colors border border-neutral-700"
                              title="View & Edit Password"
                            >
                              <Key className="w-3.5 h-3.5 text-amber-400" />
                              <span>Reset / Edit Pass</span>
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
                  <div className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    Package {index + 1}
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

            <div className="p-3 bg-neutral-950 rounded-2xl border border-neutral-800 mb-4 flex items-center justify-between">
              <span className="text-xs text-neutral-400">Current Balance:</span>
              <span className="text-base font-mono font-bold text-amber-400">
                {selectedUserForPoints.points} Points
              </span>
            </div>

            <form onSubmit={handleApplyPoints} className="space-y-4">
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
                <Save className="w-4 h-4" />
                <span>Save Password to Cloud Firestore</span>
              </button>

              <button
                type="button"
                onClick={() => sendCredentialsWhatsApp(tempPasswordModal.user)}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Send ID & Pass on WhatsApp</span>
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
    </div>
  );
};
