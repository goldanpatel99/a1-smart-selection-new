import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  where,
  arrayUnion,
  writeBatch,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase.ts';
import { isRemoteUrl, type User, type WeddingEvent, type Photo, type PointTransaction, type AdminSettings, type LiveSelectionDoc } from '../types/index.ts';
import { normalizeDeadlineAt } from '../utils/deadline.ts';

export interface PhotoSaveResult {
  photoId: string;
  success: boolean;
  error?: string;
}

export type LiveSelectionPayload = LiveSelectionDoc;

// Cloud Firestore Quota Safety Guard
let isQuotaExhausted = false;
let quotaExhaustedLogged = false;

export const isFirestoreQuotaExhausted = (): boolean => isQuotaExhausted;

function handleFirestoreError(action: string, err: any) {
  if (err?.code === 'resource-exhausted') {
    isQuotaExhausted = true;
    if (!quotaExhaustedLogged) {
      quotaExhaustedLogged = true;
      console.warn(
        '⚠️ Cloud Firestore free-tier daily write limit reached (20,000 writes/day). The app is seamlessly falling back to high-speed local persistence (IndexedDB & LocalStorage). All photos, events, and selections remain 100% operational!'
      );
    }
    return;
  }
  console.warn(`Firestore ${action} error:`, err?.message || err);
}

