import { type Photo, isRemoteUrl } from '../types/index.ts';

const DB_NAME = 'a1_smart_selection_db_v2';
const DB_VERSION = 5;

const STORE_PHOTOS = 'event_photos';
const STORE_PHOTO_BLOBS = 'photo_blobs';
const STORE_SELECTIONS = 'client_selections';
const STORE_PENDING_UPLOADS = 'pending_uploads';
const STORE_OFFLINE_QUEUE = 'offline_queue';

export interface StoredPhotoBlobs {
  photoId: string;
  eventId: string;
  blob: Blob;
  thumbBlob: Blob;
  sizeBytes: number;
  width?: number;
  height?: number;
  updatedAt: number;
}

export interface ClientSelectionProgress {
  eventId: string;
  selectedPhotoIds: string[];
  clientNotes?: string;
  selectedCount: number;
  lastSavedAt: string;
}

export interface PendingUploadItem {
  id: string; // `${eventId}:${photoId}`
  eventId: string;
  photoId: string;
  folderId: string;
  folderName: string;
  filename: string;
  blob?: Blob; // optional for legacy backward compatibility
  thumbBlob?: Blob; // optional for legacy backward compatibility
  sizeBytes: number;
  width?: number;
  height?: number;
  status: 'pending' | 'uploading' | 'failed' | 'done';
  retries: number;
  error?: string;
  createdAt: string;
}

