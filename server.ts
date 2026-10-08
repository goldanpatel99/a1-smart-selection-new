import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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

// ----------------------------------------------------
// Real-Time Cross-Device Selection Sync (SSE & REST)
// Completely immune to Cloud Firestore quota limits
// ----------------------------------------------------
const SYNC_DIR = path.resolve(__dirname, '.sync_data');
if (!fs.existsSync(SYNC_DIR)) {
  try {
    fs.mkdirSync(SYNC_DIR, { recursive: true });
  } catch (e) {
    console.warn('Could not create .sync_data directory, using memory only', e);
  }
}

interface EventSyncPayload {
  eventId: string;
  selectedPhotoIds: string[];
  selectedCount: number;
  lastUpdated: string;
  clientNotes?: string;
  status?: string;
}

const memorySyncMap = new Map<string, EventSyncPayload>();
const eventBackupMap = new Map<string, any>();
const sseConnections = new Map<string, Set<express.Response>>();

function loadEventSync(eventId: string): EventSyncPayload {
  if (memorySyncMap.has(eventId)) {
    return memorySyncMap.get(eventId)!;
  }
  const filePath = path.join(SYNC_DIR, `${eventId}.json`);
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      memorySyncMap.set(eventId, data);
      return data;
    } catch {
      // ignore
    }
  }
  const empty: EventSyncPayload = {
    eventId,
    selectedPhotoIds: [],
    selectedCount: 0,
    lastUpdated: new Date().toISOString(),
  };
  memorySyncMap.set(eventId, empty);
  return empty;
}

function saveEventSync(payload: EventSyncPayload) {
  memorySyncMap.set(payload.eventId, payload);
  try {
    fs.writeFileSync(path.join(SYNC_DIR, `${payload.eventId}.json`), JSON.stringify(payload, null, 2));
  } catch (err) {
    console.warn('Failed to persist sync file:', err);
  }
}

function broadcastEventSync(eventId: string, payload: EventSyncPayload) {
  const clients = sseConnections.get(eventId);
  if (clients && clients.size > 0) {
    const dataStr = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of clients) {
      try {
        client.write(dataStr);
      } catch {
        clients.delete(client);
      }
    }
  }
}

// 5. Get Live Event Selections
app.get('/api/events/:eventId/selection', (req, res) => {
  const { eventId } = req.params;
  const data = loadEventSync(eventId);
  res.json(data);
});

// 6. Update Live Photo Selection (From mobile or desktop)
app.post('/api/events/:eventId/selection', (req, res) => {
  try {
    const { eventId } = req.params;
    const { photoId, isSelected, selectedPhotoIds, clientNotes, status } = req.body;

    const current = loadEventSync(eventId);
    let updatedSelectedIds: string[] = [];

    if (Array.isArray(selectedPhotoIds)) {
      updatedSelectedIds = Array.from(new Set(selectedPhotoIds));
    } else if (photoId) {
      const set = new Set(current.selectedPhotoIds || []);
      if (isSelected) {
        set.add(photoId);
      } else {
        set.delete(photoId);
      }
      updatedSelectedIds = Array.from(set);
    } else {
      updatedSelectedIds = current.selectedPhotoIds || [];
    }

    const payload: EventSyncPayload = {
      eventId,
      selectedPhotoIds: updatedSelectedIds,
      selectedCount: updatedSelectedIds.length,
      lastUpdated: new Date().toISOString(),
      clientNotes: clientNotes !== undefined ? clientNotes : current.clientNotes,
      status: status || current.status || 'active',
    };

    saveEventSync(payload);
    broadcastEventSync(eventId, payload);

    res.json({ success: true, ...payload });
  } catch (err: any) {
    console.error('Error in /api/events/:eventId/selection:', err);
    res.status(500).json({ success: false, error: err?.message || 'Sync error' });
  }
});

// 7. Real-Time Server-Sent Events (SSE) Stream for Instant Live Sync
app.get('/api/events/:eventId/stream', (req, res) => {
  const { eventId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  if (!sseConnections.has(eventId)) {
    sseConnections.set(eventId, new Set());
  }
  const clientSet = sseConnections.get(eventId)!;
  clientSet.add(res);

  // Send initial state immediately
  const current = loadEventSync(eventId);
  res.write(`data: ${JSON.stringify(current)}\n\n`);

  // Keep-alive heartbeat every 15s to keep connection open through proxies/firewalls
  const heartbeat = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clientSet.delete(res);
  });
});

// 8. Event Backup Store (For cross-device event availability when Firestore quota is exhausted)
app.post('/api/events/backup', (req, res) => {
  try {
    const { event } = req.body;
    if (event && event.id) {
      eventBackupMap.set(event.id, event);
      if (event.slug) {
        eventBackupMap.set(event.slug, event);
      }
      try {
        fs.writeFileSync(path.join(SYNC_DIR, `evt_${event.id}.json`), JSON.stringify(event));
      } catch (e) {
        // ignore
      }
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

app.get('/api/events/backup/:slugOrId', (req, res) => {
  const { slugOrId } = req.params;
  let event = eventBackupMap.get(slugOrId);
  if (!event) {
    const filePath = path.join(SYNC_DIR, `evt_${slugOrId}.json`);
    if (fs.existsSync(filePath)) {
      try {
        event = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        // ignore
      }
    }
  }
  if (event) {
    res.json(event);
  } else {
    res.status(404).json({ error: 'Event backup not found' });
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
