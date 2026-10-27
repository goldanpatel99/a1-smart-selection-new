import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  ArrowLeft,
  FolderUp,
  FolderPlus,
  Eye,
  EyeOff,
  Trash2,
  Image as ImageIcon,
  CheckCircle2,
  ExternalLink,
  Copy,
  Layers,
  AlertTriangle,
  FolderOpen,
  Info,
  Filter,
  UploadCloud,
  RefreshCw,
  Minimize2,
  Maximize2,
  Cloud,
  HardDrive,
  FileQuestion,
} from 'lucide-react';
import { compressAndWatermarkImage } from '../utils/imageCompressor';
import { Photo, PhotoFolder } from '../types';
import { cloudSyncQueue, CloudSyncProgress } from '../utils/cloudSyncQueue';
import { idbStorage } from '../utils/idbStorage';
import { usePhotoSrc } from '../utils/photoSrcResolver';
import { shouldFlushBuffer } from '../utils/uploadBuffer';

// Structure for live upload confirmation card
export interface UploadConfirmationItem {
  id: string;
  filename: string;
  folderName: string;
  thumbnailUrl: string;
  url: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface FailedUploadItem {
  filename: string;
  reason: string;
}

const GENERIC_FOLDER_NAMES = new Set([
  'selected',
  'jpg',
  'jpeg',
  'edited',
  'export',
  'exports',
  'final',
  'web',
  'preview',
  'all',
  'all folders',
  'all photos',
  'photos',
  'raw',
]);

const RAW_EXTENSION_REGEX = /\.(arw|cr2|nef|dng|raw|orf|rw2|pef|raf|srw|cr3)$/i;
const SUPPORTED_IMAGE_REGEX = /\.(jpe?g|png|webp|heic|heif)$/i;

/**
 * Shared folder derivation logic used by BOTH file picker and drag-drop.
 * Resolves directly containing folder; if generic (e.g. 'Selected'), traverses up to parent.
 * Loose files fallback to selectedFolder, firstFolder, or 'Photos'.
 * Never returns 'all'.
 */
export function deriveFolderName(
  relativePath: string,
  selectedFolderName?: string,
  firstFolderName?: string
): string {
  if (!relativePath) {
    if (selectedFolderName && !GENERIC_FOLDER_NAMES.has(selectedFolderName.toLowerCase().trim())) {
      return selectedFolderName;
    }
    return firstFolderName && !GENERIC_FOLDER_NAMES.has(firstFolderName.toLowerCase().trim())
      ? firstFolderName
      : 'Photos';
  }

  const parts = relativePath.split(/[/\\]/).filter(Boolean);

  if (parts.length <= 1) {
    if (selectedFolderName && !GENERIC_FOLDER_NAMES.has(selectedFolderName.toLowerCase().trim())) {
      return selectedFolderName;
    }
    return firstFolderName && !GENERIC_FOLDER_NAMES.has(firstFolderName.toLowerCase().trim())
      ? firstFolderName
      : 'Photos';
  }

  // Search backwards from the parent of the file (parts.length - 2)
  for (let i = parts.length - 2; i >= 0; i--) {
    const candidate = parts[i].trim();
    const cleanLower = candidate.toLowerCase();
    if (!GENERIC_FOLDER_NAMES.has(cleanLower)) {
      return candidate;
    }
  }

  if (selectedFolderName && !GENERIC_FOLDER_NAMES.has(selectedFolderName.toLowerCase().trim())) {
    return selectedFolderName;
  }
  return firstFolderName && !GENERIC_FOLDER_NAMES.has(firstFolderName.toLowerCase().trim())
    ? firstFolderName
    : 'Photos';
}

// Helper to exhaustively read all entries from DirectoryReader
async function readAllEntriesFromReader(reader: any): Promise<any[]> {
  const allEntries: any[] = [];
  while (true) {
    const batch: any[] = await new Promise((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (!batch || batch.length === 0) break;
    allEntries.push(...batch);
  }
  return allEntries;
}

// Recursively scan FileSystemEntry preserving relative path
async function scanDirectoryEntry(
  entry: any,
  pathPrefix = ''
): Promise<{ file: File; relativePath: string }[]> {
  const currentPath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
  if (entry.isFile) {
    try {
      const file: File = await new Promise((res, rej) => entry.file(res, rej));
      return [{ file, relativePath: currentPath }];
    } catch {
      return [];
    }
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    const entries = await readAllEntriesFromReader(reader);
    const results: { file: File; relativePath: string }[] = [];
    for (const child of entries) {
      const sub = await scanDirectoryEntry(child, currentPath);
      results.push(...sub);
    }
    return results;
  }
  return [];
}

/**
 * Grid Photo Card: renders local photo from IDB blob and remote from R2 HTTPS
 */
const UploadGridPhotoCard: React.FC<{
  photo: Photo;
  onDelete: () => void;
}> = ({ photo, onDelete }) => {
  const src = usePhotoSrc(photo, 'thumb');

  return (
    <div className="group relative rounded-2xl overflow-hidden aspect-[4/5] bg-neutral-950 border border-neutral-800 hover:border-amber-500/40 transition shadow-sm">
      {src ? (
        <img
          src={src}
          alt={photo.filename}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-neutral-900 text-neutral-600">
          <ImageIcon className="w-6 h-6 opacity-40 animate-pulse" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80 group-hover:opacity-100 transition-opacity pointer-events-none" />

      {/* Sync Status Badge */}
      {photo.syncStatus && photo.syncStatus !== 'synced' && (
        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-sm border border-neutral-700 text-[9px] font-mono text-amber-300">
          {photo.syncStatus === 'uploading' ? 'Syncing...' : photo.syncStatus === 'failed' ? 'Failed' : 'Local'}
        </div>
      )}

      {/* Delete photo button */}
      <button
        type="button"
        onClick={onDelete}
        className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-neutral-400 hover:text-rose-400 hover:bg-black/90 opacity-60 group-hover:opacity-100 transition-opacity"
        title="Delete photo permanently"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      {/* Bottom info */}
      <div className="absolute bottom-2 left-2 right-2 truncate">
        <p className="text-[10px] font-mono text-white truncate drop-shadow">
          {photo.filename}
        </p>
      </div>
    </div>
  );
};

const ConfirmationPhotoCard: React.FC<{ item: UploadConfirmationItem }> = ({ item }) => {
  const photoModel = useMemo<Photo>(() => ({
    id: item.id,
    folderId: '',
    folderName: item.folderName,
    filename: item.filename,
    originalName: item.filename,
    url: item.url,
    thumbnailUrl: item.thumbnailUrl,
    sizeBytes: item.sizeBytes,
    isSelected: false,
    uploadedAt: item.uploadedAt,
  }), [item.id, item.folderName, item.filename, item.url, item.thumbnailUrl, item.sizeBytes, item.uploadedAt]);

  const src = usePhotoSrc(photoModel, 'thumb');

  return (
    <div className="group relative aspect-square rounded-xl overflow-hidden bg-neutral-950 border border-emerald-500/40 shadow-sm animate-in fade-in zoom-in-95">
      {src ? (
        <img
          src={src}
          alt={item.filename}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-neutral-900 text-neutral-600">
          <ImageIcon className="w-5 h-5 opacity-40" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent pointer-events-none" />

      <div className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 text-neutral-950 rounded-full flex items-center justify-center text-[9px] font-extrabold shadow">
        ✓
      </div>

      <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-sm text-[8px] font-semibold text-amber-300 truncate max-w-[70%]">
        {item.folderName}
      </div>

      <div className="absolute bottom-1 left-1 right-1 text-[8px] font-mono text-white truncate drop-shadow">
        {item.filename}
      </div>
    </div>
  );
};

export const PhotoUploadPage: React.FC = () => {
  const {
    events,
    activeEvent,
    activeEventId,
    currentUser,
    navigateTo,
    addFolder,
    deleteFolder,
    toggleFolderVisibility,
    addPhotosToEvent,
    deletePhotoFromEvent,
    showToast,
    refreshEventPhotos,
  } = useApp();

  const folderInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);

  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
  const [newFolderName, setNewFolderName] = useState('');
  const [showAddFolderInput, setShowAddFolderInput] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState({
    current: 0,
    total: 0,
    folder: '',
    speedFps: 0,
  });
  const [applyWatermark, setApplyWatermark] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  // Pagination for 5,000 photos performance
  const [visiblePhotosLimit, setVisiblePhotosLimit] = useState(60);

  // Maximum photo capacity warning modal state
  const [capacityWarning, setCapacityWarning] = useState<{
    current: number;
    attempted: number;
    max: number;
    availableSlots: number;
    pendingCandidates: Array<{ file: File; folderName: string }>;
  } | null>(null);

  // Failed files summary modal state
  const [failedUploadsSummary, setFailedUploadsSummary] = useState<{
    savedCount: number;
    failedList: FailedUploadItem[];
  } | null>(null);

  // Live real-time gallery of confirmed uploaded photos (capped at 80)
  const [confirmedUploads, setConfirmedUploads] = useState<UploadConfirmationItem[]>([]);
  const [confirmationFilterFolder, setConfirmationFilterFolder] = useState<string>('all');
  const [isUploadMinimized, setIsUploadMinimized] = useState(false);
  const [cloudSyncState, setCloudSyncState] = useState<CloudSyncProgress>(() =>
    cloudSyncQueue.getProgress(activeEvent?.id)
  );

  // 1. Subscribe to real-time Cloud Firestore Streaming Queue progress
  useEffect(() => {
    const unsub = cloudSyncQueue.onProgress((progress) => {
      if (!activeEvent || progress.eventId === activeEvent.id || !progress.eventId) {
        setCloudSyncState({ ...progress });
      }
    });
    return unsub;
  }, [activeEvent]);

  // 2. Resume pending uploads on page mount and network online
  useEffect(() => {
    if (activeEvent?.id) {
      cloudSyncQueue.resumePendingUploads(activeEvent.id);
    }

    const handleOnline = () => {
      if (activeEvent?.id) {
        cloudSyncQueue.resumePendingUploads(activeEvent.id);
      }
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [activeEvent?.id]);

  // Dedicated Folder Deletion Modal state
  const [folderToDelete, setFolderToDelete] = useState<PhotoFolder | null>(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);

  const eventFolders = activeEvent?.folders || [];
  const eventPhotos = activeEvent?.photos || [];
  const displayPhotosCount = Math.max(eventPhotos.length, activeEvent?.photosCount || 0);
  const isPhotosLoading = eventPhotos.length === 0 && (activeEvent?.photosCount || 0) > 0;

  // Exact capacity limit without Math.max(..., 5000) hardcoding
  const MAX_EVENT_CAPACITY =
    activeEvent?.maxPhotoCapacity || (activeEvent?.pointTier === 'premium' ? 5000 : 2500);

  // Deduplicated ceremony folders
  const effectiveFolders = useMemo(() => {
    if (!activeEvent) return [];

    const result: PhotoFolder[] = [];
    const seenNames = new Set<string>();
    const seenIds = new Set<string>();

    (eventFolders || []).forEach((f, idx) => {
      const cleanName = (f.name || '').trim();
      if (!cleanName || /^all(\s+folders|\s+photos)?$/i.test(cleanName)) return;
      const lower = cleanName.toLowerCase();
      if (!seenNames.has(lower) && !seenIds.has(f.id)) {
        seenNames.add(lower);
        seenIds.add(f.id);
        result.push({
          id: f.id,
          name: cleanName,
          visible: f.visible !== false,
          order: f.order !== undefined ? f.order : idx,
        });
      }
    });

    (eventPhotos || []).forEach((p) => {
      const rawName = (p.folderName || '').trim();
      if (!rawName || /^all(\s+folders|\s+photos)?$/i.test(rawName)) return;
      const lower = rawName.toLowerCase();
      if (!seenNames.has(lower)) {
        seenNames.add(lower);
        const folderId = p.folderId && !seenIds.has(p.folderId) ? p.folderId : `fld-${lower.replace(/[^a-z0-9]/g, '-')}`;
        seenIds.add(folderId);
        result.push({
          id: folderId,
          name: rawName,
          visible: true,
          order: result.length,
        });
      }
    });

    return result;
  }, [eventFolders, eventPhotos, activeEvent]);

  // Grouped photos by folder
  const photosByFolder = useMemo(() => {
    const map = new Map<string, typeof eventPhotos>();
    effectiveFolders.forEach((f) => map.set(f.id, []));

    eventPhotos.forEach((photo) => {
      let targetId = photo.folderId;
      if (!map.has(targetId)) {
        const matched = effectiveFolders.find(
          (f) => f.name.toLowerCase() === (photo.folderName || '').toLowerCase().trim()
        );
        if (matched) {
          targetId = matched.id;
        } else if (effectiveFolders.length > 0) {
          targetId = effectiveFolders[0].id;
        }
      }
      const list = map.get(targetId);
      if (list) {
        list.push(photo);
      } else {
        map.set(targetId, [photo]);
      }
    });

    return map;
  }, [effectiveFolders, eventPhotos]);

  useEffect(() => {
    if (effectiveFolders.length > 0) {
      const exists = effectiveFolders.some((f) => f.id === selectedFolderId);
      if (!exists && selectedFolderId !== 'all') {
        setSelectedFolderId(effectiveFolders[0].id);
      }
    }
  }, [effectiveFolders, selectedFolderId]);

  const currentSingleFolder =
    selectedFolderId !== 'all'
      ? effectiveFolders.find((f) => f.id === selectedFolderId)
      : null;

  const currentFolderPhotos =
    selectedFolderId === 'all'
      ? eventPhotos
      : eventPhotos.filter(
          (p) =>
            p.folderId === selectedFolderId ||
            (currentSingleFolder &&
              (p.folderName || '').toLowerCase().trim() === currentSingleFolder.name.toLowerCase().trim())
        );

  // Local pending photos count for Sync Health bar
  const localPendingCount = useMemo(() => {
    return eventPhotos.filter((p) => p.syncStatus && p.syncStatus !== 'synced').length;
  }, [eventPhotos]);

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEvent || !newFolderName.trim()) return;
    addFolder(activeEvent.id, newFolderName.trim());
    setNewFolderName('');
    setShowAddFolderInput(false);
  };

  /**
   * High-Speed Concurrent Processor
   * - Saves Blobs to IndexedDB photo_blobs
   * - Enqueues Blobs to cloudSyncQueue (no dataUrl!)
   * - Preserves client crypto.randomUUID()
   * - Tracks duplicates & failed files accurately
   */
  const processFolderUpload = async (items: { file: File; folderName: string }[]) => {
    if (items.length === 0) {
      showToast('No valid photo files detected for upload.', 'error');
      return;
    }

    const failedFiles: FailedUploadItem[] = [];
    const validCandidateFiles: Array<{ file: File; folderName: string }> = [];

    // 1. Separate supported files vs RAW / undecodable files
    for (const item of items) {
      const { file, folderName } = item;
      if (RAW_EXTENSION_REGEX.test(file.name)) {
        failedFiles.push({
          filename: file.name,
          reason: 'RAW file format unsupported. Kripya Lightroom se JPG export karein.',
        });
      } else if (!SUPPORTED_IMAGE_REGEX.test(file.name) && !file.type.startsWith('image/')) {
        failedFiles.push({
          filename: file.name,
          reason: 'Unsupported image format.',
        });
      } else {
        validCandidateFiles.push({ file, folderName });
      }
    }

    if (validCandidateFiles.length === 0 && failedFiles.length > 0) {
      setFailedUploadsSummary({ savedCount: 0, failedList: failedFiles });
      const hasRaw = failedFiles.some((f) => RAW_EXTENSION_REGEX.test(f.filename));
      if (hasRaw) {
        showToast(
          `❌ Sabhi ${failedFiles.length} files fail hue (RAW format). Kripya Lightroom se JPG export karein.`,
          'error'
        );
      } else {
        showToast(
          `❌ Sabhi ${failedFiles.length} files fail hue. Kripya valid photo files select karein.`,
          'error'
        );
      }
      return;
    }

    // 2. Duplicate Guard: skip files with same folder + filename + size
    const existingPhotoSignatures = new Set(
      eventPhotos.map(
        (p) =>
          `${(p.folderName || '').toLowerCase().trim()}|${p.filename.toLowerCase().trim()}|${p.sizeBytes || 0}`
      )
    );

    let duplicatesSkipped = 0;
    const uniqueFiles: Array<{ file: File; folderName: string }> = [];

    for (const item of validCandidateFiles) {
      const sig = `${item.folderName.toLowerCase().trim()}|${item.file.name.toLowerCase().trim()}|${item.file.size}`;
      if (existingPhotoSignatures.has(sig)) {
        duplicatesSkipped++;
      } else {
        uniqueFiles.push(item);
      }
    }

    if (duplicatesSkipped > 0) {
      showToast(`ℹ️ ${duplicatesSkipped} duplicate photos skip kiye gaye.`, 'info');
    }

    if (uniqueFiles.length === 0) {
      if (duplicatesSkipped > 0 && failedFiles.length === 0) {
        showToast('Sabhi selected photos pehle se upload hain (duplicates).', 'info');
      }
      return;
    }

    // 3. Capacity Limit Check: exact maxPhotoCapacity using max(local, cloud)
    const currentCount = Math.max(eventPhotos.length, activeEvent?.photosCount || 0);
    if (currentCount + uniqueFiles.length > MAX_EVENT_CAPACITY) {
      const availableSlots = Math.max(0, MAX_EVENT_CAPACITY - currentCount);
      setCapacityWarning({
        current: currentCount,
        attempted: uniqueFiles.length,
        max: MAX_EVENT_CAPACITY,
        availableSlots,
        pendingCandidates: uniqueFiles,
      });
      return;
    }

    await executeUpload(uniqueFiles, failedFiles);
  };

  /**
   * Execution loop: compresses images, saves to IndexedDB blobs, enqueues to cloud queue
   */
  const executeUpload = async (
    filesToUpload: Array<{ file: File; folderName: string }>,
    preFailedList: FailedUploadItem[] = []
  ) => {
    setIsProcessing(true);
    setIsUploadMinimized(false);
    const startTime = Date.now();
    const targetEventId = activeEvent?.id || activeEventId;
    if (!targetEventId) {
      showToast('No active event found to upload photos.', 'error');
      setIsProcessing(false);
      return;
    }

    let primaryFolder = (filesToUpload[0]?.folderName || '').trim();
    if (!primaryFolder || /^all(\s+folders|\s+photos)?$/i.test(primaryFolder)) {
      primaryFolder = effectiveFolders.length > 0 ? effectiveFolders[0].name : 'Photos';
    }

    setProcessingStatus({
      current: 0,
      total: filesToUpload.length,
      folder: primaryFolder,
      speedFps: 0,
    });

    const CONCURRENCY = 6;
    let totalProcessedSoFar = 0;
    const failedFiles: FailedUploadItem[] = [...preFailedList];
    let successfulProcessedCount = 0;

    let bufferedPhotosToAdd: Array<{
      id: string;
      filename: string;
      originalName: string;
      folderId: string;
      folderName: string;
      url: string;
      thumbnailUrl: string;
      sizeBytes: number;
      width?: number;
      height?: number;
      syncStatus: 'local';
    }> = [];

    let bufferedBlobsToSave: Array<{
      photoId: string;
      eventId: string;
      blob: Blob;
      thumbBlob: Blob;
      sizeBytes: number;
      width?: number;
      height?: number;
    }> = [];

    let bufferedQueueItems: Array<{
      photoId: string;
      filename: string;
      folderId: string;
      folderName: string;
      blob?: Blob;
      thumbBlob?: Blob;
      sizeBytes: number;
      width?: number;
      height?: number;
    }> = [];

    const flushCurrentBatch = async () => {
      if (bufferedPhotosToAdd.length === 0) return;
      const photosToFlush = bufferedPhotosToAdd;
      const blobsToFlush = bufferedBlobsToSave;
      const queueToFlush = bufferedQueueItems;

      bufferedPhotosToAdd = [];
      bufferedBlobsToSave = [];
      bufferedQueueItems = [];

      if (!targetEventId) return;

      try {
        // 1. Save Blobs to dedicated IDB store (single source of truth for Blobs)
        await idbStorage.savePhotoBlobs(blobsToFlush);

        // 2. Add to local App state & IDB event_photos metadata
        const formatted = await addPhotosToEvent(targetEventId, photosToFlush, { skipCloudSync: true });

        // Map matched folderIds to queue items
        const folderMap = new Map<string, string>();
        formatted.forEach((f) => folderMap.set(f.id, f.folderId));
        queueToFlush.forEach((q) => {
          q.folderId = folderMap.get(q.photoId) || q.folderId;
        });

        // 3. Enqueue into Cloud Sync Queue (metadata only, no duplicate blobs!)
        await cloudSyncQueue.enqueueBlobs(targetEventId, queueToFlush);

        // Increment count only AFTER flush succeeds
        successfulProcessedCount += photosToFlush.length;

        // Local ephemeral confirmation card (capped at 80)
        const confirmationCards: UploadConfirmationItem[] = photosToFlush.map((p) => ({
          id: p.id,
          filename: p.filename,
          folderName: p.folderName,
          thumbnailUrl: '',
          url: '',
          sizeBytes: p.sizeBytes,
          uploadedAt: new Date().toLocaleTimeString(),
        }));
        setConfirmedUploads((prev) => [...confirmationCards, ...prev].slice(0, 80));
      } catch (batchErr: any) {
        console.error('Error saving batch locally:', batchErr);
        const errMsg = batchErr?.message || 'Storage error';
        for (const p of photosToFlush) {
          failedFiles.push({
            filename: p.filename,
            reason: `Local save failed: ${errMsg}`,
          });
        }
      }
    };

    try {
      try {
        for (let i = 0; i < filesToUpload.length; i += CONCURRENCY) {
          const chunk = filesToUpload.slice(i, i + CONCURRENCY);

          const results = await Promise.all(
            chunk.map(async ({ file, folderName }) => {
              let cleanFolder = (folderName || '').trim();
              if (!cleanFolder || /^all(\s+folders|\s+photos)?$/i.test(cleanFolder)) {
                cleanFolder = primaryFolder;
              }

              try {
                const compressed = await compressAndWatermarkImage(file, {
                  maxWidth: 1000,
                  maxHeight: 800,
                  quality: 0.6,
                  watermarkText: applyWatermark
                    ? currentUser?.watermarkText || currentUser?.studioName?.toUpperCase() || 'PREVIEW'
                    : '',
                  watermarkPosition: currentUser?.watermarkPosition || 'bottom-right',
                  watermarkOpacity: currentUser?.watermarkOpacity || 0.35,
                });

                totalProcessedSoFar++;
                const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
                const speedFps = Math.round((totalProcessedSoFar / elapsedSec) * 10) / 10;

                setProcessingStatus({
                  current: Math.min(filesToUpload.length, totalProcessedSoFar),
                  total: filesToUpload.length,
                  folder: cleanFolder,
                  speedFps,
                });

                // Generate persistent client id
                const photoId = crypto.randomUUID();

                return {
                  photoId,
                  file,
                  cleanFolder,
                  compressed,
                };
              } catch (err: any) {
                console.error('Failed to compress file', file.name, err);
                totalProcessedSoFar++;
                failedFiles.push({
                  filename: file.name,
                  reason: err?.message || 'Compression error',
                });
                return null;
              }
            })
          );

          const validResults = results.filter(Boolean) as Array<{
            photoId: string;
            file: File;
            cleanFolder: string;
            compressed: any;
          }>;

          if (validResults.length > 0) {
            for (const item of validResults) {
              const { photoId, file, cleanFolder, compressed } = item;

              // Photo metadata (NO blob: or data: URLs stored persistently in IDB/Firestore)
              bufferedPhotosToAdd.push({
                id: photoId,
                filename: file.name,
                originalName: file.name,
                folderId: '',
                folderName: cleanFolder,
                url: '',
                thumbnailUrl: '',
                sizeBytes: compressed.sizeBytes,
                width: compressed.width,
                height: compressed.height,
                syncStatus: 'local',
              });

              // Actual Blobs for IDB dedicated store
              bufferedBlobsToSave.push({
                photoId,
                eventId: targetEventId,
                blob: compressed.blob,
                thumbBlob: compressed.thumbBlob,
                sizeBytes: compressed.sizeBytes,
                width: compressed.width,
                height: compressed.height,
              });

              // Queue items for Cloud Sync
              bufferedQueueItems.push({
                photoId,
                filename: file.name,
                folderId: '',
                folderName: cleanFolder,
                sizeBytes: compressed.sizeBytes,
                width: compressed.width,
                height: compressed.height,
              });
            }
          }

          // Flush decision: if buffer size >= 24 OR it is final chunk
          const isFinalChunk = i + CONCURRENCY >= filesToUpload.length;
          if (shouldFlushBuffer(bufferedPhotosToAdd.length, isFinalChunk, 24)) {
            await flushCurrentBatch();
          }

          // Micro-yield to keep UI responsive
          await new Promise((r) => setTimeout(r, 0));
        }
      } finally {
        // Guaranteed flush of any remaining leftovers after loop
        if (bufferedPhotosToAdd.length > 0) {
          await flushCurrentBatch();
        }
      }

      setProcessingStatus((prev) => ({
        ...prev,
        current: filesToUpload.length,
        speedFps: 0,
      }));

      // Accurate notification
      if (failedFiles.length > 0) {
        setFailedUploadsSummary({ savedCount: successfulProcessedCount, failedList: failedFiles });
        const allRawFailures = failedFiles.length > 0 && failedFiles.every((f) => RAW_EXTENSION_REGEX.test(f.filename));
        if (allRawFailures) {
          showToast(
            `⚠️ ${successfulProcessedCount} photos save hue. ${failedFiles.length} photos fail hue (RAW format). Kripya Lightroom se JPG export karein.`,
            'info'
          );
        } else {
          showToast(
            `⚠️ ${successfulProcessedCount} photos save hue. ${failedFiles.length} files fail hue, list neeche dekhein.`,
            'info'
          );
        }
      } else {
        showToast(
          `🎉 Sabhi ${successfulProcessedCount} photos local cache me save ho chuke hain! Cloud sync parallel chal raha hai.`,
          'success'
        );
      }
    } catch (err: any) {
      console.error('Upload process error:', err);
      showToast('Upload me koi dikkat aayi, kripya dobara try karein.', 'error');
    } finally {
      setTimeout(() => {
        if (!cloudSyncQueue.isSyncing(targetEventId)) {
          setIsProcessing(false);
        }
      }, 1500);

      if (targetEventId) {
        refreshEventPhotos(targetEventId).catch(() => {});
      }
    }
  };

  // Handler for directory / multi-folder file input
  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const items: { file: File; folderName: string }[] = [];
    const firstFolder = effectiveFolders.length > 0 ? effectiveFolders[0].name : 'Photos';
    const selectedFolder = currentSingleFolder ? currentSingleFolder.name : undefined;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const folderName = deriveFolderName(file.webkitRelativePath, selectedFolder, firstFolder);
      items.push({ file, folderName });
    }

    if (items.length === 0) {
      showToast('Selected folder has no valid image files.', 'error');
      return;
    }

    processFolderUpload(items);

    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
  };

  // Handler for loose photos multi-file input
  const handlePhotosInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const firstFolder = effectiveFolders.length > 0 ? effectiveFolders[0].name : 'Photos';
    const targetFolder = currentSingleFolder?.name || firstFolder;
    const items: { file: File; folderName: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      items.push({
        file: files[i],
        folderName: targetFolder,
      });
    }

    if (items.length === 0) {
      showToast('No valid photos selected.', 'error');
      return;
    }

    processFolderUpload(items);

    if (filesInputRef.current) {
      filesInputRef.current.value = '';
    }
  };

  // Drag & Drop Handler: synchronously calls webkitGetAsEntry()/getAsFile() for ALL items first
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const dataTransferItems = e.dataTransfer.items;
    if (!dataTransferItems || dataTransferItems.length === 0) {
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const firstFolder = effectiveFolders.length > 0 ? effectiveFolders[0].name : 'Photos';
        const targetFolder = currentSingleFolder?.name || firstFolder;
        const items = Array.from(e.dataTransfer.files).map((file) => ({
          file,
          folderName: targetFolder,
        }));
        processFolderUpload(items);
      }
      return;
    }

    // CRITICAL: Call webkitGetAsEntry()/getAsFile() for ALL items synchronously first
    const entries: any[] = [];
    const directFiles: File[] = [];

    for (let i = 0; i < dataTransferItems.length; i++) {
      const item = dataTransferItems[i];
      if (item.kind !== 'file') continue;
      const entry = (item as any).webkitGetAsEntry ? (item as any).webkitGetAsEntry() : null;
      if (entry) {
        entries.push(entry);
      } else {
        const file = item.getAsFile();
        if (file) directFiles.push(file);
      }
    }

    const firstFolder = effectiveFolders.length > 0 ? effectiveFolders[0].name : 'Photos';
    const selectedFolder = currentSingleFolder ? currentSingleFolder.name : undefined;
    const collectedFiles: { file: File; folderName: string }[] = [];

    // Scan entries asynchronously
    for (const entry of entries) {
      const scanned = await scanDirectoryEntry(entry);
      for (const item of scanned) {
        const folderName = deriveFolderName(item.relativePath, selectedFolder, firstFolder);
        collectedFiles.push({ file: item.file, folderName });
      }
    }

    // Direct files
    for (const file of directFiles) {
      const folderName = deriveFolderName('', selectedFolder, firstFolder);
      collectedFiles.push({ file, folderName });
    }

    if (collectedFiles.length === 0) {
      showToast('No valid photos found in the dropped items.', 'error');
      return;
    }

    processFolderUpload(collectedFiles);
  };

  const filteredConfirmations = useMemo(() => {
    if (confirmationFilterFolder === 'all') return confirmedUploads;
    return confirmedUploads.filter((item) => item.folderName === confirmationFilterFolder);
  }, [confirmedUploads, confirmationFilterFolder]);

  const confirmedFolderNames = useMemo(() => {
    return Array.from(new Set(confirmedUploads.map((c) => c.folderName)));
  }, [confirmedUploads]);

  if (!activeEvent) {
    const userEvents = events.filter((e) =>
      currentUser?.role === 'admin'
        ? true
        : e.photographerId === currentUser?.id ||
          (Boolean(currentUser?.email) &&
            (e as any).photographerEmail?.toLowerCase() === currentUser?.email?.toLowerCase())
    );

    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center animate-in fade-in">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-4">
          <FolderOpen className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2 font-heading">Kripya Event Select Karein</h2>
        <p className="text-sm text-neutral-400 mb-6">
          Photos upload karne ke liye apna event select karein ya Dashboard par jaakar naya event banayein.
        </p>

        {userEvents.length > 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 text-left mb-6 shadow-xl">
            <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">
              Aapke Events ({userEvents.length}):
            </h3>
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {userEvents.map((evt) => (
                <div
                  key={evt.id}
                  onClick={() => navigateTo('photo-upload', evt.id)}
                  className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 hover:border-amber-500/50 cursor-pointer flex items-center justify-between transition group"
                >
                  <div>
                    <h4 className="text-sm font-bold text-white group-hover:text-amber-400 transition">
                      {evt.title}
                    </h4>
                    <p className="text-xs text-neutral-400">
                      Couple: <strong className="text-neutral-300">{evt.coupleName}</strong> •{' '}
                      {evt.photosCount || evt.photos?.length || 0} photos
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-amber-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    Upload Photos →
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => navigateTo('dashboard')}
            className="px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-semibold transition"
          >
            ← Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in">
      {/* Top Breadcrumb & Action Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-neutral-800">
        <div>
          <button
            onClick={() => navigateTo('dashboard')}
            className="flex items-center gap-2 text-xs font-semibold text-neutral-400 hover:text-white transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Dashboard / Events</span>
          </button>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-white tracking-tight">
              {activeEvent.title}
            </h1>
            <span className="text-xs px-2.5 py-1 rounded-full font-bold border bg-amber-500/20 text-amber-300 border-amber-500/40">
              ⚡ {MAX_EVENT_CAPACITY.toLocaleString()} Photos Capacity
            </span>
            <span className="text-xs text-neutral-400 font-mono">
              {displayPhotosCount} / {MAX_EVENT_CAPACITY} Photos
            </span>
          </div>

          <p className="text-xs text-neutral-400 mt-1">
            Couple: <strong className="text-white">{activeEvent.coupleName}</strong> • Phone:{' '}
            <strong className="text-white">{activeEvent.clientPhone}</strong>
          </p>
        </div>

        {/* Top Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              const url = `${window.location.origin}/#gallery/${activeEvent.slug || activeEvent.id}`;
              navigator.clipboard.writeText(url);
              showToast('Client link copied to clipboard!', 'success');
            }}
            className="px-4 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs font-semibold flex items-center gap-2 transition"
          >
            <Copy className="w-3.5 h-3.5 text-amber-400" />
            <span>Copy Link</span>
          </button>

          <button
            onClick={() => navigateTo('client-gallery', activeEvent.id)}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300 hover:from-amber-400 hover:to-amber-200 text-neutral-950 text-xs font-extrabold flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all hover:scale-105"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Preview Client Gallery</span>
          </button>
        </div>
      </div>

      {/* Sync Health Row */}
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-4 sm:p-5 mt-6 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Cloud Sync Health
              </h4>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1 text-[11px] text-neutral-400">
                <span>
                  Local saved:{' '}
                  <strong className="text-neutral-200 font-mono">{localPendingCount}</strong>
                </span>
                <span>•</span>
                <span>
                  Uploading:{' '}
                  <strong className="text-amber-400 font-mono">{cloudSyncState.inFlight}</strong>
                </span>
                <span>•</span>
                <span>
                  Synced:{' '}
                  <strong className="text-emerald-400 font-mono">{cloudSyncState.synced}</strong>
                </span>
                {cloudSyncState.failed > 0 && (
                  <>
                    <span>•</span>
                    <span>
                      Failed:{' '}
                      <strong className="text-rose-400 font-mono">{cloudSyncState.failed}</strong>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {cloudSyncState.failed > 0 && (
              <button
                onClick={() => activeEvent?.id && cloudSyncQueue.retryFailed(activeEvent.id)}
                className="px-3.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry Failed ({cloudSyncState.failed})
              </button>
            )}
            <button
              onClick={() => activeEvent?.id && cloudSyncQueue.resumePendingUploads(activeEvent.id)}
              className="px-3.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${cloudSyncState.status === 'syncing' ? 'animate-spin text-amber-400' : ''}`}
              />
              Sync Now
            </button>
          </div>
        </div>

        {cloudSyncState.lastError && (
          <div className="mt-3 pt-3 border-t border-neutral-800/80 flex items-center gap-2 text-xs text-rose-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{cloudSyncState.lastError}</span>
          </div>
        )}
      </div>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mt-6">
        {/* Left Column: Folders Navigation & Creation */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-4 sm:p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white font-heading flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>Folders ({effectiveFolders.length})</span>
              </h3>

              <button
                type="button"
                onClick={() => setShowAddFolderInput(!showAddFolderInput)}
                className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                + Custom
              </button>
            </div>

            {showAddFolderInput && (
              <form onSubmit={handleCreateFolder} className="mb-3 animate-in fade-in">
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ring Ceremony"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs rounded-xl shadow"
                  >
                    Add
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-1.5">
              <div
                onClick={() => setSelectedFolderId('all')}
                className={`group px-3 py-2 rounded-xl cursor-pointer flex items-center justify-between transition-all ${
                  selectedFolderId === 'all'
                    ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold shadow-sm'
                    : 'hover:bg-neutral-800 text-neutral-300'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Layers className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span className="text-xs truncate font-medium">All Folders</span>
                </div>
                <span className="text-[10px] bg-neutral-950 px-1.5 py-0.5 rounded-full font-mono text-neutral-400">
                  {eventPhotos.length}
                </span>
              </div>

              {effectiveFolders.map((folder) => {
                const folderPhotosCount = eventPhotos.filter(
                  (p) =>
                    p.folderId === folder.id ||
                    (p.folderName || '').toLowerCase().trim() === folder.name.toLowerCase().trim()
                ).length;
                const isSelected = selectedFolderId === folder.id;

                return (
                  <div
                    key={folder.id}
                    onClick={() => setSelectedFolderId(folder.id)}
                    className={`group px-3 py-2 rounded-xl cursor-pointer flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold shadow-sm'
                        : 'hover:bg-neutral-800 text-neutral-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FolderOpen className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <span className="text-xs truncate font-medium">{folder.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] bg-neutral-950 px-1.5 py-0.5 rounded-full font-mono text-neutral-400">
                        {folderPhotosCount}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFolderVisibility(activeEvent.id, folder.id);
                        }}
                        className="text-neutral-500 hover:text-white p-0.5"
                        title={folder.visible ? 'Visible to client' : 'Hidden from client'}
                      >
                        {folder.visible ? (
                          <Eye className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5 text-neutral-500" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFolderToDelete(folder);
                        }}
                        className="text-neutral-500 hover:text-rose-400 p-0.5 opacity-70 group-hover:opacity-100 transition-opacity"
                        title="Delete folder permanently"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {effectiveFolders.length === 0 && (
              <div className="py-6 text-center text-neutral-500 text-xs">
                No folders yet. Upload multiple folders to automatically create them!
              </div>
            )}
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800 rounded-3xl p-4 text-xs text-neutral-400 space-y-2">
            <div className="flex items-center gap-2 text-white font-bold text-[11px]">
              <Info className="w-3.5 h-3.5 text-amber-400" />
              <span>Multi-Folder Upload Tip:</span>
            </div>
            <p className="text-[11px] leading-relaxed text-neutral-300">
              Aap ek sath multiple folders (Haldi, Mehndi, Reception) drag & drop kar sakte hain ya select kar sakte hain.
            </p>
          </div>
        </div>

        {/* Right Column: Multi-Folder Upload Zone & Photos View */}
        <div className="lg:col-span-3 space-y-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`relative rounded-3xl border-2 border-dashed p-6 sm:p-8 text-center transition-all ${
              isDragging
                ? 'border-amber-400 bg-amber-500/10 scale-[0.99]'
                : 'border-neutral-800 bg-neutral-900/80 hover:border-neutral-700'
            }`}
          >
            <input
              ref={folderInputRef}
              type="file"
              // @ts-ignore
              webkitdirectory=""
              // @ts-ignore
              directory=""
              multiple
              className="hidden"
              onChange={handleFolderInputChange}
            />
            <input
              ref={filesInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotosInputChange}
            />

            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto mb-3 shadow-inner">
              <FolderUp className="w-8 h-8" />
            </div>

            <h3 className="text-xl font-bold text-white font-heading mb-1">
              Upload Multiple Folders or Photos
            </h3>
            <p className="text-xs text-neutral-300 max-w-lg mx-auto mb-2">
              Computer se <strong className="text-amber-400">ek sath multiple folders</strong> (e.g.{' '}
              <span className="text-amber-300 font-semibold">Haldi</span>,{' '}
              <span className="text-amber-300 font-semibold">Mehndi</span>,{' '}
              <span className="text-amber-300 font-semibold">Reception</span>) drag & drop karein ya select karein.
            </p>
            <p className="text-[11px] text-neutral-400 mb-5">
              ⚡ Hardware-accelerated local ingestion • Automatic folder separation
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => folderInputRef.current?.click()}
                className="px-6 py-3.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300 hover:from-amber-400 hover:to-amber-200 text-neutral-950 font-extrabold text-sm rounded-2xl shadow-xl shadow-amber-500/20 hover:scale-105 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <FolderOpen className="w-5 h-5 text-neutral-950" />
                <span>Select Folder / Multi-Folders</span>
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => filesInputRef.current?.click()}
                className="px-5 py-3.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white font-bold text-xs rounded-2xl transition flex items-center gap-2 disabled:opacity-50"
              >
                <UploadCloud className="w-4 h-4 text-amber-400" />
                <span>
                  Select Photos ({currentSingleFolder ? currentSingleFolder.name : 'Current Folder'})
                </span>
              </button>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-neutral-400">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={applyWatermark}
                  onChange={(e) => setApplyWatermark(e.target.checked)}
                  className="rounded border-neutral-700 text-amber-500 focus:ring-0"
                />
                <span>
                  Apply Studio Watermark (
                  {currentUser?.watermarkText || currentUser?.studioName || 'STUDIO'})
                </span>
              </label>
            </div>

            {/* Live Uploading Progress Overlay */}
            {isProcessing && !isUploadMinimized && (
              <div className="absolute inset-0 bg-neutral-950/95 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center p-6 z-30 animate-in fade-in">
                <div className="w-full flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 font-mono font-bold px-2.5 py-0.5 rounded border border-amber-500/30">
                      ⚡ Immediate Parallel Cloud Sync
                    </span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono font-bold px-2.5 py-0.5 rounded border border-emerald-500/30">
                      ✓ 2,500–5,000 Safe
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsUploadMinimized(true)}
                    className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>Minimize</span>
                  </button>
                </div>

                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-2 shadow-lg">
                  {processingStatus.current >= processingStatus.total &&
                  processingStatus.total > 0 &&
                  (cloudSyncState.status === 'completed' || cloudSyncState.total === 0) ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <div className="w-6 h-6 border-3 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>

                <div className="text-base font-extrabold text-white font-heading mb-0.5 text-center">
                  {processingStatus.current >= processingStatus.total &&
                  processingStatus.total > 0 &&
                  (cloudSyncState.status === 'completed' || cloudSyncState.total === 0)
                    ? `✓ Sabhi Photos Upload & Cloud Sync Ho Gaye!`
                    : `Uploading to Folder: "${processingStatus.folder}"`}
                </div>

                <p className="text-xs text-neutral-400 mb-4 text-center max-w-md">
                  Photos compress hote hi local IndexedDB aur Cloud Firestore me stream ho rahe hain.
                </p>

                <div className="w-full max-w-lg space-y-3.5 bg-neutral-900/80 p-4 rounded-2xl border border-neutral-800 mb-4 shadow-inner">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-bold text-amber-300 flex items-center gap-1.5">
                        <HardDrive className="w-3.5 h-3.5 text-amber-400" />
                        <span>1. Local Ingestion & Compression</span>
                      </span>
                      <span className="font-mono text-neutral-300">
                        {processingStatus.current} / {processingStatus.total} (
                        {Math.min(
                          100,
                          Math.round(((processingStatus.current || 0) / (processingStatus.total || 1)) * 100)
                        )}
                        %)
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-neutral-950 rounded-full border border-neutral-800 overflow-hidden shadow-inner">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-150 rounded-full"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(2, ((processingStatus.current || 0) / (processingStatus.total || 1)) * 100)
                          )}%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-neutral-400 mt-1">
                      <span>IndexedDB Instant Storage</span>
                      <span>
                        {processingStatus.speedFps > 0
                          ? `Speed: ~${processingStatus.speedFps} photos/sec`
                          : 'Processing...'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                        <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                        <span>2. Cloud R2 & Firestore Real-Time Sync</span>
                      </span>
                      <span className="font-mono text-neutral-300">
                        {cloudSyncState.synced} / {cloudSyncState.total || processingStatus.total || 0} (
                        {cloudSyncState.total > 0
                          ? Math.min(100, Math.round(((cloudSyncState.synced || 0) / cloudSyncState.total) * 100))
                          : processingStatus.current >= processingStatus.total && processingStatus.total > 0
                          ? 100
                          : 0}
                        %)
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-neutral-950 rounded-full border border-neutral-800 overflow-hidden shadow-inner">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-300 transition-all duration-150 rounded-full"
                        style={{
                          width: `${
                            cloudSyncState.total > 0
                              ? Math.min(100, Math.max(2, ((cloudSyncState.synced || 0) / cloudSyncState.total) * 100))
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-neutral-400 mt-1">
                      <span className="flex items-center gap-1">
                        {cloudSyncState.inFlight > 0 ? (
                          <span className="text-emerald-400 font-mono">
                            ⚡ {cloudSyncState.inFlight} parallel streams active
                          </span>
                        ) : cloudSyncState.status === 'completed' ? (
                          <span className="text-emerald-400 font-semibold">✓ 100% Cloud Synced</span>
                        ) : (
                          <span>Streaming to cloud queue...</span>
                        )}
                      </span>
                      <span>
                        {cloudSyncState.speedFps > 0
                          ? `Cloud Speed: ~${cloudSyncState.speedFps} synced/sec`
                          : ''}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsUploadMinimized(true)}
                    className="text-xs font-semibold text-amber-300 hover:text-white px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition flex items-center gap-1.5"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>Run in Background</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsProcessing(false)}
                    className="text-xs text-neutral-400 hover:text-white px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* REAL-TIME UPLOAD CONFIRMATION GALLERY (Capped at 80 items) */}
          {confirmedUploads.length > 0 && (
            <div className="bg-neutral-900/90 border border-emerald-500/30 rounded-3xl p-5 shadow-2xl animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Live Upload Confirmation Gallery</span>
                      <span className="text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-full font-mono font-bold">
                        {confirmedUploads.length} Confirmed
                      </span>
                    </h3>
                    <p className="text-[11px] text-neutral-400">
                      Visual confirmation: Ye photos successfully ingest ho chuke hain aur website par save hain.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfirmedUploads([])}
                    className="text-[11px] text-neutral-500 hover:text-neutral-300 px-2 py-1 rounded hover:bg-neutral-800"
                  >
                    Clear Confirmation View
                  </button>
                </div>
              </div>

              {confirmedFolderNames.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto py-2.5 scrollbar-none">
                  <span className="text-[11px] text-neutral-400 mr-1 flex items-center gap-1">
                    <Filter className="w-3 h-3" /> Filter:
                  </span>
                  <button
                    onClick={() => setConfirmationFilterFolder('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                      confirmationFilterFolder === 'all'
                        ? 'bg-emerald-500 text-neutral-950'
                        : 'bg-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    All ({confirmedUploads.length})
                  </button>
                  {confirmedFolderNames.map((fName) => {
                    const count = confirmedUploads.filter((c) => c.folderName === fName).length;
                    return (
                      <button
                        key={fName}
                        onClick={() => setConfirmationFilterFolder(fName)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 ${
                          confirmationFilterFolder === fName
                            ? 'bg-emerald-500 text-neutral-950'
                            : 'bg-neutral-800 text-neutral-400 hover:text-white'
                        }`}
                      >
                        <span>📁 {fName}</span>
                        <span className="font-mono text-[10px]">({count})</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5 mt-3 max-h-80 overflow-y-auto pr-1">
                {filteredConfirmations.map((item) => (
                  <ConfirmationPhotoCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}

          {/* FOLDERS & PHOTOS DISPLAY WITH PAGINATION */}
          <div className="space-y-6">
            {selectedFolderId === 'all' ? (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-amber-400" />
                    <h2 className="text-base font-bold text-white font-heading">Folders & Photos</h2>
                    <span className="text-xs px-2 py-0.5 bg-neutral-800 text-neutral-300 rounded-full font-mono">
                      {displayPhotosCount} Total Photos • {effectiveFolders.length} Folders
                    </span>
                  </div>
                </div>

                {isPhotosLoading ? (
                  <div className="text-center py-12 bg-neutral-900/40 border border-amber-500/30 rounded-3xl animate-pulse">
                    <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-xs font-semibold text-amber-300">
                      Cloud se photos sync ho rahi hain ({displayPhotosCount} photos)...
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-1">
                      Kripya thoda sa intezar karein, photos load hote hi folders yahan appear honge.
                    </p>
                  </div>
                ) : effectiveFolders.length === 0 ? (
                  <div className="text-center py-12 bg-neutral-900/40 border border-neutral-800 rounded-3xl">
                    <FolderOpen className="w-10 h-10 text-neutral-600 mx-auto mb-2" />
                    <p className="text-xs text-neutral-400">Abhi tak koi photo folder upload nahi hua hai.</p>
                    <p className="text-[11px] text-neutral-500 mt-1">
                      Upar diye gaye dropzone mein apne wedding folders drop karein.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {effectiveFolders.map((folder) => {
                      const photosInThisFolder = photosByFolder.get(folder.id) || [];
                      const visiblePhotos = photosInThisFolder.slice(0, visiblePhotosLimit);
                      const hasMore = photosInThisFolder.length > visiblePhotosLimit;

                      return (
                        <div
                          key={folder.id}
                          className="bg-neutral-900/60 border border-neutral-800 rounded-3xl p-5 shadow-lg"
                        >
                          <div className="flex items-center justify-between pb-3 mb-4 border-b border-neutral-800/80">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                                <FolderOpen className="w-4 h-4" />
                              </div>
                              <div>
                                <h3 className="text-sm font-extrabold text-white font-heading flex items-center gap-2">
                                  <span>{folder.name}</span>
                                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-800 font-mono text-amber-300 font-normal">
                                    {photosInThisFolder.length} photos
                                  </span>
                                </h3>
                                <p className="text-[10px] text-neutral-400">
                                  Folder Status: {folder.visible ? '✓ Client ko dikhega' : '👁️ Client se hidden'}
                                </p>
                              </div>
                            </div>

                            <button
                              onClick={() => setSelectedFolderId(folder.id)}
                              className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-200 transition"
                            >
                              View Only This Folder
                            </button>
                          </div>

                          {photosInThisFolder.length === 0 ? (
                            <div className="py-8 text-center text-xs text-neutral-500">
                              Is folder mein koi photos nahi hain.
                            </div>
                          ) : (
                            <>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                {visiblePhotos.map((photo) => (
                                  <UploadGridPhotoCard
                                    key={photo.id}
                                    photo={photo}
                                    onDelete={async () => {
                                      await deletePhotoFromEvent(activeEvent.id, photo.id);
                                    }}
                                  />
                                ))}
                              </div>

                              {hasMore && (
                                <div className="mt-4 text-center">
                                  <button
                                    onClick={() => setVisiblePhotosLimit((prev) => prev + 60)}
                                    className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition"
                                  >
                                    Load More ({photosInThisFolder.length - visiblePhotosLimit} remaining)
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-5 h-5 text-amber-400" />
                    <h2 className="text-base font-bold text-white font-heading">
                      Folder: "{currentSingleFolder?.name}"
                    </h2>
                    <span className="text-xs font-mono text-neutral-400">
                      ({currentFolderPhotos.length} photos)
                    </span>
                  </div>

                  <button
                    onClick={() => setSelectedFolderId('all')}
                    className="text-xs font-semibold text-amber-400 hover:text-amber-300"
                  >
                    ← View All Folders
                  </button>
                </div>

                {currentFolderPhotos.length === 0 ? (
                  <div className="text-center py-12 bg-neutral-900/40 border border-neutral-800 rounded-3xl">
                    <ImageIcon className="w-10 h-10 text-neutral-600 mx-auto mb-2" />
                    <p className="text-xs text-neutral-400">No photos in this folder yet.</p>
                    <p className="text-[11px] text-neutral-500 mt-1">
                      Drag and drop photos or click "Select Photos" to add into "{currentSingleFolder?.name}".
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                      {currentFolderPhotos.slice(0, visiblePhotosLimit).map((photo) => (
                        <UploadGridPhotoCard
                          key={photo.id}
                          photo={photo}
                          onDelete={async () => {
                            await deletePhotoFromEvent(activeEvent.id, photo.id);
                          }}
                        />
                      ))}
                    </div>

                    {currentFolderPhotos.length > visiblePhotosLimit && (
                      <div className="mt-4 text-center">
                        <button
                          onClick={() => setVisiblePhotosLimit((prev) => prev + 60)}
                          className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition"
                        >
                          Load More ({currentFolderPhotos.length - visiblePhotosLimit} remaining)
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Capacity Limit Warning Modal */}
      {capacityWarning && (
        <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-neutral-900 border border-rose-500/40 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h3 className="text-xl font-extrabold text-white font-heading mb-1.5">
              Event Photos Capacity Limit (Max {capacityWarning.max.toLocaleString()})
            </h3>
            <p className="text-xs text-rose-300 font-semibold mb-4">
              In this event, maximum photo limit is{' '}
              {capacityWarning.max === 5000 ? '5,000 (Premium Point)' : '2,500 (Standard Point)'}.
            </p>

            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 text-xs text-left mb-6 space-y-2">
              <div className="flex justify-between text-neutral-400">
                <span>Already uploaded in this event:</span>
                <strong className="text-white font-mono">{capacityWarning.current} photos</strong>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Attempting to upload:</span>
                <strong className="text-rose-400 font-mono">+{capacityWarning.attempted} photos</strong>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Available slots remaining:</span>
                <strong className="text-emerald-400 font-mono">{capacityWarning.availableSlots} photos</strong>
              </div>
              <div className="border-t border-neutral-800 pt-2 flex justify-between font-bold">
                <span className="text-neutral-300">Total would be:</span>
                <span className="text-rose-400 font-mono">
                  {capacityWarning.current + capacityWarning.attempted} / {capacityWarning.max}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              {capacityWarning.availableSlots > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    const toUpload = capacityWarning.pendingCandidates.slice(
                      0,
                      capacityWarning.availableSlots
                    );
                    setCapacityWarning(null);
                    await executeUpload(toUpload);
                  }}
                  className="w-full sm:flex-1 py-3 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-neutral-950 font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition"
                >
                  Upload First {capacityWarning.availableSlots} That Fit
                </button>
              )}
              <button
                type="button"
                onClick={() => setCapacityWarning(null)}
                className="w-full sm:flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs rounded-xl transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undecodable / Failed Files Summary Modal */}
      {failedUploadsSummary && (
        <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-4">
              <FileQuestion className="w-8 h-8" />
            </div>

            <h3 className="text-xl font-extrabold text-white font-heading mb-1.5">
              Upload Summary: {failedUploadsSummary.savedCount} Saved, {failedUploadsSummary.failedList.length} Failed
            </h3>
            <p className="text-xs text-neutral-300 mb-4">
              Camera RAW files (ARW, CR2, NEF, DNG) browser me directly compress nahi ho sakte. Kripya Lightroom se JPG export karke upload karein.
            </p>

            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-3 text-xs text-left mb-6 max-h-48 overflow-y-auto space-y-2">
              {failedUploadsSummary.failedList.map((item, idx) => (
                <div key={idx} className="flex items-start justify-between gap-2 border-b border-neutral-900 pb-1.5">
                  <span className="font-mono text-white truncate max-w-[65%]">{item.filename}</span>
                  <span className="text-[10px] text-rose-400 shrink-0">{item.reason}</span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setFailedUploadsSummary(null)}
              className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs rounded-xl transition"
            >
              Okay, Samajh Gaya
            </button>
          </div>
        </div>
      )}

      {/* Dedicated Folder Deletion Modal */}
      {folderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Folder Permanently?</h3>
                <p className="text-xs text-neutral-400">"{folderToDelete.name}" folder aur uske sabhi photos</p>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed bg-neutral-950 p-3.5 rounded-2xl border border-neutral-800">
              Kya aap sach me folder <strong className="text-white">"{folderToDelete.name}"</strong> aur uske andar ke sabhi photos permanently delete karna chahte hain?
            </p>

            {isDeletingFolder && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center gap-2.5 text-xs text-amber-300">
                <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
                <span>Cloud Firestore confirmation aur deletion ho raha hai...</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeletingFolder}
                onClick={() => setFolderToDelete(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingFolder}
                onClick={async () => {
                  setIsDeletingFolder(true);
                  try {
                    await deleteFolder(activeEvent.id, folderToDelete.id, folderToDelete.name);
                    const remaining = effectiveFolders.filter(
                      (f) =>
                        f.id !== folderToDelete.id &&
                        f.name.toLowerCase().trim() !== folderToDelete.name.toLowerCase().trim()
                    );
                    setSelectedFolderId(remaining.length > 0 ? remaining[0].id : 'all');
                    setFolderToDelete(null);
                  } finally {
                    setIsDeletingFolder(false);
                  }
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-600/30 transition flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeletingFolder ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Permanently</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Background Cloud Sync Pill */}
      {(isProcessing || cloudSyncState.status === 'syncing') && isUploadMinimized && (
        <div className="fixed bottom-6 right-6 z-50 bg-neutral-900/95 border border-emerald-500/40 backdrop-blur-xl p-3.5 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-4">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Cloud className="w-5 h-5 animate-pulse" />
          </div>
          <div className="flex flex-col text-left">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">Background Upload Active</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded font-mono font-bold">
                {cloudSyncState.speedFps > 0 ? `${cloudSyncState.speedFps}/s` : 'Live'}
              </span>
            </div>
            <div className="text-[11px] text-neutral-400 font-mono mt-0.5">
              Local: {Math.round(((processingStatus.current || 0) / (processingStatus.total || 1)) * 100)}% • Cloud:{' '}
              {cloudSyncState.total > 0
                ? Math.round(((cloudSyncState.synced || 0) / cloudSyncState.total) * 100)
                : 0}
              %
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsUploadMinimized(false)}
            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition ml-1"
            title="Maximize upload view"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
