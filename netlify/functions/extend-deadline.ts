import { getAdminFirestore, verifyUserToken, FieldValue, Timestamp } from './lib/firebaseAdmin';

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
      body: JSON.stringify({ error: 'Authentication required to extend deadline' }),
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

  try {
    const data = JSON.parse(event.body || '{}');
    const { eventId, days = 6 } = data;

    if (!eventId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'eventId is required' }),
      };
    }

    const extendDays = Math.max(1, Number(days) || 6);

    // Read adminSettings for pointsPerExtension
    let pointsRequired = 1;
    try {
      const settingsSnap = await db.collection('settings').doc('global').get();
      if (settingsSnap.exists) {
        pointsRequired = Number(settingsSnap.data()?.pointsPerExtension) || 1;
      }
    } catch {}

    const userRef = db.collection('users').doc(authUser.uid);
    const eventRef = db.collection('events').doc(eventId);
    const txnId = `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const txnRef = db.collection('transactions').doc(txnId);

    let newDeadlineDateStr = '';
    let newDeadlineAtIso = '';
    let balanceAfter = 0;

    await db.runTransaction(async (transaction: any) => {
      const [userDoc, eventDoc] = await Promise.all([
        transaction.get(userRef),
        transaction.get(eventRef),
      ]);

      if (!userDoc.exists) {
        throw new Error('User profile not found');
      }
      if (!eventDoc.exists) {
        throw new Error('Event not found');
      }

      const userData = userDoc.data();
      const eventData = eventDoc.data();

      // Check owner or admin
      const isOwner = eventData.photographerId === authUser.uid;
      let isAdmin = false;
      if (!isOwner) {
        const adminDoc = await db.collection('admins').doc(authUser.uid).get();
        isAdmin = adminDoc.exists;
      }

      if (!isOwner && !isAdmin) {
        throw new Error('Unauthorized: You do not own this event');
      }

      const currentPoints = Number(userData.points ?? 0);
      if (currentPoints < pointsRequired) {
        throw new Error(
          `Insufficient points! You need ${pointsRequired} point to extend deadline. Current balance: ${currentPoints} points.`
        );
      }

      balanceAfter = currentPoints - pointsRequired;

      // Calculate new deadline in IST
      let baseDate = new Date();
      if (eventData.deadlineAt?.toDate) {
        baseDate = eventData.deadlineAt.toDate();
      } else if (eventData.deadlineAt) {
        baseDate = new Date(eventData.deadlineAt);
      } else if (eventData.deadlineDate) {
        baseDate = new Date(`${eventData.deadlineDate}T23:59:59.999+05:30`);
      }

      // If already expired in past, base from now
      if (baseDate.getTime() < Date.now()) {
        baseDate = new Date();
      }

      const istOffsetMs = 5.5 * 60 * 60 * 1000;
      const baseIst = new Date(baseDate.getTime() + istOffsetMs);
      const targetIst = new Date(baseIst.getTime() + extendDays * 24 * 60 * 60 * 1000);
      const yyyy = targetIst.getUTCFullYear();
      const mm = String(targetIst.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(targetIst.getUTCDate()).padStart(2, '0');
      newDeadlineDateStr = `${yyyy}-${mm}-${dd}`;
      const deadlineAtDate = new Date(`${newDeadlineDateStr}T23:59:59.999+05:30`);
      const deadlineAtTimestamp = Timestamp.fromDate(deadlineAtDate);
      newDeadlineAtIso = deadlineAtDate.toISOString();

      // Update user points
      transaction.update(userRef, {
        points: FieldValue.increment(-pointsRequired),
        standardPoints: FieldValue.increment(-pointsRequired),
        updatedAt: new Date().toISOString(),
      });

      // Update event deadline
      const eventUpdates: Record<string, any> = {
        deadlineDate: newDeadlineDateStr,
        deadlineAt: deadlineAtTimestamp,
        updatedAt: new Date().toISOString(),
      };
      if (eventData.status === 'expired') {
        eventUpdates.status = 'active';
      }
      transaction.update(eventRef, eventUpdates);

      // Write transaction record
      transaction.set(txnRef, {
        id: txnId,
        userId: authUser.uid,
        userEmail: authUser.email || userData.email || '',
        type: 'debit',
        amount: pointsRequired,
        description: `Deadline Extended (+${extendDays} days) for "${eventData.title}"`,
        balanceAfter,
        eventId,
        createdAt: new Date().toISOString(),
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
        deadlineDate: newDeadlineDateStr,
        deadlineAt: newDeadlineAtIso,
        balanceAfter,
      }),
    };
  } catch (err: any) {
    console.error('Extend Deadline Error:', err);
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: err.message || 'Failed to extend deadline on server',
      }),
    };
  }
}
