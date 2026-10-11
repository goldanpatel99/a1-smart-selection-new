export type PointTier = 'standard' | 'premium';

export interface Photo {
  id: string;
  filename: string;
  originalName: string;
  folderId: string;
  folderName: string;
  url: string; // compressed preview data URL or hosted URL
  thumbnailUrl?: string;
  sizeBytes?: number;
  isSelected: boolean;
  selectedAt?: string;
  clientComment?: string;
  uploadedAt: string;
}

export interface PhotoFolder {
  id: string;
  name: string; // e.g. "Haldi", "Ceremony", "Reception"
  visible: boolean;
  order: number;
}

export interface WeddingEvent {
  id: string;
  slug: string; // for client link
  title: string; // e.g. "Sharma Wedding 2026"
  coupleName: string; // e.g. "Aarav & Priya"
  clientPhone?: string;
  clientEmail?: string;
  photographerId: string;
  studioName: string;
  status: 'draft' | 'active' | 'completed' | 'expired';
  eventDate: string;
  deadlineDate: string;
  maxSelectionLimit?: number; // e.g. 100 photos, or undefined for unlimited
  folders: PhotoFolder[];
  photos: Photo[];
  createdAt: string;
  submittedAt?: string;
  clientNotes?: string;
  coverPhotoUrl?: string;
  photosPerSheet?: number; // default: 6 photos = 1 sheet (1 page)
  photosCount?: number;
  selectedCount?: number;
  selectedPhotoIds?: string[]; // IDs of currently selected photos for ultra-fast multi-device live sync
  lastSelectedAt?: string;
  storageCleanedAt?: string; // timestamp when preview storage was purged after 50 days
  isStoragePurged?: boolean; // true if preview photos were purged for storage saving
  coupleStory?: string; // romantic story/quote for hero welcome screen
  studioLogoUrl?: string;
  studioPhone?: string;
  studioInstagram?: string;
  studioAddress?: string;
  studioTagline?: string;
  // Tier & photo limit
  pointTier?: PointTier; // 'standard' (2,500 photos) | 'premium' (5,000 photos)
  maxPhotoCapacity?: number; // 2500 or 5000
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  password?: string;
  studioName: string;
  role: 'photographer' | 'admin';
  points: number; // total points (standardPoints + premiumPoints)
  standardPoints?: number; // 2,500 photos upload access / point (₹149/pt base)
  premiumPoints?: number;  // 5,000 photos upload access / point (₹249/pt base)
  createdAt: string;
  isBlocked?: boolean; // Admin can temporarily block access
  blockedAt?: string;
  blockedReason?: string;
  watermarkText?: string;
  watermarkPosition?: 'center' | 'bottom-right' | 'bottom-left' | 'top-right';
  watermarkOpacity?: number;
  defaultPhotosPerSheet?: number; // default: 6
  // 100% White-Label Studio Branding
  studioLogoUrl?: string;
  studioTagline?: string;
  studioAddress?: string;
  studioInstagram?: string;
  studioWebsite?: string;
  studioBookingPhone?: string;
  enableAntiScreenshot?: boolean;
}

export interface PointTransaction {
  id: string;
  userId: string;
  userEmail: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  balanceAfter: number;
  createdAt: string;
  paymentMethod?: string;
  amountRupees?: number;
  pointTier?: PointTier;
}

export interface PricingPackage {
  id: string;
  tier: PointTier;
  points: number;
  priceRupees: number;
  photosLimit: number; // 2500 for standard, 5000 for premium
  name: string;
  tagline: string;
  isPopular?: boolean;
  savingsText?: string;
  originalPriceRupees?: number;
}

export interface AdminSettings {
  pointsPerEvent: number;
  pointsPerExtension: number;
  pricingPackages: PricingPackage[];
  allowAdminDemoBypass: boolean;
}
