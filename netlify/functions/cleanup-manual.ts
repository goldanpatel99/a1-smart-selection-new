import { runCleanup, timingSafeEqualString } from './lib/cleanup';

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
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' }),
    };
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'CRON_SECRET is not configured on the server.' }),
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const expectedHeader = `Bearer ${cronSecret}`;

  if (!timingSafeEqualString(authHeader, expectedHeader)) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized: Invalid CRON_SECRET.' }),
    };
  }

  console.log('[Manual Cleanup Trigger] Authorized manual cleanup initiated...');
  const result = await runCleanup({ budgetMs: 20000 });

  return {
    statusCode: result.success ? 200 : 500,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(result),
  };
}
