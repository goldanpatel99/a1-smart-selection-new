import { getAdminFirestore, verifyUserToken } from './lib/firebaseAdmin';

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
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const authUser = await verifyUserToken(event.headers.authorization || event.headers.Authorization);
  if (!authUser?.uid) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized: Firebase ID token required' }),
    };
  }

  const db = getAdminFirestore();
  if (!db) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server database not configured' }),
    };
  }

  const adminDoc = await db.collection('admins').doc(authUser.uid).get();
  if (!adminDoc.exists) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Forbidden: Admin access required (admins/{uid} doc not found)' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { targetUserId, isBlocked, reason } = body;

    if (!targetUserId || typeof isBlocked !== 'boolean') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'targetUserId and boolean isBlocked are required' }),
      };
    }

    const userRef = db.collection('users').doc(targetUserId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    const updateData: Record<string, any> = {
      isBlocked,
      blockedAt: isBlocked ? new Date().toISOString() : null,
      blockedReason: isBlocked
        ? (reason?.trim() || 'Aapka photographer account admin dwara temporarily block kar diya gaya hai. Kripya admin se contact karein.')
        : null,
      updatedAt: new Date().toISOString(),
    };

    await userRef.update(updateData);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        message: isBlocked ? 'User account blocked' : 'User account unblocked',
        targetUserId,
        isBlocked,
      }),
    };
  } catch (err: any) {
    console.error('Admin set blocked error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Server error setting block state' }),
    };
  }
}
