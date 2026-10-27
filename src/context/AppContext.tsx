import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import {
  User,
  WeddingEvent,
  PointTransaction,
  AdminSettings,
  Photo,
  PhotoFolder,
  PointTier,
  LiveSelectionDoc,
  isRemoteUrl,
} from '../types';
import { storage } from '../utils/storage';
import { idbStorage } from '../utils/idbStorage';
import { firebaseService } from '../services/firebaseService';
import { SAMPLE_DEMO_EVENT, INITIAL_ADMIN_SETTINGS } from '../utils/mockData';
import { cloudSyncQueue } from '../utils/cloudSyncQueue';
import { auth, db } from '../firebase';
import { RETENTION_DAYS } from '../config/retention';
import { getDeadlineMs } from '../utils/deadline';

export type AppView =
  | 'landing'
  | 'dashboard'
  | 'client-gallery'
  | 'photo-upload'
  | 'selection-results'
  | 'admin-panel';

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface AppContextType {
  currentUser: User | null;
  isAdmin: boolean;
  users: User[];
  events: WeddingEvent[];
  transactions: PointTransaction[];
  adminSettings: AdminSettings;
  currentView: AppView;
  activeEventId: string | null;
  activeEvent: WeddingEvent | null;
  toasts: ToastMessage[];

  // Navigation
  navigateTo: (view: AppView, eventId?: string | null) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;

  // Real Firebase Auth
  login: (email: string, roleOrPassword?: string, password?: string) => Promise<boolean>;
  signup: (data: {
    name: string;
    email: string;
    phone: string;
    studioName: string;
    password?: string;
  }) => Promise<boolean>;
  forgotPassword: (email: string) => Promise<boolean>;
  logout: () => Promise<void>;
  switchUser: (userId: string) => void;
  updateStudioSettings: (settings: Partial<User>) => Promise<void>;

  // Points
  buyPoints: (
    packageId: string,
    paymentMethod?: string,
    paymentDetails?: { paymentId?: string; orderId?: string }
  ) => Promise<boolean>;
  adminAddPoints: (userId: string, points: number, reason: string, tier?: PointTier) => void;
  adminResetPassword: (userId: string, customPass?: string) => Promise<string>;
  adminUpdateSettings: (newSettings: AdminSettings) => void;
  adminUpdateOwnCredentials: (newEmail: string, newPassword: string) => Promise<boolean>;
  adminToggleBlockPhotographer: (userId: string, reason?: string) => void;
  adminDeletePhotographer: (userId: string) => Promise<void>;
  adminResetAllStoredData: () => Promise<void>;

  // Events
  createEvent: (data: {
    title: string;
    coupleName: string;
    clientPhone?: string;
    clientEmail?: string;
    eventDate: string;
    deadlineDays: number;
    maxSelectionLimit?: number;
    photosPerSheet?: number;
    coupleStory?: string;
    pointTier?: PointTier;
  }) => Promise<{ success: boolean; error?: string; eventId?: string }>;
  extendDeadline: (eventId: string, days?: number) => Promise<{ success: boolean; error?: string }>;
  updateEvent: (eventId: string, data: Partial<WeddingEvent>) => void;
  deleteEvent: (eventId: string) => Promise<void>;

  // Folders & Photos
  addFolder: (eventId: string, folderName: string) => void;
  deleteFolder: (eventId: string, folderId: string, folderName?: string) => Promise<boolean>;
  toggleFolderVisibility: (eventId: string, folderId: string) => void;
  addPhotosToEvent: (
    eventId: string,
    photos: Omit<Photo, 'id' | 'isSelected' | 'uploadedAt'>[],
    options?: { skipCloudSync?: boolean }
  ) => Promise<Photo[]>;
  deletePhotoFromEvent: (eventId: string, photoId: string) => Promise<boolean>;

  refreshEventPhotos: (eventId: string) => Promise<Photo[]>;
  mergePhotosIntoEvent: (eventId: string, photos: Photo[]) => void;

  // Client Selection
  togglePhotoSelection: (eventId: string, photoId: string) => void;
  submitClientSelection: (eventId: string, clientNotes?: string) => Promise<void>;
  restoreClientSelections: (
    eventId: string,
    selectedPhotoIds: string[],
    clientNotes?: string,
    deviceId?: string,
    rev?: number
  ) => void;

  // 50-Day Storage Management
  storageRetentionDays: number;
  runStorageAutoClean: () => number;
}

const mapAuthErrorToHinglish = (errCode: string): string => {
  switch (errCode) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Galat email ya password! Kripya sahi credentials enter karein.';
    case 'auth/email-already-in-use':
      return 'Is email se account pehle se bana hua hai. Kripya login karein.';
    case 'auth/weak-password':
      return 'Password kam se kam 6 characters ka hona chahiye.';
    case 'auth/invalid-email':
      return 'Kripya valid email address enter karein.';
    case 'auth/user-disabled':
      return 'Aapka account disable kar diya gaya hai. Kripya admin se contact karein.';
    case 'auth/too-many-requests':
      return 'Bahut saare failed attempts! Kripya thodi der baad koshish karein.';
    default:
      return 'Authentication error! Kripya internet check karke dobara try karein.';
  }
};