export interface OfflinePhotoAction {
  id: string; // `${eventId}:${photoId}` (deduped by photoId, last wins!)
  eventId: string;
  photoId: string;
  isSelected: boolean;
  selectedAt?: string;
  clientComment?: string;
  timestamp: number;
}

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
        db.createObjectStore(STORE_PHOTOS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_PHOTO_BLOBS)) {
        const blobStore = db.createObjectStore(STORE_PHOTO_BLOBS, { keyPath: 'photoId' });
        blobStore.createIndex('eventId', 'eventId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SELECTIONS)) {
        db.createObjectStore(STORE_SELECTIONS, { keyPath: 'eventId' });
      }
      if (!db.objectStoreNames.contains(STORE_PENDING_UPLOADS)) {
        const uploadStore = db.createObjectStore(STORE_PENDING_UPLOADS, { keyPath: 'id' });
        uploadStore.createIndex('eventId', 'eventId', { unique: false });
        uploadStore.createIndex('status', 'status', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_OFFLINE_QUEUE)) {
        const queueStore = db.createObjectStore(STORE_OFFLINE_QUEUE, { keyPath: 'id' });
        queueStore.createIndex('eventId', 'eventId', { unique: false });
        queueStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const idbStorage = {
  // ---------------------------------------------------------------------------
  // 1. Client Selection Auto-Save (Every 30s)
  // ---------------------------------------------------------------------------
  async saveSelectionProgress(
    eventId: string,
    selectedPhotoIds: string[],
    clientNotes?: string
  ): Promise<void> {
    if (!eventId) return;
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_SELECTIONS, 'readwrite');
      const store = tx.objectStore(STORE_SELECTIONS);
      const record: ClientSelectionProgress = {
        eventId,
        selectedPhotoIds: Array.from(new Set(selectedPhotoIds || [])),
        clientNotes: clientNotes || '',
        selectedCount: (selectedPhotoIds || []).length,
        lastSavedAt: new Date().toISOString(),
      };
      store.put(record);
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (e) {
      console.warn('IDB saveSelectionProgress error:', e);
    }
  },

  async getSelectionProgress(eventId: string): Promise<ClientSelectionProgress | null> {
    if (!eventId) return null;
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_SELECTIONS, 'readonly');
      const store = tx.objectStore(STORE_SELECTIONS);
      const req = store.get(eventId);
      return new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  },

  async clearSelectionProgress(eventId: string): Promise<void> {
    if (!eventId) return;
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_SELECTIONS, 'readwrite');
      const store = tx.objectStore(STORE_SELECTIONS);
      store.delete(eventId);
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (e) {
      console.warn('IDB clearSelectionProgress error:', e);
    }
  },

  // ---------------------------------------------------------------------------
  // 2. Pending Blobs Upload Queue (P4: Persist pending Blobs so refresh/crash resumes)
  // ---------------------------------------------------------------------------
  async savePendingUploadsBatch(items: PendingUploadItem[]): Promise<void> {
    if (!items.length) return;
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_PENDING_UPLOADS, 'readwrite');
      const store = tx.objectStore(STORE_PENDING_UPLOADS);
      for (const item of items) {
        store.put(item);
      }
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (err) {
      console.error('Failed to save pending uploads to IDB:', err);
    }
  },

  async getPendingUploads(eventId?: string): Promise<PendingUploadItem[]> {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_PENDING_UPLOADS, 'readonly');
      const store = tx.objectStore(STORE_PENDING_UPLOADS);
      const req = store.getAll();
      return new Promise((resolve) => {
        req.onsuccess = () => {
          const list = (req.result || []) as PendingUploadItem[];
          if (eventId) {
            resolve(list.filter((x) => x.eventId === eventId));
          } else {
            resolve(list);
          }
        };
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  },

  async updatePendingUpload(id: string, updates: Partial<PendingUploadItem>): Promise<void> {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_PENDING_UPLOADS, 'readwrite');
      const store = tx.objectStore(STORE_PENDING_UPLOADS);
      const req = store.get(id);
      req.onsuccess = () => {
        if (req.result) {
          store.put({ ...req.result, ...updates });
        }
      };
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {}
  },

  async removePendingUpload(id: string): Promise<void> {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_PENDING_UPLOADS, 'readwrite');
      tx.objectStore(STORE_PENDING_UPLOADS).delete(id);
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {}
  },

  async clearPendingUploadsForEvent(eventId: string): Promise<void> {
    if (!eventId) return;
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_PENDING_UPLOADS, 'readwrite');
      const store = tx.objectStore(STORE_PENDING_UPLOADS);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result || []) as PendingUploadItem[];
        for (const item of items) {
          if (item.eventId === eventId) {
            store.delete(item.id);
          }
        }
      };
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {}
  },

  // ---------------------------------------------------------------------------
  // 3. Persistent Offline Actions Queue (Y5: Deduped by photoId, last wins)
  // ---------------------------------------------------------------------------
  async enqueueOfflineAction(
    eventId: string,
    photoId: string,
    isSelected: boolean,
    selectedAt?: string,
    clientComment?: string
  ): Promise<number> {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_OFFLINE_QUEUE, 'readwrite');
      const store = tx.objectStore(STORE_OFFLINE_QUEUE);
      const id = `${eventId}:${photoId}`;
      const action: OfflinePhotoAction = {
        id,
        eventId,
        photoId,
        isSelected,
        selectedAt: selectedAt || new Date().toISOString(),
        clientComment,
        timestamp: Date.now(),
      };
      store.put(action);
      return new Promise((resolve) => {
        tx.oncomplete = async () => {
          const count = await idbStorage.getOfflineActionsCount();
          resolve(count);
        };
        tx.onerror = () => resolve(0);
      });
    } catch {
      return 0;
    }
  },

  async getOfflineActions(): Promise<OfflinePhotoAction[]> {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_OFFLINE_QUEUE, 'readonly');
      const store = tx.objectStore(STORE_OFFLINE_QUEUE);
      const req = store.getAll();
      return new Promise((resolve) => {
        req.onsuccess = () => {
          const items = (req.result || []) as OfflinePhotoAction[];
          items.sort((a, b) => a.timestamp - b.timestamp);
          resolve(items);
        };
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  },

  async getOfflineActionsCount(): Promise<number> {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_OFFLINE_QUEUE, 'readonly');
      const store = tx.objectStore(STORE_OFFLINE_QUEUE);
      const req = store.count();
      return new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result || 0);
        req.onerror = () => resolve(0);
      });
    } catch {
      return 0;
    }
  },

  async removeOfflineAction(id: string): Promise<void> {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_OFFLINE_QUEUE, 'readwrite');
      tx.objectStore(STORE_OFFLINE_QUEUE).delete(id);
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {}
  },

  async clearOfflineActions(): Promise<void> {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_OFFLINE_QUEUE, 'readwrite');
      tx.objectStore(STORE_OFFLINE_QUEUE).clear();
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {}
  },

  // ---------------------------------------------------------------------------
  // 3b. Dedicated Photo Blobs Store (P1: Full & Thumb Blobs keyed by photoId)
  // ---------------------------------------------------------------------------
  async savePhotoBlobs(
    items: Array<{
      photoId: string;
      eventId: string;
      blob: Blob;
      thumbBlob: Blob;
      sizeBytes?: number;
      width?: number;
      height?: number;
    }>
  ): Promise<void> {
    if (!items.length) return;
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_PHOTO_BLOBS, 'readwrite');
      const store = tx.objectStore(STORE_PHOTO_BLOBS);
      const now = Date.now();
      for (const item of items) {
        const record: StoredPhotoBlobs = {
          photoId: item.photoId,
          eventId: item.eventId,
          blob: item.blob,
          thumbBlob: item.thumbBlob,
          sizeBytes: item.sizeBytes || item.blob.size,
          width: item.width,
          height: item.height,
          updatedAt: now,
        };
        store.put(record);
      }
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (err) {
      console.error('Failed to save photo blobs to IDB:', err);
    }
  },

  async getPhotoBlob(photoId: string): Promise<StoredPhotoBlobs | null> {
    if (!photoId) return null;
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_PHOTO_BLOBS, 'readonly');
      const store = tx.objectStore(STORE_PHOTO_BLOBS);
      const req = store.get(photoId);
      return new Promise((resolve) => {
        req.onsuccess = () => resolve((req.result as StoredPhotoBlobs) || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  },

  async deletePhotoBlobs(photoIds: string[]): Promise<void> {
    if (!photoIds || !photoIds.length) return;
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_PHOTO_BLOBS, 'readwrite');
      const store = tx.objectStore(STORE_PHOTO_BLOBS);
      for (const id of photoIds) {
        store.delete(id);
      }
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {}
  },

  async clearPhotoBlobsForEvent(eventId: string): Promise<void> {
    if (!eventId) return;
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_PHOTO_BLOBS, 'readwrite');
      const store = tx.objectStore(STORE_PHOTO_BLOBS);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result || []) as StoredPhotoBlobs[];
        for (const item of list) {
          if (item.eventId === eventId) {
            store.delete(item.photoId);
          }
        }
      };
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {}
  },

  // ---------------------------------------------------------------------------
  // 4. Photos Cache (IndexedDB for fast client rendering - NO blob:/data: URLs)
  // ---------------------------------------------------------------------------
  async saveEventPhotos(eventId: string, photos: Photo[]): Promise<void> {
    if (!eventId || !photos.length) return;
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_PHOTOS, 'readwrite');
      const store = tx.objectStore(STORE_PHOTOS);
      for (const p of photos) {
        // Enforce: NO blob: or data: URLs stored persistently in IndexedDB
        const safeUrl = isRemoteUrl(p.url) ? p.url : '';
        const safeThumb = isRemoteUrl(p.thumbnailUrl) ? p.thumbnailUrl : '';
        store.put({
          ...p,
          eventId,
          url: safeUrl,
          thumbnailUrl: safeThumb,
        });
      }
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (e) {
      console.warn('IDB saveEventPhotos error:', e);
    }
  },

  async getEventPhotos(eventId: string): Promise<Photo[]> {
    if (!eventId) return [];
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_PHOTOS, 'readonly');
      const store = tx.objectStore(STORE_PHOTOS);
      const req = store.getAll();
      return new Promise((resolve) => {
        req.onsuccess = () => {
          const list = (req.result || []) as (Photo & { eventId?: string })[];
          const filtered = list.filter((p) => p.eventId === eventId);
          resolve(filtered);
        };
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  },

  async deleteEventPhotos(eventId: string): Promise<void> {
    if (!eventId) return;
    try {
      const db = await getDB();
      const tx = db.transaction([STORE_PHOTOS, STORE_PHOTO_BLOBS], 'readwrite');
      const store = tx.objectStore(STORE_PHOTOS);
      const blobStore = tx.objectStore(STORE_PHOTO_BLOBS);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result || []) as (Photo & { eventId?: string })[];
        for (const p of list) {
          if (p.eventId === eventId) {
            store.delete(p.id);
            blobStore.delete(p.id);
          }
        }
      };
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {}
  },

  async deletePhoto(eventId: string, photoId: string): Promise<void> {
    try {
      const db = await getDB();
      const tx = db.transaction([STORE_PHOTOS, STORE_PHOTO_BLOBS], 'readwrite');
      tx.objectStore(STORE_PHOTOS).delete(photoId);
      tx.objectStore(STORE_PHOTO_BLOBS).delete(photoId);
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {}
  },

  async deletePhotosByIds(photoIds: string[]): Promise<void> {
    if (!photoIds || !photoIds.length) return;
    try {
      const db = await getDB();
      const tx = db.transaction([STORE_PHOTOS, STORE_PHOTO_BLOBS], 'readwrite');
      const store = tx.objectStore(STORE_PHOTOS);
      const blobStore = tx.objectStore(STORE_PHOTO_BLOBS);
      for (const id of photoIds) {
        store.delete(id);
        blobStore.delete(id);
      }
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {}
  },

  async deleteFolderPhotos(eventId: string, folderId?: string, folderName?: string): Promise<void> {
    if (!eventId) return;
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_PHOTOS, 'readwrite');
      const store = tx.objectStore(STORE_PHOTOS);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result || []) as (Photo & { eventId?: string })[];
        const targetClean = (folderName || '').toLowerCase().trim();
        for (const p of list) {
          if (p.eventId === eventId) {
            const matchesId = folderId && p.folderId === folderId;
            const matchesName = targetClean && (p.folderName || '').toLowerCase().trim() === targetClean;
            if (matchesId || matchesName) {
              store.delete(p.id);
            }
          }
        }
      };
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {}
  },

  async getAllEventsPhotoCounts(): Promise<Map<string, { count: number; coverUrl?: string }>> {
    const result = new Map<string, { count: number; coverUrl?: string }>();
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_PHOTOS, 'readonly');
      const store = tx.objectStore(STORE_PHOTOS);
      const req = store.getAll();
      return new Promise((resolve) => {
        req.onsuccess = () => {
          const list = (req.result || []) as (Photo & { eventId?: string })[];
          for (const p of list) {
            if (!p.eventId) continue;
            const existing = result.get(p.eventId) || { count: 0 };
            existing.count++;
            if (!existing.coverUrl) {
              existing.coverUrl = p.thumbnailUrl || p.url;
            }
            result.set(p.eventId, existing);
          }
          resolve(result);
        };
        req.onerror = () => resolve(result);
      });
    } catch {
      return result;
    }
  },

  async clearAll(): Promise<void> {
    try {
      const db = await getDB();
      const storeNames = [
        STORE_PHOTOS,
        STORE_PHOTO_BLOBS,
        STORE_SELECTIONS,
        STORE_PENDING_UPLOADS,
        STORE_OFFLINE_QUEUE,
      ];
      const tx = db.transaction(storeNames, 'readwrite');
      for (const name of storeNames) {
        if (db.objectStoreNames.contains(name)) {
          tx.objectStore(name).clear();
        }
      }
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {}
  },

  // Tombstone compatibility methods (noop since true deletion is enforced)
  async addPhotoTombstones(_eventId: string, _photoIds: string[], _folderName?: string): Promise<void> {},
  async getEventTombstoneIds(_eventId: string): Promise<string[]> { return []; },
  async getEventTombstoneFolders(_eventId: string): Promise<string[]> { return []; },
};
