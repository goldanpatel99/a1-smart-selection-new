import { getAdminFirestore, verifyUserToken, FieldValue } from './lib/firebaseAdmin';

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

  // Verify caller has admin privileges via admins/{uid} document
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
    const { targetUserId, points, reason, tier } = body;

    if (!targetUserId || points === undefined) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'targetUserId and points amount are required' }),
      };
    }

    const pointsNum = Number(points);
    if (isNaN(pointsNum)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid points number' }),
      };
    }

    const isPremium = tier === 'premium';
    const specificField = isPremium ? 'premiumPoints' : 'standardPoints';
    const userRef = db.collection('users').doc(targetUserId);
    const txnId = `tx-admin-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const txnRef = db.collection('transactions').doc(txnId);

    let updatedBalance = 0;
    let targetEmail = '';

    await db.runTransaction(async (transaction: any) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new Error(`Target user ${targetUserId} not found`);
      }

      const userData = userDoc.data();
      targetEmail = userData.email || '';
      const currentStd = Number(userData.standardPoints ?? userData.points ?? 0);
      const currentPrm = Number(userData.premiumPoints ?? 0);

      const newStd = isPremium ? currentStd : Math.max(0, currentStd + pointsNum);
      const newPrm = isPremium ? Math.max(0, currentPrm + pointsNum) : currentPrm;
      updatedBalance = newStd + newPrm;

      transaction.update(userRef, {
        points: updatedBalance,
        [specificField]: isPremium ? newPrm : newStd,
        updatedAt: new Date().toISOString(),
      });

      transaction.set(txnRef, {
        id: txnId,
        userId: targetUserId,
        userEmail: targetEmail,
        type: pointsNum >= 0 ? 'credit' : 'debit',
        amount: Math.abs(pointsNum),
        pointTier: isPremium ? 'premium' : 'standard',
        description: `Admin Adjustment (${isPremium ? 'Premium' : 'Standard'}): ${reason || 'Manual Admin Update'}`,
        balanceAfter: updatedBalance,
        createdAt: new Date().toISOString(),
        paymentMethod: 'Admin Grant',
        adminUid: authUser.uid,
      });
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        message: `Points updated successfully on server`,
        balanceAfter: updatedBalance,
        txnId,
      }),
    };
  } catch (err: any) {
    console.error('Admin point adjustment error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Server error adjusting points' }),
    };
  }
}
