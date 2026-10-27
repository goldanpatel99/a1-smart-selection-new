import { getAdminFirestore } from './firebaseAdmin';

export interface CreditPurchaseParams {
  paymentId: string;
  orderId: string;
  userId: string;
  amountRupees: number;
  points: number;
  tier: 'standard' | 'premium';
  description?: string;
  source: 'verify' | 'webhook';
}

export interface CreditPurchaseResult {
  success: boolean;
  alreadyCredited: boolean;
  balanceAfter?: number;
  error?: string;
}

export async function creditPurchaseOnce(params: CreditPurchaseParams): Promise<CreditPurchaseResult> {
  const { paymentId, orderId, userId, amountRupees, points, tier, description, source } = params;

  if (!paymentId || !userId) {
    throw new Error('paymentId and userId are required');
  }

  const db = getAdminFirestore();
  if (!db) {
    throw new Error('Firebase Admin Firestore is not initialized on server');
  }

  const txnRef = db.collection('transactions').doc(paymentId);
  const userRef = db.collection('users').doc(userId);
  const specificPointField = tier === 'premium' ? 'premiumPoints' : 'standardPoints';

  return await db.runTransaction(async (transaction: any) => {
    // 1. FIRST read transaction.get(txnRef)
    const txnSnap = await transaction.get(txnRef);
    if (txnSnap.exists) {
      const existingData = txnSnap.data() || {};
      return {
        success: true,
        alreadyCredited: true,
        balanceAfter: existingData.balanceAfter,
      };
    }

    // 2. Read users/{userId}
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) {
      throw new Error(`User ${userId} not found`);
    }

    const userData = userSnap.data() || {};
    if (userData.isBlocked) {
      throw new Error(`User account is blocked: ${userData.blockedReason || 'Blocked by admin'}`);
    }

    // Current balances
    const currentPoints = Number(userData.points || 0);
    const currentTierPoints = Number(userData[specificPointField] || 0);

    const newPoints = currentPoints + points;
    const newTierPoints = currentTierPoints + points;
    const nowIso = new Date().toISOString();

    // 3. & 4. Update users/{userId}
    transaction.update(userRef, {
      points: newPoints,
      [specificPointField]: newTierPoints,
      lastRechargedAt: nowIso,
    });

    // 5. Create transactions/{paymentId} with all audit fields
    transaction.set(txnRef, {
      id: paymentId,
      paymentId,
      orderId: orderId || '',
      userId,
      userEmail: userData.email || '',
      points,
      amount: points,
      pointTier: tier,
      type: 'credit',
      amountRupees: amountRupees || 0,
      balanceAfter: newPoints,
      source,
      status: 'success',
      paymentMethod: 'razorpay',
      description:
        description ||
        `Points recharge via ${source} (${points} ${tier === 'premium' ? 'Premium' : 'Standard'} Points)`,
      createdAt: nowIso,
    });

    return {
      success: true,
      alreadyCredited: false,
      balanceAfter: newPoints,
    };
  });
}
