import crypto from 'crypto';
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
      body: JSON.stringify({ error: 'Authentication required to create event' }),
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
    const title = (data.title || '').trim();
    const coupleName = (data.coupleName || '').trim();

    if (!title || !coupleName) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Title and couple name are required' }),
      };
    }

    const tier = data.pointTier === 'premium' ? 'premium' : 'standard';
    const isPremium = tier === 'premium';
    const maxPhotoCapacity = isPremium ? 5000 : 2500;
    const deadlineDays = Math.max(1, Number(data.deadlineDays) || 15);

    // Calculate deadline in IST (UTC+5:30)
    const now = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const nowIst = new Date(now.getTime() + istOffsetMs);
    const targetIst = new Date(nowIst.getTime() + deadlineDays * 24 * 60 * 60 * 1000);
    const yyyy = targetIst.getUTCFullYear();
    const mm = String(targetIst.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(targetIst.getUTCDate()).padStart(2, '0');
    const deadlineDateStr = `${yyyy}-${mm}-${dd}`;
    const deadlineAtDate = new Date(`${deadlineDateStr}T23:59:59.999+05:30`);
    const deadlineAtTimestamp = Timestamp.fromDate(deadlineAtDate);

    const userRef = db.collection('users').doc(authUser.uid);
    const newEventId = `evt-${crypto.randomUUID()}`;
    const eventRef = db.collection('events').doc(newEventId);
    const txnId = `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const txnRef = db.collection('transactions').doc(txnId);

    const baseSlug =
      (title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'event');

    let slug = '';
    let publicLinkRef: any = null;
    let balanceAfter = 0;
    let createdEventData: any = null;

    await db.runTransaction(async (transaction: any) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new Error('User profile not found. Please sign up or contact admin.');
      }

      // Read publicLinks first to ensure slug uniqueness (crypto 8 chars [0-9a-f], max 5 retries)
      slug = '';
      publicLinkRef = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const suffix = crypto.randomBytes(4).toString('hex');
        const candidateSlug = `${baseSlug}-${suffix}`;
        const candidateRef = db.collection('publicLinks').doc(candidateSlug);
        const existingLink = await transaction.get(candidateRef);
        if (!existingLink.exists) {
          slug = candidateSlug;
          publicLinkRef = candidateRef;
          break;
        }
      }

      if (!slug || !publicLinkRef) {
        throw new Error('Slug collision: could not generate unique event link after 5 attempts. Please try again.');
      }

      const userData = userDoc.data();
      if (userData.isBlocked) {
        throw new Error(
          userData.blockedReason ||
            'Aapka photographer account temporarily blocked hai. Kripya admin se contact karein.'
        );
      }

      const currentStd = Number(userData.standardPoints ?? userData.points ?? 0);
      const currentPrm = Number(userData.premiumPoints ?? 0);
      const chosenBalance = isPremium ? currentPrm : currentStd;

      if (chosenBalance < 1) {
        throw new Error(
          `Insufficient ${isPremium ? 'Premium' : 'Standard'} Points. Current balance: ${chosenBalance}`
        );
      }

      const totalPoints = Number(userData.points ?? (currentStd + currentPrm));
      balanceAfter = Math.max(0, totalPoints - 1);
      const newStd = isPremium ? currentStd : Math.max(0, currentStd - 1);
      const newPrm = isPremium ? Math.max(0, currentPrm - 1) : currentPrm;

      // 1. Decrement user points
      transaction.update(userRef, {
        points: FieldValue.increment(-1),
        [isPremium ? 'premiumPoints' : 'standardPoints']: FieldValue.increment(-1),
        updatedAt: new Date().toISOString(),
      });

      // 2. Denormalize studio branding from user profile
      const studioBranding = {
        name: userData.studioName || userData.name || 'Studio',
        logoUrl: userData.studioLogoUrl || null,
        whatsapp: userData.studioBookingPhone || userData.phone || null,
        phone: userData.phone || null,
        watermarkText: userData.watermarkText || userData.studioName || null,
        tagline: userData.studioTagline || 'Luxury Wedding Stories & Timeless Cinematic Films',
        instagram: userData.studioInstagram || null,
        address: userData.studioAddress || null,
      };

      createdEventData = {
        id: newEventId,
        slug,
        title,
        coupleName,
        clientPhone: data.clientPhone || '',
        clientEmail: data.clientEmail || '',
        photographerId: authUser.uid,
        photographerEmail: authUser.email || userData.email || '',
        studioName: studioBranding.name,
        studio: studioBranding,
        status: 'active',
        eventDate: data.eventDate || now.toISOString().split('T')[0],
        deadlineDate: deadlineDateStr,
        deadlineAt: deadlineAtTimestamp,
        maxSelectionLimit: data.maxSelectionLimit || null,
        photosPerSheet: data.photosPerSheet || userData.defaultPhotosPerSheet || 6,
        coupleStory: data.coupleStory || '',
        folders: [],
        photosCount: 0,
        selectedCount: 0,
        createdAt: new Date().toISOString(),
        pointTier: tier,
        maxPhotoCapacity,
      };

      // 3. Create event doc
      transaction.set(eventRef, createdEventData);

      // 4. Create public link lookup doc for O(1) slug resolution
      transaction.set(publicLinkRef, {
        eventId: newEventId,
        photographerId: authUser.uid,
        updatedAt: new Date().toISOString(),
      });

      // 5. Write transaction record
      transaction.set(txnRef, {
        id: txnId,
        userId: authUser.uid,
        userEmail: authUser.email || userData.email || '',
        type: 'debit',
        amount: 1,
        pointTier: tier,
        description: `Event Created: "${title}" (${isPremium ? '⚡ Premium Point - Up to 5k Photos' : 'Standard Point - Up to 2.5k Photos'})`,
        balanceAfter,
        eventId: newEventId,
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
        eventId: newEventId,
        balanceAfter,
        event: {
          ...createdEventData,
          deadlineAt: deadlineAtDate.toISOString(),
        },
      }),
    };
  } catch (err: any) {
    console.error('Create Event Error:', err);
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: err.message || 'Failed to create event on server',
      }),
    };
  }
}
