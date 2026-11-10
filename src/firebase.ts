import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

const envApiKey = import.meta.env?.VITE_FIREBASE_API_KEY;
const envAuthDomain = import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN;
const envProjectId = import.meta.env?.VITE_FIREBASE_PROJECT_ID;
const envStorageBucket = import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET;
const envMessagingSenderId = import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID;
const envAppId = import.meta.env?.VITE_FIREBASE_APP_ID;
const envDatabaseId = import.meta.env?.VITE_FIRESTORE_DATABASE_ID;

const useEnvConfig = Boolean(envApiKey && envProjectId);

const appConfig = useEnvConfig
  ? {
      apiKey: envApiKey,
      authDomain: envAuthDomain,
      projectId: envProjectId,
      storageBucket: envStorageBucket,
      messagingSenderId: envMessagingSenderId,
      appId: envAppId,
    }
  : firebaseConfig;

// Initialize Firebase SDK
export const app = initializeApp(appConfig);
export const auth = getAuth(app);

// Database ID: empty string or '(default)' means the default database (undefined)
const rawDatabaseId = useEnvConfig
  ? envDatabaseId
  : firebaseConfig.firestoreDatabaseId;

const databaseId =
  !rawDatabaseId || rawDatabaseId === '(default)' ? undefined : rawDatabaseId;

// Initialize Firestore with persistent multi-tab IndexedDB cache
// and auto-detect long polling (WebSocket first, fallback gracefully without server read spikes)
export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
    experimentalAutoDetectLongPolling: true,
    ignoreUndefinedProperties: true,
  },
  databaseId
);

