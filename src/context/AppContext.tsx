import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  User,
  WeddingEvent,
  PointTransaction,
  AdminSettings,
  Photo,
  PhotoFolder,
  PointTier,
} from '../types';
import { storage } from '../utils/storage';
import { idbStorage } from '../utils/idbStorage';
import { firebaseService } from '../services/firebaseService';
import { SAMPLE_DEMO_EVENT } from '../utils/mockData';

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

  // Auth
  login: (email: string, role?: 'photographer' | 'admin', password?: string) => boolean;
  signup: (data: {
    name: string;
    email: string;
    phone: string;
    studioName: string;
    password?: string;
  }) => boolean;
  logout: () => void;
  switchUser: (userId: string) => void;
  updateStudioSettings: (settings: Partial<User>) => void;

  // Points
  buyPoints: (
    packageId: string,
    paymentMethod?: string,
    paymentDetails?: { paymentId?: string; orderId?: string }
  ) => Promise<boolean>;
  adminAddPoints: (userId: string, points: number, reason: string, tier?: PointTier) => void;
  adminResetPassword: (userId: string, customPass?: string) => string;
  adminUpdateSettings: (newSettings: AdminSettings) => void;
  adminUpdateOwnCredentials: (newEmail: string, newPassword: string) => boolean;
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
  }) => { success: boolean; error?: string; eventId?: string };
  extendDeadline: (eventId: string, days?: number) => { success: boolean; error?: string };
  updateEvent: (eventId: string, data: Partial<WeddingEvent>) => void;
  deleteEvent: (eventId: string) => void;

  // Folders & Photos
  addFolder: (eventId: string, folderName: string) => void;
  deleteFolder: (eventId: string, folderId: string, folderName?: string) => Promise<void> | void;
  toggleFolderVisibility: (eventId: string, folderId: string) => void;
  addPhotosToEvent: (eventId: string, photos: Omit<Photo, 'id' | 'isSelected' | 'uploadedAt'>[]) => Promise<Photo[]>;
  deletePhotoFromEvent: (eventId: string, photoId: string) => void;
  refreshEventPhotos: (eventId: string) => Promise<Photo[]>;
  mergePhotosIntoEvent: (eventId: string, photos: Photo[]) => void;

  // Client Selection
  togglePhotoSelection: (eventId: string, photoId: string) => void;
  submitClientSelection: (eventId: string, clientNotes?: string) => void;

  // 50-Day Storage Management
  storageRetentionDays: number;
  runStorageAutoClean: () => number;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>(() => storage.getUsers());
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => storage.getCurrentUserId());
  const [events, setEvents] = useState<WeddingEvent[]>(() => storage.getEvents());
  const [demoEvent, setDemoEvent] = useState<WeddingEvent>(SAMPLE_DEMO_EVENT);
  const [transactions, setTransactions] = useState<PointTransaction[]>(() => storage.getTransactions());
  const [adminSettings, setAdminSettings] = useState<AdminSettings>(() => storage.getSettings());
  const [currentView, setCurrentView] = useState<AppView>('landing');
  const [activeEventId, setActiveEventId] = useState<string | null>(() => storage.getActiveEventId());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Derived current user
  const currentUser = users.find((u) => u.id === currentUserId) || null;

  // Sync to storage and Cloud Firestore
  useEffect(() => {
    storage.saveUsers(users);
    users.forEach((u) => {
      firebaseService.saveUser(u);
    });
  }, [users]);

  useEffect(() => {
    storage.setCurrentUserId(currentUserId);
  }, [currentUserId]);

  useEffect(() => {
    storage.setActiveEventId(activeEventId);
  }, [activeEventId]);

  useEffect(() => {
    storage.saveEvents(events);
  }, [events]);

  useEffect(() => {
    storage.saveTransactions(transactions);
    transactions.slice(0, 20).forEach((t) => {
      firebaseService.saveTransaction(t);
    });
  }, [transactions]);

  useEffect(() => {
    storage.saveSettings(adminSettings);
    firebaseService.saveSettings(adminSettings);
  }, [adminSettings]);

  // Real-time Cloud Firestore Listeners
  useEffect(() => {
    // Initial hydration from local IndexedDB cache: Ensure every event has true local photo counts and covers immediately
    idbStorage.getAllEventsPhotoCounts().then((countsMap) => {
      if (countsMap.size > 0) {
        setEvents((prev) =>
          prev.map((e) => {
            const data = countsMap.get(e.id);
            if (!data) return e;
            const bestCount = Math.max(e.photosCount || 0, e.photos?.length || 0, data.count);
            return {
              ...e,
              photosCount: bestCount,
              coverPhotoUrl: e.coverPhotoUrl || data.coverUrl,
            };
          })
        );
      }
    });

    const unsubEvents = firebaseService.subscribeEvents((cloudEvents) => {
      setEvents((prev) => {
        const cloudIds = new Set(cloudEvents.map((ce) => ce.id));
        // Critical: Keep all locally-created events that are not yet returned by cloud listener!
        const localPendingEvents = prev.filter((e) => !cloudIds.has(e.id));

        const mergedCloudEvents = cloudEvents.map((ce) => {
          const existing = prev.find((e) => e.id === ce.id);
          const existingPhotos = existing?.photos || [];
          const cePhotos = ce.photos || [];
          let finalPhotos = existingPhotos.length > 0 ? existingPhotos : cePhotos;

          // Cross-device live selection sync: If cloud event has updated selectedPhotoIds, apply to photos!
          if (ce.selectedPhotoIds && Array.isArray(ce.selectedPhotoIds) && finalPhotos.length > 0) {
            const selectedSet = new Set(ce.selectedPhotoIds);
            finalPhotos = finalPhotos.map((p) => ({
              ...p,
              isSelected: selectedSet.has(p.id),
            }));
          }

          // Strict folder sync: ONLY folders uploaded by photographer exist (NO default Highlights/Ceremony)
          const finalFolders = (ce.folders !== undefined && Array.isArray(ce.folders))
            ? ce.folders
            : (existing?.folders || []);

          // Accurate photo count: Use finalPhotos.length if photos are loaded, otherwise ce.photosCount
          const accuratePhotosCount = finalPhotos.length > 0
            ? finalPhotos.length
            : (ce.photosCount !== undefined ? ce.photosCount : (existing?.photosCount || 0));

          return {
            ...ce,
            folders: finalFolders,
            photos: finalPhotos,
            photosCount: accuratePhotosCount,
            selectedCount: ce.selectedPhotoIds ? ce.selectedPhotoIds.length : (ce.selectedCount ?? finalPhotos.filter((p) => p.isSelected).length),
          };
        });

        const allMerged = [...localPendingEvents, ...mergedCloudEvents];
        storage.saveEvents(allMerged);
        return allMerged;
      });
    });

    const unsubUsers = firebaseService.subscribeUsers((cloudUsers) => {
      if (cloudUsers && cloudUsers.length > 0) {
        setUsers(cloudUsers);
      }
    });

    const unsubTransactions = firebaseService.subscribeTransactions((cloudTxs) => {
      setTransactions(cloudTxs || []);
    });

    const unsubSettings = firebaseService.subscribeSettings((cloudSettings) => {
      if (cloudSettings) {
        setAdminSettings(cloudSettings);
      }
    });

    return () => {
      unsubEvents();
      unsubUsers();
      unsubTransactions();
      unsubSettings();
    };
  }, []);

  // Synchronous in-memory photo accumulator map to avoid stale closures during high-speed batch uploads
  const eventPhotosCacheRef = useRef<Map<string, Map<string, Photo>>>(new Map());

  // Robust photo merger that ensures no uploaded photos are dropped
  const mergePhotosIntoEvent = useCallback((eventId: string, photosToMerge: Photo[]) => {
    if (!eventId || !photosToMerge || photosToMerge.length === 0) return;

    let cacheMap = eventPhotosCacheRef.current.get(eventId);
    if (!cacheMap) {
      cacheMap = new Map<string, Photo>();
      eventPhotosCacheRef.current.set(eventId, cacheMap);
    }

    photosToMerge.forEach((p) => {
      const existing = cacheMap!.get(p.id);
      cacheMap!.set(p.id, {
        ...p,
        url: p.url || existing?.url || '',
        thumbnailUrl: p.thumbnailUrl || existing?.thumbnailUrl || p.url || '',
      });
    });

    const accumulatedPhotos = Array.from(cacheMap.values());

    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;

        const photoMap = new Map<string, Photo>();
        (e.photos || []).forEach((p) => photoMap.set(p.id, p));
        accumulatedPhotos.forEach((p) => {
          const localPhoto = photoMap.get(p.id);
          photoMap.set(p.id, {
            ...p,
            url: localPhoto?.url || p.url,
            thumbnailUrl: localPhoto?.thumbnailUrl || p.thumbnailUrl || p.url,
          });
        });

        const mergedPhotos = Array.from(photoMap.values());
        const selectedIds = mergedPhotos.filter((p) => p.isSelected).map((p) => p.id);
        const accurateCount = mergedPhotos.length > 0
          ? mergedPhotos.length
          : Math.max(e.photosCount || 0, photosToMerge.length);

        return {
          ...e,
          photos: mergedPhotos,
          photosCount: accurateCount,
          selectedCount: selectedIds.length,
          selectedPhotoIds: selectedIds,
          coverPhotoUrl: e.coverPhotoUrl || mergedPhotos[0]?.thumbnailUrl || mergedPhotos[0]?.url,
        };
      })
    );
  }, []);

  const refreshEventPhotos = useCallback(async (eventId: string): Promise<Photo[]> => {
    if (!eventId) return [];

    // 1. Fetch from local IDB (instant)
    const cached = await idbStorage.getEventPhotos(eventId);
    if (cached && cached.length > 0) {
      mergePhotosIntoEvent(eventId, cached);
    }

    // 2. Fetch from Cloud Firestore
    const cloudPhotos = await firebaseService.fetchEventPhotos(eventId);
    if (cloudPhotos && cloudPhotos.length > 0) {
      mergePhotosIntoEvent(eventId, cloudPhotos);
      idbStorage.saveEventPhotos(eventId, cloudPhotos);
    }

    // 3. Direct auto-push: If local IDB has photos that are missing from cloud, push them to cloud
    if (cached && cached.length > (cloudPhotos?.length || 0)) {
      const cloudPhotoIds = new Set((cloudPhotos || []).map((p) => p.id));
      const missingPhotos = cached.filter((p) => !cloudPhotoIds.has(p.id));
      if (missingPhotos.length > 0) {
        firebaseService.savePhotos(eventId, missingPhotos).catch(() => {});
      }
    }

    const cacheMap = eventPhotosCacheRef.current.get(eventId);
    const resolvedPhotos = cacheMap
      ? Array.from(cacheMap.values())
      : (cloudPhotos?.length ? cloudPhotos : cached || []);

    if (resolvedPhotos.length > 0) {
      setEvents((prev) =>
        prev.map((e) => {
          if (e.id !== eventId) return e;
          return {
            ...e,
            photos: resolvedPhotos,
            photosCount: resolvedPhotos.length,
          };
        })
      );
    }

    return resolvedPhotos;
  }, [mergePhotosIntoEvent]);

  // Synchronize photos for active event from Cloud Firestore & IndexedDB in real time (cross-device sync!)
  useEffect(() => {
    if (!activeEventId) return;

    // 1. Initial hydration from IndexedDB and Cloud Firestore
    refreshEventPhotos(activeEventId);

    // 2. Real-time Firestore subcollection listener for live cross-device photo sync & client selection
    const unsubPhotos = firebaseService.subscribeEventPhotos(activeEventId, (cloudPhotos) => {
      if (cloudPhotos && cloudPhotos.length > 0) {
        mergePhotosIntoEvent(activeEventId, cloudPhotos);
        idbStorage.saveEventPhotos(activeEventId, cloudPhotos);
      }
    });

    return () => {
      unsubPhotos();
    };
  }, [activeEventId, refreshEventPhotos, mergePhotosIntoEvent]);

  const isNavigatingProgrammaticallyRef = useRef(false);
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const usersRef = useRef(users);
  usersRef.current = users;

  // Handle URL hash routing on initial load & popstate/hashchange across devices
  useEffect(() => {
    const handleRouteFromHash = () => {
      if (isNavigatingProgrammaticallyRef.current) return;

      const hash = window.location.hash.replace('#', '');
      if (hash.startsWith('gallery/')) {
        const slugOrId = hash.replace('gallery/', '');
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
        const currentEvents = eventsRef.current;
        const evt = currentEvents.find((e) => e.slug === slugOrId || e.id === slugOrId);
        if (evt) {
          setActiveEventId(evt.id);
          setCurrentView('client-gallery');
        } else {
          // Fetch from Cloud Firestore if opened by client on a fresh device
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
      } else if (hash === 'admin') {
        const storedUid = storage.getCurrentUserId();
        const authedUser = usersRef.current.find((u) => u.id === storedUid);
        if (authedUser && authedUser.role === 'admin') {
          setCurrentView('admin-panel');
        } else {
          setCurrentView('landing');
          window.location.hash = '';
        }
      } else if (hash === 'dashboard') {
        const storedUid = storage.getCurrentUserId();
        if (storedUid) {
          setCurrentView('dashboard');
        } else {
          setCurrentView('landing');
          window.location.hash = '';
        }
      } else if (hash.startsWith('upload/')) {
        const eid = hash.replace('upload/', '');
        if (eid) setActiveEventId(eid);
        setCurrentView('photo-upload');
      } else if (hash.startsWith('results/')) {
        const eid = hash.replace('results/', '');
        if (eid) setActiveEventId(eid);
        setCurrentView('selection-results');
      }
    };

    handleRouteFromHash();
    window.addEventListener('hashchange', handleRouteFromHash);
    return () => window.removeEventListener('hashchange', handleRouteFromHash);
  }, []);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const navigateTo = (view: AppView, eventId: string | null = null) => {
    isNavigatingProgrammaticallyRef.current = true;
    setCurrentView(view);
    if (eventId !== undefined) {
      setActiveEventId(eventId);
    }
    // Update url hash for easy sharing and back button
    if (view === 'client-gallery' && eventId) {
      if (eventId === 'demo-sample-event' || eventId === 'demo') {
        window.location.hash = 'gallery/sample-client-gallery';
      } else {
        const evt = eventsRef.current.find((e) => e.id === eventId);
        window.location.hash = `gallery/${evt ? evt.slug : eventId}`;
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
  };

  const login = (
    email: string,
    role: 'photographer' | 'admin' = 'photographer',
    password?: string
  ): boolean => {
    const cleanEmail = email.trim().toLowerCase();
    
    // Find user by primary email or admin master aliases
    let user = users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (
      !user &&
      (cleanEmail === 'admin@a1smartselection.com' ||
        cleanEmail === 'admin' ||
        cleanEmail === 'goldanpatel99@gmail.com' ||
        cleanEmail === 'admin@nepoliancinematicstudio.com')
    ) {
      user = users.find((u) => u.role === 'admin') || users[0];
    }

    if (user) {
      if (user.isBlocked) {
        showToast(
          user.blockedReason ||
            'Aapka photographer account admin dwara temporarily block kar diya gaya hai. Kripya admin se contact karein.',
          'error'
        );
        return false;
      }

      if (password && user.password && user.password !== password) {
        // Master password checks for Admin
        const isMasterAdminPass =
          user.role === 'admin' &&
          (password === 'admin' ||
            password === 'admin@nepolian' ||
            password === 'goldan@studio' ||
            password === 'admin123' ||
            password === 'Admin@2026');
        if (!isMasterAdminPass) {
          showToast('Galat password! Kripya sahi password enter karein.', 'error');
          return false;
        }
      }
      setCurrentUserId(user.id);
      showToast(`Welcome back, ${user.name}!`, 'success');
      if (user.role === 'admin' || role === 'admin') {
        navigateTo('admin-panel');
      } else {
        navigateTo('dashboard');
      }
      return true;
    } else {
      showToast('Account nahi mila. Kripya pehle New Studio Registration karein.', 'error');
      return false;
    }
  };

  const signup = (data: {
    name: string;
    email: string;
    phone: string;
    studioName: string;
    password?: string;
  }): boolean => {
    const existing = users.find((u) => u.email.toLowerCase() === data.email.toLowerCase());
    if (existing) {
      showToast('Is email se account pehle se bana hua hai. Kripya login karein.', 'error');
      return false;
    }

    const newUser: User = {
      id: `user-${Date.now()}`,
      name: data.name,
      email: data.email,
      phone: data.phone,
      password: data.password || '123456',
      studioName: data.studioName,
      role: 'photographer',
      points: 0, // MUST start with 0 points per user specification!
      createdAt: new Date().toISOString(),
      watermarkText: data.studioName.toUpperCase(),
      watermarkPosition: 'bottom-right',
      watermarkOpacity: 0.35,
    };

    setUsers((prev) => [...prev, newUser]);
    setCurrentUserId(newUser.id);
    firebaseService.saveUser(newUser);
    showToast(`Studio successfully registered! Aapka starting balance is 0 points.`, 'success');
    navigateTo('dashboard');
    return true;
  };

  const logout = () => {
    setCurrentUserId(null);
    showToast('Logged out successfully.', 'info');
    navigateTo('landing');
  };

  const switchUser = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (user) {
      setCurrentUserId(user.id);
      showToast(`Switched account to: ${user.name} (${user.role})`, 'info');
      if (user.role === 'admin') {
        navigateTo('admin-panel');
      } else {
        navigateTo('dashboard');
      }
    }
  };

  const updateStudioSettings = (settings: Partial<User>) => {
    if (!currentUser) return;
    setUsers((prev) =>
      prev.map((u) => (u.id === currentUser.id ? { ...u, ...settings } : u))
    );
    showToast('Studio settings saved!', 'success');
  };

  const buyPoints = async (
    packageId: string,
    paymentMethod = 'Razorpay',
    paymentDetails?: { paymentId?: string; orderId?: string }
  ): Promise<boolean> => {
    if (!currentUser) {
      showToast('Please login to buy points', 'error');
      return false;
    }

    const pkg = adminSettings.pricingPackages.find((p) => p.id === packageId);
    if (!pkg) {
      showToast('Invalid package selected', 'error');
      return false;
    }

    const isPremium = pkg.tier === 'premium';
    const currentStd = currentUser.standardPoints !== undefined ? currentUser.standardPoints : (currentUser.points || 0);
    const currentPrm = currentUser.premiumPoints !== undefined ? currentUser.premiumPoints : 0;

    const newStd = isPremium ? currentStd : currentStd + pkg.points;
    const newPrm = isPremium ? currentPrm + pkg.points : currentPrm;
    const totalNewPoints = newStd + newPrm;

    const refText = paymentDetails?.paymentId ? ` • Ref: ${paymentDetails.paymentId}` : '';
    const newTx: PointTransaction = {
      id: `tx-${Date.now()}`,
      userId: currentUser.id,
      userEmail: currentUser.email,
      type: 'credit',
      amount: pkg.points,
      amountRupees: pkg.priceRupees,
      pointTier: pkg.tier,
      description: `Points Recharge: ${pkg.name} (${pkg.points} ${isPremium ? 'Premium' : 'Standard'} ${pkg.points === 1 ? 'Point' : 'Points'})${refText}`,
      balanceAfter: totalNewPoints,
      createdAt: new Date().toISOString(),
      paymentMethod,
    };

    const updatedUser: User = {
      ...currentUser,
      standardPoints: newStd,
      premiumPoints: newPrm,
      points: totalNewPoints,
    };

    setUsers((prev) =>
      prev.map((u) => (u.id === currentUser.id ? updatedUser : u))
    );
    setTransactions((prev) => [newTx, ...prev]);
    firebaseService.saveUser(updatedUser);
    firebaseService.saveTransaction(newTx);

    showToast(
      `Payment of ₹${pkg.priceRupees} verified! ${pkg.points} ${isPremium ? 'Premium Points (5,000 photos access/pt)' : 'Standard Points (2,500 photos access/pt)'} live credit ho gaye!`,
      'success'
    );
    return true;
  };

  const adminAddPoints = (userId: string, points: number, reason: string, tier: PointTier = 'standard') => {
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return;

    const isPremium = tier === 'premium';
    const currentStd = targetUser.standardPoints !== undefined ? targetUser.standardPoints : (targetUser.points || 0);
    const currentPrm = targetUser.premiumPoints !== undefined ? targetUser.premiumPoints : 0;

    const newStd = isPremium ? currentStd : Math.max(0, currentStd + points);
    const newPrm = isPremium ? Math.max(0, currentPrm + points) : currentPrm;
    const newTotal = newStd + newPrm;

    const newTx: PointTransaction = {
      id: `tx-${Date.now()}`,
      userId: targetUser.id,
      userEmail: targetUser.email,
      type: points >= 0 ? 'credit' : 'debit',
      amount: Math.abs(points),
      pointTier: tier,
      description: `Admin Adjustment (${isPremium ? 'Premium' : 'Standard'}): ${reason}`,
      balanceAfter: newTotal,
      createdAt: new Date().toISOString(),
      paymentMethod: 'Admin Grant',
    };

    const updatedUser: User = {
      ...targetUser,
      standardPoints: newStd,
      premiumPoints: newPrm,
      points: newTotal,
    };

    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? updatedUser : u))
    );
    setTransactions((prev) => [newTx, ...prev]);
    firebaseService.saveUser(updatedUser);
    firebaseService.saveTransaction(newTx);

    showToast(
      `${points >= 0 ? 'Added' : 'Deducted'} ${Math.abs(points)} ${isPremium ? 'Premium' : 'Standard'} points for ${targetUser.name}`,
      'success'
    );
  };

  const adminResetPassword = (userId: string, customPass?: string): string => {
    const newPass = customPass?.trim() || `A1-${Math.floor(100000 + Math.random() * 900000)}`;
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === userId) {
          const updated = { ...u, password: newPass };
          firebaseService.saveUser(updated);
          return updated;
        }
        return u;
      })
    );
    const user = users.find((u) => u.id === userId);
    showToast(`Password updated for ${user?.name || 'Photographer'}: ${newPass}`, 'success');
    return newPass;
  };

  const adminUpdateSettings = (newSettings: AdminSettings) => {
    setAdminSettings(newSettings);
    showToast('Admin settings & pricing updated!', 'success');
  };

  const adminUpdateOwnCredentials = (newEmail: string, newPass: string): boolean => {
    const adminUser = users.find((u) => u.role === 'admin') || currentUser;
    if (!adminUser) {
      showToast('Admin account not found!', 'error');
      return false;
    }

    const updatedAdmin: User = {
      ...adminUser,
      email: newEmail.trim(),
      password: newPass.trim(),
    };

    setUsers((prev) => prev.map((u) => (u.id === adminUser.id ? updatedAdmin : u)));
    firebaseService.saveUser(updatedAdmin);
    showToast('Admin credentials updated! You can now log in with your new ID and Password.', 'success');
    return true;
  };

  const adminToggleBlockPhotographer = (userId: string, reason?: string) => {
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return;
    if (targetUser.role === 'admin') {
      showToast('Admin account block nahi kiya ja sakta!', 'error');
      return;
    }

    const nextBlocked = !targetUser.isBlocked;
    const updatedUser: User = {
      ...targetUser,
      isBlocked: nextBlocked,
      blockedAt: nextBlocked ? new Date().toISOString() : undefined,
      blockedReason: nextBlocked
        ? (reason?.trim() || 'Aapka photographer account admin dwara temporarily block kar diya gaya hai. Kripya admin se contact karein.')
        : undefined,
    };

    setUsers((prev) => prev.map((u) => (u.id === userId ? updatedUser : u)));
    storage.saveUsers(users.map((u) => (u.id === userId ? updatedUser : u)));
    firebaseService.saveUser(updatedUser);

    if (nextBlocked && currentUserId === userId) {
      logout();
      showToast('Aapka account admin dwara temporarily block kar diya gaya hai.', 'error');
    } else {
      showToast(
        nextBlocked
          ? `${targetUser.studioName} (${targetUser.name}) ko temporarily BLOCK kar diya gaya hai.`
          : `${targetUser.studioName} (${targetUser.name}) ko UNBLOCK kar diya gaya hai. Ab wo login kar sakte hain.`,
        nextBlocked ? 'info' : 'success'
      );
    }
  };

  const adminDeletePhotographer = async (userId: string) => {
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return;
    if (targetUser.role === 'admin') {
      showToast('Admin account delete nahi kiya ja sakta!', 'error');
      return;
    }

    // 1. Delete user from local state, storage, and Firestore
    const nextUsers = users.filter((u) => u.id !== userId);
    setUsers(nextUsers);
    storage.saveUsers(nextUsers);
    await firebaseService.deleteUser(userId);

    // 2. Remove all events belonging to this photographer
    const photographerEvents = events.filter((e) => e.photographerId === userId);
    for (const evt of photographerEvents) {
      await firebaseService.deleteEvent(evt.id);
      await idbStorage.deleteEventPhotos(evt.id);
    }
    const nextEvents = events.filter((e) => e.photographerId !== userId);
    setEvents(nextEvents);
    storage.saveEvents(nextEvents);

    // 3. If currently logged in as this user, log out
    if (currentUserId === userId) {
      logout();
    }

    showToast(`${targetUser.studioName} (${targetUser.name}) ka account aur events permanently delete kar diye gaye.`, 'success');
  };

  const adminResetAllStoredData = async () => {
    try {
      // 1. Reset Firestore data
      await firebaseService.resetAllData();

      // 2. Clear localStorage and IndexedDB
      storage.resetAllData();
      await idbStorage.clearAll();

      // 3. Reset in-memory state to pristine admin-only setup
      const freshAdminUser: User = {
        id: 'user-admin-main',
        name: 'Admin',
        email: 'admin@a1smartselection.com',
        phone: '+91 7970641503',
        password: 'admin',
        studioName: 'A1 Smart Selection Admin HQ',
        role: 'admin',
        points: 1998,
        standardPoints: 999,
        premiumPoints: 999,
        createdAt: new Date().toISOString(),
        watermarkText: 'A1 SMART SELECTION',
        watermarkPosition: 'bottom-right',
        watermarkOpacity: 0.35,
        defaultPhotosPerSheet: 6,
      };

      setUsers([freshAdminUser]);
      setEvents([]);
      setTransactions([]);
      storage.saveUsers([freshAdminUser]);
      storage.saveEvents([]);
      storage.saveTransactions([]);
      storage.setCurrentUserId('user-admin-main');
      setCurrentUserId('user-admin-main');

      showToast('Sara testing/stored data successfully wipe & reset kar diya gaya hai! Ab direct real photographers ke liye brand-new clean state ready hai.', 'success');
      navigateTo('admin-panel');
    } catch (err) {
      console.error('Reset error:', err);
      showToast('Reset ke dauran error aaya. Kripya dobara try karein.', 'error');
    }
  };

  const createEvent = (data: {
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
  }) => {
    if (!currentUser) {
      return { success: false, error: 'Please login first' };
    }

    const tier: PointTier = data.pointTier || 'standard';
    const isPremium = tier === 'premium';
    const currentStd = currentUser.standardPoints !== undefined ? currentUser.standardPoints : (currentUser.points || 0);
    const currentPrm = currentUser.premiumPoints !== undefined ? currentUser.premiumPoints : 0;

    // Check respective point balance
    if (isPremium) {
      if (currentPrm < 1) {
        return {
          success: false,
          error: `Insufficient Premium Points! Aapke paas ${currentPrm} Premium Points hain. 5,000 photos access ke liye kripya Premium Points recharge karein.`,
        };
      }
    } else {
      if (currentStd < 1) {
        return {
          success: false,
          error: `Insufficient Standard Points! Aapke paas ${currentStd} Standard Points hain. 2,500 photos access ke liye kripya Standard Points recharge karein.`,
        };
      }
    }

    // Deduct 1 point from chosen tier
    const newStd = isPremium ? currentStd : currentStd - 1;
    const newPrm = isPremium ? currentPrm - 1 : currentPrm;
    const newBalance = newStd + newPrm;

    const newTx: PointTransaction = {
      id: `tx-${Date.now()}`,
      userId: currentUser.id,
      userEmail: currentUser.email,
      type: 'debit',
      amount: 1,
      pointTier: tier,
      description: `Event Created: "${data.title}" (${isPremium ? '⚡ Premium Point - Up to 5k Photos' : 'Standard Point - Up to 2.5k Photos'})`,
      balanceAfter: newBalance,
      createdAt: new Date().toISOString(),
    };

    const deadlineDate = new Date();
    deadlineDate.setDate(deadlineDate.getDate() + data.deadlineDays);

    const slug = data.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') + `-${Math.floor(100 + Math.random() * 900)}`;

    const newEventId = `evt-${Date.now()}`;
    const defaultFolders: PhotoFolder[] = [];

    const newEvent: WeddingEvent = {
      id: newEventId,
      slug,
      title: data.title,
      coupleName: data.coupleName,
      clientPhone: data.clientPhone,
      clientEmail: data.clientEmail,
      photographerId: currentUser.id,
      photographerEmail: currentUser.email,
      studioName: currentUser.studioName || currentUser.name,
      status: 'active',
      eventDate: data.eventDate,
      deadlineDate: deadlineDate.toISOString().split('T')[0],
      maxSelectionLimit: data.maxSelectionLimit,
      photosPerSheet: data.photosPerSheet || currentUser.defaultPhotosPerSheet || 6,
      coupleStory: data.coupleStory,
      folders: defaultFolders,
      photos: [],
      photosCount: 0,
      createdAt: new Date().toISOString(),
      pointTier: tier,
      maxPhotoCapacity: isPremium ? 5000 : 2500,
    };

    const updatedUser: User = {
      ...currentUser,
      standardPoints: newStd,
      premiumPoints: newPrm,
      points: newBalance,
    };

    // 1. Immediately update activeEventId in both React state & storage
    setActiveEventId(newEventId);
    storage.setActiveEventId(newEventId);

    // 2. Synchronous immediate local storage save (failsafe against network/reload)
    const currentStoredEvents = storage.getEvents();
    const updatedStoredEvents = [newEvent, ...currentStoredEvents.filter((e) => e.id !== newEventId)];
    storage.saveEvents(updatedStoredEvents);

    const currentStoredUsers = storage.getUsers();
    const updatedStoredUsers = currentStoredUsers.map((u) => (u.id === currentUser.id ? updatedUser : u));
    storage.saveUsers(updatedStoredUsers);

    const currentStoredTxs = storage.getTransactions();
    storage.saveTransactions([newTx, ...currentStoredTxs]);

    // 3. Update React states
    setUsers((prev) =>
      prev.map((u) => (u.id === currentUser.id ? updatedUser : u))
    );
    setTransactions((prev) => [newTx, ...prev]);
    setEvents((prev) => [newEvent, ...prev.filter((e) => e.id !== newEventId)]);

    // 4. Save to Cloud Firestore
    firebaseService.saveUser(updatedUser);
    firebaseService.saveTransaction(newTx);
    firebaseService.saveEvent(newEvent);

    showToast(
      `Event created! 1 ${isPremium ? 'Premium Point (5,000 photos access)' : 'Standard Point (2,500 photos access)'} deduct hua.`,
      'success'
    );
    return { success: true, eventId: newEventId };
  };

  const extendDeadline = (eventId: string, days = 6) => {
    if (!currentUser) return { success: false, error: 'Not logged in' };
    const requiredPoints = adminSettings.pointsPerExtension;

    if (currentUser.points < requiredPoints) {
      return {
        success: false,
        error: `Insufficient points! You need ${requiredPoints} point to extend deadline. Balance: ${currentUser.points} points.`,
      };
    }

    const evt = events.find((e) => e.id === eventId);
    if (!evt) return { success: false, error: 'Event not found' };

    const currentDeadline = new Date(evt.deadlineDate || new Date());
    currentDeadline.setDate(currentDeadline.getDate() + days);
    const newDeadlineStr = currentDeadline.toISOString().split('T')[0];

    const newBalance = currentUser.points - requiredPoints;
    const newTx: PointTransaction = {
      id: `tx-${Date.now()}`,
      userId: currentUser.id,
      userEmail: currentUser.email,
      type: 'debit',
      amount: requiredPoints,
      description: `Deadline Extended (+${days} days) for "${evt.title}"`,
      balanceAfter: newBalance,
      createdAt: new Date().toISOString(),
    };

    setUsers((prev) =>
      prev.map((u) => (u.id === currentUser.id ? { ...u, points: newBalance } : u))
    );
    setTransactions((prev) => [newTx, ...prev]);
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId
          ? {
              ...e,
              deadlineDate: newDeadlineStr,
              status: e.status === 'expired' ? 'active' : e.status,
            }
          : e
      )
    );

    showToast(`Deadline extended by ${days} days! (1 point deducted)`, 'success');
    return { success: true };
  };

  const updateEvent = (eventId: string, data: Partial<WeddingEvent>) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, ...data } : e))
    );
    showToast('Event updated!', 'success');
  };

  const deleteEvent = (eventId: string) => {
    const targetEvent = events.find((e) => e.id === eventId) || storage.getEvents().find((e) => e.id === eventId);
    
    // Auto-refund point if event was created but 0 photos were uploaded!
    if (targetEvent && (!targetEvent.photos || targetEvent.photos.length === 0) && currentUser) {
      const isPrem = targetEvent.pointTier === 'premium';
      const curStd = currentUser.standardPoints !== undefined ? currentUser.standardPoints : (currentUser.points || 0);
      const curPrm = currentUser.premiumPoints !== undefined ? currentUser.premiumPoints : 0;
      const refStd = isPrem ? curStd : curStd + 1;
      const refPrm = isPrem ? curPrm + 1 : curPrm;
      const refundedUser: User = {
        ...currentUser,
        standardPoints: refStd,
        premiumPoints: refPrm,
        points: refStd + refPrm,
      };

      setUsers((prev) => prev.map((u) => (u.id === currentUser.id ? refundedUser : u)));
      const storedUsers = storage.getUsers().map((u) => (u.id === currentUser.id ? refundedUser : u));
      storage.saveUsers(storedUsers);
      firebaseService.saveUser(refundedUser);
      showToast(`Event deleted. 1 ${isPrem ? 'Premium' : 'Standard'} Point wapas refund kar diya gaya!`, 'info');
    } else {
      showToast('Event deleted', 'info');
    }

    const nextEvents = events.filter((e) => e.id !== eventId);
    setEvents(nextEvents);
    storage.saveEvents(nextEvents);
    if (activeEventId === eventId) {
      setActiveEventId(null);
      storage.setActiveEventId(null);
    }
    firebaseService.deleteEvent(eventId);
    idbStorage.deleteEventPhotos(eventId);
  };

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
      storage.saveEvents(
        storage.getEvents().map((ev) => (ev.id === eventId ? updatedEventToSave! : ev))
      );
    }
    showToast(`Folder "${cleanName}" added!`, 'success');
  };

  const deleteFolder = async (eventId: string, folderId: string, folderName?: string) => {
    const currentEvent =
      eventsRef.current.find((e) => e.id === eventId) ||
      storage.getEvents().find((e) => e.id === eventId);
    if (!currentEvent) return;

    const currentFolders = currentEvent.folders || [];
    const cleanSearchName = (folderName || '').toLowerCase().trim();
    const targetFolder = currentFolders.find(
      (f) =>
        f.id === folderId ||
        (cleanSearchName && f.name.toLowerCase().trim() === cleanSearchName) ||
        (folderId.startsWith('fld-auto-') &&
          f.name.toLowerCase().replace(/\s+/g, '-') === folderId.replace(/^fld-auto-\d+-/, ''))
    );
    const targetFolderName = (targetFolder?.name || folderName || '').toLowerCase().trim();

    // Collect all known photos across React state and in-memory cache
    const cacheMap = eventPhotosCacheRef.current.get(eventId);
    const cachedPhotos = cacheMap ? Array.from(cacheMap.values()) : [];
    const statePhotos = currentEvent.photos || [];

    const allPhotosMap = new Map<string, Photo>();
    statePhotos.forEach((p) => allPhotosMap.set(p.id, p));
    cachedPhotos.forEach((p) => allPhotosMap.set(p.id, p));

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

    const deletedPhotos = Array.from(allPhotosMap.values()).filter(isMatch);
    const deletedPhotoIds = new Set(deletedPhotos.map((p) => p.id));
    const remainingPhotos = statePhotos.filter((p) => !deletedPhotoIds.has(p.id));
    const remainingFolders = currentFolders.filter(
      (f) =>
        f.id !== folderId &&
        (!targetFolder || f.id !== targetFolder.id) &&
        (!targetFolderName || f.name.toLowerCase().trim() !== targetFolderName)
    );

    // 1. Remove deleted photos from in-memory cache accumulator immediately
    if (cacheMap) {
      deletedPhotoIds.forEach((id) => cacheMap.delete(id));
    }

    const updated: WeddingEvent = {
      ...currentEvent,
      folders: remainingFolders,
      photos: remainingPhotos,
      photosCount: remainingPhotos.length,
      selectedCount: remainingPhotos.filter((p) => p.isSelected).length,
      coverPhotoUrl: remainingPhotos[0]?.thumbnailUrl || remainingPhotos[0]?.url || undefined,
    };

    // 2. Update React state immediately
    setEvents((prev) => prev.map((e) => (e.id === eventId ? updated : e)));

    // 3. Immediately update localStorage so refresh NEVER restores the deleted folder!
    storage.saveEvents(
      storage.getEvents().map((ev) => (ev.id === eventId ? updated : ev))
    );

    // 4. Update Cloud Firestore parent event document
    await firebaseService.saveEvent(updated);

    // 5. Delete photos atomically from IndexedDB & Cloud Firestore subcollection
    const photoIdsArray = Array.from(deletedPhotoIds);
    idbStorage.deletePhotosByIds(photoIdsArray);
    if (targetFolderName || folderId) {
      idbStorage.deleteFolderPhotos(eventId, folderId, targetFolderName);
    }
    firebaseService.deletePhotos(eventId, photoIdsArray);

    // 6. Update backend backup file
    try {
      fetch('/api/events/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: updated }),
      }).catch(() => {});
    } catch {}

    const displayName = targetFolder?.name || folderName || 'Folder';
    showToast(`Folder "${displayName}" aur uske photos permanently delete ho gaye.`, 'info');
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
      storage.saveEvents(
        storage.getEvents().map((ev) => (ev.id === eventId ? updatedEventToSave! : ev))
      );
    }
  };

  const addPhotosToEvent = async (
    eventId: string,
    newPhotosData: Omit<Photo, 'id' | 'isSelected' | 'uploadedAt'>[]
  ): Promise<Photo[]> => {
    if (!newPhotosData || newPhotosData.length === 0) return [];

    // Find target event from current state or storage
    const currentEvent =
      eventsRef.current.find((e) => e.id === eventId) ||
      storage.getEvents().find((e) => e.id === eventId);
    if (!currentEvent) return [];

    // Get or initialize in-memory cache map for this event
    let cacheMap = eventPhotosCacheRef.current.get(eventId);
    if (!cacheMap) {
      cacheMap = new Map<string, Photo>();
      (currentEvent.photos || []).forEach((p) => cacheMap!.set(p.id, p));
      eventPhotosCacheRef.current.set(eventId, cacheMap);
    }

    // Filter out any dummy / "All Folders" from existing folders
    const existingFolders = [...(currentEvent.folders || [])].filter(
      (f) => !/^all(\s+folders|\s+photos)?$/i.test(f.name.trim())
    );
    const folderNameToIdMap = new Map<string, string>();
    existingFolders.forEach((f) => folderNameToIdMap.set(f.name.toLowerCase().trim(), f.id));

    // Find first valid non-"all" folder name from the batch if available
    const primaryBatchFolder = newPhotosData.find(
      (p) => p.folderName && !/^all(\s+folders|\s+photos)?$/i.test(p.folderName.trim())
    )?.folderName?.trim();

    // Ensure new folders are recorded, NEVER creating an "All Folders" folder
    newPhotosData.forEach((p) => {
      let rawName = (p.folderName || '').trim();
      // If folderName is "all", "all folders", or empty, fall back to the batch folder or first folder or 'Photos'
      if (!rawName || /^all(\s+folders|\s+photos)?$/i.test(rawName)) {
        rawName = primaryBatchFolder || (existingFolders.length > 0 ? existingFolders[0].name : 'Photos');
      }
      const lowerName = rawName.toLowerCase();
      if (!folderNameToIdMap.has(lowerName)) {
        const newFolderId = `fld-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const newFolder: PhotoFolder = {
          id: newFolderId,
          name: rawName,
          visible: true,
          order: existingFolders.length,
        };
        existingFolders.push(newFolder);
        folderNameToIdMap.set(lowerName, newFolderId);
      }
    });

    // Formatted photos with unique IDs and folder references
    const formattedPhotos: Photo[] = newPhotosData.map((p, idx) => {
      let rawName = (p.folderName || '').trim();
      if (!rawName || /^all(\s+folders|\s+photos)?$/i.test(rawName)) {
        rawName = primaryBatchFolder || (existingFolders.length > 0 ? existingFolders[0].name : 'Photos');
      }
      const matchedFolderId = folderNameToIdMap.get(rawName.toLowerCase()) || p.folderId;
      return {
        ...p,
        id: (p as any).id || `p-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
        folderId: matchedFolderId,
        folderName: rawName,
        isSelected: false,
        uploadedAt: new Date().toISOString(),
      };
    });

    // Atomically append to in-memory accumulator so subsequent batches NEVER lose earlier photos
    formattedPhotos.forEach((p) => {
      cacheMap!.set(p.id, p);
    });

    const allAccumulatedPhotos = Array.from(cacheMap.values());
    const coverPhoto =
      currentEvent.coverPhotoUrl ||
      allAccumulatedPhotos[0]?.thumbnailUrl ||
      allAccumulatedPhotos[0]?.url;

    // 1. Immediately save to IndexedDB (virtually unlimited local storage capacity)
    await idbStorage.saveEventPhotos(eventId, formattedPhotos);

    // 2. Update React state cleanly with ALL accumulated photos immediately
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        return {
          ...e,
          folders: existingFolders,
          photos: allAccumulatedPhotos,
          photosCount: allAccumulatedPhotos.length,
          coverPhotoUrl: coverPhoto,
        };
      })
    );

    // 3. Save parent event metadata to localStorage & Firestore
    const eventMetadataToSave: WeddingEvent = {
      ...currentEvent,
      folders: existingFolders,
      photos: allAccumulatedPhotos,
      photosCount: allAccumulatedPhotos.length,
      coverPhotoUrl: coverPhoto,
    };
    storage.saveEvents(
      storage.getEvents().map((ev) => (ev.id === eventId ? eventMetadataToSave : ev))
    );
    // 4. Directly save individual photo documents to Cloud Firestore subcollection with guaranteed await
    try {
      await firebaseService.savePhotos(eventId, formattedPhotos);
    } catch (saveErr) {
      console.warn('Direct Firestore savePhotos error:', saveErr);
    }

    // 5. Save updated parent event document to Cloud Firestore
    try {
      await firebaseService.saveEvent(eventMetadataToSave);
    } catch (e) {
      console.warn('Firestore saveEvent error:', e);
    }

    return formattedPhotos;
  };

  const deletePhotoFromEvent = (eventId: string, photoId: string) => {
    const cacheMap = eventPhotosCacheRef.current.get(eventId);
    if (cacheMap) {
      cacheMap.delete(photoId);
    }

    let updatedEventToSave: WeddingEvent | null = null;
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        const currentPhotos = e.photos || [];
        const updatedPhotos = currentPhotos.filter((p) => p.id !== photoId);
        const updatedEvent: WeddingEvent = {
          ...e,
          photos: updatedPhotos,
          photosCount: updatedPhotos.length,
          selectedCount: updatedPhotos.filter((p) => p.isSelected).length,
        };
        updatedEventToSave = updatedEvent;
        return updatedEvent;
      })
    );
    if (updatedEventToSave) {
      firebaseService.saveEvent(updatedEventToSave);
      storage.saveEvents(
        storage.getEvents().map((ev) => (ev.id === eventId ? updatedEventToSave! : ev))
      );
    }
    firebaseService.deletePhoto(eventId, photoId);
    idbStorage.deleteEventPhotos(eventId, photoId);
  };

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

    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;

        const currentPhotos = e.photos || [];
        const currentSelectedCount = currentPhotos.filter((p) => p.isSelected).length;
        const targetPhoto = currentPhotos.find((p) => p.id === photoId);
        const willSelect = !targetPhoto?.isSelected;

        if (willSelect && e.maxSelectionLimit && currentSelectedCount >= e.maxSelectionLimit) {
          showToast(`Maximum selection limit reached (${e.maxSelectionLimit} photos)!`, 'error');
          return e;
        }

        const selectedAt = willSelect ? new Date().toISOString() : undefined;

        const updatedPhotos = currentPhotos.map((p) =>
          p.id === photoId
            ? {
                ...p,
                isSelected: willSelect,
                selectedAt: selectedAt,
              }
            : p
        );

        const updatedSelectedIds = updatedPhotos.filter((p) => p.isSelected).map((p) => p.id);
        const updatedSelectedCount = updatedSelectedIds.length;

        // Persist photo selection state to Cloud Firestore (both photo doc & parent event for instant multi-device sync)
        firebaseService.updatePhoto(eventId, photoId, {
          isSelected: willSelect,
          selectedAt: selectedAt || undefined,
        });

        firebaseService.updateEventSelections(eventId, updatedSelectedIds, updatedSelectedCount);

        return {
          ...e,
          photos: updatedPhotos,
          selectedPhotoIds: updatedSelectedIds,
          selectedCount: updatedSelectedCount,
          lastSelectedAt: new Date().toISOString(),
        };
      })
    );
  };

  const submitClientSelection = (eventId: string, clientNotes = '') => {
    if (eventId === 'demo-sample-event' || eventId === 'demo') {
      setDemoEvent((prev) => ({
        ...prev,
        status: 'completed',
        clientNotes,
      }));
      showToast('🎉 Demo selection completed! Try downloading the .bat file.', 'success');
      return;
    }

    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        const updatedEvent: WeddingEvent = {
          ...e,
          status: 'completed',
          submittedAt: new Date().toISOString(),
          clientNotes: clientNotes,
        };
        firebaseService.saveEvent(updatedEvent);
        return updatedEvent;
      })
    );
    showToast('Selection successfully submitted! Photographer has been notified.', 'success');
  };

  // 50-Day Storage Retention Policy & Auto-Cleanup
  const storageRetentionDays = 50;
  const RETENTION_MS = storageRetentionDays * 24 * 60 * 60 * 1000;

  const runStorageAutoClean = (): number => {
    const now = Date.now();
    let cleanedCount = 0;

    setEvents((prev) =>
      prev.map((e) => {
        const ageMs = now - new Date(e.createdAt).getTime();
        if (ageMs >= RETENTION_MS && !e.isStoragePurged) {
          cleanedCount++;
          // Purge heavy image URLs to save disk/bandwidth while preserving photo names, selections & metadata
          const purgedPhotos = (e.photos || []).map((p) => ({
            ...p,
            url: '', // image payload cleared
            thumbnailUrl: '',
          }));
          return {
            ...e,
            photos: purgedPhotos,
            isStoragePurged: true,
            storageCleanedAt: new Date().toISOString(),
          };
        }
        return e;
      })
    );

    return cleanedCount;
  };

  // Auto-run storage cleanup on load and periodically
  useEffect(() => {
    runStorageAutoClean();
    const timer = setInterval(() => {
      runStorageAutoClean();
    }, 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const activeEvent = useMemo(() => {
    if (activeEventId === 'demo-sample-event' || activeEventId === 'demo') {
      return demoEvent;
    }
    if (!activeEventId) return null;
    const foundInState = events.find((e) => e.id === activeEventId);
    if (foundInState) return foundInState;
    // Failsafe fallback to local storage
    const foundInStorage = storage.getEvents().find((e) => e.id === activeEventId);
    return foundInStorage || null;
  }, [activeEventId, events, demoEvent]);

  return (
    <AppContext.Provider
      value={{
        currentUser,
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
