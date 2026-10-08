import { WeddingEvent } from '../types';

export interface LiveSelectionUpdate {
  eventId: string;
  selectedPhotoIds: string[];
  selectedCount: number;
  lastUpdated: string;
  clientNotes?: string;
  status?: string;
}

export const liveSyncService = {
  // Push an instant selection toggle or full state to the real-time server
  pushSelection: async (
    eventId: string,
    params: {
      photoId?: string;
      isSelected?: boolean;
      selectedPhotoIds?: string[];
      clientNotes?: string;
      status?: string;
    }
  ): Promise<LiveSelectionUpdate | null> => {
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (res.ok) {
        return (await res.json()) as LiveSelectionUpdate;
      }
    } catch (err) {
      console.warn('Real-time sync push failed, will retry on next poll:', err);
    }
    return null;
  },

  // Get current selections from the server
  getSelections: async (eventId: string): Promise<LiveSelectionUpdate | null> => {
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/selection`);
      if (res.ok) {
        return (await res.json()) as LiveSelectionUpdate;
      }
    } catch (err) {
      console.warn('Failed to fetch event selections:', err);
    }
    return null;
  },

  // Subscribe to live SSE stream with robust fallback polling for guaranteed cross-device sync
  subscribeEvent: (
    eventId: string,
    onUpdate: (update: LiveSelectionUpdate) => void
  ): (() => void) => {
    let isSubscribed = true;
    let eventSource: EventSource | null = null;

    // 1. Initial fast fetch
    liveSyncService.getSelections(eventId).then((data) => {
      if (data && isSubscribed) {
        onUpdate(data);
      }
    });

    // 2. Real-Time Server-Sent Events (SSE)
    try {
      eventSource = new EventSource(`/api/events/${encodeURIComponent(eventId)}/stream`);
      eventSource.onmessage = (event) => {
        if (!isSubscribed) return;
        try {
          const data = JSON.parse(event.data) as LiveSelectionUpdate;
          if (data && data.eventId === eventId) {
            onUpdate(data);
          }
        } catch {
          // ignore
        }
      };

      eventSource.onerror = () => {
        // SSE will automatically reconnect, but fallback polling keeps sync alive
      };
    } catch (err) {
      console.warn('EventSource not available, falling back to live polling', err);
    }

    // 3. Ultra-fast 2-second background polling fallback (guarantees sync even on flaky mobile Safari connections)
    const pollInterval = setInterval(async () => {
      if (!isSubscribed) return;
      const data = await liveSyncService.getSelections(eventId);
      if (data && isSubscribed) {
        onUpdate(data);
      }
    }, 2000);

    return () => {
      isSubscribed = false;
      if (eventSource) {
        eventSource.close();
      }
      clearInterval(pollInterval);
    };
  },

  // Backup event metadata to server for seamless cross-device availability
  backupEvent: async (event: WeddingEvent) => {
    try {
      await fetch('/api/events/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event }),
      });
    } catch {
      // ignore
    }
  },

  // Retrieve event backup from server
  getBackupEvent: async (slugOrId: string): Promise<WeddingEvent | null> => {
    try {
      const res = await fetch(`/api/events/backup/${encodeURIComponent(slugOrId)}`);
      if (res.ok) {
        return (await res.json()) as WeddingEvent;
      }
    } catch {
      // ignore
    }
    return null;
  },
};
