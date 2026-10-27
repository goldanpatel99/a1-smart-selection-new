import { auth } from '../firebase.ts';
import { idbStorage, type PendingUploadItem } from './idbStorage.ts';
import { firebaseService, isFirestoreQuotaExhausted } from '../services/firebaseService.ts';

export interface CloudSyncProgress {
  eventId: string;
  total: number;
  synced: number;
  inFlight: number;
  failed: number;
  speedFps: number;
  status: 'idle' | 'syncing' | 'completed' | 'paused' | 'error';
  lastError?: string;
  failedItems?: PendingUploadItem[];
}

type ProgressListener = (progress: CloudSyncProgress) => void;

interface PresignCacheEntry {
  photoId: string;
  fullUploadUrl: string;
  fullPublicUrl: string;
  fullKey: string;
  thumbUploadUrl: string;
  thumbPublicUrl: string;
  thumbKey: string;
  expiresAt: number;
}

export class SyncError extends Error {
  code: string;
  status?: number;

  constructor(message: string, code: string, status?: number) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
    this.status = status;
  }
}

export interface CloudSyncDependencies {
  auth?: any;
  idbStorage?: any;
  firebaseService?: any;
  isFirestoreQuotaExhausted?: () => boolean;
  fetchFn?: typeof fetch;
}

export class CloudSyncQueueManager {
  private queue: PendingUploadItem[] = [];
  private inFlightMap = new Map<string, boolean>();
  private scheduledRetryIds = new Set<string>();
  private eventProgressMap = new Map<string, CloudSyncProgress>();
  private pausedEvents = new Map<string, string>(); // eventId -> reason
  private listeners: Set<ProgressListener> = new Set();
  private isProcessing = false;
  private concurrency = 4; // Concurrency 4 per specification
  private recentSyncTimestamps: number[] = [];
  private toastNotifier?: (msg: string, type: 'success' | 'error' | 'info') => void;
  private presignCache = new Map<string, PresignCacheEntry>();
  private retryTimers = new Map<string, NodeJS.Timeout>();

  private authInstance: any;
  private idbInstance: any;
  private firebaseServiceInstance: any;
  private isQuotaExhaustedFn: () => boolean;
  private fetchImpl: typeof fetch;

