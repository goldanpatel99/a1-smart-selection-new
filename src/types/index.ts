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
  clientPhone: string;
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
  storageCleanedAt?: string; // timestamp when preview storage was purged after 50 days
  isStoragePurged?: boolean; // true if preview photos were purged for storage saving
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  studioName: string;
  role: 'photographer' | 'admin';
  points: number; // starts at 0 for new photographers
  createdAt: string;
  watermarkText?: string;
  watermarkPosition?: 'center' | 'bottom-right' | 'bottom-left' | 'top-right';
  watermarkOpacity?: number;
  defaultPhotosPerSheet?: number; // default: 6
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
}

export interface PricingPackage {
  id: string;
  points: number;
  priceRupees: number;
  name: string;
  tagline: string;
  isPopular?: boolean;
  savingsText?: string;
}

export interface AdminSettings {
  pointsPerEvent: number;
  pointsPerExtension: number;
  pricingPackages: PricingPackage[];
  allowAdminDemoBypass: boolean;
}
