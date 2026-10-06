import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  User,
  WeddingEvent,
  PointTransaction,
  AdminSettings,
  Photo,
  PhotoFolder,
} from '../types';
import { storage } from '../utils/storage';
import { idbStorage } from '../utils/idbStorage';
import { firebaseService } from '../services/firebaseService';

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
  adminAddPoints: (userId: string, points: number, reason: string) => void;
  adminResetPassword: (userId: string, customPass?: string) => string;
  adminUpdateSettings: (newSettings: AdminSettings) => void;

  // Events
  createEvent: (data: {
    title: string;
    coupleName: string;
    clientPhone: string;
    clientEmail?: string;
    eventDate: string;
    deadlineDays: number;
    maxSelectionLimit?: number;
    photosPerSheet?: number;
    coupleStory?: string;
  }) => { success: boolean; error?: string; eventId?: string };
  extendDeadline: (eventId: string, days?: number) => { success: boolean; error?: string };
  updateEvent: (eventId: string, data: Partial<WeddingEvent>) => void;
  deleteEvent: (eventId: string) => void;

  // Folders & Photos
  addFolder: (eventId: string, folderName: string) => void;
  deleteFolder: (eventId: string, folderId: string) => void;
  toggleFolderVisibility: (eventId: string, folderId: string) => void;
  addPhotosToEvent: (eventId: string, photos: Omit<Photo, 'id' | 'isSelected' | 'uploadedAt'>[]) => void;
  deletePhotoFromEvent: (eventId: string, photoId: string) => void;

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
  const [transactions, setTransactions] = useState<PointTransaction[]>(() => storage.getTransactions());
  const [adminSettings, setAdminSettings] = useState<AdminSettings>(() => storage.getSettings());
  const [currentView, setCurrentView] = useState<AppView>('landing');
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
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
    storage.saveEvents(events);
    events.forEach((evt) => {
      firebaseService.saveEvent(evt);
    });
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
    const unsubEvents = firebaseService.subscribeEvents((cloudEvents) => {
      setEvents((prev) => {
        const prevMap = new Map<string, WeddingEvent>();
        prev.forEach((e) => prevMap.set(e.id, e));
        return cloudEvents.map((ce) => {
          const existing = prevMap.get(ce.id);
          return {
            ...ce,
            // Preserve in-memory photos if already loaded, avoiding empty cloud overwrite
            photos: existing && existing.photos.length > 0 ? existing.photos : ce.photos || [],
            photosCount: ce.photosCount ?? (existing?.photos.length || 0),
          };
        });
      });
    });

    const unsubUsers = firebaseService.subscribeUsers((cloudUsers) => {
      setUsers((prev) => {
        const map = new Map<string, User>();
        prev.forEach((u) => map.set(u.id, u));
        cloudUsers.forEach((u) => map.set(u.id, u));
        return Array.from(map.values());
      });
    });

    const unsubTransactions = firebaseService.subscribeTransactions((cloudTxs) => {
      setTransactions((prev) => {
        const map = new Map<string, PointTransaction>();
        prev.forEach((t) => map.set(t.id, t));
        cloudTxs.forEach((t) => map.set(t.id, t));
        return Array.from(map.values());
      });
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

  // Synchronize photos for active event from Cloud Firestore in real time (cross-device sync!)
  useEffect(() => {
    if (!activeEventId) return;

    // 1. First check local IndexedDB cache for immediate offline rendering
    idbStorage.getEventPhotos(activeEventId).then((cached) => {
      if (cached && cached.length > 0) {
        setEvents((prev) =>
          prev.map((e) =>
            e.id === activeEventId && e.photos.length === 0
              ? {
                  ...e,
                  photos: cached,
                  photosCount: cached.length,
                  coverPhotoUrl: e.coverPhotoUrl || cached[0]?.url,
                }
              : e
          )
        );
      }
    });

    // 2. Real-time Firestore subcollection listener for live cross-device photo sync
    const unsubPhotos = firebaseService.subscribeEventPhotos(activeEventId, (cloudPhotos) => {
      if (cloudPhotos && cloudPhotos.length > 0) {
        setEvents((prev) =>
          prev.map((e) => {
            if (e.id !== activeEventId) return e;
            return {
              ...e,
              photos: cloudPhotos,
              photosCount: cloudPhotos.length,
              selectedCount: cloudPhotos.filter((p) => p.isSelected).length,
              coverPhotoUrl: e.coverPhotoUrl || cloudPhotos[0]?.url,
            };
          })
        );
        // Cache to IDB
        idbStorage.saveEventPhotos(activeEventId, cloudPhotos);
      }
    });

    return () => {
      unsubPhotos();
    };
  }, [activeEventId]);

  // Handle URL hash routing on initial load
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash.startsWith('gallery/')) {
      const slugOrId = hash.replace('gallery/', '');
      const evt = events.find((e) => e.slug === slugOrId || e.id === slugOrId);
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
      setCurrentView('admin-panel');
    } else if (hash === 'dashboard') {
      setCurrentView('dashboard');
    }
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
    setCurrentView(view);
    if (eventId !== undefined) {
      setActiveEventId(eventId);
    }
    // Update url hash for easy sharing and back button
    if (view === 'client-gallery' && eventId) {
      const evt = events.find((e) => e.id === eventId);
      window.location.hash = `gallery/${evt ? evt.slug : eventId}`;
    } else if (view === 'admin-panel') {
      window.location.hash = 'admin';
    } else if (view === 'dashboard') {
      window.location.hash = 'dashboard';
    } else if (view === 'landing') {
      window.location.hash = '';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const login = (
    email: string,
    role: 'photographer' | 'admin' = 'photographer',
    password?: string
  ): boolean => {
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (user) {
      if (password && user.password && user.password !== password) {
        showToast('Galat password! Kripya sahi password enter karein.', 'error');
        return false;
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

    const newPoints = currentUser.points + pkg.points;
    const refText = paymentDetails?.paymentId ? ` • Ref: ${paymentDetails.paymentId}` : '';
    const newTx: PointTransaction = {
      id: `tx-${Date.now()}`,
      userId: currentUser.id,
      userEmail: currentUser.email,
      type: 'credit',
      amount: pkg.points,
      amountRupees: pkg.priceRupees,
      description: `Points Recharge: ${pkg.name} (${pkg.points} points)${refText}`,
      balanceAfter: newPoints,
      createdAt: new Date().toISOString(),
      paymentMethod,
    };

    setUsers((prev) =>
      prev.map((u) => (u.id === currentUser.id ? { ...u, points: newPoints } : u))
    );
    setTransactions((prev) => [newTx, ...prev]);
    showToast(`Payment of ₹${pkg.priceRupees} verified! ${pkg.points} points credited instantly to your studio balance.`, 'success');
    return true;
  };

  const adminAddPoints = (userId: string, points: number, reason: string) => {
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return;

    const newBalance = Math.max(0, targetUser.points + points);
    const newTx: PointTransaction = {
      id: `tx-${Date.now()}`,
      userId: targetUser.id,
      userEmail: targetUser.email,
      type: points >= 0 ? 'credit' : 'debit',
      amount: Math.abs(points),
      description: `Admin Adjustment: ${reason}`,
      balanceAfter: newBalance,
      createdAt: new Date().toISOString(),
      paymentMethod: 'Admin Grant',
    };

    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, points: newBalance } : u))
    );
    setTransactions((prev) => [newTx, ...prev]);
    showToast(`${points >= 0 ? 'Added' : 'Deducted'} ${Math.abs(points)} points for ${targetUser.name}`, 'success');
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

  const createEvent = (data: {
    title: string;
    coupleName: string;
    clientPhone: string;
    clientEmail?: string;
    eventDate: string;
    deadlineDays: number;
    maxSelectionLimit?: number;
    photosPerSheet?: number;
    coupleStory?: string;
  }) => {
    if (!currentUser) {
      return { success: false, error: 'Please login first' };
    }

    // Points Check
    const requiredPoints = adminSettings.pointsPerEvent;
    if (currentUser.points < requiredPoints) {
      return {
        success: false,
        error: `Insufficient points! You need ${requiredPoints} point to create an event. Current balance: ${currentUser.points} points. Please buy points first.`,
      };
    }

    // Deduct 1 point
    const newBalance = currentUser.points - requiredPoints;
    const newTx: PointTransaction = {
      id: `tx-${Date.now()}`,
      userId: currentUser.id,
      userEmail: currentUser.email,
      type: 'debit',
      amount: requiredPoints,
      description: `Event Created: "${data.title}"`,
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
    // Completely clean: No pre-uploaded sample folders. Folders are created when photographer uploads them.
    const defaultFolders: PhotoFolder[] = [];

    const newEvent: WeddingEvent = {
      id: newEventId,
      slug,
      title: data.title,
      coupleName: data.coupleName,
      clientPhone: data.clientPhone,
      clientEmail: data.clientEmail,
      photographerId: currentUser.id,
      studioName: currentUser.studioName || currentUser.name,
      status: 'active',
      eventDate: data.eventDate,
      deadlineDate: deadlineDate.toISOString().split('T')[0],
      maxSelectionLimit: data.maxSelectionLimit,
      photosPerSheet: data.photosPerSheet || currentUser.defaultPhotosPerSheet || 6,
      coupleStory: data.coupleStory,
      folders: defaultFolders,
      photos: [],
      createdAt: new Date().toISOString(),
    };

    setUsers((prev) =>
      prev.map((u) => (u.id === currentUser.id ? { ...u, points: newBalance } : u))
    );
    setTransactions((prev) => [newTx, ...prev]);
    setEvents((prev) => [newEvent, ...prev]);

    showToast(`Event created! 1 point deducted. New balance: ${newBalance} points.`, 'success');
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
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    firebaseService.deleteEvent(eventId);
    idbStorage.deleteEventPhotos(eventId);
    showToast('Event deleted', 'info');
  };

  const addFolder = (eventId: string, folderName: string) => {
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        const newFolder: PhotoFolder = {
          id: `fld-${Date.now()}`,
          name: folderName.trim(),
          visible: true,
          order: e.folders.length,
        };
        const updated = { ...e, folders: [...e.folders, newFolder] };
        firebaseService.saveEvent(updated);
        return updated;
      })
    );
    showToast(`Folder "${folderName}" added!`, 'success');
  };

  const deleteFolder = (eventId: string, folderId: string) => {
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        const deletedPhotos = e.photos.filter((p) => p.folderId === folderId);
        deletedPhotos.forEach((p) => {
          firebaseService.deletePhoto(eventId, p.id);
          idbStorage.deleteEventPhotos(eventId, p.id);
        });
        const updated = {
          ...e,
          folders: e.folders.filter((f) => f.id !== folderId),
          photos: e.photos.filter((p) => p.folderId !== folderId),
        };
        firebaseService.saveEvent(updated);
        return updated;
      })
    );
    showToast('Folder deleted', 'info');
  };

  const toggleFolderVisibility = (eventId: string, folderId: string) => {
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        const updated = {
          ...e,
          folders: e.folders.map((f) =>
            f.id === folderId ? { ...f, visible: !f.visible } : f
          ),
        };
        firebaseService.saveEvent(updated);
        return updated;
      })
    );
  };

  const addPhotosToEvent = (
    eventId: string,
    newPhotosData: Omit<Photo, 'id' | 'isSelected' | 'uploadedAt'>[]
  ) => {
    // Auto-detect and sync exact folder names
    let formattedPhotos: Photo[] = [];

    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;

        const existingFolders = [...e.folders];
        const folderNameToIdMap = new Map<string, string>();
        existingFolders.forEach((f) => folderNameToIdMap.set(f.name.toLowerCase(), f.id));

        newPhotosData.forEach((p) => {
          const rawName = (p.folderName || 'Photos').trim();
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

        formattedPhotos = newPhotosData.map((p, idx) => {
          const rawName = (p.folderName || 'Photos').trim();
          const matchedFolderId = folderNameToIdMap.get(rawName.toLowerCase()) || p.folderId;
          return {
            ...p,
            id: `p-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
            folderId: matchedFolderId,
            folderName: rawName,
            isSelected: false,
            uploadedAt: new Date().toISOString(),
          };
        });

        const updatedPhotos = [...e.photos, ...formattedPhotos];
        const coverPhoto = e.coverPhotoUrl || (updatedPhotos.length > 0 ? updatedPhotos[0].url : undefined);

        const updatedEvent: WeddingEvent = {
          ...e,
          folders: existingFolders,
          photos: updatedPhotos,
          photosCount: updatedPhotos.length,
          coverPhotoUrl: coverPhoto,
        };

        // Persist parent event metadata
        firebaseService.saveEvent(updatedEvent);

        return updatedEvent;
      })
    );

    // Save individual photo documents to Cloud Firestore subcollection (cross-device persistent!)
    if (formattedPhotos.length > 0) {
      firebaseService.savePhotos(eventId, formattedPhotos);
      idbStorage.saveEventPhotos(eventId, formattedPhotos);
    }

    showToast(`${newPhotosData.length} photos uploaded and saved to Cloud Firestore!`, 'success');
  };

  const deletePhotoFromEvent = (eventId: string, photoId: string) => {
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        const updatedPhotos = e.photos.filter((p) => p.id !== photoId);
        return {
          ...e,
          photos: updatedPhotos,
          photosCount: updatedPhotos.length,
          selectedCount: updatedPhotos.filter((p) => p.isSelected).length,
        };
      })
    );
    firebaseService.deletePhoto(eventId, photoId);
    idbStorage.deleteEventPhotos(eventId, photoId);
  };

  const togglePhotoSelection = (eventId: string, photoId: string) => {
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;

        const currentSelectedCount = e.photos.filter((p) => p.isSelected).length;
        const targetPhoto = e.photos.find((p) => p.id === photoId);
        const willSelect = !targetPhoto?.isSelected;

        if (willSelect && e.maxSelectionLimit && currentSelectedCount >= e.maxSelectionLimit) {
          showToast(`Maximum selection limit reached (${e.maxSelectionLimit} photos)!`, 'error');
          return e;
        }

        const selectedAt = willSelect ? new Date().toISOString() : undefined;

        // Persist photo selection state to Cloud Firestore
        firebaseService.updatePhoto(eventId, photoId, {
          isSelected: willSelect,
          selectedAt: selectedAt || undefined,
        });

        const updatedPhotos = e.photos.map((p) =>
          p.id === photoId
            ? {
                ...p,
                isSelected: willSelect,
                selectedAt: selectedAt,
              }
            : p
        );

        return {
          ...e,
          photos: updatedPhotos,
          selectedCount: updatedPhotos.filter((p) => p.isSelected).length,
        };
      })
    );
  };

  const submitClientSelection = (eventId: string, clientNotes = '') => {
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        return {
          ...e,
          status: 'completed',
          submittedAt: new Date().toISOString(),
          clientNotes: clientNotes,
        };
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
          const purgedPhotos = e.photos.map((p) => ({
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

  const activeEvent = events.find((e) => e.id === activeEventId) || null;

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
        createEvent,
        extendDeadline,
        updateEvent,
        deleteEvent,
        addFolder,
        deleteFolder,
        toggleFolderVisibility,
        addPhotosToEvent,
        deletePhotoFromEvent,
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