  constructor(deps?: CloudSyncDependencies) {
    this.authInstance = deps?.auth ?? auth;
    this.idbInstance = deps?.idbStorage ?? idbStorage;
    this.firebaseServiceInstance = deps?.firebaseService ?? firebaseService;
    this.isQuotaExhaustedFn = deps?.isFirestoreQuotaExhausted ?? isFirestoreQuotaExhausted;
    this.fetchImpl = deps?.fetchFn ?? ((...args: any[]) => (globalThis.fetch as any)(...args));

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', (e) => {
        if (this.hasPendingWork()) {
          e.preventDefault();
          e.returnValue = 'Photos are syncing to cloud. Leaving now may pause the upload.';
          return e.returnValue;
        }
      });

      // Resume pending uploads when network reconnects
      window.addEventListener('online', () => {
        for (const [eventId, reason] of this.pausedEvents) {
          if (reason.toLowerCase().includes('network') || reason.toLowerCase().includes('fetch')) {
            this.resumePendingUploads(eventId);
          }
        }
      });

      // Periodic quota auto-retry timer every 5 minutes
      setInterval(() => {
        if (!this.isQuotaExhaustedFn()) {
          for (const [eventId, reason] of this.pausedEvents) {
            if (reason.toLowerCase().includes('quota')) {
              this.resumePendingUploads(eventId);
            }
          }
        }
      }, 5 * 60 * 1000);
    }

    // Auto-resume queue when user signs in if paused due to auth
    if (typeof window !== 'undefined' && this.authInstance?.onAuthStateChanged) {
      this.authInstance.onAuthStateChanged((user: any) => {
        if (user) {
          for (const [eventId, reason] of this.pausedEvents) {
            if (reason === 'Login required' || reason.toLowerCase().includes('login')) {
              this.resumePendingUploads(eventId);
            }
          }
        }
      });
    }
  }

  public setToastNotifier(fn: (msg: string, type: 'success' | 'error' | 'info') => void) {
    this.toastNotifier = fn;
  }

  public pauseEvent(eventId: string, reason: string): void {
    this.pausedEvents.set(eventId, reason);
    const p = this.getProgress(eventId);
    p.status = 'paused';
    p.lastError = reason;
    this.notify(eventId);
  }

  public isEventPaused(eventId: string): boolean {
    return this.pausedEvents.has(eventId);
  }

  public hasPendingWork(eventId?: string): boolean {
    if (eventId) {
      const hasQueued = this.queue.some((q) => q.eventId === eventId);
      const hasInFlight = Array.from(this.inFlightMap.keys()).some((k) => k.startsWith(`${eventId}:`));
      const hasRetries = Array.from(this.scheduledRetryIds).some((k) => k.startsWith(`${eventId}:`));
      return hasQueued || hasInFlight || hasRetries;
    }
    return this.queue.length > 0 || this.inFlightMap.size > 0 || this.scheduledRetryIds.size > 0;
  }

  private hasActiveWork(eventId?: string): boolean {
    if (eventId) {
      if (this.pausedEvents.has(eventId)) return false;
      const hasQueued = this.queue.some((q) => q.eventId === eventId);
      const hasInFlight = Array.from(this.inFlightMap.keys()).some((k) => k.startsWith(`${eventId}:`));
      const hasRetries = Array.from(this.scheduledRetryIds).some((k) => k.startsWith(`${eventId}:`));
      return hasQueued || hasInFlight || hasRetries;
    }
    const hasActiveQueue = this.queue.some((q) => !this.pausedEvents.has(q.eventId));
    const hasInFlight = this.inFlightMap.size > 0;
    const hasRetries = Array.from(this.scheduledRetryIds).some((k) => {
      const eId = k.split(':')[0];
      return !this.pausedEvents.has(eId);
    });
    return hasActiveQueue || hasInFlight || hasRetries;
  }

  public isSyncing(eventId?: string): boolean {
    return this.hasPendingWork(eventId);
  }

  public getProgress(eventId?: string): CloudSyncProgress {
    if (eventId) {
      const existing = this.eventProgressMap.get(eventId);
      if (existing) return existing;
      const initial: CloudSyncProgress = {
        eventId,
        total: 0,
        synced: 0,
        inFlight: 0,
        failed: 0,
        speedFps: 0,
        status: 'idle',
      };
      this.eventProgressMap.set(eventId, initial);
      return initial;
    }

    // Aggregate summary if no specific eventId requested
    const all = Array.from(this.eventProgressMap.values());
    if (!all.length) {
      return {
        eventId: '',
        total: 0,
        synced: 0,
        inFlight: 0,
        failed: 0,
        speedFps: 0,
        status: 'idle',
      };
    }

    return {
      eventId: all[0].eventId,
      total: all.reduce((sum, p) => sum + p.total, 0),
      synced: all.reduce((sum, p) => sum + p.synced, 0),
      inFlight: this.inFlightMap.size,
      failed: all.reduce((sum, p) => sum + p.failed, 0),
      speedFps: all[0].speedFps,
      status: this.hasPendingWork() ? 'syncing' : 'idle',
      lastError: all.find((p) => p.lastError)?.lastError,
    };
  }

  public onProgress(callback: ProgressListener): () => void {
    this.listeners.add(callback);
    callback(this.getProgress());
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify(eventId?: string) {
    const progress = this.getProgress(eventId);
    const snapshot = { ...progress };
    this.listeners.forEach((fn) => {
      try {
        fn(snapshot);
      } catch (err) {
        console.error('Error in cloudSyncQueue progress listener:', err);
      }
    });
  }

  /**
   * Resume pending uploads from IndexedDB on refresh, restart, or network reconnect
   */
  public async resumePendingUploads(eventId: string): Promise<number> {
    if (!eventId) return 0;
    // Clear paused state for this event on explicit resume
    this.pausedEvents.delete(eventId);

    const progress = this.getProgress(eventId);
    progress.status = 'syncing';
    progress.lastError = undefined;

    const pendingFromDb = await this.idbInstance.getPendingUploads(eventId);
    const unresolved = pendingFromDb.filter((item: any) => item.status !== 'done');

    if (!unresolved.length) {
      progress.status = 'completed';
      this.notify(eventId);
      return 0;
    }

    progress.total = Math.max(progress.total, unresolved.length);

    // Add items that are not already queued or in-flight
    let addedCount = 0;
    for (const item of unresolved) {
      if (!this.queue.some((q) => q.id === item.id) && !this.inFlightMap.has(item.id)) {
        this.queue.push(item);
        addedCount++;
      }
    }

    this.notify(eventId);
    if (addedCount > 0 || !this.isProcessing) {
      this.triggerWorker();
    }

    return unresolved.length;
  }

  /**
   * Retry failed items for an event
   */
  public async retryFailed(eventId: string): Promise<void> {
    if (!eventId) return;
    this.pausedEvents.delete(eventId);
    const pendingFromDb = await this.idbInstance.getPendingUploads(eventId);
    const failedItems = pendingFromDb.filter((i: any) => i.status === 'failed');

    for (const item of failedItems) {
      item.retries = 0;
      item.status = 'pending';
      item.error = undefined;
      await this.idbInstance.updatePendingUpload(item.id, { retries: 0, status: 'pending', error: undefined });
      if (!this.queue.some((q) => q.id === item.id) && !this.inFlightMap.has(item.id)) {
        this.queue.push(item);
      }
    }

    const progress = this.getProgress(eventId);
    progress.failed = 0;
    progress.status = 'syncing';
    progress.lastError = undefined;
    this.notify(eventId);
    this.triggerWorker();
  }

  /**
   * Enqueue photos with Blobs to IndexedDB and streaming queue
   */
  public async enqueueBlobs(
    eventId: string,
    items: Array<{
      photoId: string;
      filename: string;
      folderId: string;
      folderName: string;
      sizeBytes: number;
      width?: number;
      height?: number;
      blob?: Blob;
      thumbBlob?: Blob;
    }>
  ): Promise<void> {
    if (!eventId || !items.length) return;

    let progress = this.eventProgressMap.get(eventId);
    if (!progress) {
      progress = {
        eventId,
        total: 0,
        synced: 0,
        inFlight: 0,
        failed: 0,
        speedFps: 0,
        status: 'syncing',
      };
      this.eventProgressMap.set(eventId, progress);
    }

    const pendingItems: PendingUploadItem[] = [];

    for (const it of items) {
      // 1. Refuse empty files immediately without network calls
      if ((it.sizeBytes !== undefined && it.sizeBytes === 0) || (it.blob && it.blob.size === 0)) {
        progress.total++;
        progress.failed++;
        progress.lastError = `Photo "${it.filename}" rejected: Empty file (0 bytes).`;
        console.warn(`[Queue] Rejected 0-byte photo "${it.filename}".`);
        continue;
      }

      pendingItems.push({
        id: `${eventId}:${it.photoId}`,
        eventId,
        photoId: it.photoId,
        folderId: it.folderId,
        folderName: it.folderName,
        filename: it.filename,
        sizeBytes: it.sizeBytes,
        width: it.width,
        height: it.height,
        status: 'pending',
        retries: 0,
        createdAt: new Date().toISOString(),
      });
    }

    if (!pendingItems.length) {
      this.notify(eventId);
      return;
    }

    // 2. Persist metadata to IndexedDB pending queue
    await this.idbInstance.savePendingUploadsBatch(pendingItems);

    // 3. Add to active in-memory queue
    for (const item of pendingItems) {
      if (!this.queue.some((q) => q.id === item.id)) {
        this.queue.push(item);
      }
    }

    progress.total += pendingItems.length;
    if (!this.pausedEvents.has(eventId)) {
      progress.status = 'syncing';
    }
    this.notify(eventId);
    this.triggerWorker();
  }

  private triggerWorker() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.runLoop().finally(() => {
      this.isProcessing = false;
    });
  }

  private async runLoop() {
    while (this.hasActiveWork()) {
      // Check auth state
      if (!this.authInstance.currentUser) {
        for (const [eventId] of this.eventProgressMap) {
          if (this.hasPendingWork(eventId)) {
            this.pauseEvent(eventId, 'Login required');
          }
        }
        break; // Pause loop until auth state changes
      }

      // Check Firestore quota
      if (this.isQuotaExhaustedFn()) {
        for (const [eventId] of this.eventProgressMap) {
          if (this.hasPendingWork(eventId)) {
            this.pauseEvent(
              eventId,
              'Firestore free quota exceeded for today. Blobs are safely preserved in local IndexedDB.'
            );
          }
        }
        break;
      }

      // Pre-fetch presigned URLs in batches of up to 20 photos for unpaused queue items
      await this.prefetchPresignedUrlsBatch();

      // Spawn up to concurrency parallel uploads for unpaused items
      while (this.inFlightMap.size < this.concurrency) {
        const itemIndex = this.queue.findIndex((q) => !this.pausedEvents.has(q.eventId));
        if (itemIndex === -1) break;

        const [item] = this.queue.splice(itemIndex, 1);
        if (!item) break;

        this.inFlightMap.set(item.id, true);
        const p = this.getProgress(item.eventId);
        p.inFlight = this.inFlightMap.size;
        if (!this.pausedEvents.has(item.eventId)) {
          p.status = 'syncing';
        }
        this.notify(item.eventId);

        this.processUpload(item).finally(() => {
          this.inFlightMap.delete(item.id);
          const currP = this.getProgress(item.eventId);
          currP.inFlight = this.inFlightMap.size;
          this.updateSpeed();
          this.notify(item.eventId);

          if (!this.hasPendingWork(item.eventId)) {
            if (!this.pausedEvents.has(item.eventId)) {
              currP.status = currP.failed > 0 && currP.synced === 0 ? 'error' : 'completed';
            }
            currP.speedFps = 0;
            this.notify(item.eventId);
          }
        });
      }

      // If only paused events remain, break out of loop immediately
      if (!this.hasActiveWork()) {
        break;
      }

      await new Promise((r) => setTimeout(r, 40));
    }
  }

  /**
   * Pre-fetches presigned URLs in batches of up to 20 photos (40 URLs)
   */
  private async prefetchPresignedUrlsBatch() {
    if (!this.queue.length || !this.authInstance.currentUser) return;

    // Filter out items belonging to paused events
    const itemsNeedingPresign: PendingUploadItem[] = [];
    const now = Date.now();

    for (const item of this.queue) {
      if (this.pausedEvents.has(item.eventId)) continue;
      const cached = this.presignCache.get(item.photoId);
      if (!cached || cached.expiresAt <= now + 60000) {
        itemsNeedingPresign.push(item);
        if (itemsNeedingPresign.length >= 20) break; // Batch limit 20 photos
      }
    }

    if (!itemsNeedingPresign.length) return;

    const eventId = itemsNeedingPresign[0].eventId;
    if (this.pausedEvents.has(eventId)) return;

    const sameEventItems = itemsNeedingPresign.filter((i) => i.eventId === eventId);
    if (!sameEventItems.length) return;

    try {
      const idToken = await this.authInstance.currentUser.getIdToken();
      if (!idToken) {
        this.pauseEvent(eventId, 'Login required');
        return;
      }
      const filesPayload: Array<{ photoId: string; type: 'full' | 'thumb'; contentType: string; extension: string }> = [];

      for (const it of sameEventItems) {
        filesPayload.push({ photoId: it.photoId, type: 'full', contentType: 'image/jpeg', extension: 'jpg' });
        filesPayload.push({ photoId: it.photoId, type: 'thumb', contentType: 'image/jpeg', extension: 'jpg' });
      }

      const res = await this.fetchImpl('/api/r2-presign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          eventId,
          files: filesPayload,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const urls = data.urls || [];
        const expiresAt = Date.now() + 840000; // ~14 minutes validity

        for (const it of sameEventItems) {
          const full = urls.find((u: any) => u.photoId === it.photoId && u.type === 'full');
          const thumb = urls.find((u: any) => u.photoId === it.photoId && u.type === 'thumb');
          if (full && thumb) {
            this.presignCache.set(it.photoId, {
              photoId: it.photoId,
              fullUploadUrl: full.uploadUrl,
              fullPublicUrl: full.publicUrl,
              fullKey: full.key,
              thumbUploadUrl: thumb.uploadUrl,
              thumbPublicUrl: thumb.publicUrl,
              thumbKey: thumb.key,
              expiresAt,
            });
          }
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        const code = errJson.code || '';
        if (code === 'R2_NOT_CONFIGURED' || code === 'R2_PUBLIC_URL_MISSING' || code === 'SERVER_NOT_CONFIGURED') {
          const reason = errJson.error || 'Cloud storage is currently not configured on server';
          this.pauseEvent(eventId, reason);
          return;
        }
        if (res.status === 401) {
          await this.authInstance.currentUser.getIdToken(true).catch(() => {});
          this.pauseEvent(eventId, 'Login required');
          return;
        }
        console.warn('Batch presign request returned', res.status, errJson);
      }
    } catch (e: any) {
      console.warn('Failed to prefetch presigned URLs batch:', e);
      if (e.message?.includes('network') || e.message?.includes('fetch')) {
        this.pauseEvent(eventId, 'Network error. Photos will sync when back online.');
      }
    }
  }

  /**
   * Process single photo: Upload Blobs to R2 via PUT, then save Firestore metadata doc
   * Photo is marked synced ONLY after BOTH succeed!
   */
  private async processUpload(item: PendingUploadItem): Promise<boolean> {
    const { eventId, photoId, filename, folderId, folderName, sizeBytes, width, height } = item;
    const progress = this.getProgress(eventId);

    try {
      // 1. Fetch Blobs from photo_blobs store, with backward compatibility for legacy inline blobs
      let fullBlob = item.blob;
      let thumbBlob = item.thumbBlob;

      if (!fullBlob || !thumbBlob) {
        const stored = await this.idbInstance.getPhotoBlob(photoId);
        if (stored) {
          fullBlob = stored.blob;
          thumbBlob = stored.thumbBlob;
        }
      } else {
        // Backward compatibility: legacy pending record still had inline blobs; migrate to photo_blobs store
        await this.idbInstance.savePhotoBlobs([
          {
            photoId,
            eventId,
            blob: fullBlob,
            thumbBlob,
            sizeBytes: sizeBytes || fullBlob.size,
            width,
            height,
          },
        ]);
        await this.idbInstance.updatePendingUpload(item.id, { blob: undefined, thumbBlob: undefined });
      }

      if (!fullBlob || !thumbBlob) {
        throw new SyncError('Local file missing', 'LOCAL_FILE_MISSING', 400);
      }
      if (fullBlob.size === 0 || thumbBlob.size === 0) {
        throw new SyncError('Empty file (0 bytes)', 'EMPTY_FILE', 400);
      }

      await this.idbInstance.updatePendingUpload(item.id, { status: 'uploading' });

      // 2. Obtain presigned URLs (from cache or request)
      let presign = this.presignCache.get(photoId);
      if (!presign || presign.expiresAt <= Date.now()) {
        const idToken = await this.authInstance.currentUser?.getIdToken();
        if (!idToken) throw new SyncError('Login required', 'UNAUTHORIZED', 401);

        const res = await this.fetchImpl('/api/r2-presign', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            eventId,
            files: [
              { photoId, type: 'full', contentType: 'image/jpeg', extension: 'jpg' },
              { photoId, type: 'thumb', contentType: 'image/jpeg', extension: 'jpg' },
            ],
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (res.status === 401) {
            await this.authInstance.currentUser?.getIdToken(true).catch(() => {});
            throw new SyncError('Login required', 'UNAUTHORIZED', 401);
          }
          const code =
            errData.code ||
            (res.status === 403 ? 'FORBIDDEN' : res.status === 404 ? 'EVENT_NOT_FOUND' : 'PRESIGN_ERROR');
          const msg = errData.error || `Presign failed with status ${res.status}`;
          throw new SyncError(msg, code, res.status);
        }

        const data = await res.json();
        const urls = data.urls || [];
        const full = urls.find((u: any) => u.type === 'full');
        const thumb = urls.find((u: any) => u.type === 'thumb');
        if (!full || !thumb) {
          throw new SyncError('Presign endpoint did not return required URLs', 'INVALID_RESPONSE', 500);
        }

        presign = {
          photoId,
          fullUploadUrl: full.uploadUrl,
          fullPublicUrl: full.publicUrl,
          fullKey: full.key,
          thumbUploadUrl: thumb.uploadUrl,
          thumbPublicUrl: thumb.publicUrl,
          thumbKey: thumb.key,
          expiresAt: Date.now() + 840000,
        };
        this.presignCache.set(photoId, presign);
      }

      // 3. Upload full and thumbnail Blobs to R2 using PUT
      const [fullPutRes, thumbPutRes] = await Promise.all([
        this.fetchImpl(presign.fullUploadUrl, {
          method: 'PUT',
          body: fullBlob,
          headers: { 'Content-Type': 'image/jpeg' },
        }),
        this.fetchImpl(presign.thumbUploadUrl, {
          method: 'PUT',
          body: thumbBlob,
          headers: { 'Content-Type': 'image/jpeg' },
        }),
      ]);

      if (!fullPutRes.ok) {
        throw new SyncError(
          `R2 full photo PUT failed with status ${fullPutRes.status}`,
          'R2_PUT_ERROR',
          fullPutRes.status
        );
      }
      if (!thumbPutRes.ok) {
        throw new SyncError(
          `R2 thumbnail PUT failed with status ${thumbPutRes.status}`,
          'R2_PUT_ERROR',
          thumbPutRes.status
        );
      }

      // 4. Save photo document to Firestore (metadata ONLY, no base64, validate isRemoteUrl)
      const saveResults = await this.firebaseServiceInstance.savePhotos(eventId, [
        {
          id: photoId,
          eventId,
          folderId,
          folderName,
          filename,
          originalName: filename,
          url: presign.fullPublicUrl,
          thumbnailUrl: presign.thumbPublicUrl,
          r2Key: presign.fullKey,
          r2ThumbKey: presign.thumbKey,
          sizeBytes: sizeBytes || fullBlob.size,
          width,
          height,
          isSelected: false,
          uploadedAt: new Date().toISOString(),
          syncStatus: 'synced',
        },
      ]);

      const photoSaveResult = saveResults.find((r: any) => r.photoId === photoId);
      if (!photoSaveResult || !photoSaveResult.success) {
        throw new SyncError(
          photoSaveResult?.error || 'Firestore photo document write failed',
          'FIRESTORE_WRITE_ERROR'
        );
      }

      // 5. Success: ONLY now delete local blobs and IDB pending record
      await this.idbInstance.deletePhotoBlobs([photoId]);
      await this.idbInstance.removePendingUpload(item.id);
      this.presignCache.delete(photoId);

      progress.synced++;
      this.recentSyncTimestamps.push(Date.now());
      return true;
    } catch (err: any) {
      console.error(`Upload error for photo "${filename}":`, err);

      const isConfigError =
        err.code === 'R2_NOT_CONFIGURED' ||
        err.code === 'R2_PUBLIC_URL_MISSING' ||
        err.code === 'SERVER_NOT_CONFIGURED' ||
        err.message?.includes('R2_NOT_CONFIGURED') ||
        err.message?.includes('R2_PUBLIC_URL_MISSING') ||
        err.message?.includes('SERVER_NOT_CONFIGURED');

      if (isConfigError) {
        const reason = err.message || 'Cloud storage is not configured on server';
        this.pauseEvent(eventId, reason);
        // Put item back into queue as pending, NO retries increment, NO photo marked failed
        this.queue.unshift(item);
        await this.idbInstance.updatePendingUpload(item.id, { status: 'pending', error: err.message });
        return false;
      }

      const isAuthError =
        err.code === 'UNAUTHORIZED' ||
        err.message === 'Login required';

      if (isAuthError) {
        this.pauseEvent(eventId, 'Login required');
        this.queue.unshift(item);
        await this.idbInstance.updatePendingUpload(item.id, { status: 'pending', error: 'Login required' });
        return false;
      }

      const isPermanent =
        err.code === 'LOCAL_FILE_MISSING' ||
        err.code === 'EMPTY_FILE' ||
        err.code === 'CAPACITY_EXCEEDED' ||
        err.code === 'FORBIDDEN' ||
        err.code === 'EVENT_NOT_FOUND' ||
        err.code === 'BATCH_LIMIT_EXCEEDED' ||
        (typeof err.code === 'string' && err.code.startsWith('INVALID_')) ||
        err.message?.includes('Local file missing') ||
        err.message?.includes('Empty file') ||
        err.message?.includes('CAPACITY_EXCEEDED') ||
        err.message?.includes('FORBIDDEN') ||
        err.message?.includes('EVENT_NOT_FOUND') ||
        err.message?.includes('INVALID_') ||
        err.message?.includes('BATCH_LIMIT_EXCEEDED');

      item.retries++;

      if (!isPermanent && item.retries <= 5 && !this.isQuotaExhaustedFn()) {
        const delay = Math.min(30000, Math.pow(2, item.retries) * 1000 + Math.random() * 500);
        await this.idbInstance.updatePendingUpload(item.id, {
          retries: item.retries,
          status: 'pending',
          error: err.message,
        });

        this.scheduledRetryIds.add(item.id);

        const timer = setTimeout(() => {
          this.scheduledRetryIds.delete(item.id);
          this.retryTimers.delete(item.id);
          this.queue.push(item);
          this.triggerWorker();
        }, delay);

        this.retryTimers.set(item.id, timer);
        return false;
      }

      // Permanent failure or 5 retries exhausted: keep blob in IDB, mark as failed
      await this.idbInstance.updatePendingUpload(item.id, {
        retries: item.retries,
        status: 'failed',
        error: err.message,
      });

      progress.failed++;
      progress.lastError = err.message || `Failed to upload "${filename}"`;
      return false;
    }
  }

  private updateSpeed() {
    const now = Date.now();
    this.recentSyncTimestamps = this.recentSyncTimestamps.filter((t) => now - t <= 5000);
    const count = this.recentSyncTimestamps.length;
    const speed = count > 0 ? Math.round((count / 5) * 10) / 10 : 0;
    for (const [, p] of this.eventProgressMap) {
      p.speedFps = speed;
    }
  }
}

export const cloudSyncQueue = new CloudSyncQueueManager();