const getInitialRoute = (): { view: AppView; eventId: string | null; slugOrId: string | null } => {
  if (typeof window === 'undefined') {
    return { view: 'landing', eventId: null, slugOrId: null };
  }

  const rawHash = window.location.hash || '';
  const cleanHash = rawHash.replace(/^[#/]+/, '').trim();
  const rawPath = window.location.pathname || '';
  const cleanPath = rawPath.replace(/^\/+/, '').trim();

  let slugOrId: string | null = null;
  if (cleanHash.startsWith('gallery/')) {
    slugOrId = cleanHash.replace(/^gallery\//, '').trim();
  } else if (cleanHash.startsWith('g/')) {
    slugOrId = cleanHash.replace(/^g\//, '').trim();
  } else if (cleanPath.startsWith('gallery/')) {
    slugOrId = cleanPath.replace(/^gallery\//, '').trim();
  } else if (cleanPath.startsWith('g/')) {
    slugOrId = cleanPath.replace(/^g\//, '').trim();
  } else {
    try {
      const params = new URLSearchParams(window.location.search);
      const qg =
        params.get('gallery') ||
        params.get('g') ||
        params.get('event') ||
        params.get('eventId') ||
        params.get('slug') ||
        params.get('id');
      if (qg) slugOrId = qg.trim();
    } catch {}
  }

  if (slugOrId) {
    if (
      slugOrId === 'sample-client-gallery' ||
      slugOrId === 'sample-wedding' ||
      slugOrId === 'demo' ||
      slugOrId === 'demo-sample-event'
    ) {
      return { view: 'client-gallery', eventId: 'demo-sample-event', slugOrId };
    }
    return {
      view: 'client-gallery',
      eventId: slugOrId,
      slugOrId,
    };
  }

  if (cleanHash === 'admin' || cleanPath === 'admin') {
    return { view: 'admin-panel', eventId: null, slugOrId: null };
  }

  if (cleanHash === 'dashboard' || cleanPath === 'dashboard') {
    return { view: 'dashboard', eventId: null, slugOrId: null };
  }

  if (cleanHash.startsWith('upload/')) {
    return { view: 'photo-upload', eventId: cleanHash.replace('upload/', ''), slugOrId: null };
  }

  if (cleanHash.startsWith('results/')) {
    return { view: 'selection-results', eventId: cleanHash.replace('results/', ''), slugOrId: null };
  }

  return { view: 'landing', eventId: null, slugOrId: null };
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialRoute = useMemo(() => getInitialRoute(), []);

  // Auth & Profile
  const [currentUser, setCurrentUser] = useState<User | null>(() => storage.getCachedProfile());
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // App Collections
  const [users, setUsers] = useState<User[]>([]);
  const [events, setEvents] = useState<WeddingEvent[]>([]);
  const [demoEvent, setDemoEvent] = useState<WeddingEvent>(SAMPLE_DEMO_EVENT);
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [adminSettings, setAdminSettings] = useState<AdminSettings>(INITIAL_ADMIN_SETTINGS);
  const [currentView, setCurrentView] = useState<AppView>(initialRoute.view);
  const [activeEventId, setActiveEventId] = useState<string | null>(initialRoute.eventId);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Device ID for cross-device conflict-free selection sync
  const deviceIdRef = useRef<string>(
    typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem('a1_client_device_id') ||
        (() => {
          const id = 'dev-' + Math.random().toString(36).substring(2, 9);
          try {
            sessionStorage.setItem('a1_client_device_id', id);
          } catch {}
          return id;
        })()
      : 'dev-guest'
  );

  const selectionRevRef = useRef<Map<string, number>>(new Map());
  const hasShownSyncWarningRef = useRef(false);
  const pendingSelectionWrites = useRef<
    Map<
      string,
      {
        timer: NodeJS.Timeout | null;
        payload: LiveSelectionDoc;
        retries?: number;
      }
    >
  >(new Map());

  const eventsRef = useRef(events);
  eventsRef.current = events;
  const isNavigatingProgrammaticallyRef = useRef(false);
  const tombstonesCacheRef = useRef<Map<string, Set<string>>>(new Map());
  const tombstoneFoldersRef = useRef<Map<string, Set<string>>>(new Map());
  const eventPhotosCacheRef = useRef<Map<string, Map<string, Photo>>>(new Map());

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const navigateTo = useCallback((view: AppView, eventId: string | null = null) => {
    isNavigatingProgrammaticallyRef.current = true;
    setCurrentView(view);
    if (eventId !== undefined) {
      setActiveEventId(eventId);
    }
    // Update url hash for clean navigation & sharing
    if (view === 'client-gallery' && eventId) {
      if (eventId === 'demo-sample-event' || eventId === 'demo') {
        window.location.hash = 'gallery/sample-client-gallery';
      } else {
        const evt = eventsRef.current.find((e) => e.id === eventId);
        window.location.hash = `gallery/${evt?.slug || eventId}`;
      }
    } else if (view === 'admin-panel') {
      window.location.hash = 'admin';
    } else if (view === 'dashboard') {
      window.location.hash = 'dashboard';
    } else if (view === 'photo-upload') {
      window.location.hash = eventId ? `upload/${eventId}` : 'upload';
    } else if (view === 'selection-results') {
      window.location.hash = eventId ? `results/${eventId}` : 'results';
    } else if (view === 'landing') {
      window.location.hash = '';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      isNavigatingProgrammaticallyRef.current = false;
    }, 300);
  }, []);

  // Flush pending live selections on unload / submit
  const flushLiveSelection = useCallback(async (eventId: string) => {
    const pending = pendingSelectionWrites.current.get(eventId);
    if (pending) {
      if (pending.timer) clearTimeout(pending.timer);
      pendingSelectionWrites.current.delete(eventId);
      await firebaseService.updateLiveSelection(eventId, pending.payload);
    }
  }, []);

  useEffect(() => {
    const handleFlushAll = () => {
      pendingSelectionWrites.current.forEach((val, eid) => {
        if (val.timer) clearTimeout(val.timer);
        firebaseService.updateLiveSelection(eid, val.payload).catch(() => {});
      });
      pendingSelectionWrites.current.clear();
    };

    const handleOnline = () => {
      pendingSelectionWrites.current.forEach((val, eid) => {
        if (!val.timer) {
          firebaseService
            .updateLiveSelection(eid, val.payload)
            .then(() => {
              pendingSelectionWrites.current.delete(eid);
              hasShownSyncWarningRef.current = false;
            })
            .catch(() => {});
        }
      });
    };

    window.addEventListener('beforeunload', handleFlushAll);
    window.addEventListener('pagehide', handleFlushAll);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('beforeunload', handleFlushAll);
      window.removeEventListener('pagehide', handleFlushAll);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // 1. Firebase Auth State Listener & Profile Synchronization
  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (firebaseUser) {
        const uid = firebaseUser.uid;

        // Check Admin privilege via admins/{uid} document
        const adminStatus = await firebaseService.checkIsAdmin(uid);
        setIsAdmin(adminStatus);

        // Live Profile Snapshot
        unsubProfile = firebaseService.subscribeUserProfile(uid, (profile) => {
          if (profile) {
            if (profile.isBlocked) {
              signOut(auth);
              setCurrentUser(null);
              setIsAdmin(false);
              storage.clearCachedProfile();
              showToast(
                profile.blockedReason ||
                  'Aapka photographer account admin dwara temporarily block kar diya gaya hai. Kripya admin se contact karein.',
                'error'
              );
              navigateTo('landing');
              return;
            }
            setCurrentUser(profile);
            storage.saveCachedProfile(profile);
          } else {
            // Profile document does not exist yet (e.g. Master Admin)
            const fallbackProfile: User = {
              id: uid,
              name: firebaseUser.displayName || 'Studio Owner',
              email: firebaseUser.email || '',
              phone: '',
              studioName: 'Studio HQ',
              role: adminStatus ? 'admin' : 'photographer',
              points: 0,
              standardPoints: 0,
              premiumPoints: 0,
              createdAt: new Date().toISOString(),
            };
            setCurrentUser(fallbackProfile);
            storage.saveCachedProfile(fallbackProfile);
          }
        });
      } else {
        setCurrentUser(null);
        setIsAdmin(false);
        storage.clearCachedProfile();
      }
    });

    return () => {
      if (unsubProfile) unsubProfile();
      unsubscribeAuth();
    };
  }, [navigateTo, showToast]);

  // 2. Data Subscriptions for Authenticated User (Photographer or Admin)
  useEffect(() => {
    if (!currentUser?.id) {
      setTransactions([]);
      return;
    }

    const unsubEvents = firebaseService.subscribeEvents(
      currentUser.id,
      isAdmin,
      (cloudEvents) => {
        setEvents((prev) => {
          const cloudIds = new Set(cloudEvents.map((ce) => ce.id));
          const localOnly = prev.filter((e) => !cloudIds.has(e.id));
          const merged = cloudEvents.map((ce) => {
            const existing = prev.find((e) => e.id === ce.id);
            return {
              ...ce,
              photos: existing?.photos?.length ? existing.photos : ce.photos || [],
              photosCount: existing?.photos?.length || ce.photosCount || 0,
            };
          });
          return [...localOnly, ...merged];
        });
      }
    );

    let unsubUsers = () => {};
    if (isAdmin) {
      unsubUsers = firebaseService.subscribeUsers(true, (cloudUsers) => {
        setUsers(cloudUsers || []);
      });
    }

    const unsubTxs = firebaseService.subscribeTransactions(
      currentUser.id,
      isAdmin,
      (cloudTxs) => {
        setTransactions(cloudTxs || []);
      }
    );

    const unsubSettings = firebaseService.subscribeSettings((cloudSettings) => {
      if (cloudSettings) setAdminSettings(cloudSettings);
    });

    return () => {
      unsubEvents();
      unsubUsers();
      unsubTxs();
      unsubSettings();
    };
  }, [currentUser?.id, isAdmin]);

  // 3. Single Event & Live Selection Listeners (Single-event listener for anonymous client gallery)
  useEffect(() => {
    if (!activeEventId || activeEventId === 'demo-sample-event' || activeEventId === 'demo') {
      return;
    }

    // Single Event live doc listener
    const unsubEvent = firebaseService.subscribeEvent(activeEventId, (cloudEvt) => {
      if (cloudEvt) {
        setEvents((prev) => {
          const idx = prev.findIndex((e) => e.id === cloudEvt.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              ...cloudEvt,
              photos: updated[idx].photos?.length ? updated[idx].photos : cloudEvt.photos || [],
              photosCount: updated[idx].photos?.length || cloudEvt.photosCount || 0,
            };
            return updated;
          }
          return [...prev, cloudEvt];
        });
      }
    });

    // Real-time photo docChanges listener
    const unsubPhotos = firebaseService.subscribeEventPhotos(activeEventId, (cloudPhotos) => {
      if (!cloudPhotos || cloudPhotos.length === 0) return;
      const memTombstones = tombstonesCacheRef.current.get(activeEventId) || new Set<string>();
      const folderTombstones = tombstoneFoldersRef.current.get(activeEventId) || new Set<string>();

      setEvents((prev) =>
        prev.map((e) => {
          if (e.id !== activeEventId) return e;
          const cleanPhotos = cloudPhotos.filter((p) => {
            if (!p?.id || memTombstones.has(p.id)) return false;
            const pFolder = (p.folderName || '').toLowerCase().trim();
            if (pFolder && folderTombstones.has(pFolder)) return false;
            return true;
          });

          const selSet = new Set(e.selectedPhotoIds || []);
          const merged = cleanPhotos.map((p) => ({
            ...p,
            isSelected: selSet.has(p.id),
          }));

          return {
            ...e,
            photos: merged,
            photosCount: merged.length,
            selectedCount: merged.filter((p) => p.isSelected).length,
          };
        })
      );
    });

    // Live Selection Mirror: events/{activeEventId}/live_state/selection
    const unsubLiveSelection = firebaseService.subscribeLiveSelection(
      activeEventId,
      (payload) => {
        if (!payload || !Array.isArray(payload.selectedPhotoIds)) return;
        // Echo suppression: Ignore if written by same device and rev is not newer
        if (payload.deviceId === deviceIdRef.current) {
          const curRev = selectionRevRef.current.get(activeEventId) || 0;
          if (payload.rev && payload.rev <= curRev) return;
        }
        if (payload.rev) {
          selectionRevRef.current.set(activeEventId, payload.rev);
        }

        restoreClientSelections(
          activeEventId,
          payload.selectedPhotoIds,
          payload.clientNotes,
          payload.deviceId,
          payload.rev
        );
      }
    );

    return () => {
      unsubEvent();
      unsubPhotos();
      unsubLiveSelection();
    };
  }, [activeEventId]);

  // Routing synchronization on hash/popstate
  useEffect(() => {
    const handleRouteFromHash = () => {
      if (isNavigatingProgrammaticallyRef.current) return;

      const rawHash = window.location.hash || '';
      const cleanHash = rawHash.replace(/^[#/]+/, '').trim();
      const rawPath = window.location.pathname || '';
      const cleanPath = rawPath.replace(/^\/+/, '').trim();

      let slugOrId: string | null = null;
      if (cleanHash.startsWith('gallery/')) {
        slugOrId = cleanHash.replace(/^gallery\//, '').trim();
      } else if (cleanHash.startsWith('g/')) {
        slugOrId = cleanHash.replace(/^g\//, '').trim();
      } else if (cleanPath.startsWith('gallery/')) {
        slugOrId = cleanPath.replace(/^gallery\//, '').trim();
      } else if (cleanPath.startsWith('g/')) {
        slugOrId = cleanPath.replace(/^g\//, '').trim();
      } else {
        try {
          const params = new URLSearchParams(window.location.search);
          const qg =
            params.get('gallery') ||
            params.get('g') ||
            params.get('event') ||
            params.get('eventId') ||
            params.get('slug') ||
            params.get('id');
          if (qg) slugOrId = qg.trim();
        } catch {}
      }

      if (slugOrId) {
        if (
          slugOrId === 'sample-client-gallery' ||
          slugOrId === 'sample-wedding' ||
          slugOrId === 'demo' ||
          slugOrId === 'demo-sample-event'
        ) {
          setActiveEventId('demo-sample-event');
          setCurrentView('client-gallery');
          return;
        }

        const evt = eventsRef.current.find((e) => e.slug === slugOrId || e.id === slugOrId);
        if (evt) {
          setActiveEventId(evt.id);
          setCurrentView('client-gallery');
        } else {
          setActiveEventId(slugOrId);
          setCurrentView('client-gallery');
          // Public link resolution via document get
          firebaseService.getEventBySlugOrId(slugOrId).then((cloudEvt) => {
            if (cloudEvt) {
              setEvents((prev) => {
                if (prev.some((e) => e.id === cloudEvt.id)) return prev;
                return [...prev, cloudEvt];
              });
              setActiveEventId(cloudEvt.id);
              setCurrentView('client-gallery');
            }
          });
        }
        return;
      }

      if (cleanHash === 'admin' || cleanPath === 'admin') {
        setCurrentView('admin-panel');
      } else if (cleanHash === 'dashboard' || cleanPath === 'dashboard') {
        setCurrentView('dashboard');
      } else if (cleanHash.startsWith('upload/')) {
        const eid = cleanHash.replace('upload/', '');
        if (eid) setActiveEventId(eid);
        setCurrentView('photo-upload');
      } else if (cleanHash.startsWith('results/')) {
        const eid = cleanHash.replace('results/', '');
        if (eid) setActiveEventId(eid);
        setCurrentView('selection-results');
      }
    };

    handleRouteFromHash();
    window.addEventListener('hashchange', handleRouteFromHash);
    window.addEventListener('popstate', handleRouteFromHash);
    return () => {
      window.removeEventListener('hashchange', handleRouteFromHash);
      window.removeEventListener('popstate', handleRouteFromHash);
    };
  }, []);

  // --- Real Firebase Authentication Handlers ---

  const login = async (
    email: string,
    roleOrPassword?: string,
    maybePassword?: string
  ): Promise<boolean> => {
    const cleanEmail = email.trim().toLowerCase();
    const password = maybePassword !== undefined ? maybePassword : (roleOrPassword || '');

    if (!cleanEmail || !password) {
      showToast('Email aur Password enter karein!', 'error');
      return false;
    }

    try {
      const userCred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const uid = userCred.user.uid;

      // Verify if account is blocked
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists() && userDoc.data().isBlocked) {
        await signOut(auth);
        showToast(
          userDoc.data().blockedReason ||
            'Aapka photographer account admin dwara temporarily block kar diya gaya hai. Kripya admin se contact karein.',
          'error'
        );
        return false;
      }

      const adminStatus = await firebaseService.checkIsAdmin(uid);
      setIsAdmin(adminStatus);

      showToast(`Welcome back, ${userCred.user.displayName || cleanEmail}!`, 'success');
      if (adminStatus || roleOrPassword === 'admin') {
        navigateTo('admin-panel');
      } else {
        navigateTo('dashboard');
      }
      return true;
    } catch (err: any) {
      console.error('Login error:', err);
      showToast(mapAuthErrorToHinglish(err.code || ''), 'error');
      return false;
    }
  };

  const signup = async (data: {
    name: string;
    email: string;
    phone: string;
    studioName: string;
    password?: string;
  }): Promise<boolean> => {
    const cleanEmail = data.email.trim().toLowerCase();
    const password = data.password?.trim() || '';

    if (!data.name.trim() || !cleanEmail || !data.phone.trim() || !data.studioName.trim() || !password) {
      showToast('Sabhi fields bharna anivarya (mandatory) hai!', 'error');
      return false;
    }

    try {
      const userCred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const uid = userCred.user.uid;

      await firebaseService.createUserProfile(uid, {
        name: data.name.trim(),
        email: cleanEmail,
        phone: data.phone.trim(),
        studioName: data.studioName.trim(),
      });

      showToast('Studio successfully registered! Aapka starting balance is 0 points.', 'success');
      navigateTo('dashboard');
      return true;
    } catch (err: any) {
      console.error('Signup error:', err);
      showToast(mapAuthErrorToHinglish(err.code || ''), 'error');
      return false;
    }
  };

  const forgotPassword = async (email: string): Promise<boolean> => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      showToast('Kripya apna registered email enter karein.', 'error');
      return false;
    }
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      showToast(`Password reset link aapke email (${cleanEmail}) par bhej diya gaya hai!`, 'success');
      return true;
    } catch (err: any) {
      console.error('Password reset error:', err);
      showToast(mapAuthErrorToHinglish(err.code || ''), 'error');
      return false;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('SignOut error:', e);
    }
    setCurrentUser(null);
    setIsAdmin(false);
    storage.clearCachedProfile();
    showToast('Logged out successfully.', 'info');
    navigateTo('landing');
  };

  const switchUser = (_userId: string) => {
    // Restricted in Part 2 per architectural security rules
    showToast('Account switching is disabled in live session.', 'info');
  };

  const updateStudioSettings = async (settings: Partial<User>) => {
    if (!currentUser) return;
    const updatedUser: User = { ...currentUser, ...settings };
    setCurrentUser(updatedUser);
    storage.saveCachedProfile(updatedUser);
    await firebaseService.saveUser(updatedUser);

    // Denormalize studio branding onto events
    const updatedStudio = {
      name: updatedUser.studioName || updatedUser.name,
      logoUrl: updatedUser.studioLogoUrl,
      whatsapp: updatedUser.studioBookingPhone || updatedUser.phone,
      phone: updatedUser.phone,
      watermarkText: updatedUser.watermarkText,
      tagline: updatedUser.studioTagline,
      instagram: updatedUser.studioInstagram,
      address: updatedUser.studioAddress,
    };

    setEvents((prev) =>
      prev.map((e) => {
        if (e.photographerId === updatedUser.id) {
          const withStudio = { ...e, studio: updatedStudio, studioName: updatedStudio.name };
          firebaseService.saveEvent(withStudio).catch(() => {});
          return withStudio;
        }
        return e;
      })
    );

    showToast('Studio settings saved!', 'success');
  };

  // --- Points & Admin Features ---

  const buyPoints = async (
    packageId: string,
    _paymentMethod = 'Razorpay',
    paymentDetails?: { paymentId?: string; orderId?: string }
  ): Promise<boolean> => {
    if (!currentUser) {
      showToast('Please login to buy points', 'error');
      return false;
    }

    const pkg = adminSettings.pricingPackages.find((p) => p.id === packageId);
    const isPremium = pkg?.tier === 'premium';
    const pointsCount = pkg?.points || 1;
    const refText = paymentDetails?.paymentId ? ` • Ref: ${paymentDetails.paymentId}` : '';

    showToast(
      `Payment verified! ${pointsCount} ${isPremium ? 'Premium Points' : 'Standard Points'} studio balance me jud gaye hain!${refText}`,
      'success'
    );
    return true;
  };

  const adminAddPoints = async (userId: string, points: number, reason: string, tier: PointTier = 'standard') => {
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        showToast('Admin authentication required', 'error');
        return;
      }

      const res = await fetch('/api/admin-adjust-points', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          targetUserId: userId,
          points,
          reason,
          tier,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        showToast(json.error || 'Failed to adjust points on server', 'error');
        return;
      }

      showToast(`Points adjusted successfully! Balance: ${json.balanceAfter}`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Error adjusting points', 'error');
    }
  };

  const adminResetPassword = async (userId: string, _customPass?: string): Promise<string> => {
    const user = users.find((u) => u.id === userId);
    if (user?.email) {
      await forgotPassword(user.email);
    }
    return 'Reset link sent to registered email';
  };

  const adminUpdateSettings = (newSettings: AdminSettings) => {
    setAdminSettings(newSettings);
    firebaseService.saveSettings(newSettings);
    showToast('Admin settings & pricing updated!', 'success');
  };

  const adminUpdateOwnCredentials = async (_newEmail: string, _newPass: string): Promise<boolean> => {
    showToast('Admin credentials update must be requested via Firebase Console.', 'info');
    return true;
  };

  const adminToggleBlockPhotographer = async (userId: string, reason?: string) => {
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return;
    if (targetUser.role === 'admin') {
      showToast('Admin account block nahi kiya ja sakta!', 'error');
      return;
    }

    const nextBlocked = !targetUser.isBlocked;
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        showToast('Admin authentication required', 'error');
        return;
      }

      const res = await fetch('/api/admin-set-blocked', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          targetUserId: userId,
          isBlocked: nextBlocked,
          reason,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        showToast(json.error || 'Failed to update block status on server', 'error');
        return;
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isBlocked: nextBlocked, blockedReason: reason } : u))
      );

      showToast(
        nextBlocked
          ? `${targetUser.studioName} (${targetUser.name}) ko temporarily BLOCK kar diya gaya hai.`
          : `${targetUser.studioName} (${targetUser.name}) ko UNBLOCK kar diya gaya hai.`,
        nextBlocked ? 'info' : 'success'
      );
    } catch (err: any) {
      showToast(err?.message || 'Error updating block state', 'error');
    }
  };

  const adminDeletePhotographer = async (userId: string) => {
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return;
    if (targetUser.role === 'admin') {
      showToast('Admin account delete nahi kiya ja sakta!', 'error');
      return;
    }

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        showToast('Admin authentication required', 'error');
        return;
      }

      const res = await fetch('/api/admin-delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ targetUserId: userId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        showToast(json.error || 'Failed to delete user on server', 'error');
        return;
      }

      setUsers((prev) => prev.filter((u) => u.id !== userId));
      showToast(`User ${targetUser.name} deleted successfully.`, 'info');
    } catch (err: any) {
      showToast(err?.message || 'Error deleting user', 'error');
    }

    const photographerEvents = events.filter((e) => e.photographerId === userId);
    for (const evt of photographerEvents) {
      await firebaseService.deleteEvent(evt.id);
      await idbStorage.deleteEventPhotos(evt.id);
    }
    setEvents((prev) => prev.filter((e) => e.photographerId !== userId));

    showToast(`${targetUser.studioName} (${targetUser.name}) ka account permanently delete kar diya gaya.`, 'success');
  };

  const adminResetAllStoredData = async () => {
    try {
      await firebaseService.resetAllData();
      await idbStorage.clearAll();
      storage.resetAllData();
      setEvents([]);
      setTransactions([]);
      showToast('Clean state ready hai.', 'success');
    } catch (err) {
      console.error('Reset error:', err);
      showToast('Reset error. Kripya dobara try karein.', 'error');
    }
  };

  // --- Events Management ---

  const createEvent = async (data: {
    title: string;
    coupleName: string;
    clientPhone?: string;
    clientEmail?: string;
    eventDate: string;
    deadlineDays: number;
    maxSelectionLimit?: number;
    photosPerSheet?: number;
    coupleStory?: string;
    pointTier?: PointTier;
  }): Promise<{ success: boolean; error?: string; eventId?: string }> => {
    if (!currentUser) {
      showToast('Please login first', 'error');
      return { success: false, error: 'Please login first' };
    }

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        showToast('Authentication required to create event', 'error');
        return { success: false, error: 'Authentication required' };
      }

      const res = await fetch('/api/create-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(data),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        const errMsg = json.error || 'Failed to create event on server';
        showToast(errMsg, 'error');
        return { success: false, error: errMsg };
      }

      const newEventId = json.eventId;
      if (json.event) {
        setEvents((prev) => [json.event, ...prev.filter((e) => e.id !== newEventId)]);
      }
      setActiveEventId(newEventId);

      const isPremium = (data.pointTier || 'standard') === 'premium';
      showToast(
        `Event created! 1 ${isPremium ? 'Premium Point (5,000 photos access)' : 'Standard Point (2,500 photos access)'} deduct hua.`,
        'success'
      );
      return { success: true, eventId: newEventId };
    } catch (err: any) {
      console.error('Create event error:', err);
      const msg = err.message || 'Network error creating event';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }
  };

  const extendDeadline = async (eventId: string, days = 6): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) {
      showToast('Not logged in', 'error');
      return { success: false, error: 'Not logged in' };
    }

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        showToast('Authentication required', 'error');
        return { success: false, error: 'Authentication required' };
      }

      const res = await fetch('/api/extend-deadline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ eventId, days }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        const err = json.error || 'Failed to extend deadline on server';
        showToast(err, 'error');
        return { success: false, error: err };
      }

      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId
            ? {
                ...e,
                deadlineDate: json.newDeadlineDate,
                deadlineAt: json.newDeadlineAt,
                status: 'active',
              }
            : e
        )
      );

      showToast(`Deadline extended by ${days} days! (1 point deducted)`, 'success');
      return { success: true };
    } catch (err: any) {
      const msg = err.message || 'Network error extending deadline';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }
  };

  const updateEvent = (eventId: string, data: Partial<WeddingEvent>) => {
    // Ensure immutable fields are never updated from client
    const safeData = { ...data };
    delete safeData.deadlineDate;
    delete safeData.deadlineAt;
    delete safeData.pointTier;
    delete safeData.maxPhotoCapacity;
    delete safeData.photographerId;
    delete safeData.createdAt;

    setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, ...safeData } : e)));
    firebaseService.updateEvent(eventId, safeData);
    showToast('Event updated!', 'success');
  };

  const deleteEvent = async (eventId: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    if (activeEventId === eventId) {
      setActiveEventId(null);
    }
    showToast('Event permanently deleted', 'info');

    eventPhotosCacheRef.current.delete(eventId);
    tombstonesCacheRef.current.delete(eventId);
    tombstoneFoldersRef.current.delete(eventId);

    await firebaseService.deleteEvent(eventId);
    await idbStorage.deleteEventPhotos(eventId);
    await idbStorage.clearSelectionProgress(eventId);
  };

  // --- Folder & Photo Management ---

  const addFolder = (eventId: string, folderName: string) => {
    const cleanName = folderName.trim();
    if (!cleanName || /^all(\s+folders|\s+photos)?$/i.test(cleanName)) return;

    let updatedEventToSave: WeddingEvent | null = null;
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        const currentFolders = e.folders || [];
        const newFolder: PhotoFolder = {
          id: `fld-${Date.now()}`,
          name: cleanName,
          visible: true,
          order: currentFolders.length,
        };
        const updated = { ...e, folders: [...currentFolders, newFolder] };
        updatedEventToSave = updated;
        return updated;
      })
    );

    if (updatedEventToSave) {
      firebaseService.saveEvent(updatedEventToSave);
    }
    showToast(`Folder "${cleanName}" added!`, 'success');
  };

  const deleteFolder = async (eventId: string, folderId: string, folderName?: string): Promise<boolean> => {
    const currentEvent = eventsRef.current.find((e) => e.id === eventId);
    if (!currentEvent) return false;

    const currentFolders = currentEvent.folders || [];
    const cleanSearchName = (folderName || '').toLowerCase().trim();
    const targetFolder = currentFolders.find(
      (f) =>
        f.id === folderId ||
        (cleanSearchName && f.name.toLowerCase().trim() === cleanSearchName)
    );
    const targetFolderName = (targetFolder?.name || folderName || '').toLowerCase().trim();

    const statePhotos = currentEvent.photos || [];
    const isMatch = (p: Photo) => {
      const pFolderId = p.folderId || '';
      const pFolderName = (p.folderName || '').toLowerCase().trim();
      return (
        (folderId && pFolderId === folderId) ||
        (targetFolder && pFolderId === targetFolder.id) ||
        (targetFolderName && pFolderName === targetFolderName) ||
        (cleanSearchName && pFolderName === cleanSearchName)
      );
    };

    const deletedPhotos = statePhotos.filter(isMatch);
    const photoIdsArray = deletedPhotos.map((p) => p.id);

    // Record in tombstones
    let memTombstones = tombstonesCacheRef.current.get(eventId);
    if (!memTombstones) {
      memTombstones = new Set<string>();
      tombstonesCacheRef.current.set(eventId, memTombstones);
    }
    photoIdsArray.forEach((id) => memTombstones!.add(id));

    let memFolders = tombstoneFoldersRef.current.get(eventId);
    if (!memFolders) {
      memFolders = new Set<string>();
      tombstoneFoldersRef.current.set(eventId, memFolders);
    }
    if (targetFolderName) memFolders.add(targetFolderName);

    await idbStorage.addPhotoTombstones(eventId, photoIdsArray, targetFolderName);

    try {
      await firebaseService.deletePhotos(eventId, photoIdsArray, targetFolderName);
    } catch (cloudErr) {
      console.warn('Cloud deletion warning:', cloudErr);
    }

    if (photoIdsArray.length > 0) {
      await idbStorage.deletePhotosByIds(photoIdsArray);
    }
    if (targetFolderName || folderId) {
      await idbStorage.deleteFolderPhotos(eventId, folderId, targetFolderName);
    }

    const remainingPhotos = statePhotos.filter((p) => !photoIdsArray.includes(p.id));
    const remainingFolders = currentFolders.filter(
      (f) =>
        f.id !== folderId &&
        (!targetFolder || f.id !== targetFolder.id) &&
        (!targetFolderName || f.name.toLowerCase().trim() !== targetFolderName)
    );

    const prevDeletedIds = currentEvent.deletedPhotoIds || [];
    const prevDeletedFolders = currentEvent.deletedFolderNames || [];

    const updated: WeddingEvent = {
      ...currentEvent,
      folders: remainingFolders,
      photos: remainingPhotos,
      photosCount: remainingPhotos.length,
      selectedCount: remainingPhotos.filter((p) => p.isSelected).length,
      coverPhotoUrl: remainingPhotos[0]?.thumbnailUrl || remainingPhotos[0]?.url || undefined,
      deletedPhotoIds: Array.from(new Set([...prevDeletedIds, ...photoIdsArray])),
      deletedFolderNames: Array.from(
        new Set([...prevDeletedFolders, ...(targetFolderName ? [targetFolderName] : [])])
      ),
    };

    await firebaseService.saveEvent(updated);
    setEvents((prev) => prev.map((e) => (e.id === eventId ? updated : e)));

    const displayName = targetFolder?.name || folderName || 'Folder';
    showToast(`Folder "${displayName}" deleted with tombstone protection.`, 'success');
    return true;
  };

  const toggleFolderVisibility = (eventId: string, folderId: string) => {
    let updatedEventToSave: WeddingEvent | null = null;
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        const currentFolders = e.folders || [];
        const updated = {
          ...e,
          folders: currentFolders.map((f) =>
            f.id === folderId ? { ...f, visible: !f.visible } : f
          ),
        };
        updatedEventToSave = updated;
        return updated;
      })
    );
    if (updatedEventToSave) {
      firebaseService.saveEvent(updatedEventToSave);
    }
  };

  const mergePhotosIntoEvent = useCallback((eventId: string, photosToMerge: Photo[]) => {
    if (!eventId || !photosToMerge || photosToMerge.length === 0) return;

    let cacheMap = eventPhotosCacheRef.current.get(eventId);
    if (!cacheMap) {
      cacheMap = new Map<string, Photo>();
      eventPhotosCacheRef.current.set(eventId, cacheMap);
    }

    const tombstonedIds = tombstonesCacheRef.current.get(eventId);
    const tombstonedFolders = tombstoneFoldersRef.current.get(eventId);

    photosToMerge.forEach((p) => {
      if (!p.id) return;
      if (tombstonedIds && tombstonedIds.has(p.id)) return;
      const pFolder = (p.folderName || '').toLowerCase().trim();
      if (pFolder && tombstonedFolders && tombstonedFolders.has(pFolder)) return;

      const existing = cacheMap!.get(p.id);
      cacheMap!.set(p.id, {
        ...p,
        url: p.url || existing?.url || '',
        thumbnailUrl: p.thumbnailUrl || existing?.thumbnailUrl || p.url || '',
      });
    });

    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        const photoMap = new Map<string, Photo>();
        (e.photos || []).forEach((p) => {
          if (tombstonedIds && tombstonedIds.has(p.id)) return;
          const pFolder = (p.folderName || '').toLowerCase().trim();
          if (pFolder && tombstonedFolders && tombstonedFolders.has(pFolder)) return;
          photoMap.set(p.id, p);
        });

        photosToMerge.forEach((p) => {
          if (tombstonedIds && tombstonedIds.has(p.id)) return;
          const pFolder = (p.folderName || '').toLowerCase().trim();
          if (pFolder && tombstonedFolders && tombstonedFolders.has(pFolder)) return;
          const isSelected = (e.selectedPhotoIds || []).includes(p.id);
          photoMap.set(p.id, { ...p, isSelected });
        });

        const updatedList = Array.from(photoMap.values());
        return {
          ...e,
          photos: updatedList,
          photosCount: updatedList.length,
          selectedCount: updatedList.filter((p) => p.isSelected).length,
        };
      })
    );
  }, []);

  const refreshEventPhotos = useCallback(async (eventId: string): Promise<Photo[]> => {
    if (!eventId) return [];
    const memSet = tombstonesCacheRef.current.get(eventId) || new Set<string>();
    const folderSet = tombstoneFoldersRef.current.get(eventId) || new Set<string>();

    const cloudPhotos = await firebaseService.fetchEventPhotos(eventId);
    const cleanCloud = (cloudPhotos || []).filter((p) => {
      if (memSet.has(p.id)) return false;
      const pFolder = (p.folderName || '').toLowerCase().trim();
      if (pFolder && folderSet.has(pFolder)) return false;
      return true;
    });

    if (cleanCloud.length > 0) {
      idbStorage.saveEventPhotos(eventId, cleanCloud).catch(() => {});
      setEvents((prev) =>
        prev.map((e) => {
          if (e.id !== eventId) return e;
          const selSet = new Set(e.selectedPhotoIds || []);
          const withSel = cleanCloud.map((p) => ({
            ...p,
            isSelected: selSet.has(p.id),
          }));
          return {
            ...e,
            photos: withSel,
            photosCount: withSel.length,
            selectedCount: withSel.filter((p) => p.isSelected).length,
          };
        })
      );
    }
    return cleanCloud;
  }, []);

  const addPhotosToEvent = async (
    eventId: string,
    newPhotosData: Omit<Photo, 'id' | 'isSelected' | 'uploadedAt'>[],
    options?: { skipCloudSync?: boolean }
  ): Promise<Photo[]> => {
    if (!newPhotosData || newPhotosData.length === 0) return [];

    const currentEvent = eventsRef.current.find((e) => e.id === eventId);
    if (!currentEvent) return [];

    const existingFolders = [...(currentEvent.folders || [])].filter(
      (f) => !/^all(\s+folders|\s+photos)?$/i.test(f.name.trim())
    );
    const folderNameToIdMap = new Map<string, string>();
    existingFolders.forEach((f) => folderNameToIdMap.set(f.name.toLowerCase().trim(), f.id));

    const newFoldersToCreate: PhotoFolder[] = [];
    newPhotosData.forEach((p) => {
      const cleanFld = (p.folderName || '').trim();
      if (!cleanFld || /^all(\s+folders|\s+photos)?$/i.test(cleanFld)) return;
      const lower = cleanFld.toLowerCase();
      if (!folderNameToIdMap.has(lower)) {
        const newFldId = `fld-${lower.replace(/[^a-z0-9]/g, '-')}-${Math.floor(100 + Math.random() * 900)}`;
        folderNameToIdMap.set(lower, newFldId);
        newFoldersToCreate.push({
          id: newFldId,
          name: cleanFld,
          visible: true,
          order: existingFolders.length + newFoldersToCreate.length,
        });
      }
    });

    const finalFolders = [...existingFolders, ...newFoldersToCreate];

    const newPhotos: Photo[] = newPhotosData.map((data, index) => {
      const uniqueSuffix = `${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`;
      const cleanFldName = (data.folderName || '').trim();
      const resolvedFolderId = cleanFldName ? folderNameToIdMap.get(cleanFldName.toLowerCase()) : undefined;

      return {
        id: `photo-${uniqueSuffix}`,
        url: data.url,
        thumbnailUrl: data.thumbnailUrl || data.url,
        filename: data.filename || 'photo.jpg',
        originalName: data.originalName || data.filename || 'photo.jpg',
        folderId: resolvedFolderId || '',
        folderName: cleanFldName || 'Photos',
        sizeBytes: data.sizeBytes,
        width: data.width,
        height: data.height,
        r2Key: data.r2Key,
        r2ThumbKey: data.r2ThumbKey,
        isSelected: false,
        uploadedAt: new Date().toISOString(),
      };
    });

    // Save to IndexedDB
    await idbStorage.saveEventPhotos(eventId, newPhotos);

    // Merge into local state
    mergePhotosIntoEvent(eventId, newPhotos);

    // Update parent doc folders and accurate photo count
    const totalPhotos = (currentEvent.photos?.length || 0) + newPhotos.length;
    const coverUrl = currentEvent.coverPhotoUrl || newPhotos[0]?.thumbnailUrl || newPhotos[0]?.url;

    const updatedEvent: WeddingEvent = {
      ...currentEvent,
      folders: finalFolders,
      photosCount: totalPhotos,
      coverPhotoUrl: coverUrl,
    };

    setEvents((prev) => prev.map((e) => (e.id === eventId ? updatedEvent : e)));
    firebaseService.saveEvent(updatedEvent);

    // Push photos to Firestore if not explicitly skipped
    if (!options?.skipCloudSync) {
      const validPhotos = newPhotos.filter((p) => isRemoteUrl(p.url));
      if (validPhotos.length > 0) {
        firebaseService.savePhotos(eventId, validPhotos).catch((err) => {
          console.error('Failed to sync new photos to Firestore:', err);
        });
      }
    }

    return newPhotos;
  };

  const deletePhotoFromEvent = async (eventId: string, photoId: string): Promise<boolean> => {
    let memTombstones = tombstonesCacheRef.current.get(eventId);
    if (!memTombstones) {
      memTombstones = new Set<string>();
      tombstonesCacheRef.current.set(eventId, memTombstones);
    }
    memTombstones.add(photoId);

    await idbStorage.addPhotoTombstones(eventId, [photoId]);
    await idbStorage.deletePhoto(eventId, photoId);

    try {
      await firebaseService.deletePhoto(eventId, photoId);
    } catch (e) {
      console.warn('Cloud deletePhoto warning:', e);
    }

    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        const currentPhotos = e.photos || [];
        const updatedPhotos = currentPhotos.filter((p) => p.id !== photoId);
        const prevDeleted = e.deletedPhotoIds || [];
        return {
          ...e,
          photos: updatedPhotos,
          photosCount: updatedPhotos.length,
          selectedCount: updatedPhotos.filter((p) => p.isSelected).length,
          deletedPhotoIds: Array.from(new Set([...prevDeleted, photoId])),
        };
      })
    );

    showToast('Photo permanently deleted', 'success');
    return true;
  };

  // --- Client Selection & Single Debounced Live State Stream ---

  const togglePhotoSelection = (eventId: string, photoId: string) => {
    if (eventId === 'demo-sample-event' || eventId === 'demo') {
      setDemoEvent((prev) => {
        const currentPhotos = prev.photos || [];
        const updatedPhotos = currentPhotos.map((p) =>
          p.id === photoId ? { ...p, isSelected: !p.isSelected } : p
        );
        const selCount = updatedPhotos.filter((p) => p.isSelected).length;
        return {
          ...prev,
          photos: updatedPhotos,
          selectedCount: selCount,
          selectedPhotoIds: updatedPhotos.filter((p) => p.isSelected).map((p) => p.id),
        };
      });
      return;
    }

    const currentEvent = eventsRef.current.find((e) => e.id === eventId);
    if (!currentEvent) return;

    // Enforce lock and completion status in logic
    if (currentEvent.status === 'completed' || currentEvent.status === 'locked') {
      showToast('Selection final submit ho chuki hai / locked hai! Aur changes nahi kiye ja sakte.', 'error');
      return;
    }

    // Enforce deadline in logic using normalized millisecond check
    if (currentEvent.deadlineAt || currentEvent.deadlineDate) {
      const dTime = getDeadlineMs(currentEvent);
      if (Date.now() > dTime) {
        showToast('Event selection deadline expire ho chuki hai!', 'error');
        return;
      }
    }

    // Compute next selection state purely
    const currentSelected = new Set(
      currentEvent.selectedPhotoIds ||
        (currentEvent.photos || []).filter((p) => p.isSelected).map((p) => p.id)
    );

    const willSelect = !currentSelected.has(photoId);

    if (willSelect && currentEvent.maxSelectionLimit && currentSelected.size >= currentEvent.maxSelectionLimit) {
      showToast(`Maximum selection limit reached (${currentEvent.maxSelectionLimit} photos)!`, 'error');
      return;
    }

    if (willSelect) {
      currentSelected.add(photoId);
    } else {
      currentSelected.delete(photoId);
    }

    const nextSelectedIds = Array.from(currentSelected);
    const nextSelectedCount = nextSelectedIds.length;
    const nowIso = new Date().toISOString();

    // 1. Update React State immediately (Pure updater)
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        const updatedPhotos = (e.photos || []).map((p) => ({
          ...p,
          isSelected: currentSelected.has(p.id),
          selectedAt: currentSelected.has(p.id) ? (p.selectedAt || nowIso) : undefined,
        }));
        return {
          ...e,
          photos: updatedPhotos,
          selectedPhotoIds: nextSelectedIds,
          selectedCount: nextSelectedCount,
          lastSelectedAt: nowIso,
        };
      })
    );

    // 2. Optimistic local IndexedDB write (0ms latency failsafe against tab close)
    idbStorage.saveSelectionProgress(eventId, nextSelectedIds, currentEvent.clientNotes || '');

    // 3. Single Debounced (~600ms) Write to events/{eventId}/live_state/selection with backoff retry
    const rev = (selectionRevRef.current.get(eventId) || 0) + 1;
    selectionRevRef.current.set(eventId, rev);

    const livePayload: LiveSelectionDoc = {
      selectedPhotoIds: nextSelectedIds,
      selectedCount: nextSelectedCount,
      clientNotes: currentEvent.clientNotes,
      status: currentEvent.status,
      updatedAt: nowIso,
      deviceId: deviceIdRef.current,
      rev,
    };

    const pending = pendingSelectionWrites.current.get(eventId);
    if (pending?.timer) clearTimeout(pending.timer);

    const scheduleWrite = (retryCount = 0) => {
      const delay = retryCount === 0 ? 600 : Math.min(10000, Math.pow(2, retryCount) * 1000);
      const timer = setTimeout(async () => {
        try {
          await firebaseService.updateLiveSelection(eventId, livePayload);
          pendingSelectionWrites.current.delete(eventId);
          hasShownSyncWarningRef.current = false;
        } catch (err: any) {
          console.warn('Debounced selection write failed:', err);
          if (!hasShownSyncWarningRef.current) {
            hasShownSyncWarningRef.current = true;
            showToast('Selection abhi sync nahi ho paayi, auto-retry chal raha hai', 'info');
          }
          if (retryCount < 5) {
            scheduleWrite(retryCount + 1);
          } else {
            pendingSelectionWrites.current.set(eventId, { timer: null, payload: livePayload, retries: 5 });
          }
        }
      }, delay);

      pendingSelectionWrites.current.set(eventId, { timer, payload: livePayload, retries: retryCount });
    };

    scheduleWrite(0);
  };

  const submitClientSelection = async (eventId: string, clientNotes = '') => {
    if (eventId === 'demo-sample-event' || eventId === 'demo') {
      setDemoEvent((prev) => ({
        ...prev,
        status: 'completed',
        clientNotes,
      }));
      showToast('🎉 Demo selection completed! Try downloading the .bat file.', 'success');
      return;
    }

    const target = eventsRef.current.find((e) => e.id === eventId);
    if (!target) return;

    if (target.status === 'completed' || target.status === 'locked') {
      showToast('Selection pehle hi submit ho chuki hai!', 'info');
      return;
    }

    const selectedIds =
      target.selectedPhotoIds ||
      (target.photos || []).filter((p) => p.isSelected).map((p) => p.id);

    try {
      // 1. Await final flush of live_state
      await flushLiveSelection(eventId);

      // 2. Final live_state completion write (strict: true throws on quota or connection error)
      const rev = (selectionRevRef.current.get(eventId) || 0) + 1;
      selectionRevRef.current.set(eventId, rev);
      const nowIso = new Date().toISOString();

      await firebaseService.updateLiveSelection(
        eventId,
        {
          selectedPhotoIds: selectedIds,
          selectedCount: selectedIds.length,
          clientNotes,
          status: 'completed',
          updatedAt: nowIso,
          deviceId: deviceIdRef.current,
          rev,
        },
        { strict: true }
      );

      // 3. Update Parent Event Document with ONLY allowed keys (throws on failure)
      await firebaseService.submitClientSelection(eventId, {
        status: 'completed',
        clientNotes,
        submittedAt: nowIso,
        selectedCount: selectedIds.length,
        lastSelectedAt: nowIso,
        clientPhone: target.clientPhone,
      });

      // 4. Update React State ONLY after (1) and (2) write operations succeeded
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId
            ? {
                ...e,
                status: 'completed',
                submittedAt: nowIso,
                clientNotes,
                selectedCount: selectedIds.length,
              }
            : e
        )
      );

      // 5. Clear IndexedDB selection draft
      await idbStorage.clearSelectionProgress(eventId).catch(() => {});

      showToast('Selection successfully submitted! Photographer has been notified.', 'success');
    } catch (err: any) {
      console.error('Submit selection error:', err);
      showToast('Selection submit karne mein error aaya. Kripya dobara try karein.', 'error');
    }
  };

  const restoreClientSelections = (
    eventId: string,
    selectedPhotoIds: string[],
    savedNotes?: string,
    _deviceId?: string,
    _rev?: number
  ) => {
    if (!eventId || !Array.isArray(selectedPhotoIds)) return;
    const idSet = new Set(selectedPhotoIds);

    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        const currentPhotos = e.photos || [];
        const updatedPhotos = currentPhotos.map((p) => {
          const isSel = idSet.has(p.id);
          return {
            ...p,
            isSelected: isSel,
            selectedAt: isSel ? (p.selectedAt || new Date().toISOString()) : undefined,
          };
        });

        return {
          ...e,
          photos: updatedPhotos,
          selectedPhotoIds: selectedPhotoIds,
          selectedCount: selectedPhotoIds.length,
          clientNotes: savedNotes !== undefined ? savedNotes : e.clientNotes,
        };
      })
    );
  };

  // 40-Day Storage Retention Policy (Server-authoritative via auto-delete-expired)
  const storageRetentionDays = RETENTION_DAYS;

  const runStorageAutoClean = (): number => {
    // Client-side auto-clean is disabled; server scheduled function auto-delete-expired handles retention cleanup
    return 0;
  };

  const activeEvent = useMemo(() => {
    if (activeEventId === 'demo-sample-event' || activeEventId === 'demo') {
      return demoEvent;
    }
    if (!activeEventId) return null;
    const foundInState = events.find((e) => e.id === activeEventId || e.slug === activeEventId);
    if (foundInState) return foundInState;

    if (initialRoute.slugOrId && (activeEventId === initialRoute.slugOrId || activeEventId === initialRoute.eventId)) {
      const formattedTitle = initialRoute.slugOrId
        .split(/[-_]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      return {
        id: activeEventId,
        slug: initialRoute.slugOrId,
        title: formattedTitle || 'Wedding Gallery',
        coupleName: formattedTitle || 'Wedding Couple',
        photographerId: 'photographer-guest',
        eventDate: new Date().toISOString().split('T')[0],
        deadlineDate: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
        studioName: 'Wedding Studio',
        photosCount: 0,
        photos: [],
        folders: [],
        status: 'active' as const,
        createdAt: new Date().toISOString(),
      };
    }
    return null;
  }, [activeEventId, events, demoEvent, initialRoute]);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        isAdmin,
        users,
        events,
        transactions,
        adminSettings,
        currentView,
        activeEventId,
        activeEvent,
        toasts,
        navigateTo,
        showToast,
        removeToast,
        login,
        signup,
        forgotPassword,
        logout,
        switchUser,
        updateStudioSettings,
        buyPoints,
        adminAddPoints,
        adminResetPassword,
        adminUpdateSettings,
        adminUpdateOwnCredentials,
        adminToggleBlockPhotographer,
        adminDeletePhotographer,
        adminResetAllStoredData,
        createEvent,
        extendDeadline,
        updateEvent,
        deleteEvent,
        addFolder,
        deleteFolder,
        toggleFolderVisibility,
        addPhotosToEvent,
        deletePhotoFromEvent,
        refreshEventPhotos,
        mergePhotosIntoEvent,
        togglePhotoSelection,
        submitClientSelection,
        restoreClientSelections,
        storageRetentionDays,
        runStorageAutoClean,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
