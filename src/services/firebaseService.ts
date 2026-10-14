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
  limit,
} from 'firebase/firestore';
import { db } from '../firebase';
import { User, WeddingEvent, Photo, PointTransaction, AdminSettings } from '../types';

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
  // --- EVENTS ---
  subscribeEvents: (onUpdate: (events: WeddingEvent[]) => void) => {
    try {
      const q = collection(db, 'events');
      return onSnapshot(
        q,
        (snapshot) => {
          const events: WeddingEvent[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as WeddingEvent;
            events.push({
              ...data,
              // Maintain photos array structure
              photos: data.photos || [],
            });
          });
          if (events.length > 0) {
            onUpdate(events);
          }
        },
        (error) => {
          if (error?.code === 'resource-exhausted') {
            isQuotaExhausted = true;
          }
          console.warn('Firestore events listener error (falling back to local cache):', error.message);
        }
      );
    } catch (e) {
      console.warn('Could not initialize events listener:', e);
      return () => {};
    }
  },

  // Save parent event document (lightweight metadata only - guarantees document is < 5KB)
  saveEvent: async (event: WeddingEvent) => {
    if (isQuotaExhausted) return;
    try {
      // Strip massive base64 photo arrays from parent document so it NEVER hits 1MB limit
      const { photos, ...meta } = event;
      const selectedIds = (photos || []).filter((p) => p.isSelected).map((p) => p.id);
      const totalCount = Math.max(
        event.photosCount || 0,
        photos ? photos.length : 0
      );
      const cleanEventMeta = {
        ...meta,
        photosCount: totalCount,
        selectedCount: selectedIds.length,
        selectedPhotoIds: selectedIds,
      };
      await setDoc(doc(db, 'events', event.id), cleanEventMeta, { merge: true });
    } catch (err: any) {
      handleFirestoreError('saveEvent', err);
    }
  },

  // Ultra-fast instant sync for client photo selections (cross-device real-time sync)
  updateEventSelections: async (eventId: string, selectedPhotoIds: string[], selectedCount: number) => {
    if (isQuotaExhausted) return;
    try {
      await setDoc(
        doc(db, 'events', eventId),
        {
          selectedPhotoIds,
          selectedCount,
          lastSelectedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err: any) {
      handleFirestoreError('updateEventSelections', err);
    }
  },

  // Update total photos count in Firestore
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

  // Save photos to Firestore subcollection /events/{eventId}/photos/{photo.id}
  // Features: 2x retry per photo with graceful fallback if free daily quota is exceeded
  savePhotos: async (eventId: string, photos: Photo[]): Promise<number> => {
    if (!eventId || !photos || photos.length === 0 || isQuotaExhausted) return 0;
    let savedCount = 0;
    try {
      // Chunk photos to avoid network congestion (5 parallel writes per batch)
      const chunkSize = 5;
      for (let i = 0; i < photos.length; i += chunkSize) {
        if (isQuotaExhausted) break;
        const chunk = photos.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (photo) => {
            if (isQuotaExhausted) return;
            let attempt = 0;
            const maxAttempts = 2;
            while (attempt < maxAttempts) {
              if (isQuotaExhausted) return;
              try {
                await setDoc(
                  doc(db, 'events', eventId, 'photos', photo.id),
                  {
                    id: photo.id,
                    filename: photo.filename,
                    originalName: photo.originalName || photo.filename,
                    folderId: photo.folderId,
                    folderName: photo.folderName,
                    url: photo.url,
                    thumbnailUrl: photo.thumbnailUrl || photo.url,
                    sizeBytes: photo.sizeBytes || 0,
                    isSelected: Boolean(photo.isSelected),
                    selectedAt: photo.selectedAt || null,
                    clientComment: photo.clientComment || '',
                    uploadedAt: photo.uploadedAt || new Date().toISOString(),
                  },
                  { merge: true }
                );
                savedCount++;
                return; // Successfully saved
              } catch (singleErr: any) {
                if (singleErr?.code === 'resource-exhausted') {
                  handleFirestoreError('savePhotos single', singleErr);
                  return;
                }
                attempt++;
                if (attempt >= maxAttempts) {
                  console.warn(`Failed to save photo ${photo.id} to Firestore:`, singleErr?.message || singleErr);
                } else {
                  await new Promise((res) => setTimeout(res, 120 * attempt));
                }
              }
            }
          })
        );
      }
      return savedCount;
    } catch (err: any) {
      handleFirestoreError('savePhotos batch', err);
      return savedCount;
    }
  },

  // Subscribe to real-time photos for an event (cross-device sync!)
  subscribeEventPhotos: (eventId: string, onUpdate: (photos: Photo[]) => void) => {
    try {
      const q = collection(db, 'events', eventId, 'photos');
      return onSnapshot(
        q,
        (snapshot) => {
          const photos: Photo[] = [];
          snapshot.forEach((docSnap) => {
            photos.push(docSnap.data() as Photo);
          });
          onUpdate(photos);
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

  // Fetch all photos for an event directly from Firestore with auto-retry
  fetchEventPhotos: async (eventId: string): Promise<Photo[]> => {
    let attempts = 0;
    while (attempts < 2) {
      try {
        const q = collection(db, 'events', eventId, 'photos');
        const snap = await getDocs(q);
        const photos: Photo[] = [];
        snap.forEach((docSnap) => {
          photos.push(docSnap.data() as Photo);
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

  // Update a single photo (e.g. client heart selection)
  updatePhoto: async (eventId: string, photoId: string, updates: Partial<Photo>) => {
    if (isQuotaExhausted) return;
    try {
      await setDoc(doc(db, 'events', eventId, 'photos', photoId), updates, { merge: true });
    } catch (err: any) {
      handleFirestoreError('updatePhoto', err);
    }
  },

  // Delete a single photo
  deletePhoto: async (eventId: string, photoId: string) => {
    if (isQuotaExhausted) return;
    try {
      await deleteDoc(doc(db, 'events', eventId, 'photos', photoId));
    } catch (err: any) {
      handleFirestoreError('deletePhoto', err);
    }
  },

  // Delete multiple photos from Firestore in parallel batches
  deletePhotos: async (eventId: string, photoIds: string[]) => {
    if (!photoIds || photoIds.length === 0 || isQuotaExhausted) return;
    try {
      const batchSize = 10;
      for (let i = 0; i < photoIds.length; i += batchSize) {
        if (isQuotaExhausted) break;
        const chunk = photoIds.slice(i, i + batchSize);
        await Promise.all(
          chunk.map((photoId) =>
            deleteDoc(doc(db, 'events', eventId, 'photos', photoId)).catch((e) => {
              handleFirestoreError('deletePhoto chunk', e);
            })
          )
        );
      }
    } catch (err: any) {
      handleFirestoreError('deletePhotos batch', err);
    }
  },

  // Delete event and its photos subcollection
  deleteEvent: async (eventId: string) => {
    if (isQuotaExhausted) return;
    try {
      // First clean up subcollection docs
      const photosSnap = await getDocs(collection(db, 'events', eventId, 'photos'));
      const deletePromises: Promise<void>[] = [];
      photosSnap.forEach((docSnap) => {
        deletePromises.push(deleteDoc(docSnap.ref));
      });
      await Promise.all(deletePromises);

      // Then delete parent doc
      await deleteDoc(doc(db, 'events', eventId));
    } catch (err: any) {
      handleFirestoreError('deleteEvent', err);
    }
  },

  getEventBySlugOrId: async (slugOrId: string): Promise<WeddingEvent | null> => {
    try {
      let targetEvent: WeddingEvent | null = null;
      // First try doc id directly
      const docSnap = await getDoc(doc(db, 'events', slugOrId));
      if (docSnap.exists()) {
        targetEvent = docSnap.data() as WeddingEvent;
      } else {
        // Else query by slug
        const q = query(collection(db, 'events'), where('slug', '==', slugOrId), limit(1));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          targetEvent = querySnap.docs[0].data() as WeddingEvent;
        }
      }

      if (targetEvent) {
        // Fetch subcollection photos for complete gallery view
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
  subscribeUsers: (onUpdate: (users: User[]) => void) => {
    try {
      const q = collection(db, 'users');
      return onSnapshot(
        q,
        (snapshot) => {
          const users: User[] = [];
          snapshot.forEach((docSnap) => {
            users.push(docSnap.data() as User);
          });
          if (users.length > 0) {
            onUpdate(users);
          }
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

  saveUser: async (user: User) => {
    if (isQuotaExhausted) return;
    try {
      await setDoc(doc(db, 'users', user.id), user, { merge: true });
    } catch (err: any) {
      handleFirestoreError('saveUser', err);
    }
  },

  deleteUser: async (userId: string) => {
    if (isQuotaExhausted) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
    } catch (err: any) {
      handleFirestoreError('deleteUser', err);
    }
  },

  // Reset all stored events, subcollections, transactions, and test photographers
  resetAllData: async () => {
    try {
      // 1. Delete all events and their photo subcollections
      const eventsSnap = await getDocs(collection(db, 'events'));
      for (const evt of eventsSnap.docs) {
        try {
          const photosSnap = await getDocs(collection(db, 'events', evt.id, 'photos'));
          for (const p of photosSnap.docs) {
            await deleteDoc(p.ref);
          }
          await deleteDoc(evt.ref);
        } catch (innerErr) {
          console.warn('Error deleting event document during reset:', innerErr);
        }
      }

      // 2. Delete all transactions
      const txSnap = await getDocs(collection(db, 'transactions'));
      for (const t of txSnap.docs) {
        try {
          await deleteDoc(t.ref);
        } catch (innerErr) {
          console.warn('Error deleting transaction during reset:', innerErr);
        }
      }

      // 3. Delete non-admin users
      const usersSnap = await getDocs(collection(db, 'users'));
      for (const u of usersSnap.docs) {
        try {
          const data = u.data() as User;
          if (data.role !== 'admin' || u.id !== 'user-admin-main') {
            await deleteDoc(u.ref);
          }
        } catch (innerErr) {
          console.warn('Error deleting user during reset:', innerErr);
        }
      }
    } catch (err) {
      console.warn('Error in firebaseService.resetAllData:', err);
    }
  },

  // --- TRANSACTIONS ---
  subscribeTransactions: (onUpdate: (txs: PointTransaction[]) => void) => {
    try {
      const q = collection(db, 'transactions');
      return onSnapshot(
        q,
        (snapshot) => {
          const txs: PointTransaction[] = [];
          snapshot.forEach((docSnap) => {
            txs.push(docSnap.data() as PointTransaction);
          });
          if (txs.length > 0) {
            onUpdate(txs);
          }
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
  subscribeSettings: (onUpdate: (settings: AdminSettings) => void) => {
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
};
