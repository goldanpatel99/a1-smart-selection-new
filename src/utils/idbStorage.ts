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
};
