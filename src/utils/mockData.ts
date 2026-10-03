import { WeddingEvent, User, PointTransaction, AdminSettings } from '../types';

export const INITIAL_ADMIN_SETTINGS: AdminSettings = {
  pointsPerEvent: 1,
  pointsPerExtension: 1,
  allowAdminDemoBypass: true,
  pricingPackages: [
    {
      id: 'pkg-1',
      points: 1,
      priceRupees: 110,
      name: 'Starter 1 Event',
      tagline: 'Ek event ke liye perfect. 1 Event = 1 Point.',
      isPopular: false,
    },
    {
      id: 'pkg-5',
      points: 5,
      priceRupees: 520,
      name: 'Studio Pack (5 Events)',
      tagline: '₹104 per event. Save ₹30.',
      isPopular: false,
      savingsText: 'Save ₹30',
    },
    {
      id: 'pkg-20',
      points: 20,
      priceRupees: 1990,
      name: 'Pro Studio (20 Events)',
      tagline: '₹99.5 per event. Best value for busy wedding season.',
      isPopular: true,
      savingsText: 'Best Value 🔥',
    },
  ],
};

export const INITIAL_USERS: User[] = [
  {
    id: 'user-goldan-patel',
    name: 'Goldan Patel',
    email: 'nepoliancinematicstudio@gmail.com',
    phone: '+91 7970641503',
    studioName: 'NEPOLIAN CINEMATIC STUDIO',
    role: 'photographer',
    points: 5,
    createdAt: '2026-10-01T10:00:00.000Z',
    watermarkText: 'NEPOLIAN CINEMATIC STUDIO',
    watermarkPosition: 'center',
    watermarkOpacity: 0.35,
    defaultPhotosPerSheet: 6,
  },
  {
    id: 'user-admin-goldan',
    name: 'Goldan Patel (Admin)',
    email: 'admin@nepoliancinematicstudio.com',
    phone: '+91 7970641503',
    studioName: 'NEPOLIAN CINEMATIC STUDIO HQ',
    role: 'admin',
    points: 999,
    createdAt: '2026-10-01T10:00:00.000Z',
    watermarkText: 'NEPOLIAN CINEMATIC STUDIO',
    watermarkPosition: 'center',
    watermarkOpacity: 0.35,
    defaultPhotosPerSheet: 6,
  },
];

export const INITIAL_TRANSACTIONS: PointTransaction[] = [
  {
    id: 'tx-init-1',
    userId: 'user-goldan-patel',
    userEmail: 'nepoliancinematicstudio@gmail.com',
    amount: 5,
    type: 'credit',
    description: 'Initial Studio Points Balance',
    createdAt: '2026-10-01T10:00:00.000Z',
    balanceAfter: 5,
  },
];

// Clean initial state: No pre-existing sample events or dummy files
export const INITIAL_EVENTS: WeddingEvent[] = [];
