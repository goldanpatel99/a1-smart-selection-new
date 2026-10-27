import { verifyUserToken, getAdminFirestore } from './lib/firebaseAdmin';
import { createPresignedUploadUrl, isR2Configured, isR2PublicUrlConfigured } from './lib/r2Client';

interface PresignRequestItem {
  photoId: string;
  type: 'full' | 'thumb';
  contentType: string;
  extension?: string;
}

const PHOTO_ID_REGEX = /^[A-Za-z0-9_-]{8,64}$/;

function getCorsHeaders(requestOrigin?: string): Record<string, string> {
  const allowedOrigin = process.env.APP_URL || process.env.VITE_APP_URL;
  // If specific allowed origin configured and matches, use it; otherwise allow current origin or fallback
  const origin = allowedOrigin ? (requestOrigin === allowedOrigin ? requestOrigin : allowedOrigin) : (requestOrigin || '*');
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

export async function handler(event: {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  body: string | null;
}) {
  const originHeader = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(originHeader);

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' }),
    };
  }

  // 1. Check Server / Admin SDK Configuration
  const db = getAdminFirestore();
  if (!db) {
    return {
      statusCode: 503,
      headers: corsHeaders,
      body: JSON.stringify({
        code: 'SERVER_NOT_CONFIGURED',
        error: 'Firebase Admin SDK not configured on server. Please configure FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID.',
      }),
    };
  }

  // 2. Check Cloudflare R2 Credentials & Public URL
  if (!isR2Configured()) {
    return {
      statusCode: 503,
      headers: corsHeaders,
      body: JSON.stringify({
        code: 'R2_NOT_CONFIGURED',
        error: 'Cloudflare R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME.',
      }),
    };
  }

  if (!isR2PublicUrlConfigured()) {
    return {
      statusCode: 503,
      headers: corsHeaders,
      body: JSON.stringify({
        code: 'R2_PUBLIC_URL_MISSING',
        error: 'R2_PUBLIC_URL environment variable is missing. A public CDN or custom domain URL is required to serve photos.',
      }),
    };
  }

  // 3. Validate Authentication
  const authHeader = event.headers.authorization || event.headers.Authorization;
  const authUser = await verifyUserToken(authHeader);
  if (!authUser) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({
        code: 'UNAUTHORIZED',
        error: 'Valid Firebase ID token is required to request presigned upload URLs.',
      }),
    };
  }

  try {
    const { eventId, files } = JSON.parse(event.body || '{}') as {
      eventId: string;
      files: PresignRequestItem[];
    };

    if (!eventId || !Array.isArray(files) || files.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          code: 'INVALID_REQUEST',
          error: 'eventId and non-empty files array are required.',
        }),
      };
    }

    // Limit batch size (max 40 items per request, i.e. 20 photos full + thumb)
    if (files.length > 40) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          code: 'BATCH_LIMIT_EXCEEDED',
          error: 'Maximum 40 files allowed per presign request.',
        }),
      };
    }

    // 4. Validate each file item
    for (const item of files) {
      if (!item.photoId || !PHOTO_ID_REGEX.test(item.photoId)) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            code: 'INVALID_PHOTO_ID',
            error: `Invalid photoId: "${item.photoId}". Must match ^[A-Za-z0-9_-]{8,64}$.`,
          }),
        };
      }
      if (item.type !== 'full' && item.type !== 'thumb') {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            code: 'INVALID_TYPE',
            error: `Invalid type "${item.type}". Must be 'full' or 'thumb'.`,
          }),
        };
      }
      const ct = (item.contentType || '').toLowerCase().trim();
      if (ct !== 'image/jpeg' && ct !== 'image/jpg') {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            code: 'INVALID_CONTENT_TYPE',
            error: `Content-Type must be image/jpeg, got "${item.contentType}".`,
          }),
        };
      }
    }

    // 5. Verify event exists and caller is owner or admin
    const eventRef = db.collection('events').doc(eventId);
    const eventSnap = await eventRef.get();
    if (!eventSnap.exists) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          code: 'EVENT_NOT_FOUND',
          error: `Event with id "${eventId}" not found.`,
        }),
      };
    }

    const eventData = eventSnap.data() || {};
    const isOwner = eventData.photographerId === authUser.uid;
    let isAdmin = false;
    if (!isOwner) {
      const adminSnap = await db.collection('admins').doc(authUser.uid).get();
      isAdmin = adminSnap.exists;
    }

    if (!isOwner && !isAdmin) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({
          code: 'FORBIDDEN',
          error: 'Forbidden: You do not have permission to upload photos to this event.',
        }),
      };
    }

    // 6. Capacity Check using Firestore count() aggregate
    const maxCapacity = Number(eventData.maxPhotoCapacity) || (eventData.pointTier === 'premium' ? 5000 : 2500);
    const countQuery = await eventRef.collection('photos').count().get();
    const existingPhotoCount = countQuery.data().count;

    // Count how many unique photo IDs are in this batch
    const uniqueBatchPhotoIds = new Set(files.map((f) => f.photoId));
    if (existingPhotoCount + uniqueBatchPhotoIds.size > maxCapacity) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          code: 'CAPACITY_EXCEEDED',
          error: `Event capacity limit of ${maxCapacity} photos reached. Current: ${existingPhotoCount}, attempted new: ${uniqueBatchPhotoIds.size}.`,
          currentCount: existingPhotoCount,
          maxCapacity,
        }),
      };
    }

    // 7. Generate presigned URLs
    const results: Array<{
      photoId: string;
      type: 'full' | 'thumb';
      uploadUrl: string;
      publicUrl: string;
      key: string;
    }> = [];

    for (const item of files) {
      const key = `events/${eventId}/${item.photoId}-${item.type}.jpg`;
      const presigned = await createPresignedUploadUrl(key, 'image/jpeg');

      if (!presigned) {
        return {
          statusCode: 503,
          headers: corsHeaders,
          body: JSON.stringify({
            code: 'R2_PRESIGN_FAILED',
            error: 'Failed to generate presigned URL. Check Cloudflare R2 bucket and credentials.',
          }),
        };
      }

      results.push({
        photoId: item.photoId,
        type: item.type,
        uploadUrl: presigned.uploadUrl,
        publicUrl: presigned.publicUrl,
        key: presigned.key,
      });
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ urls: results }),
    };
  } catch (err: any) {
    console.error('R2 Presign Error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        code: 'INTERNAL_SERVER_ERROR',
        error: err.message || 'Failed to process presign request.',
      }),
    };
  }
}
