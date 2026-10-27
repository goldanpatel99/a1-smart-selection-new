export async function handler() {
  return {
    statusCode: 410,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: 'Gone: Direct point deduction endpoint is decommissioned. Points are deducted server-authoritatively inside /api/create-event and /api/extend-deadline transactions.',
    }),
  };
}
