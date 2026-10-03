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
    runStorageAutoClean,
    navigateTo,
    showToast,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'photographers' | 'pricing' | 'transactions'>('photographers');

  // Modals / point adjustment states
  const [selectedUserForPoints, setSelectedUserForPoints] = useState<User | null>(null);
  const [pointsAdjustment, setPointsAdjustment] = useState<number>(5);
  const [adjustmentReason, setAdjustmentReason] = useState<string>('Free Welcome Grant');

  // Reset password display
  const [tempPasswordModal, setTempPasswordModal] = useState<{ user: User; pass: string } | null>(null);

  // Editable pricing settings
  const [settingsForm, setSettingsForm] = useState<AdminSettings>(() => ({
    ...adminSettings,
    pricingPackages: adminSettings.pricingPackages.map((p) => ({ ...p })),
  }));

  const photographers = users.filter((u) => u.role === 'photographer');
  const totalEvents = events.length;
  const totalPhotos = events.reduce((sum, e) => sum + e.photos.length, 0);
  const totalRevenue = transactions
    .filter((t) => t.amountRupees)
    .reduce((sum, t) => sum + (t.amountRupees || 0), 0);

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
          <p className="text-xs text-neutral-400">
            Control photographers, adjust points balances, manage pricing packages and inspect system activity.
          </p>
        </div>

        <button
          onClick={() => navigateTo('dashboard')}
          className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 self-start sm:self-auto"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Exit to Studio View</span>
        </button>
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

      {/* 50-Day Storage Policy & Auto-Cleanup Management */}
      <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Cloud Storage Lifecycle (50-Day Policy Active)
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Har uploaded event ko 50 din tak full preview storage mein rakha jaata hai. 50 din baad server storage saving ke liye previews auto-purge ho jaate hain (Client selection numbers, comments aur .BAT scripts 100% safe rehte hain).
          </p>
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
          className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap self-start sm:self-auto transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
          <span>Run 50-Day Storage Clean Now</span>
        </button>
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
              <p className="text-xs text-neutral-400">
                Admin can give free points, deduct points, or reset studio passwords.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-400 uppercase text-[10px] tracking-wider">
                  <th className="pb-3">Photographer / Studio</th>
                  <th className="pb-3">Email & Contact</th>
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
                      <td className="py-4 font-mono text-neutral-400">
                        <div>{user.email}</div>
                        <div className="text-[11px] text-neutral-500">{user.phone}</div>
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
                            onClick={() => handleResetPassword(user)}
                            className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-xl text-xs transition-colors"
                            title="Reset Password"
                          >
                            <Key className="w-3.5 h-3.5" />
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

      {/* Modal: Password Reset Display */}
      {tempPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-3xl p-6 text-center shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-3">
              <Key className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-white mb-1">Temporary Password</h3>
            <p className="text-xs text-neutral-400 mb-4">
              Generated for {tempPasswordModal.user.name} ({tempPasswordModal.user.email})
            </p>

            <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 font-mono font-bold text-lg text-amber-300 select-all mb-4">
              {tempPasswordModal.pass}
            </div>

            <button
              onClick={() => setTempPasswordModal(null)}
              className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs rounded-xl"
            >
              Done & Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
