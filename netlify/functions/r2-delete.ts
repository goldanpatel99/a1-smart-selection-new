import { getAdminFirestore, verifyUserToken } from './lib/firebaseAdmin';
import { deleteR2Objects } from './lib/r2Client';

export async function handler(event: {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  body: string | null;
}) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const authUser = await verifyUserToken(event.headers.authorization || event.headers.Authorization);
  if (!authUser?.uid) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized: Firebase ID token required.' }),
    };
  }

  const db = getAdminFirestore();
  if (!db) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Firebase Admin database not configured' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { eventId, photoIds } = body as { eventId: string; photoIds: string[] };

    if (!eventId || !Array.isArray(photoIds) || photoIds.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'eventId and non-empty photoIds array are required.' }),
      };
    }

    // Verify event ownership or admin privilege
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Event not found' }),
      };
    }

    const eventData = eventDoc.data() || {};
    const isOwner = eventData.photographerId === authUser.uid;
    let isAdmin = false;
    if (!isOwner) {
      const adminDoc = await db.collection('admins').doc(authUser.uid).get();
      isAdmin = adminDoc.exists;
    }

    if (!isOwner && !isAdmin) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Forbidden: You do not own this event' }),
      };
    }

    // Collect R2 keys from photo documents or build standard keys
    const r2KeysSet = new Set<string>();
    const photoDocsRefs: FirebaseFirestore.DocumentReference[] = [];

    // Query photo docs in chunks of 50 to get explicit r2Key and r2ThumbKey
    const CHUNK_SIZE = 50;
    for (let i = 0; i < photoIds.length; i += CHUNK_SIZE) {
      const chunkIds = photoIds.slice(i, i + CHUNK_SIZE);
      const snaps = await Promise.all(
        chunkIds.map((pid) => db.collection('events').doc(eventId).collection('photos').doc(pid).get())
      );

      for (const snap of snaps) {
        if (snap.exists) {
          photoDocsRefs.push(snap.ref);
          const pData = snap.data();
          if (pData?.r2Key) r2KeysSet.add(pData.r2Key);
          if (pData?.r2ThumbKey) r2KeysSet.add(pData.r2ThumbKey);
          if (pData?.url && pData.url.includes('.r2.')) {
            const match = pData.url.match(/events\/[^\s?]+/);
            if (match) r2KeysSet.add(match[0]);
          }
        }
      }
    }

    // If no explicit r2Key stored, build standard paths for each photoId
    for (const pid of photoIds) {
      r2KeysSet.add(`events/${eventId}/full/${pid}.jpg`);
      r2KeysSet.add(`events/${eventId}/thumb/${pid}.jpg`);
      r2KeysSet.add(`events/${eventId}/full/${pid}.webp`);
      r2KeysSet.add(`events/${eventId}/thumb/${pid}.webp`);
    }

    // Delete R2 objects (chunked by <= 1000 inside deleteR2Objects)
    const keysArray = Array.from(r2KeysSet);
    const r2Result = await deleteR2Objects(keysArray);
    const r2Success = r2Result.ok;

    // Delete Firestore photo docs
    let deletedFirestoreDocs = 0;
    const BATCH_LIMIT = 400;
    for (let i = 0; i < photoDocsRefs.length; i += BATCH_LIMIT) {
      const batchChunk = photoDocsRefs.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();
      batchChunk.forEach((ref) => {
        batch.delete(ref);
        deletedFirestoreDocs++;
      });
      await batch.commit();
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: r2Success,
        deletedPhotosCount: photoIds.length,
        deletedR2KeysCount: keysArray.length,
        deletedFirestoreDocs,
      }),
    };
  } catch (err: any) {
    console.error('R2 Delete Error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Failed to delete photos from storage' }),
    };
  }
}
