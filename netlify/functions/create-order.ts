import Razorpay from 'razorpay';
import { getAdminFirestore, verifyUserToken } from './lib/firebaseAdmin';
import { SERVER_PRICING_PACKAGES, ServerPackage } from './lib/pricingPackages';

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

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Razorpay credentials not configured in server environment variables (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing).',
      }),
    };
  }

  // Verify auth header
  const authUser = await verifyUserToken(event.headers.authorization || event.headers.Authorization);
  if (!authUser) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized: Valid Firebase ID token is required to create a payment order.' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { packageId, studioName } = body;

    if (!packageId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'packageId is required' }),
      };
    }

    // Resolve package strictly on server (never trust client amounts/points)
    let selectedPackage: ServerPackage | undefined = SERVER_PRICING_PACKAGES[packageId];

    // Check if custom pricing packages exist in settings/global
    const db = getAdminFirestore();
    if (db) {
      try {
        const settingsSnap = await db.collection('settings').doc('global').get();
        if (settingsSnap.exists) {
          const settingsData = settingsSnap.data();
          const pkgList = settingsData?.pricingPackages;
          if (Array.isArray(pkgList)) {
            const found = pkgList.find((p: any) => p.id === packageId);
            if (found && found.priceRupees && found.points) {
              selectedPackage = {
                id: found.id,
                tier: found.tier || 'standard',
                points: Number(found.points),
                priceRupees: Number(found.priceRupees),
                photosLimit: Number(found.photosLimit) || (found.tier === 'premium' ? 5000 : 2500),
                name: found.name || 'Point Recharge',
              };
            }
          }
        }
      } catch (settingsErr) {
        console.warn('Could not read settings/global for pricing:', settingsErr);
      }
    }

    if (!selectedPackage) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Invalid or unrecognized packageId: "${packageId}"` }),
      };
    }

    const verifiedPriceRupees = selectedPackage.priceRupees;
    const verifiedPoints = selectedPackage.points;
    const verifiedTier = selectedPackage.tier;
    const amountInPaise = Math.round(verifiedPriceRupees * 100);

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rcpt_${Date.now()}_${verifiedPoints}pts`,
      notes: {
        userId: authUser.uid,
        userEmail: authUser.email || '',
        points: String(verifiedPoints),
        tier: verifiedTier,
        packageId: selectedPackage.id,
        studioName: studioName || 'Nepolian Cinematic Studio',
      },
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId,
        points: verifiedPoints,
        tier: verifiedTier,
      }),
    };
  } catch (error: any) {
    console.error('Razorpay Create Order Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error?.message || 'Failed to create Razorpay order',
      }),
    };
  }
}
