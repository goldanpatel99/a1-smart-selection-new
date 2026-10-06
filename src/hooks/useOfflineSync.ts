import { useState, useEffect, useCallback } from 'react';
import { firebaseService } from '../services/firebaseService';

interface PendingSyncItem {
  eventId: string;
  photoId: string;
  updates: {
    isSelected?: boolean;
    selectedAt?: string;
    clientComment?: string;
  };
  timestamp: number;
}

const STORAGE_KEY = 'a1_offline_sync_queue';

export function useOfflineSync(showToast?: (msg: string, type: 'success' | 'error' | 'info') => void) {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingItems, setPendingItems] = useState<PendingSyncItem[]>(() => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  });
  const [isSyncing, setIsSyncing] = useState(false);

  // Save pending items to localStorage
  const saveQueue = (queue: PendingSyncItem[]) => {
    setPendingItems(queue);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch {}
  };

  // Sync all pending items to Firebase
  const syncQueue = useCallback(async () => {
    if (!navigator.onLine || pendingItems.length === 0 || isSyncing) return;

    setIsSyncing(true);
    const queueToProcess = [...pendingItems];
    const failedItems: PendingSyncItem[] = [];

    for (const item of queueToProcess) {
      try {
        await firebaseService.updatePhoto(item.eventId, item.photoId, item.updates);
      } catch (err) {
        console.warn('Sync failed for photo:', item.photoId, err);
        failedItems.push(item);
      }
    }

    saveQueue(failedItems);
    setIsSyncing(false);

    if (failedItems.length === 0 && queueToProcess.length > 0) {
      if (showToast) {
        showToast(
          `✓ All ${queueToProcess.length} offline selections synced to Cloud Firestore!`,
          'success'
        );
      }
    }
  }, [pendingItems, isSyncing, showToast]);

  // Network status listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (showToast) {
        showToast('⚡ Internet connected. Syncing photo selections...', 'info');
      }
      syncQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
      if (showToast) {
        showToast(
          '📶 Offline Mode Active. Your selections are 100% saved locally on this device.',
          'info'
        );
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    if (navigator.onLine && pendingItems.length > 0) {
      syncQueue();
    }

    // Periodic check every 15 seconds
    const interval = setInterval(() => {
      if (navigator.onLine && pendingItems.length > 0) {
        syncQueue();
      }
    }, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [syncQueue, showToast, pendingItems.length]);

  // Queue a photo update (will sync immediately if online, or enqueue if offline/slow)
  const enqueuePhotoSync = (
    eventId: string,
    photoId: string,
    updates: { isSelected?: boolean; selectedAt?: string; clientComment?: string }
  ) => {
    // If online, fire and forget to Cloud Firestore
    if (navigator.onLine) {
      firebaseService.updatePhoto(eventId, photoId, updates).catch(() => {
        // Enqueue if direct save failed due to flaky connection
        const newItem: PendingSyncItem = { eventId, photoId, updates, timestamp: Date.now() };
        saveQueue([...pendingItems, newItem]);
      });
    } else {
      // Offline: Enqueue
      const filtered = pendingItems.filter(
        (p) => !(p.eventId === eventId && p.photoId === photoId)
      );
      saveQueue([...filtered, { eventId, photoId, updates, timestamp: Date.now() }]);
    }
  };

  return {
    isOnline,
    pendingCount: pendingItems.length,
    isSyncing,
    enqueuePhotoSync,
    syncQueue,
  };
}
