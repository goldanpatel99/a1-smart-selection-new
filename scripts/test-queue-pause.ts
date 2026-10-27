import assert from 'node:assert/strict';
import { CloudSyncQueueManager } from '../src/utils/cloudSyncQueue.ts';

async function runQueuePauseTests() {
  console.log('Testing cloud sync queue pause on config errors...');

  let fetchCount = 0;
  const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
    fetchCount++;
    const urlStr = url.toString();
    if (urlStr.includes('/api/r2-presign')) {
      return {
        ok: false,
        status: 503,
        json: async () => ({
          code: 'R2_NOT_CONFIGURED',
          error: 'Cloudflare R2 is not configured on the server',
        }),
      } as any;
    }
    return { ok: false, status: 500 } as any;
  };

  const mockAuth = {
    currentUser: {
      getIdToken: async () => 'mock-test-id-token',
    },
    onAuthStateChanged: () => () => {},
  };

  const pendingDbStore: any[] = [
    {
      id: 'evt-1:photo-1',
      eventId: 'evt-1',
      photoId: 'photo-1',
      filename: 'photo1.jpg',
      status: 'pending',
      retries: 0,
    },
    {
      id: 'evt-1:photo-2',
      eventId: 'evt-1',
      photoId: 'photo-2',
      filename: 'photo2.jpg',
      status: 'pending',
      retries: 0,
    },
  ];

  const mockIdb = {
    getPendingUploads: async (eventId: string) => {
      return pendingDbStore.filter((i) => i.eventId === eventId);
    },
    savePendingUploadsBatch: async (items: any[]) => {
      pendingDbStore.push(...items);
    },
    updatePendingUpload: async (id: string, updates: any) => {
      const it = pendingDbStore.find((i) => i.id === id);
      if (it) Object.assign(it, updates);
    },
    getPhotoBlob: async () => ({ blob: new Blob(['a']), thumbBlob: new Blob(['b']) }),
    deletePhotoBlobs: async () => {},
    removePendingUpload: async () => {},
  };

  const mockFirebaseService = {
    savePhotos: async () => [{ photoId: 'photo-1', success: true }],
  };

  const queue = new CloudSyncQueueManager({
    auth: mockAuth,
    idbStorage: mockIdb,
    firebaseService: mockFirebaseService,
    isFirestoreQuotaExhausted: () => false,
    fetchFn: mockFetch as any,
  });

  // Test 1: Initial resume with 503 R2_NOT_CONFIGURED
  const count = await queue.resumePendingUploads('evt-1');
  assert.equal(count, 2, 'Should find 2 pending uploads');

  // Wait a short duration to ensure runLoop completes and does NOT hot-loop
  await new Promise((r) => setTimeout(r, 200));

  const progress = queue.getProgress('evt-1');
  console.log('Progress after first run:', progress);

  assert.equal(progress.status, 'paused', 'Event status must be paused');
  assert.equal(progress.failed, 0, 'No photos should be marked failed in progress');
  assert.equal(fetchCount, 1, `Fetch must be called exactly once per resume, but called ${fetchCount} times`);

  // Verify none of the items in IDB were marked failed
  for (const item of pendingDbStore) {
    assert.notEqual(item.status, 'failed', `Item ${item.id} must not be marked failed`);
    assert.equal(item.retries, 0, `Item ${item.id} retries must not be incremented on config error`);
  }

  // Wait another 150ms to verify no additional requests are made while paused (no hot loop)
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(fetchCount, 1, 'Queue must not make any additional requests while paused');

  // Test 2: Second explicit resume ("Sync Now")
  console.log('Triggering second explicit resume ("Sync Now")...');
  await queue.resumePendingUploads('evt-1');
  await new Promise((r) => setTimeout(r, 200));

  const progress2 = queue.getProgress('evt-1');
  assert.equal(progress2.status, 'paused', 'Event status must be paused again after 2nd attempt');
  assert.equal(progress2.failed, 0, 'Photos must still not be marked failed');
  assert.equal(fetchCount, 2, `Fetch must be called at most once per resume (total 2 for 2 resumes, got ${fetchCount})`);

  console.log('✓ All queue pause tests passed successfully!');
}

runQueuePauseTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
