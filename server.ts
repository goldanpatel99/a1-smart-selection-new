import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Razorpay API Credentials provided by Studio (Live Key - Verified)
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_live_TkG9ETDfzpFIgr';
let rawSecret = process.env.RAZORPAY_KEY_SECRET || 'lMx2YLe8RCri7f9Mwq9SCz9a';
// Auto-fix OCR ambiguity: capital I vs lowercase l in Razorpay secret
if (rawSecret.startsWith('IMx2')) {
  rawSecret = 'l' + rawSecret.slice(1);
}
const RAZORPAY_KEY_SECRET = rawSecret;

let razorpay: Razorpay;
try {
  razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET,
  });
} catch (err) {
  console.error('Failed to initialize Razorpay SDK:', err);
}

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 2. Razorpay Public Config endpoint
app.get('/api/razorpay/config', (req, res) => {
  res.json({
    keyId: RAZORPAY_KEY_ID,
    isLive: RAZORPAY_KEY_ID.startsWith('rzp_live'),
    isConfigured: Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET),
  });
});

// 3. Create Order endpoint
app.post('/api/razorpay/create-order', async (req, res) => {
  try {
    const { amountRupees, points, packageId, userId, userEmail, studioName } = req.body;

    if (!amountRupees || !points) {
      return res.status(400).json({ error: 'amountRupees and points are required' });
    }

    const amountInPaise = Math.round(Number(amountRupees) * 100);

    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rcpt_${Date.now()}_${points}pts`,
      notes: {
        userId: userId || 'unknown',
        points: String(points),
        packageId: packageId || '',
        userEmail: userEmail || '',
        studioName: studioName || 'Nepolian Cinematic Studio',
      },
    };

    if (!razorpay) {
      razorpay = new Razorpay({
        key_id: RAZORPAY_KEY_ID,
        key_secret: RAZORPAY_KEY_SECRET,
      });
    }

    const order = await razorpay.orders.create(options);

    return res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: RAZORPAY_KEY_ID,
    });
  } catch (error: any) {
    console.error('Razorpay Create Order Error:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to create Razorpay order',
      details: error?.error || error,
    });
  }
});

// 4. Verify Payment endpoint
app.post('/api/razorpay/verify-payment', (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required payment verification parameters',
      });
    }

    const hmac = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature === razorpay_signature) {
      return res.json({
        success: true,
        message: 'Payment verified successfully! Points can be credited.',
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'Cryptographic signature mismatch. Payment verification failed.',
      });
    }
  } catch (error: any) {
    console.error('Razorpay Verification Error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Server error during payment verification',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    // Mount Vite dev server middleware in development
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Express server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
