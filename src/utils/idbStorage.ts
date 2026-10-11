import { Photo } from '../types';

const DB_NAME = 'a1_smart_selection_db_v1';
const DB_VERSION = 1;
const STORE_NAME = 'event_photos';

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const idbStorage = {
  async saveEventPhotos(eventId: string, photos: Photo[]): Promise<void> {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const photo of photos) {
        store.put({ ...photo, eventId });
      }
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('IDB saveEventPhotos error:', e);
    }
  },

  async getEventPhotos(eventId: string): Promise<Photo[]> {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      return new Promise((resolve) => {
        request.onsuccess = () => {
          const all = (request.result || []) as Array<Photo & { eventId: string }>;
          const filtered = all.filter((item) => item.eventId === eventId);
          resolve(filtered);
        };
        request.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  },

  async getAllEventsPhotoCounts(): Promise<Map<string, { count: number; coverUrl?: string; folders: string[] }>> {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      return new Promise((resolve) => {
        request.onsuccess = () => {
          const all = (request.result || []) as Array<Photo & { eventId: string }>;
          const map = new Map<string, { count: number; coverUrl?: string; folders: string[] }>();
          for (const item of all) {
            if (!item.eventId) continue;
            const current = map.get(item.eventId) || { count: 0, folders: [] };
            current.count++;
            if (!current.coverUrl && (item.thumbnailUrl || item.url)) {
              current.coverUrl = item.thumbnailUrl || item.url;
            }
            if (item.folderName && !current.folders.includes(item.folderName)) {
              current.folders.push(item.folderName);
            }
            map.set(item.eventId, current);
          }
          resolve(map);
        };
        request.onerror = () => resolve(new Map());
      });
    } catch {
      return new Map();
    }
  },

  async deleteEventPhotos(eventId: string, photoId?: string): Promise<void> {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      if (photoId) {
        store.delete(photoId);
      } else {
        const req = store.getAll();
        req.onsuccess = () => {
          const all = (req.result || []) as Array<Photo & { eventId: string }>;
          all.filter((i) => i.eventId === eventId).forEach((i) => store.delete(i.id));
        };
      }
    } catch (e) {
      console.warn('IDB delete error:', e);
    }
  },

  async clearAll(): Promise<void> {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (e) {
      console.warn('IDB clearAll error:', e);
    }
  },
};
