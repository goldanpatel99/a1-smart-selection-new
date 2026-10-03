import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase';
import { User, WeddingEvent, PointTransaction, AdminSettings } from '../types';

export const firebaseService = {
  // --- EVENTS ---
  subscribeEvents: (onUpdate: (events: WeddingEvent[]) => void) => {
    try {
      const q = collection(db, 'events');
      return onSnapshot(
        q,
        (snapshot) => {
          const events: WeddingEvent[] = [];
          snapshot.forEach((docSnap) => {
            events.push(docSnap.data() as WeddingEvent);
          });
          if (events.length > 0) {
            onUpdate(events);
          }
        },
        (error) => {
          console.warn('Firestore events listener error (falling back to local cache):', error.message);
        }
      );
    } catch (e) {
      console.warn('Could not initialize events listener:', e);
      return () => {};
    }
  },

  saveEvent: async (event: WeddingEvent) => {
    try {
      await setDoc(doc(db, 'events', event.id), event, { merge: true });
    } catch (err) {
      console.warn('Error saving event to Firestore:', err);
    }
  },

  deleteEvent: async (eventId: string) => {
    try {
      await deleteDoc(doc(db, 'events', eventId));
    } catch (err) {
      console.warn('Error deleting event from Firestore:', err);
    }
  },

  getEventBySlugOrId: async (slugOrId: string): Promise<WeddingEvent | null> => {
    try {
      // First try doc id directly
      const docSnap = await getDoc(doc(db, 'events', slugOrId));
      if (docSnap.exists()) {
        return docSnap.data() as WeddingEvent;
      }
      // Else query by slug
      const q = query(collection(db, 'events'), where('slug', '==', slugOrId), limit(1));
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        return querySnap.docs[0].data() as WeddingEvent;
      }
    } catch (err) {
      console.warn('Error fetching event from Firestore:', err);
    }
    return null;
  },

  // --- USERS ---
  subscribeUsers: (onUpdate: (users: User[]) => void) => {
    try {
      const q = collection(db, 'users');
      return onSnapshot(
        q,
        (snapshot) => {
          const users: User[] = [];
          snapshot.forEach((docSnap) => {
            users.push(docSnap.data() as User);
          });
          if (users.length > 0) {
            onUpdate(users);
          }
        },
        (error) => {
          console.warn('Firestore users listener error:', error.message);
        }
      );
    } catch (e) {
      console.warn('Could not initialize users listener:', e);
      return () => {};
    }
  },

  saveUser: async (user: User) => {
    try {
      await setDoc(doc(db, 'users', user.id), user, { merge: true });
    } catch (err) {
      console.warn('Error saving user to Firestore:', err);
    }
  },

  // --- TRANSACTIONS ---
  subscribeTransactions: (onUpdate: (txs: PointTransaction[]) => void) => {
    try {
      const q = collection(db, 'transactions');
      return onSnapshot(
        q,
        (snapshot) => {
          const txs: PointTransaction[] = [];
          snapshot.forEach((docSnap) => {
            txs.push(docSnap.data() as PointTransaction);
          });
          if (txs.length > 0) {
            onUpdate(txs);
          }
        },
        (error) => {
          console.warn('Firestore transactions listener error:', error.message);
        }
      );
    } catch (e) {
      console.warn('Could not initialize transactions listener:', e);
      return () => {};
    }
  },

  saveTransaction: async (tx: PointTransaction) => {
    try {
      await setDoc(doc(db, 'transactions', tx.id), tx, { merge: true });
    } catch (err) {
      console.warn('Error saving transaction to Firestore:', err);
    }
  },

  // --- SETTINGS ---
  subscribeSettings: (onUpdate: (settings: AdminSettings) => void) => {
    try {
      const docRef = doc(db, 'settings', 'global');
      return onSnapshot(
        docRef,
        (docSnap) => {
          if (docSnap.exists()) {
            onUpdate(docSnap.data() as AdminSettings);
          }
        },
        (error) => {
          console.warn('Firestore settings listener error:', error.message);
        }
      );
    } catch (e) {
      console.warn('Could not initialize settings listener:', e);
      return () => {};
    }
  },

  saveSettings: async (settings: AdminSettings) => {
    try {
      await setDoc(doc(db, 'settings', 'global'), settings, { merge: true });
    } catch (err) {
      console.warn('Error saving settings to Firestore:', err);
    }
  },
};
