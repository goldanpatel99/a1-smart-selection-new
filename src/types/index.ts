export type PointTier = 'standard' | 'premium';

export type PhotoSyncStatus = 'local' | 'uploading' | 'synced' | 'failed';

export function isRemoteUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return false;
  return /^https?:\/\//i.test(trimmed);
}

export interface Photo {
  id: string; // client-generated crypto.randomUUID()
  filename: string;
  originalName: string;
  folderId: string;
  folderName: string;
  url: string; // remote HTTPS URL, or empty if local-only
  thumbnailUrl?: string; // remote HTTPS URL, or empty if local-only
  sizeBytes?: number;
  isSelected: boolean;
  selectedAt?: string;
  clientComment?: string;
  uploadedAt: string;
  eventId?: string;
  r2Key?: string;
  r2ThumbKey?: string;
  width?: number;
  height?: number;
  syncStatus?: PhotoSyncStatus; // Local-only state: 'local' | 'uploading' | 'synced' | 'failed'
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
  photographerEmail?: string;
  studioName: string;
  status: 'draft' | 'active' | 'completed' | 'expired' | 'locked';
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
  watermarkText?: string;
  studio?: {
    name?: string;
    logoUrl?: string;
    whatsapp?: string;
    phone?: string;
    watermarkText?: string;
    tagline?: string;
    instagram?: string;
    address?: string;
  };
  deadlineAt?: string;
  // Tier & photo limit
  pointTier?: PointTier; // 'standard' (2,500 photos) | 'premium' (5,000 photos)
  maxPhotoCapacity?: number; // 2500 or 5000
  // Permanent deletion tombstones (prevents deleted photos & folders from resurrecting)
  deletedPhotoIds?: string[];
  deletedFolderNames?: string[];
  // Event tombstone flags (prevents deleted events & cached folders from resurrecting)
  event_id_deleted?: boolean;
  isDeleted?: boolean;
  deletedAt?: string;
}

export interface LiveSelectionDoc {
  selectedPhotoIds: string[];
  selectedCount: number;
  clientNotes?: string;
  status?: string;
  updatedAt: string;
  deviceId?: string;
  rev?: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
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

export interface DanglingPhotoIssue {
  id: string;
  fileName: string;
  folderName?: string;
  source: 'cloud' | 'local_idb' | 'both';
  reason: 'tombstoned_in_cloud' | 'tombstoned_in_idb' | 'deleted_folder_orphan' | 'missing_in_cloud' | 'missing_in_local' | 'corrupted';
  description: string;
}

export interface OrphanedFolderIssue {
  name: string;
  id?: string;
  reason: 'in_deleted_tombstone_list' | 'missing_in_cloud' | 'missing_in_local' | 'empty_and_orphaned';
  description: string;
}

export interface SyncAuditReport {
  eventId: string;
  eventTitle: string;
  scannedAt: number;
  cloudTotalDocs: number;
  cloudValidPhotos: number;
  cloudTombstonedPhotos: number;
  localIdbPhotos: number;
  localTombstonesCount: number;
  cloudTombstonesCount: number;
  recordedPhotosCount: number;
  actualHealthyCount: number;
  countMismatch: number;
  danglingPhotos: DanglingPhotoIssue[];
  orphanedFolders: OrphanedFolderIssue[];
  isClean: boolean;
}

export interface DeepCleanupResult {
  eventId: string;
  prunedCloudDocs: number;
  prunedLocalIdb: number;
  prunedOrphanFolders: number;
  tombstonesRegistered: number;
  finalHealthyCount: number;
  logs: string[];
}

