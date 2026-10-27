import { runCleanup, timingSafeEqualString } from './lib/cleanup';

export const config = {
  schedule: '@daily',
};

export async function handler(event?: any) {
  const cronSecret = process.env.CRON_SECRET;

  // Block unauthenticated direct HTTP calls
  if (event?.httpMethod) {
    const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
    if (!cronSecret || !timingSafeEqualString(authHeader, `Bearer ${cronSecret}`)) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Forbidden: Direct HTTP invocation of auto-delete-expired is blocked. Use /api/cleanup-manual with CRON_SECRET.',
        }),
      };
    }
  }

  console.log('[Scheduled Cleanup] Executing @daily automated 40-day retention cleanup...');
  const result = await runCleanup({ budgetMs: 20000 });

  return {
    statusCode: result.success ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  };
}