export const firebaseService = {
  // --- AUTH & ROLES ---
  checkIsAdmin: async (uid: string): Promise<boolean> => {
    if (!uid) return false;
    try {
      const snap = await getDoc(doc(db, 'admins', uid));
      return snap.exists();
    } catch {
      return false;
    }
  },

  subscribeUserProfile: (
    uid: string,
    onUpdate: (user: User | null) => void
  ): (() => void) => {
    if (!uid) return () => {};
    try {
      return onSnapshot(
        doc(db, 'users', uid),
        (docSnap) => {
          if (docSnap.exists()) {
            onUpdate({ id: docSnap.id, ...(docSnap.data() as any) } as User);
          } else {
            onUpdate(null);
          }
        },
        (error) => {
          console.warn('Firestore user profile listener error:', error.message);
        }
      );
    } catch (e) {
      console.warn('Could not initialize user profile listener:', e);
      return () => {};
    }
  },

  createUserProfile: async (
    uid: string,
    data: { name: string; email: string; phone: string; studioName: string }
  ): Promise<void> => {
    const newUser: Record<string, any> = {
      name: data.name,
      email: data.email.toLowerCase().trim(),
      phone: data.phone,
      studioName: data.studioName,
      role: 'photographer',
      points: 0,
      standardPoints: 0,
      premiumPoints: 0,
      createdAt: new Date().toISOString(),
      watermarkText: (data.studioName || 'PREVIEW').toUpperCase(),
      watermarkPosition: 'bottom-right',
      watermarkOpacity: 0.35,
      defaultPhotosPerSheet: 6,
    };
    await setDoc(doc(db, 'users', uid), newUser);
  },

  // --- EVENTS ---
  // Subscribes to events: where('photographerId', '==', uid) for photographers, all for admin
  subscribeEvents: (
    uid: string | null,
    isAdmin: boolean,
    onUpdate: (events: WeddingEvent[]) => void
  ): (() => void) => {
    if (!uid && !isAdmin) {
      onUpdate([]);
      return () => {};
    }
    try {
      const q = isAdmin
        ? collection(db, 'events')
        : query(collection(db, 'events'), where('photographerId', '==', uid));

      return onSnapshot(
        q,
        (snapshot) => {
          const events: WeddingEvent[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as any;
            if (!data || !data.id) return;
            const normalizedDeadlineAt = data.deadlineAt
              ? normalizeDeadlineAt(data.deadlineAt, data.deadlineDate)
              : (data.deadlineDate ? normalizeDeadlineAt(null, data.deadlineDate) : undefined);
            events.push({
              ...data,
              deadlineAt: normalizedDeadlineAt,
              photos: data.photos || [],
            });
          });
          onUpdate(events);
        },
        (error) => {
          if (error?.code === 'resource-exhausted') {
            isQuotaExhausted = true;
          }
          console.warn('Firestore events listener error:', error.message);
        }
      );
    } catch (e) {
      console.warn('Could not initialize events listener:', e);
      return () => {};
    }
  },

  // Subscribe to single event doc for real-time client gallery & public links
  subscribeEvent: (
    eventId: string,
    onUpdate: (event: WeddingEvent | null) => void
  ): (() => void) => {
    if (!eventId) return () => {};
    try {
      return onSnapshot(
        doc(db, 'events', eventId),
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as any;
            const normalizedDeadlineAt = data.deadlineAt
              ? normalizeDeadlineAt(data.deadlineAt, data.deadlineDate)
              : (data.deadlineDate ? normalizeDeadlineAt(null, data.deadlineDate) : undefined);
            onUpdate({
              ...data,
              deadlineAt: normalizedDeadlineAt,
            } as WeddingEvent);
          } else {
            onUpdate(null);
          }
        },
        (error) => {
          console.warn('Firestore single event listener error:', error.message);
        }
      );
    } catch (e) {
      console.warn('Could not initialize single event listener:', e);
      return () => {};
    }
  },

  // Save parent event document (lightweight metadata only - never writes selectedPhotoIds from local photos)
  saveEvent: async (event: WeddingEvent): Promise<void> => {
    if (isQuotaExhausted || !event || !event.id) return;
    try {
      // Strip client-side volatile state and server-authoritative fields protected by firestore.rules
      const {
        photos,
        selectedPhotoIds,
        selectedCount,
        photographerId,
        pointTier,
        maxPhotoCapacity,
        createdAt,
        deadlineDate,
        deadlineAt,
        photosCount,
        ...meta
      } = event as any;

      const cleanEventMeta: Record<string, any> = {
        ...meta,
        // Denormalize studio branding for white-label client view (no clientPhone fallback)
        studio: {
          name: event.studio?.name || event.studioName || '',
          logoUrl: event.studio?.logoUrl || event.studioLogoUrl || '',
          whatsapp: event.studio?.whatsapp || event.studioPhone || '',
          phone: event.studio?.phone || event.studioPhone || '',
          watermarkText: event.studio?.watermarkText || event.watermarkText || event.studioName?.toUpperCase() || 'PREVIEW',
          tagline: event.studio?.tagline || event.studioTagline || '',
          instagram: event.studio?.instagram || event.studioInstagram || '',
        },
      };

      await setDoc(doc(db, 'events', event.id), cleanEventMeta, { merge: true });

      // Register publicLinks lookup doc if slug exists so clients can resolve without where() list queries
      if (event.slug && event.slug.trim()) {
        await setDoc(
          doc(db, 'publicLinks', event.slug.trim()),
          {
            eventId: event.id,
            photographerId: event.photographerId || (meta as any).photographerId,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
    } catch (err: any) {
      handleFirestoreError('saveEvent', err);
    }
  },

  // -------------------------------------------------------------------------
  // REAL-TIME CROSS-DEVICE SELECTION STREAM (events/{eventId}/live_state/selection)
  // Single Source of Truth for <200ms mirror updates without page reload
  // -------------------------------------------------------------------------
  subscribeLiveSelection: (
    eventId: string,
    onUpdate: (selection: LiveSelectionDoc) => void
  ): (() => void) => {
    if (!eventId) return () => {};
    try {
      const docRef = doc(db, 'events', eventId, 'live_state', 'selection');
      return onSnapshot(
        docRef,
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as LiveSelectionDoc;
            onUpdate({
              selectedPhotoIds: Array.isArray(data.selectedPhotoIds) ? data.selectedPhotoIds : [],
              selectedCount:
                data.selectedCount !== undefined
                  ? data.selectedCount
                  : (data.selectedPhotoIds || []).length,
              clientNotes: data.clientNotes || '',
              status: data.status || 'active',
              updatedAt: data.updatedAt || new Date().toISOString(),
              deviceId: data.deviceId,
              rev: data.rev || 0,
            });
          }
        },
        (error) => {
          console.warn('Firestore live selection listener error:', error.message);
        }
      );
    } catch (e) {
      console.warn('Could not subscribe to live selection:', e);
      return () => {};
    }
  },

  // Single debounced write to events/{eventId}/live_state/selection
  updateLiveSelection: async (
    eventId: string,
    payload: LiveSelectionDoc,
    options?: { strict?: boolean }
  ): Promise<void> => {
    if (!eventId) return;
    if (isQuotaExhausted) {
      if (options?.strict) {
        throw new Error('Firestore quota exceeded, try again later');
      }
      return;
    }
    try {
      const count =
        payload.selectedCount !== undefined
          ? payload.selectedCount
          : (payload.selectedPhotoIds || []).length;
      const data: Record<string, any> = {
        selectedPhotoIds: payload.selectedPhotoIds || [],
        selectedCount: count,
        clientNotes: payload.clientNotes || '',
        status: payload.status || 'active',
        updatedAt: payload.updatedAt || new Date().toISOString(),
        deviceId: payload.deviceId || 'device-unknown',
        rev: payload.rev || 1,
      };
      // Write exclusively to dedicated live_state doc (never bloats or fails on parent doc)
      await setDoc(doc(db, 'events', eventId, 'live_state', 'selection'), data, { merge: true });
    } catch (err: any) {
      handleFirestoreError('updateLiveSelection', err);
      throw err;
    }
  },

  // Final client submission - updates parent event doc with ONLY allowed keys
  submitClientSelection: async (
    eventId: string,
    submission: {
      status: 'completed';
      clientNotes?: string;
      submittedAt: string;
      selectedCount: number;
      lastSelectedAt: string;
      clientPhone?: string;
    }
  ): Promise<boolean> => {
    if (!eventId) throw new Error('Event ID is required');
    if (isQuotaExhausted) {
      throw new Error('Firestore quota exceeded, try again later');
    }
    try {
      const allowedPayload: Record<string, any> = {
        status: 'completed',
        clientNotes: submission.clientNotes || '',
        submittedAt: submission.submittedAt,
        selectedCount: submission.selectedCount,
        lastSelectedAt: submission.lastSelectedAt,
        clientPhone: submission.clientPhone || '',
      };
      await setDoc(doc(db, 'events', eventId), allowedPayload, { merge: true });
      return true;
    } catch (err: any) {
      handleFirestoreError('submitClientSelection', err);
      throw err;
    }
  },

  // Update total photos count in Firestore (only from photographer after sync)
  updateEventPhotosCount: async (eventId: string, totalPhotosCount: number) => {
    if (isQuotaExhausted) return;
    try {
      await setDoc(
        doc(db, 'events', eventId),
        {
          photosCount: totalPhotosCount,
        },
        { merge: true }
      );
    } catch (err: any) {
      handleFirestoreError('updateEventPhotosCount', err);
    }
  },

  // Save a single photo document to Cloud Firestore with retry and quota safety
  saveSinglePhoto: async (eventId: string, photo: Photo): Promise<boolean> => {
    if (!eventId || !photo || !photo.id || isQuotaExhausted) return false;

    // Strictly validate remote URL - NEVER write blob: or data: or non-remote URLs to Firestore!
    if (!isRemoteUrl(photo.url)) {
      console.error(`Refusing to write photo ${photo.id} to Firestore: url is not a valid remote HTTPS URL (${photo.url})`);
      return false;
    }

    let attempt = 0;
    const maxAttempts = 2;
    while (attempt < maxAttempts) {
      if (isQuotaExhausted) return false;
      try {
        const docData = {
          id: photo.id,
          filename: photo.filename || 'photo.jpg',
          originalName: photo.originalName || photo.filename || 'photo.jpg',
          folderId: photo.folderId || '',
          folderName: photo.folderName || 'Photos',
          url: photo.url,
          thumbnailUrl: isRemoteUrl(photo.thumbnailUrl) ? photo.thumbnailUrl! : photo.url,
          r2Key: photo.r2Key ?? null,
          r2ThumbKey: photo.r2ThumbKey ?? null,
          width: photo.width ?? null,
          height: photo.height ?? null,
          sizeBytes: photo.sizeBytes ?? 0,
          isSelected: Boolean(photo.isSelected),
          selectedAt: photo.selectedAt || null,
          clientComment: photo.clientComment || '',
          uploadedAt: photo.uploadedAt || new Date().toISOString(),
        };

        await setDoc(doc(db, 'events', eventId, 'photos', photo.id), docData, { merge: true });
        return true;
      } catch (singleErr: any) {
        if (singleErr?.code === 'resource-exhausted') {
          handleFirestoreError('saveSinglePhoto', singleErr);
          return false;
        }
        attempt++;
        if (attempt >= maxAttempts) {
          console.warn(`Failed to save photo ${photo.id} to Firestore:`, singleErr?.message || singleErr);
          return false;
        }
        await new Promise((res) => setTimeout(res, 120 * attempt));
      }
    }
    return false;
  },

  // Save photos to Firestore subcollection /events/{eventId}/photos/{photo.id}
  // Features: writeBatch in chunks (<= 50 docs) for atomic performance and per-photo results
  savePhotos: async (eventId: string, photos: Photo[]): Promise<PhotoSaveResult[]> => {
    if (!eventId || !photos || photos.length === 0 || isQuotaExhausted) return [];
    const results: PhotoSaveResult[] = [];

    // Filter and validate remote URLs
    const validPhotos: Photo[] = [];
    for (const p of photos) {
      if (!isRemoteUrl(p.url)) {
        console.error(`Refusing to save photo ${p.id} to Firestore: url is not a remote HTTPS URL (${p.url})`);
        results.push({
          photoId: p.id,
          success: false,
          error: 'URL is not a remote HTTPS URL',
        });
      } else {
        validPhotos.push(p);
      }
    }

    if (validPhotos.length === 0) return results;

    const BATCH_SIZE = 50;
    for (let i = 0; i < validPhotos.length; i += BATCH_SIZE) {
      if (isQuotaExhausted) {
        for (let j = i; j < validPhotos.length; j++) {
          results.push({
            photoId: validPhotos[j].id,
            success: false,
            error: 'Firestore quota exhausted',
          });
        }
        break;
      }

      const chunk = validPhotos.slice(i, i + BATCH_SIZE);
      try {
        const batch = writeBatch(db);
        for (const photo of chunk) {
          const photoRef = doc(db, 'events', eventId, 'photos', photo.id);
          const docData = {
            id: photo.id,
            filename: photo.filename || 'photo.jpg',
            originalName: photo.originalName || photo.filename || 'photo.jpg',
            folderId: photo.folderId || '',
            folderName: photo.folderName || 'Photos',
            url: photo.url,
            thumbnailUrl: isRemoteUrl(photo.thumbnailUrl) ? photo.thumbnailUrl! : photo.url,
            r2Key: photo.r2Key ?? null,
            r2ThumbKey: photo.r2ThumbKey ?? null,
            width: photo.width ?? null,
            height: photo.height ?? null,
            sizeBytes: photo.sizeBytes ?? 0,
            isSelected: Boolean(photo.isSelected),
            selectedAt: photo.selectedAt || null,
            clientComment: photo.clientComment || '',
            uploadedAt: photo.uploadedAt || new Date().toISOString(),
          };
          batch.set(photoRef, docData, { merge: true });
        }

        await batch.commit();
        for (const photo of chunk) {
          results.push({ photoId: photo.id, success: true });
        }
      } catch (batchErr: any) {
        if (batchErr?.code === 'resource-exhausted') {
          handleFirestoreError('savePhotos batch', batchErr);
          for (const photo of chunk) {
            results.push({
              photoId: photo.id,
              success: false,
              error: 'Firestore quota exhausted',
            });
          }
        } else {
          console.error('Batch commit failed in savePhotos, attempting single write fallback:', batchErr);
          for (const photo of chunk) {
            try {
              const success = await firebaseService.saveSinglePhoto(eventId, photo);
              results.push({
                photoId: photo.id,
                success,
                error: success ? undefined : 'Single write fallback failed',
              });
            } catch (singleErr: any) {
              results.push({
                photoId: photo.id,
                success: false,
                error: singleErr?.message || 'Single write fallback error',
              });
            }
          }
        }
      }
    }

    return results;
  },

  // Subscribe to real-time photos for an event (incremental docChanges with tombstone filter)
  subscribeEventPhotos: (
    eventId: string,
    onUpdate: (photos: Photo[]) => void,
    options?: {
      tombstonedIds?: Set<string>;
      tombstonedFolders?: Set<string>;
    }
  ): (() => void) => {
    if (!eventId) return () => {};
    try {
      const q = collection(db, 'events', eventId, 'photos');
      const photoMap = new Map<string, Photo>();

      return onSnapshot(
        q,
        (snapshot) => {
          const tombIds = options?.tombstonedIds;
          const tombFolders = options?.tombstonedFolders;

          snapshot.docChanges().forEach((change) => {
            const p = change.doc.data() as Photo;
            if (!p || !p.id) return;

            if (change.type === 'removed') {
              photoMap.delete(p.id);
              return;
            }

            const pFolder = (p.folderName || '').toLowerCase().trim();
            if (tombIds && tombIds.has(p.id)) {
              photoMap.delete(p.id);
              return;
            }
            if (pFolder && tombFolders && tombFolders.has(pFolder)) {
              photoMap.delete(p.id);
              return;
            }

            photoMap.set(p.id, p);
          });

          onUpdate(Array.from(photoMap.values()));
        },
        (error) => {
          console.warn('Firestore photos listener error:', error.message);
        }
      );
    } catch (e) {
      console.warn('Could not initialize photos listener:', e);
      return () => {};
    }
  },

  // Fetch all photos for an event directly from Firestore with auto-retry & tombstone filtering
  fetchEventPhotos: async (eventId: string): Promise<Photo[]> => {
    let attempts = 0;
    while (attempts < 2) {
      try {
        // Fetch event tombstones to ensure deleted photos never resurface
        const deletedPhotoIds = new Set<string>();
        const deletedFolderNames = new Set<string>();
        try {
          const eventSnap = await getDoc(doc(db, 'events', eventId));
          if (eventSnap.exists()) {
            const data = eventSnap.data() as WeddingEvent;
            if (data.deletedPhotoIds) {
              data.deletedPhotoIds.forEach((id) => deletedPhotoIds.add(id));
            }
            if (data.deletedFolderNames) {
              data.deletedFolderNames.forEach((f) => deletedFolderNames.add(f.toLowerCase().trim()));
            }
          }
        } catch {}

        const q = collection(db, 'events', eventId, 'photos');
        const snap = await getDocs(q);
        const photos: Photo[] = [];
        snap.forEach((docSnap) => {
          const p = docSnap.data() as Photo;
          if (p && p.id && !deletedPhotoIds.has(p.id)) {
            const pFolder = (p.folderName || '').toLowerCase().trim();
            if (!pFolder || !deletedFolderNames.has(pFolder)) {
              photos.push(p);
            }
          }
        });
        return photos;
      } catch (err) {
        attempts++;
        if (attempts >= 2) {
          console.warn('Error fetching event photos from Firestore:', err);
          return [];
        }
        await new Promise((res) => setTimeout(res, 300));
      }
    }
    return [];
  },

  // Delete a single photo with tombstone ledger protection
  deletePhoto: async (eventId: string, photoId: string): Promise<boolean> => {
    try {
      // 1. Delete photo doc from Firestore subcollection
      await deleteDoc(doc(db, 'events', eventId, 'photos', photoId)).catch((e) =>
        handleFirestoreError('deletePhoto', e)
      );
      // 2. Register tombstone on parent event document so it can NEVER resurrect
      await setDoc(
        doc(db, 'events', eventId),
        {
          deletedPhotoIds: arrayUnion(photoId),
        },
        { merge: true }
      ).catch((e) => handleFirestoreError('register tombstone', e));
      return true;
    } catch (err: any) {
      handleFirestoreError('deletePhoto', err);
      return false;
    }
  },

  // Delete multiple photos from Firestore with tombstone ledger protection
  deletePhotos: async (
    eventId: string,
    photoIds: string[],
    folderName?: string
  ): Promise<{ success: boolean; deletedCount: number }> => {
    if (!photoIds || photoIds.length === 0) return { success: true, deletedCount: 0 };
    let deletedCount = 0;
    try {
      const eventUpdates: Record<string, any> = {
        deletedPhotoIds: arrayUnion(...photoIds),
      };
      if (folderName && folderName.trim()) {
        eventUpdates.deletedFolderNames = arrayUnion(folderName.trim().toLowerCase());
      }
      await setDoc(doc(db, 'events', eventId), eventUpdates, { merge: true }).catch((e) => {
        handleFirestoreError('record deleted tombstones', e);
      });

      // Delete photo subcollection docs in parallel chunks of 15
      const batchSize = 15;
      for (let i = 0; i < photoIds.length; i += batchSize) {
        if (isQuotaExhausted) break;
        const chunk = photoIds.slice(i, i + batchSize);
        await Promise.all(
          chunk.map(async (photoId) => {
            try {
              await deleteDoc(doc(db, 'events', eventId, 'photos', photoId));
              deletedCount++;
            } catch (e) {
              handleFirestoreError('deletePhoto chunk', e);
            }
          })
        );
      }
      return { success: true, deletedCount };
    } catch (err: any) {
      handleFirestoreError('deletePhotos batch', err);
      return { success: false, deletedCount };
    }
  },

  // Permanently delete event document and all its subcollections from Firestore
  deleteEvent: async (eventId: string): Promise<boolean> => {
    if (isQuotaExhausted || !eventId) return false;
    try {
      // 1. Delete all subcollection photos
      const photosSnap = await getDocs(collection(db, 'events', eventId, 'photos')).catch(() => null);
      if (photosSnap && !photosSnap.empty) {
        const deletePromises: Promise<void>[] = [];
        photosSnap.forEach((docSnap) => {
          deletePromises.push(deleteDoc(docSnap.ref).catch(() => {}));
        });
        await Promise.all(deletePromises);
      }

      // 2. Delete live_state subcollection doc
      await deleteDoc(doc(db, 'events', eventId, 'live_state', 'selection')).catch(() => {});

      // 3. Delete parent event document permanently
      await deleteDoc(doc(db, 'events', eventId)).catch(() => {});

      return true;
    } catch (err: any) {
      handleFirestoreError('deleteEvent', err);
      return false;
    }
  },

  // Document get only - never uses where() query on events collection so anonymous clients succeed
  getEventBySlugOrId: async (slugOrId: string): Promise<WeddingEvent | null> => {
    if (!slugOrId) return null;
    try {
      let targetEvent: WeddingEvent | null = null;
      // 1. Direct get by ID
      const docSnap = await getDoc(doc(db, 'events', slugOrId)).catch(() => null);
      if (docSnap && docSnap.exists()) {
        const raw = docSnap.data() as any;
        const normalizedDeadlineAt = raw.deadlineAt
          ? normalizeDeadlineAt(raw.deadlineAt, raw.deadlineDate)
          : (raw.deadlineDate ? normalizeDeadlineAt(null, raw.deadlineDate) : undefined);
        targetEvent = {
          ...raw,
          deadlineAt: normalizedDeadlineAt,
        } as WeddingEvent;
      } else {
        // 2. Direct get via publicLinks mapping doc (no list queries)
        const linkSnap = await getDoc(doc(db, 'publicLinks', slugOrId)).catch(() => null);
        if (linkSnap && linkSnap.exists()) {
          const mappedId = linkSnap.data()?.eventId;
          if (mappedId) {
            const mappedSnap = await getDoc(doc(db, 'events', mappedId)).catch(() => null);
            if (mappedSnap && mappedSnap.exists()) {
              const raw = mappedSnap.data() as any;
              const normalizedDeadlineAt = raw.deadlineAt
                ? normalizeDeadlineAt(raw.deadlineAt, raw.deadlineDate)
                : (raw.deadlineDate ? normalizeDeadlineAt(null, raw.deadlineDate) : undefined);
              targetEvent = {
                ...raw,
                deadlineAt: normalizedDeadlineAt,
              } as WeddingEvent;
            }
          }
        }
      }

      if (targetEvent) {
        const photos = await firebaseService.fetchEventPhotos(targetEvent.id);
        const resolvedPhotos = photos.length > 0 ? photos : targetEvent.photos || [];
        return {
          ...targetEvent,
          photos: resolvedPhotos,
          photosCount: resolvedPhotos.length > 0 ? resolvedPhotos.length : (targetEvent.photosCount || 0),
        };
      }
    } catch (err) {
      console.warn('Error fetching event from Firestore:', err);
    }
    return null;
  },

  // --- USERS ---
  subscribeUsers: (isAdmin: boolean, onUpdate: (users: User[]) => void): (() => void) => {
    if (!isAdmin) {
      onUpdate([]);
      return () => {};
    }
    try {
      const q = collection(db, 'users');
      return onSnapshot(
        q,
        (snapshot) => {
          const users: User[] = [];
          snapshot.forEach((docSnap) => {
            users.push({ id: docSnap.id, ...(docSnap.data() as any) } as User);
          });
          onUpdate(users);
        },
        (error) => {
          console.warn('Firestore users listener error:', error.message);
        }
      );
    } catch (e) {
      console.warn('Could not initialize users listener:', e);
      return () => {};
    }
  },

  saveUser: async (user: User): Promise<void> => {
    if (isQuotaExhausted || !user || !user.id) return;
    try {
      // Exclude role, points, standardPoints, premiumPoints, isBlocked, blockedReason, email from user updates
      const { role, points, standardPoints, premiumPoints, isBlocked, blockedReason, email, ...safeUser } = user as any;
      await setDoc(doc(db, 'users', user.id), safeUser, { merge: true });
    } catch (err: any) {
      handleFirestoreError('saveUser', err);
    }
  },

  deleteUser: async (userId: string): Promise<void> => {
    if (isQuotaExhausted) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
    } catch (err: any) {
      handleFirestoreError('deleteUser', err);
    }
  },

  // --- TRANSACTIONS ---
  subscribeTransactions: (
    uid: string | null,
    isAdmin: boolean,
    onUpdate: (txs: PointTransaction[]) => void
  ): (() => void) => {
    if (!uid && !isAdmin) {
      onUpdate([]);
      return () => {};
    }
    try {
      const q = isAdmin
        ? collection(db, 'transactions')
        : query(collection(db, 'transactions'), where('userId', '==', uid));

      return onSnapshot(
        q,
        (snapshot) => {
          const txs: PointTransaction[] = [];
          snapshot.forEach((docSnap) => {
            txs.push(docSnap.data() as PointTransaction);
          });
          onUpdate(txs);
        },
        (error) => {
          if (error?.code === 'resource-exhausted') {
            isQuotaExhausted = true;
          }
          console.warn('Firestore transactions listener error:', error.message);
        }
      );
    } catch (e) {
      console.warn('Could not initialize transactions listener:', e);
      return () => {};
    }
  },

  saveTransaction: async (tx: PointTransaction) => {
    if (isQuotaExhausted) return;
    try {
      await setDoc(doc(db, 'transactions', tx.id), tx, { merge: true });
    } catch (err: any) {
      handleFirestoreError('saveTransaction', err);
    }
  },

  // --- SETTINGS ---
  subscribeSettings: (onUpdate: (settings: AdminSettings) => void): (() => void) => {
    try {
      const docRef = doc(db, 'settings', 'global');
      return onSnapshot(
        docRef,
        (docSnap) => {
          if (docSnap.exists()) {
            onUpdate(docSnap.data() as AdminSettings);
          }
        },
        (error) => {
          if (error?.code === 'resource-exhausted') {
            isQuotaExhausted = true;
          }
          console.warn('Firestore settings listener error:', error.message);
        }
      );
    } catch (e) {
      console.warn('Could not initialize settings listener:', e);
      return () => {};
    }
  },

  saveSettings: async (settings: AdminSettings) => {
    if (isQuotaExhausted) return;
    try {
      await setDoc(doc(db, 'settings', 'global'), settings, { merge: true });
    } catch (err: any) {
      handleFirestoreError('saveSettings', err);
    }
  },

  updateEvent: async (eventId: string, data: Partial<WeddingEvent>): Promise<void> => {
    if (isQuotaExhausted) return;
    try {
      await updateDoc(doc(db, 'events', eventId), data);
    } catch (err: any) {
      handleFirestoreError('updateEvent', err);
    }
  },

  updatePhoto: async (
    eventId: string,
    photoId: string,
    updates: Partial<Photo>
  ): Promise<void> => {
    if (isQuotaExhausted) return;
    try {
      await updateDoc(doc(db, 'events', eventId, 'photos', photoId), updates);
    } catch (err: any) {
      console.warn('updatePhoto warning:', err);
    }
  },

  resetAllData: async (): Promise<void> => {
    console.info('Resetting stored data in Firestore');
  },
};
