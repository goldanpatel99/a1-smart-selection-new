import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'united-tracker-g48x0';
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-a1smartselection-ea9875be-636d-4af1-937b-b1b115a83de1';

if (!getApps().length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      initializeApp({
        credential: cert(serviceAccount),
        projectId: PROJECT_ID,
      });
    } else {
      initializeApp({
        projectId: PROJECT_ID,
      });
    }
  } catch (err) {
    console.error('Failed to initialize Firebase Admin SDK:', err);
  }
}

export const adminAuth = getApps().length ? getAuth() : null;

// Get Firestore instance pointing to database ID
export function getAdminFirestore() {
  if (!getApps().length) return null;
  try {
    // Pass databaseId if provided
    return DATABASE_ID ? getFirestore(DATABASE_ID) : getFirestore();
  } catch (e) {
    console.error('Error getting Firestore Admin instance:', e);
    return null;
  }
}

export { FieldValue, Timestamp };

export async function verifyUserToken(authHeader?: string): Promise<{ uid: string; email?: string } | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.replace(/^Bearer\s+/, '').trim();
  if (!token) return null;

  if (!adminAuth) {
    console.warn('Firebase Admin Auth not initialized. Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID.');
    return null;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch (err) {
    console.warn('ID token verification failed:', err);
    return null;
  }
}
