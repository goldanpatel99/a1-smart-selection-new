import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = (() => {
  const portIdx = process.argv.indexOf('--port');
  if (portIdx !== -1 && process.argv[portIdx + 1]) {
    const parsed = parseInt(process.argv[portIdx + 1], 10);
    if (!isNaN(parsed)) return parsed;
  }
  return process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
})();

// 1. Raw body parser strictly for Razorpay Webhook to preserve HMAC payload integrity
app.post(
  ['/api/webhook', '/.netlify/functions/webhook'],
  express.raw({ type: '*/*' }),
  async (req, res) => {
    try {
      const { handler } = await import('./netlify/functions/webhook.ts');
      const rawBody = Buffer.isBuffer(req.body)
        ? req.body.toString('utf8')
        : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body || {});

      const result = await handler({
        httpMethod: req.method,
        headers: req.headers as Record<string, string | undefined>,
        body: rawBody,
      });

      return res.status(result.statusCode).set(result.headers || {}).send(result.body);
    } catch (err: any) {
      console.error('Webhook execution error:', err);
      return res.status(500).json({ error: err.message || 'Webhook adapter failure' });
    }
  }
);

// 2. Standard JSON body parser for all other API endpoints
app.use(express.json());

// 3. Generic Netlify Function Adapter: single source of truth for all API routes
const handleFunctionRequest = async (funcName: string, req: express.Request, res: express.Response) => {
  const cleanName = funcName.replace(/[^a-zA-Z0-9_-]/g, '');

  if (cleanName === 'auto-delete-expired') {
    return res.status(403).json({
      error: 'Forbidden: Direct HTTP invocation of auto-delete-expired is blocked. Use /api/cleanup-manual with CRON_SECRET.',
    });
  }

  try {
    const mod = await import(`./netlify/functions/${cleanName}.ts`);
    if (typeof mod.handler !== 'function') {
      return res.status(404).json({ error: `Function "${cleanName}" not found or lacks a handler.` });
    }

    const bodyString =
      typeof req.body === 'string'
        ? req.body
        : req.body && Object.keys(req.body).length > 0
        ? JSON.stringify(req.body)
        : null;

    const result = await mod.handler({
      httpMethod: req.method,
      headers: req.headers as Record<string, string | undefined>,
      body: bodyString,
    });

    return res.status(result.statusCode).set(result.headers || {}).send(result.body);
  } catch (err: any) {
    console.error(`Error executing netlify function ${cleanName}:`, err);
    return res.status(500).json({
      error: err.message || `Failed to execute ${cleanName}`,
    });
  }
};

// Aliases for razorpay sub-routes & config
app.get(['/api/razorpay/config', '/.netlify/functions/config'], (_req, res) => {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  res.json({
    keyId,
    isLive: keyId.startsWith('rzp_live'),
    isConfigured: Boolean(keyId && process.env.RAZORPAY_KEY_SECRET),
  });
});

app.all(['/api/razorpay/create-order', '/api/create-order', '/.netlify/functions/create-order'], (req, res) =>
  handleFunctionRequest('create-order', req, res)
);

app.all(
  ['/api/razorpay/verify-payment', '/api/verify-payment', '/.netlify/functions/verify-payment'],
  (req, res) => handleFunctionRequest('verify-payment', req, res)
);

// Generic function route for all netlify functions (/api/:func and /.netlify/functions/:func)
app.all(['/api/:func', '/.netlify/functions/:func'], (req, res) => {
  return handleFunctionRequest(req.params.func, req, res);
});

async function startServer() {
  try {
    if (process.env.NODE_ENV === 'production') {
      app.use(express.static(path.resolve(__dirname, 'dist')));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
      });
    } else {
      // Mount Vite dev server middleware in development
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: process.env.DISABLE_HMR !== 'true',
        },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    }
  } catch (initErr) {
    console.error('Error initializing Vite server middleware:', initErr);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Express server running on http://0.0.0.0:${PORT}`);
    console.log(`  ➜  Local:   http://localhost:${PORT}/`);
    console.log(`  ➜  Network: http://0.0.0.0:${PORT}/`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${PORT} already in use. Retrying in 1s...`);
      setTimeout(() => {
        server.close();
        server.listen(PORT, '0.0.0.0');
      }, 1000);
    } else {
      console.error('Server listen error:', err);
    }
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
