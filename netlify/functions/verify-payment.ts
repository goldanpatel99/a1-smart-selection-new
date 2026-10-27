import crypto from 'crypto';
import Razorpay from 'razorpay';
import { verifyUserToken } from './lib/firebaseAdmin';
import { SERVER_PRICING_PACKAGES } from './lib/pricingPackages';
import { creditPurchaseOnce } from './lib/creditPurchase';

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
      body: JSON.stringify({ error: 'Razorpay credentials not configured in server environment.' }),
    };
  }

  const authUser = await verifyUserToken(event.headers.authorization || event.headers.Authorization);

  try {
    const body = JSON.parse(event.body || '{}');
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'Missing required payment verification parameters (order_id, payment_id, signature)',
        }),
      };
    }

    // Cryptographic signature verification with timing-safe comparison
    const hmac = crypto.createHmac('sha256', keySecret);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generatedSignature = hmac.digest('hex');

    const expectedBuffer = Buffer.from(generatedSignature, 'utf8');
    const receivedBuffer = Buffer.from(razorpay_signature, 'utf8');

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'Cryptographic signature mismatch. Payment verification failed.',
        }),
      };
    }

    // Fetch verified order details from Razorpay to guarantee authentic points and tier
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    let verifiedPoints = 1;
    let verifiedTier: 'standard' | 'premium' = 'standard';
    let targetUserId = authUser?.uid || body.userId || '';
    let packageId = body.packageId || 'custom';
    let amountRupees = 0;

    try {
      const order = await razorpay.orders.fetch(razorpay_order_id);
      if (order) {
        amountRupees = Number(order.amount || 0) / 100;
        if (order.notes?.points) {
          verifiedPoints = Number(order.notes.points);
        }
        if (order.notes?.tier === 'premium' || order.notes?.tier === 'standard') {
          verifiedTier = order.notes.tier;
        }
        if (order.notes?.userId) {
          targetUserId = String(order.notes.userId);
        }
        if (order.notes?.packageId) {
          packageId = String(order.notes.packageId);
          // If notes didn't have tier/points, look up in server package table
          if (!order.notes.points && SERVER_PRICING_PACKAGES[packageId]) {
            verifiedPoints = SERVER_PRICING_PACKAGES[packageId].points;
            verifiedTier = SERVER_PRICING_PACKAGES[packageId].tier;
          }
        }
      }
    } catch (orderFetchErr) {
      console.warn('Could not fetch order from Razorpay, falling back to server package table:', orderFetchErr);
      if (packageId && SERVER_PRICING_PACKAGES[packageId]) {
        verifiedPoints = SERVER_PRICING_PACKAGES[packageId].points;
        verifiedTier = SERVER_PRICING_PACKAGES[packageId].tier;
        amountRupees = SERVER_PRICING_PACKAGES[packageId].priceRupees;
      }
    }

    if (!targetUserId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'User ID could not be identified for payment crediting.',
        }),
      };
    }

    const creditResult = await creditPurchaseOnce({
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      userId: targetUserId,
      amountRupees,
      points: verifiedPoints,
      tier: verifiedTier,
      description: `Razorpay Payment (${verifiedPoints} ${verifiedTier === 'premium' ? 'Premium' : 'Standard'} Points)`,
      source: 'verify',
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        alreadyCredited: creditResult.alreadyCredited,
        balanceAfter: creditResult.balanceAfter,
        message: creditResult.alreadyCredited
          ? 'Payment already verified and credited previously (idempotent).'
          : 'Payment verified and studio points successfully credited on server!',
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        points: verifiedPoints,
        tier: verifiedTier,
      }),
    };
  } catch (error: any) {
    console.error('Payment Verification Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error?.message || 'Server error during payment verification',
      }),
    };
  }
}
