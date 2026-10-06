import { WeddingEvent, User, PointTransaction, AdminSettings } from '../types';
import { INITIAL_ADMIN_SETTINGS, INITIAL_USERS, INITIAL_EVENTS, INITIAL_TRANSACTIONS } from './mockData';

const STORAGE_KEYS = {
  USERS: 'a1_users_v4',
  CURRENT_USER_ID: 'a1_current_user_id_v4',
  EVENTS: 'a1_events_v4',
  TRANSACTIONS: 'a1_transactions_v4',
  SETTINGS: 'a1_settings_v4',
};

// Cleanup older versions and dummy data
try {
  ['a1_events_v1', 'a1_transactions_v1', 'a1_users_v1',
   'a1_events_v2', 'a1_transactions_v2', 'a1_users_v2', 'a1_current_user_id_v2',
   'a1_events_v3', 'a1_transactions_v3', 'a1_users_v3', 'a1_current_user_id_v3'].forEach((key) => {
    localStorage.removeItem(key);
  });
} catch {}

export const storage = {
  getUsers(): User[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USERS);
      if (!data) {
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(INITIAL_USERS));
        return INITIAL_USERS;
      }
      return JSON.parse(data);
    } catch {
      return INITIAL_USERS;
    }
  },

  saveUsers(users: User[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    } catch (e) {
      console.error('Failed to save users', e);
    }
  },

  getCurrentUserId(): string | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
      if (!stored) {
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, 'user-goldan-patel');
        return 'user-goldan-patel';
      }
      return stored;
    } catch {
      return 'user-goldan-patel';
    }
  },

  setCurrentUserId(id: string | null): void {
    try {
      if (id) {
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, id);
      } else {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
      }
    } catch (e) {
      console.error('Failed to set current user id', e);
    }
  },

  getEvents(): WeddingEvent[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EVENTS);
      if (!data) {
        localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(INITIAL_EVENTS));
        return INITIAL_EVENTS;
      }
      return JSON.parse(data);
    } catch {
      return INITIAL_EVENTS;
    }
  },

  saveEvents(events: WeddingEvent[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
    } catch {
      // If quota exceeded due to large photo base64 strings, save lightweight metadata copy to localStorage
      try {
        const lightweight = events.map((e) => ({
          ...e,
          photos: e.photos.map((p) => ({
            ...p,
            url: '', // strip heavy base64 from localStorage copy
            thumbnailUrl: '',
          })),
        }));
        localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(lightweight));
      } catch (innerErr) {
        console.warn('Could not save to localStorage:', innerErr);
      }
    }
  },

  getTransactions(): PointTransaction[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      if (!data) {
        localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(INITIAL_TRANSACTIONS));
        return INITIAL_TRANSACTIONS;
      }
      return JSON.parse(data);
    } catch {
      return INITIAL_TRANSACTIONS;
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
      return JSON.parse(data);
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

  resetAllData(): void {
    localStorage.removeItem(STORAGE_KEYS.USERS);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
    localStorage.removeItem(STORAGE_KEYS.EVENTS);
    localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
  }
};
