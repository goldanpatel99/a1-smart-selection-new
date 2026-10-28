import { initializeApp, cert, getApps, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

let serviceAccount: (ServiceAccount & { project_id?: string }) | null = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (err) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', err);
  }
}

const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  serviceAccount?.project_id ||
  serviceAccount?.projectId ||
  '';

const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || '(default)';

if (!PROJECT_ID) {
  console.error(
    'Firebase Admin error: No project ID determined. Set FIREBASE_PROJECT_ID, VITE_FIREBASE_PROJECT_ID, or provide project_id in FIREBASE_SERVICE_ACCOUNT.'
  );
}

if (!getApps().length) {
  if (PROJECT_ID) {
    try {
      if (serviceAccount) {
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
}

export const adminAuth = getApps().length ? getAuth() : null;

// Get Firestore instance pointing to database ID
export function getAdminFirestore() {
  if (!getApps().length) return null;
  try {
    // Pass databaseId if provided and not default
    return DATABASE_ID && DATABASE_ID !== '(default)'
      ? getFirestore(DATABASE_ID)
      : getFirestore();
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
