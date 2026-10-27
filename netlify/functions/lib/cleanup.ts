import crypto from 'crypto';
import { FieldPath } from 'firebase-admin/firestore';
import { getAdminFirestore, Timestamp } from './firebaseAdmin';
import { listR2ObjectsByPrefix, deleteR2Objects, isR2Configured } from './r2Client';

export interface CleanupOptions {
  budgetMs?: number;
}

export interface CleanupResult {
  success: boolean;
  scannedCount: number;
  deletedCount: number;
  skippedCount: number;
  purgedEventsCount: number;
  purgedPhotosCount: number;
  purgedR2ObjectsCount: number;
  errors: string[];
  timedOut: boolean;
  durationMs: number;
}

export function timingSafeEqualString(a?: string, b?: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Runs 40-day retention cleanup for expired wedding events with full pagination.
 * 1. Paginates events by orderBy('deadlineAt') where deadlineAt <= cutoffTimestamp (pages of 50).
 * 2. Paginates legacy events without deadlineAt by FieldPath.documentId() (pages of 100).
 * 3. Enforces budgetMs execution limit.
 * 4. Atomically deletes R2 objects and verifies 0 keys remain before deleting Firestore records.
 */
export async function runCleanup(options: CleanupOptions = {}): Promise<CleanupResult> {
  const startTime = Date.now();
  const budgetMs = options.budgetMs || 20000;
  const result: CleanupResult = {
    success: true,
    scannedCount: 0,
    deletedCount: 0,
    skippedCount: 0,
    purgedEventsCount: 0,
    purgedPhotosCount: 0,
    purgedR2ObjectsCount: 0,
    errors: [],
    timedOut: false,
    durationMs: 0,
  };

  const db = getAdminFirestore();
  if (!db) {
    result.success = false;
    result.errors.push('Firebase Admin not configured');
    result.durationMs = Date.now() - startTime;
    return result;
  }

  if (!isR2Configured()) {
    result.success = false;
    result.errors.push('R2 storage is not configured. Skipping cleanup to prevent orphaned data.');
    result.durationMs = Date.now() - startTime;
    return result;
  }

  const RETENTION_DAYS = 40;
  const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const cutoffMs = startTime - RETENTION_MS;
  const cutoffTimestamp = Timestamp.fromDate(new Date(cutoffMs));

  const processedEventIds = new Set<string>();

  const purgeEvent = async (doc: FirebaseFirestore.DocumentSnapshot): Promise<boolean> => {
    const eventId = doc.id;
    const data = doc.data() || {};
    const prefix = `events/${eventId}/`;

    // Step A: List R2 objects under prefix
    const listRes = await listR2ObjectsByPrefix(prefix);
    if (!listRes.ok) {
      console.error(`Cannot list R2 objects for event ${eventId}: ${listRes.error}. Skipping Firestore deletion.`);
      result.errors.push(`Event ${eventId}: R2 list failed (${listRes.error})`);
      result.skippedCount++;
      return false;
    }

    // Step B: Delete all listed R2 objects
    if (listRes.keys.length > 0) {
      const deleteRes = await deleteR2Objects(listRes.keys);
      if (!deleteRes.ok) {
        console.error(`R2 deletion failed for event ${eventId} (${deleteRes.errorCount} errors). Skipping Firestore deletion.`);
        result.errors.push(`Event ${eventId}: R2 delete failed for ${deleteRes.errorCount} objects`);
        result.skippedCount++;
        return false;
      }
      result.purgedR2ObjectsCount += listRes.keys.length;
    }

    // Step C: Verify 0 keys remain under prefix
    const verifyRes = await listR2ObjectsByPrefix(prefix);
    if (!verifyRes.ok || verifyRes.keys.length > 0) {
      const remCount = verifyRes.keys?.length ?? 0;
      console.error(`R2 folder for event ${eventId} still has ${remCount} keys after deletion. Skipping Firestore deletion.`);
      result.errors.push(`Event ${eventId}: R2 verify failed (${remCount} keys remaining)`);
      result.skippedCount++;
      return false;
    }

    // Step D: Delete Firestore subcollections
    // 1. Photos subcollection
    const photosSnap = await db.collection('events').doc(eventId).collection('photos').get();
    const photoDocs = photosSnap.docs;
    const BATCH_SIZE = 400;

    for (let i = 0; i < photoDocs.length; i += BATCH_SIZE) {
      const chunk = photoDocs.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const pDoc of chunk) {
        batch.delete(pDoc.ref);
        result.purgedPhotosCount++;
      }
      await batch.commit();
    }

    // 2. live_state subcollection
    const liveSnap = await db.collection('events').doc(eventId).collection('live_state').get();
    if (!liveSnap.empty) {
      const liveBatch = db.batch();
      liveSnap.forEach((lDoc) => liveBatch.delete(lDoc.ref));
      await liveBatch.commit();
    }

    // 3. publicLinks doc
    if (data.slug && typeof data.slug === 'string') {
      await db
        .collection('publicLinks')
        .doc(data.slug.trim())
        .delete()
        .catch((delErr) => {
          console.warn(`Could not delete publicLink for ${data.slug}:`, delErr.message);
        });
    }

    // 4. Delete the parent event document
    await doc.ref.delete();
    result.deletedCount++;
    result.purgedEventsCount++;
    console.log(`[Retention Cleanup] Event ${eventId} ("${data.title}") permanently purged from R2 and Firestore.`);
    return true;
  };

  try {
    // LOOP 1: Query by orderBy('deadlineAt') where deadlineAt <= cutoffTimestamp, page size 50, startAfter
    let lastDeadlineDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    let indexAvailable = true;

    while (Date.now() - startTime < budgetMs && indexAvailable) {
      let query = db
        .collection('events')
        .orderBy('deadlineAt')
        .where('deadlineAt', '<=', cutoffTimestamp)
        .limit(50);

      if (lastDeadlineDoc) {
        query = query.startAfter(lastDeadlineDoc);
      }

      let snap: FirebaseFirestore.QuerySnapshot | null = null;
      try {
        snap = await query.get();
      } catch (err: any) {
        console.warn('Index query on deadlineAt failed (index may be building/missing):', err.message);
        indexAvailable = false;
        break;
      }

      if (!snap || snap.empty) break;

      for (const doc of snap.docs) {
        if (Date.now() - startTime >= budgetMs) {
          result.timedOut = true;
          break;
        }

        lastDeadlineDoc = doc;
        result.scannedCount++;
        processedEventIds.add(doc.id);

        await purgeEvent(doc);
      }

      if (snap.docs.length < 50 || result.timedOut) break;
    }

    // LOOP 2: Legacy events without deadlineAt - paginate by FieldPath.documentId() in pages of 100
    let lastLegacyDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    while (Date.now() - startTime < budgetMs) {
      let query = db
        .collection('events')
        .orderBy(FieldPath.documentId())
        .limit(100);

      if (lastLegacyDoc) {
        query = query.startAfter(lastLegacyDoc);
      }

      let snap: FirebaseFirestore.QuerySnapshot | null = null;
      try {
        snap = await query.get();
      } catch (err: any) {
        console.warn('Scan query by documentId failed:', err.message);
        result.errors.push(`Scan query failed: ${err.message}`);
        break;
      }

      if (!snap || snap.empty) break;

      for (const doc of snap.docs) {
        lastLegacyDoc = doc;

        if (processedEventIds.has(doc.id)) {
          continue;
        }

        if (Date.now() - startTime >= budgetMs) {
          result.timedOut = true;
          break;
        }

        result.scannedCount++;
        processedEventIds.add(doc.id);

        const data = doc.data();
        // If deadlineAt exists and index was working, it was already handled or not expired
        if (data.deadlineAt && indexAvailable) {
          result.skippedCount++;
          continue;
        }

        // Evaluate deadline timestamp
        let deadlineMs = 0;
        if (data.deadlineAt) {
          if (typeof data.deadlineAt.toDate === 'function') {
            deadlineMs = data.deadlineAt.toDate().getTime();
          } else if (typeof data.deadlineAt === 'string') {
            deadlineMs = new Date(data.deadlineAt).getTime();
          }
        } else if (data.deadlineDate && typeof data.deadlineDate === 'string') {
          deadlineMs = new Date(`${data.deadlineDate}T23:59:59.999+05:30`).getTime();
        } else if (data.createdAt && typeof data.createdAt === 'string') {
          deadlineMs = new Date(data.createdAt).getTime();
        }

        if (!deadlineMs || isNaN(deadlineMs) || deadlineMs + RETENTION_MS > startTime) {
          result.skippedCount++;
          continue;
        }

        await purgeEvent(doc);
      }

      if (snap.docs.length < 100 || result.timedOut) break;
    }

    if (Date.now() - startTime >= budgetMs) {
      result.timedOut = true;
    }
  } catch (err: any) {
    console.error('[Retention Cleanup Error]:', err);
    result.success = false;
    result.errors.push(err.message || 'Cleanup encountered unexpected error');
  }

  result.durationMs = Date.now() - startTime;
  return result;
}
