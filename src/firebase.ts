import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  memoryLocalCache,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK
export const app = initializeApp(firebaseConfig);

// Initialize Firestore with memory cache (avoids browser localStorage quota exhaustion from large mutation queues)
// and experimentalForceLongPolling for robust connectivity across all devices and sandboxes
export const db = initializeFirestore(
  app,
  {
    localCache: memoryLocalCache(),
    experimentalForceLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId || undefined
);

