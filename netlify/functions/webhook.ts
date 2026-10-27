import crypto from 'crypto';
import { creditPurchaseOnce } from './lib/creditPurchase';

export async function handler(event: {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  body: string | null;
}) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
  const signature = event.headers['x-razorpay-signature'] || event.headers['X-Razorpay-Signature'];

  if (!webhookSecret) {
    console.warn('RAZORPAY_WEBHOOK_SECRET is not configured.');
    return { statusCode: 500, body: 'Webhook secret not configured' };
  }

  if (!signature) {
    return { statusCode: 400, body: 'Missing x-razorpay-signature header' };
  }

  // Validate webhook signature against raw body with timing-safe comparison
  const rawBody = event.body || '';
  const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

  const expBuffer = Buffer.from(expectedSignature, 'utf8');
  const rcvBuffer = Buffer.from(signature, 'utf8');

  if (expBuffer.length !== rcvBuffer.length || !crypto.timingSafeEqual(expBuffer, rcvBuffer)) {
    console.error('Invalid Razorpay webhook signature');
    return { statusCode: 400, body: 'Invalid signature' };
  }

  try {
    const payload = JSON.parse(rawBody);
    const eventType = payload.event;

    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      const paymentEntity = payload.payload?.payment?.entity || {};
      const paymentId = paymentEntity.id;
      const orderId = paymentEntity.order_id;
      const notes = paymentEntity.notes || {};
      const targetUserId = notes.userId;
      const points = Number(notes.points) || 1;
      const packageId = notes.packageId || 'custom';
      const isPremium = notes.tier === 'premium' || packageId?.includes('premium') || packageId?.includes('5k');
      const tier = isPremium ? 'premium' : 'standard';
      const amountRupees = (paymentEntity.amount || 0) / 100;

      if (paymentId && targetUserId) {
        // Await creditPurchaseOnce inside the handler before responding.
        // If it throws, execution jumps to catch and returns 500 so Razorpay retries.
        const result = await creditPurchaseOnce({
          paymentId,
          orderId,
          userId: targetUserId,
          amountRupees,
          points,
          tier,
          description: `Razorpay Webhook (${points} ${tier === 'premium' ? 'Premium' : 'Standard'} Points)`,
          source: 'webhook',
        });
        console.log(`Webhook creditPurchaseOnce result for payment ${paymentId}: alreadyCredited=${result.alreadyCredited}`);
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ok', received: true }),
    };
  } catch (err: any) {
    console.error('Webhook processing error:', err);
    return { statusCode: 500, body: `Webhook error: ${err.message}` };
  }
}
