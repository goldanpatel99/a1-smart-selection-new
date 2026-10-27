import { WeddingEvent, User, PointTransaction, AdminSettings } from '../types';
import { INITIAL_ADMIN_SETTINGS } from './mockData';

const STORAGE_KEYS = {
  CACHED_PROFILE: 'a1_cached_profile_v6',
  CURRENT_USER_ID: 'a1_current_user_id_v6',
  ACTIVE_EVENT_ID: 'a1_active_event_id_v6',
  EVENTS: 'a1_events_v6',
  TRANSACTIONS: 'a1_transactions_v6',
  SETTINGS: 'a1_settings_v6',
};

// Cleanup older versions, leftover mutations and reclaim storage quota
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('firestore_mutations_') || key.startsWith('a1_events_v') || key.startsWith('a1_transactions_v'))) {
        if (key !== STORAGE_KEYS.EVENTS && key !== STORAGE_KEYS.TRANSACTIONS) {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  }
} catch {}

export const storage = {
  getCachedProfile(): User | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CACHED_PROFILE);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  saveCachedProfile(user: User | null): void {
    try {
      if (user) {
        // Strip sensitive fields, keep only UI preferences and profile info
        const safeProfile: Partial<User> = {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          studioName: user.studioName,
          role: user.role,
          watermarkText: user.watermarkText,
          watermarkPosition: user.watermarkPosition,
          watermarkOpacity: user.watermarkOpacity,
          defaultPhotosPerSheet: user.defaultPhotosPerSheet,
          studioLogoUrl: user.studioLogoUrl,
        };
        localStorage.setItem(STORAGE_KEYS.CACHED_PROFILE, JSON.stringify(safeProfile));
      } else {
        localStorage.removeItem(STORAGE_KEYS.CACHED_PROFILE);
      }
    } catch (e) {
      console.warn('Failed to save cached profile', e);
    }
  },

  getUsers(): User[] {
    return [];
  },

  saveUsers(_users: User[]): void {},

  getCurrentUserId(): string | null {
    try {
      // Security: Session is stored in sessionStorage so closing the tab/browser automatically ends the session
      return sessionStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
    } catch {
      return null;
    }
  },

  setCurrentUserId(id: string | null): void {
    try {
      if (id) {
        sessionStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, id);
      } else {
        sessionStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
      }
      // Also ensure localStorage does not retain any persistent auto-login token
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
    } catch (e) {
      console.error('Failed to set current user id', e);
    }
  },

  getActiveEventId(): string | null {
    try {
      return sessionStorage.getItem(STORAGE_KEYS.ACTIVE_EVENT_ID) || localStorage.getItem(STORAGE_KEYS.ACTIVE_EVENT_ID);
    } catch {
      return null;
    }
  },

  setActiveEventId(id: string | null): void {
    try {
      if (id) {
        sessionStorage.setItem(STORAGE_KEYS.ACTIVE_EVENT_ID, id);
        localStorage.setItem(STORAGE_KEYS.ACTIVE_EVENT_ID, id);
      } else {
        sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_EVENT_ID);
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_EVENT_ID);
      }
    } catch {}
  },

  getEvents(): WeddingEvent[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EVENTS);
      if (!data) return [];
      const parsed: WeddingEvent[] = JSON.parse(data);
      return parsed.map((e) => ({
        ...e,
        photos: e.photos || [],
        folders: e.folders || [],
        photosCount: Math.max(e.photosCount || 0, (e.photos || []).length),
      }));
    } catch {
      return [];
    }
  },

  saveEvents(events: WeddingEvent[]): void {
    try {
      // High-volume performance optimization:
      // Strip heavy base64 photo arrays from localStorage (full photos are safely in IndexedDB).
      // This guarantees localStorage stays under 5MB quota and JSON.stringify runs in <1ms without UI freeze.
      const lightweight = events.map((e) => ({
        ...e,
        photosCount: Math.max(e.photosCount || 0, (e.photos || []).length),
        photos: [], // keep empty in localStorage metadata; loaded on demand from IndexedDB
      }));
      localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(lightweight));
    } catch (err) {
      console.warn('Could not save lightweight events to localStorage:', err);
    }
  },

  getTransactions(): PointTransaction[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      if (!data) return [];
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  saveTransactions(transactions: PointTransaction[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
    } catch (e) {
      console.error('Failed to save transactions', e);
    }
  },

  getSettings(): AdminSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!data) {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(INITIAL_ADMIN_SETTINGS));
        return INITIAL_ADMIN_SETTINGS;
      }
      const parsed: AdminSettings = JSON.parse(data);
      // Auto-migrate if older version with only 3 generic packages or old pricing (199 / 3000)
      const hasUpdatedPackages =
        Array.isArray(parsed.pricingPackages) &&
        parsed.pricingPackages.length >= 6 &&
        parsed.pricingPackages.some((p) => p.id === 'pkg-prm-1' && p.priceRupees === 249) &&
        parsed.pricingPackages.some((p) => p.id === 'pkg-prm-5' && p.priceRupees === 1199) &&
        parsed.pricingPackages.some((p) => p.id === 'pkg-std-1' && p.photosLimit === 2500);

      if (!hasUpdatedPackages) {
        const upgraded: AdminSettings = {
          ...parsed,
          pricingPackages: INITIAL_ADMIN_SETTINGS.pricingPackages,
        };
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(upgraded));
        return upgraded;
      }

      return parsed;
    } catch {
      return INITIAL_ADMIN_SETTINGS;
    }
  },

  saveSettings(settings: AdminSettings): void {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  },

  clearCachedProfile(): void {
    localStorage.removeItem(STORAGE_KEYS.CACHED_PROFILE);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
  },

  resetAllData(): void {
    localStorage.removeItem(STORAGE_KEYS.CACHED_PROFILE);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_EVENT_ID);
    localStorage.removeItem(STORAGE_KEYS.EVENTS);
    localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
  }
};
