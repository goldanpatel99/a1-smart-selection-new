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
  Sparkles,
  Shield,
  Layers,
  X,
  AlertTriangle,
  FolderCheck,
  FolderOpen,
  Info,
  MessageCircle,
  Zap,
  Filter,
  Check,
  UploadCloud,
  ChevronDown,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { compressAndWatermarkImage } from '../utils/imageCompressor';
import { PhotoFolder } from '../types';

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

// Helper to exhaustively read all entries from a DirectoryReader (handles 100-item batch limits)
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

// Recursively scan dropped FileSystemDirectoryEntry, preserving separate folder names
async function scanDirectoryEntry(
  entry: any,
  inheritedFolderName = ''
): Promise<{ file: File; folderName: string }[]> {
  let currentFolderName = inheritedFolderName || entry.name || '';
  if (/^all(\s+folders|\s+photos)?$/i.test(currentFolderName.trim())) {
    currentFolderName = '';
  }
  const reader = entry.createReader();
  const entries = await readAllEntriesFromReader(reader);
  const results: { file: File; folderName: string }[] = [];

  for (const item of entries) {
    if (item.isFile) {
      try {
        const file: File = await new Promise((res, rej) => item.file(res, rej));
        if (
          file.type.startsWith('image/') ||
          /\.(jpe?g|png|webp|arw|cr2|nef|dng|heic)$/i.test(file.name)
        ) {
          results.push({ file, folderName: currentFolderName || 'Photos' });
        }
      } catch (err) {
        console.warn('Could not read file entry', err);
      }
    } else if (item.isDirectory) {
      // If parent is a generic container like 'Wedding', use the subfolder's ceremony name
      // Otherwise if parent is already a ceremony folder like 'Haldi', keep 'Haldi'
      let subFolderName = item.name;
      if (
        currentFolderName &&
        !/^(wedding|event|photos|gallery|all|all\s+folders)$/i.test(currentFolderName)
      ) {
        subFolderName = currentFolderName;
      }
      const subResults = await scanDirectoryEntry(item, subFolderName);
      results.push(...subResults);
    }
  }

  return results;
}

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

  // Hidden inputs for folders & loose photos
  const folderInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);

  // 'all' represents viewing all folders simultaneously; or a specific folder ID
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

  // Maximum photo capacity warning modal state
  const [capacityWarning, setCapacityWarning] = useState<{
    current: number;
    attempted: number;
    max: number;
  } | null>(null);

  // Live real-time gallery of confirmed uploaded photos
  const [confirmedUploads, setConfirmedUploads] = useState<UploadConfirmationItem[]>([]);
  const [showConfirmationGallery, setShowConfirmationGallery] = useState(false);
  const [confirmationFilterFolder, setConfirmationFilterFolder] = useState<string>('all');

  // Dedicated Folder Deletion Modal state (eliminates unreliable window.confirm in iframes)
  const [folderToDelete, setFolderToDelete] = useState<PhotoFolder | null>(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);

  const eventFolders = activeEvent?.folders || [];
  const eventPhotos = activeEvent?.photos || [];
  const displayPhotosCount = Math.max(eventPhotos.length, activeEvent?.photosCount || 0);
  const isPhotosLoading = eventPhotos.length === 0 && (activeEvent?.photosCount || 0) > 0;

  // Capacity limit based on event tier (2500 Standard, 5000 Premium)
  const MAX_EVENT_CAPACITY =
    activeEvent?.maxPhotoCapacity || (activeEvent?.pointTier === 'premium' ? 5000 : 2500);

  // Clean folders: never include any dummy "All Folders" or "all"
  const effectiveFolders = useMemo(() => {
    const cleanEventFolders = (eventFolders || []).filter(
      (f) => !/^all(\s+folders|\s+photos)?$/i.test(f.name.trim())
    );
    if (cleanEventFolders.length > 0) return cleanEventFolders;
    if (eventPhotos.length === 0) return [];
    const rawFolderNames = Array.from(new Set(eventPhotos.map((p) => (p.folderName || '').trim())));
    const validNames = rawFolderNames.filter(
      (name) => name && !/^all(\s+folders|\s+photos)?$/i.test(name)
    );
    if (validNames.length === 0) return [];
    return validNames.map((name, idx) => ({
      id: `fld-auto-${idx}-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      visible: true,
      order: idx,
    }));
  }, [eventFolders, eventPhotos]);

  // Grouped photos by folder for separated view
  const photosByFolder = useMemo(() => {
    const map = new Map<string, typeof eventPhotos>();
    effectiveFolders.forEach((f) => map.set(f.id, []));

    eventPhotos.forEach((photo) => {
      let targetId = photo.folderId;
      if (!map.has(targetId)) {
        // Fallback: match by folder name
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

  // Auto-select folder when available so user is directly inside their folder
  useEffect(() => {
    if (effectiveFolders.length > 0) {
      const exists = effectiveFolders.some((f) => f.id === selectedFolderId);
      if (!exists && selectedFolderId !== 'all') {
        setSelectedFolderId(effectiveFolders[0].id);
      }
    }
  }, [effectiveFolders, selectedFolderId]);

  // Current folder when a single folder is selected
  const currentSingleFolder =
    selectedFolderId !== 'all'
      ? effectiveFolders.find((f) => f.id === selectedFolderId)
      : null;

  const currentFolderPhotos =
    selectedFolderId === 'all'
      ? eventPhotos
      : eventPhotos.filter((p) => p.folderId === selectedFolderId || (currentSingleFolder && (p.folderName || '').toLowerCase().trim() === currentSingleFolder.name.toLowerCase().trim()));

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEvent || !newFolderName.trim()) return;
    addFolder(activeEvent.id, newFolderName.trim());
    setNewFolderName('');
    setShowAddFolderInput(false);
  };

  // High-Speed Concurrent Processor with per-file live progress & guaranteed completion
  const processFolderUpload = async (items: { file: File; folderName: string }[]) => {
    if (items.length === 0) {
      showToast('No valid photo files detected for upload.', 'error');
      return;
    }

    const currentEventPhotosCount = eventPhotos.length;
    if (currentEventPhotosCount + items.length > MAX_EVENT_CAPACITY) {
      setCapacityWarning({
        current: currentEventPhotosCount,
        attempted: items.length,
        max: MAX_EVENT_CAPACITY,
      });
      return;
    }

    setIsProcessing(true);
    setShowConfirmationGallery(true);
    const startTime = Date.now();

    // Clean primary folder name: never allow "all" or "all folders"
    let primaryFolder = (items[0]?.folderName || '').trim();
    if (!primaryFolder || /^all(\s+folders|\s+photos)?$/i.test(primaryFolder)) {
      primaryFolder = effectiveFolders.length > 0 ? effectiveFolders[0].name : 'Photos';
    }

    setProcessingStatus({
      current: 0,
      total: items.length,
      folder: primaryFolder,
      speedFps: 0,
    });

    const CONCURRENCY = 6;
    let totalProcessedSoFar = 0;
    const targetEventId = activeEvent?.id || activeEventId;

    try {
      for (let i = 0; i < items.length; i += CONCURRENCY) {
        const chunk = items.slice(i, i + CONCURRENCY);

        const results = await Promise.all(
          chunk.map(async ({ file, folderName }) => {
            let cleanFolder = (folderName || '').trim();
            if (!cleanFolder || /^all(\s+folders|\s+photos)?$/i.test(cleanFolder)) {
              cleanFolder = primaryFolder;
            }

            try {
              const compressed = await compressAndWatermarkImage(file, {
                maxWidth: 1100,
                maxHeight: 900,
                quality: 0.65,
                watermarkText: applyWatermark
                  ? currentUser?.watermarkText || currentUser?.studioName?.toUpperCase() || 'PREVIEW'
                  : '',
                watermarkPosition: currentUser?.watermarkPosition || 'bottom-right',
                watermarkOpacity: currentUser?.watermarkOpacity || 0.35,
              });

              totalProcessedSoFar++;
              const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
              const speedFps = Math.round((totalProcessedSoFar / elapsedSec) * 10) / 10;

              // Live per-photo update for accurate real-time reading
              setProcessingStatus({
                current: Math.min(items.length, totalProcessedSoFar),
                total: items.length,
                folder: cleanFolder,
                speedFps,
              });

              return {
                filename: file.name,
                originalName: file.name,
                folderId: '',
                folderName: cleanFolder,
                url: compressed.dataUrl,
                thumbnailUrl: compressed.thumbnailUrl || compressed.dataUrl,
                sizeBytes: compressed.sizeBytes,
              };
            } catch (err) {
              console.error('Failed to compress file', file.name, err);
              totalProcessedSoFar++;
              return null;
            }
          })
        );

        const validPhotos = results.filter(Boolean) as Array<{
          filename: string;
          originalName: string;
          folderId: string;
          folderName: string;
          url: string;
          thumbnailUrl: string;
          sizeBytes: number;
        }>;

        if (validPhotos.length > 0) {
          // 1. Immediately append to live confirmation gallery
          const newConfirmationCards: UploadConfirmationItem[] = validPhotos.map((p, idx) => ({
            id: `up-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
            filename: p.filename,
            folderName: p.folderName,
            thumbnailUrl: p.thumbnailUrl,
            url: p.url,
            sizeBytes: p.sizeBytes,
            uploadedAt: new Date().toLocaleTimeString(),
          }));

          setConfirmedUploads((prev) => [...newConfirmationCards, ...prev]);

          // 2. Incremental batch sync into active event state
          if (targetEventId) {
            try {
              await addPhotosToEvent(targetEventId, validPhotos);
            } catch (batchErr) {
              console.error('Error saving batch to event:', batchErr);
            }
          }
        }
      }

      // 100% complete state
      setProcessingStatus((prev) => ({
        ...prev,
        current: items.length,
        speedFps: 0,
      }));

      // Auto-switch to the uploaded folder
      setTimeout(() => {
        const found = effectiveFolders.find(
          (f) => f.name.toLowerCase().trim() === primaryFolder.toLowerCase().trim()
        );
        if (found) {
          setSelectedFolderId(found.id);
        }
      }, 200);

      showToast(
        `🎉 Sabhi ${items.length} photos successfully upload ho chuke hain!`,
        'success'
      );
    } catch (err) {
      console.error('Upload process error:', err);
      showToast('Upload me koi dikkat aayi, kripya dobara try karein.', 'error');
    } finally {
      // Guaranteed: ALWAYS close the uploading overlay cleanly after short delay
      setTimeout(() => {
        setIsProcessing(false);
      }, 600);

      // Background cloud sync without blocking UI
      if (targetEventId) {
        refreshEventPhotos(targetEventId).catch((e) => {
          console.warn('Background sync error after upload', e);
        });
      }
    }
  };

  // Handler for directory / multi-folder file input
  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const items: { file: File; folderName: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (
        !file.type.startsWith('image/') &&
        !/\.(jpe?g|png|webp|arw|cr2|nef|dng|heic)$/i.test(file.name)
      ) {
        continue;
      }

      // webkitRelativePath contains e.g. "Wedding/01_Haldi/DSC_001.JPG" or "Haldi/DSC_001.JPG"
      const relativePath = file.webkitRelativePath || '';
      const pathParts = relativePath.split('/').filter(Boolean);

      let detectedFolderName = 'Photos';
      if (pathParts.length >= 3) {
        const first = pathParts[0];
        const second = pathParts[1];
        if (/^(wedding|event|photos|gallery|all|all\s+folders)$/i.test(first.trim())) {
          detectedFolderName = second;
        } else {
          detectedFolderName = first;
        }
      } else if (pathParts.length === 2) {
        // Single folder: E.g. "Haldi/file.jpg" -> pick "Haldi"
        detectedFolderName = pathParts[0];
      } else if (currentSingleFolder) {
        detectedFolderName = currentSingleFolder.name;
      }

      // Prevent dummy "all" or "all folders"
      if (!detectedFolderName || /^all(\s+folders|\s+photos)?$/i.test(detectedFolderName.trim())) {
        detectedFolderName = currentSingleFolder ? currentSingleFolder.name : (effectiveFolders.length > 0 ? effectiveFolders[0].name : 'Photos');
      }

      items.push({
        file,
        folderName: detectedFolderName,
      });
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

    const targetFolder = currentSingleFolder?.name || (effectiveFolders.length > 0 ? effectiveFolders[0].name : 'Photos');
    const items: { file: File; folderName: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (
        file.type.startsWith('image/') ||
        /\.(jpe?g|png|webp|arw|cr2|nef|dng|heic)$/i.test(file.name)
      ) {
        items.push({
          file,
          folderName: targetFolder,
        });
      }
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

  // Drag & Drop Handler supporting multiple folders and loose files simultaneously
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const dataTransferItems = e.dataTransfer.items;
    if (!dataTransferItems || dataTransferItems.length === 0) {
      // Fallback for standard files drag
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files).filter(
          (f) =>
            f.type.startsWith('image/') ||
            /\.(jpe?g|png|webp|arw|cr2|nef|dng|heic)$/i.test(f.name)
        );
        const targetFolder = currentSingleFolder?.name || 'Photos';
        const items = files.map((file) => ({ file, folderName: targetFolder }));
        processFolderUpload(items);
      }
      return;
    }

    const collectedFiles: { file: File; folderName: string }[] = [];

    for (let i = 0; i < dataTransferItems.length; i++) {
      const item = dataTransferItems[i];
      const entry = (item as any).webkitGetAsEntry ? (item as any).webkitGetAsEntry() : null;

      if (entry) {
        if (entry.isDirectory) {
          // Dedicated folder scan: each folder keeps its own folder name!
          const folderFiles = await scanDirectoryEntry(entry);
          collectedFiles.push(...folderFiles);
        } else if (entry.isFile) {
          try {
            const file: File = await new Promise((res, rej) => entry.file(res, rej));
            if (
              file.type.startsWith('image/') ||
              /\.(jpe?g|png|webp|arw|cr2|nef|dng|heic)$/i.test(file.name)
            ) {
              const targetFolder = currentSingleFolder?.name || 'Photos';
              collectedFiles.push({ file, folderName: targetFolder });
            }
          } catch (err) {
            console.warn('Error reading loose file', err);
          }
        }
      }
    }

    if (collectedFiles.length === 0) {
      showToast('No valid photos found in the dropped folders/files.', 'error');
      return;
    }

    processFolderUpload(collectedFiles);
  };

  // Filtered confirmation list
  const filteredConfirmations = useMemo(() => {
    if (confirmationFilterFolder === 'all') return confirmedUploads;
    return confirmedUploads.filter((item) => item.folderName === confirmationFilterFolder);
  }, [confirmedUploads, confirmationFilterFolder]);

  // Unique folder names present in confirmed uploads
  const confirmedFolderNames = useMemo(() => {
    return Array.from(new Set(confirmedUploads.map((c) => c.folderName)));
  }, [confirmedUploads]);

  if (!activeEvent) {
    const userEvents = events.filter((e) =>
      currentUser?.role === 'admin'
        ? true
        : e.photographerId === currentUser?.id ||
          (Boolean(currentUser?.email) && (e as any).photographerEmail?.toLowerCase() === currentUser?.email?.toLowerCase())
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

        {userEvents.length > 0 ? (
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
                      Couple: <strong className="text-neutral-300">{evt.coupleName}</strong> • {evt.photosCount || evt.photos?.length || 0} photos
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-amber-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    Upload Photos →
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

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
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
                activeEvent.pointTier === 'premium'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-neutral-800 text-neutral-300 border-neutral-700'
              }`}
            >
              {activeEvent.pointTier === 'premium' ? '⚡ Premium (5,000 Cap)' : 'Standard (2,500 Cap)'}
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
        <div className="flex items-center gap-2.5">
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

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mt-6">
        {/* Left Column: Folders Navigation & Folder Creation */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-4 sm:p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white font-heading flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>Folders ({eventFolders.length})</span>
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

            {/* Custom Folder Input */}
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

            {/* Individual Folders List (Strictly actual ceremony folders) */}
            <div className="space-y-1.5">
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

            {eventFolders.length === 0 && (
              <div className="py-6 text-center text-neutral-500 text-xs">
                No folders yet. Upload multiple folders to automatically create them!
              </div>
            )}
          </div>

          {/* Quick Help Box */}
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

        {/* Right Column: Multi-Folder Upload Zone + Live Confirmation Gallery + Photos View */}
        <div className="lg:col-span-3 space-y-6">
          {/* Multi-Folder Dropzone */}
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
            {/* Hidden Inputs */}
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
              ⚡ Ultra-fast 8x concurrent upload • Automatic folder separation on website
            </p>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => folderInputRef.current?.click()}
                className="px-6 py-3.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300 hover:from-amber-400 hover:to-amber-200 text-neutral-950 font-extrabold text-sm rounded-2xl shadow-xl shadow-amber-500/20 hover:scale-105 transition-all flex items-center gap-2"
              >
                <FolderOpen className="w-5 h-5 text-neutral-950" />
                <span>Select Folder / Multi-Folders</span>
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => filesInputRef.current?.click()}
                className="px-5 py-3.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white font-bold text-xs rounded-2xl transition flex items-center gap-2"
              >
                <UploadCloud className="w-4 h-4 text-amber-400" />
                <span>
                  Select Photos ({currentSingleFolder ? currentSingleFolder.name : 'Current Folder'})
                </span>
              </button>
            </div>

            {/* Studio Watermark Option */}
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
            {isProcessing && (
              <div className="absolute inset-0 bg-neutral-950/95 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center p-6 z-30 animate-in fade-in">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3 shadow-lg">
                  {processingStatus.current >= processingStatus.total && processingStatus.total > 0 ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <div className="w-6 h-6 border-3 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>

                <div className="text-base font-extrabold text-white font-heading mb-1 text-center">
                  {processingStatus.current >= processingStatus.total && processingStatus.total > 0
                    ? `✓ Sabhi Photos Upload Ho Gaye!`
                    : `Uploading to Folder: "${processingStatus.folder}"`}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 font-mono font-bold px-2.5 py-0.5 rounded border border-amber-500/30">
                    ⚡ High-Speed Multi-Threaded Sync
                  </span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono font-bold px-2.5 py-0.5 rounded border border-emerald-500/30">
                    ✓ 100% Cloud Persistence
                  </span>
                  {processingStatus.speedFps > 0 && (
                    <span className="text-[10px] bg-neutral-800 text-neutral-300 font-mono px-2 py-0.5 rounded">
                      Speed: ~{processingStatus.speedFps} photos/sec
                    </span>
                  )}
                </div>

                <div className="text-xs font-mono text-neutral-300 mb-2">
                  Processed <strong className="text-white">{processingStatus.current}</strong> of{' '}
                  <strong className="text-white">{processingStatus.total}</strong> photos (
                  {Math.min(100, Math.round(((processingStatus.current || 0) / (processingStatus.total || 1)) * 100))}%)
                </div>

                {/* Progress bar */}
                <div className="w-full max-w-md h-3 bg-neutral-900 rounded-full border border-neutral-800 overflow-hidden shadow-inner mb-4">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 transition-all duration-200 rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          3,
                          ((processingStatus.current || 0) / (processingStatus.total || 1)) * 100
                        )
                      )}%`,
                    }}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <p className="text-[11px] text-neutral-400">
                    {processingStatus.current >= processingStatus.total && processingStatus.total > 0
                      ? 'Closing overlay and updating folders...'
                      : 'Compressing and saving photos to Cloud Firestore...'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsProcessing(false)}
                    className="text-[10px] text-neutral-400 hover:text-white px-2 py-1 rounded bg-neutral-900 border border-neutral-800 hover:border-neutral-700"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* REAL-TIME UPLOAD CONFIRMATION GALLERY */}
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
                        {confirmedUploads.length} Confirmed Uploaded
                      </span>
                    </h3>
                    <p className="text-[11px] text-neutral-400">
                      Visual confirmation: Ye saare photos successfully upload ho chuke hain aur website par save hain.
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

              {/* Folder filter pills for confirmation grid */}
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

              {/* Confirmation Thumbnails Grid */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5 mt-3 max-h-80 overflow-y-auto pr-1">
                {filteredConfirmations.map((item) => (
                  <div
                    key={item.id}
                    className="group relative aspect-square rounded-xl overflow-hidden bg-neutral-950 border border-emerald-500/40 shadow-sm animate-in fade-in zoom-in-95"
                  >
                    {(item.thumbnailUrl || item.url) ? (
                      <img
                        src={(item.thumbnailUrl || item.url) || undefined}
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

                    {/* Green Verification Checkmark Badge */}
                    <div className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 text-neutral-950 rounded-full flex items-center justify-center text-[9px] font-extrabold shadow">
                      ✓
                    </div>

                    {/* Folder Pill */}
                    <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-sm text-[8px] font-semibold text-amber-300 truncate max-w-[70%]">
                      {item.folderName}
                    </div>

                    {/* File name */}
                    <div className="absolute bottom-1 left-1 right-1 text-[8px] font-mono text-white truncate drop-shadow">
                      {item.filename}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* WEBSITE DISPLAY: FOLDERS & PHOTOS (Separated as uploaded) */}
          <div className="space-y-6">
            {selectedFolderId === 'all' ? (
              // VIEW 1: "ALL FOLDERS" - Each uploaded folder shown separately in its own section!
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-amber-400" />
                    <h2 className="text-base font-bold text-white font-heading">
                      Folders & Photos
                    </h2>
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

                      return (
                        <div
                          key={folder.id}
                          className="bg-neutral-900/60 border border-neutral-800 rounded-3xl p-5 shadow-lg"
                        >
                          {/* Folder Section Header */}
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

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setSelectedFolderId(folder.id)}
                                className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-200 transition"
                              >
                                View Only This Folder
                              </button>
                            </div>
                          </div>

                          {/* Photos Grid for this specific folder */}
                          {photosInThisFolder.length === 0 ? (
                            <div className="py-8 text-center text-xs text-neutral-500">
                              Is folder mein koi photos nahi hain.
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                              {photosInThisFolder.map((photo) => (
                                <div
                                  key={photo.id}
                                  className="group relative rounded-2xl overflow-hidden aspect-[4/5] bg-neutral-950 border border-neutral-800 hover:border-amber-500/40 transition shadow-sm"
                                >
                                  {(photo.thumbnailUrl || photo.url) ? (
                                    <img
                                      src={(photo.thumbnailUrl || photo.url) || undefined}
                                      alt={photo.filename}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-neutral-900 text-neutral-600">
                                      <ImageIcon className="w-6 h-6 opacity-40" />
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80 group-hover:opacity-100 transition-opacity pointer-events-none" />

                                  {/* Delete photo button */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      deletePhotoFromEvent(activeEvent.id, photo.id);
                                      showToast(`Photo "${photo.filename}" deleted`, 'info');
                                    }}
                                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-neutral-400 hover:text-rose-400 hover:bg-black/90 opacity-60 group-hover:opacity-100 transition-opacity"
                                    title="Delete photo"
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
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              // VIEW 2: SINGLE SELECTED FOLDER
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                    {currentFolderPhotos.map((photo) => (
                      <div
                        key={photo.id}
                        className="group relative rounded-2xl overflow-hidden aspect-[4/5] bg-neutral-900 border border-neutral-800 hover:border-amber-500/40 transition shadow-sm"
                      >
                        {(photo.thumbnailUrl || photo.url) ? (
                          <img
                            src={(photo.thumbnailUrl || photo.url) || undefined}
                            alt={photo.filename}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-neutral-900 text-neutral-600">
                            <ImageIcon className="w-6 h-6 opacity-40" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80 group-hover:opacity-100 transition-opacity pointer-events-none" />

                        <button
                          type="button"
                          onClick={() => {
                            deletePhotoFromEvent(activeEvent.id, photo.id);
                            showToast(`Photo "${photo.filename}" deleted`, 'info');
                          }}
                          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-neutral-400 hover:text-rose-400 hover:bg-black/90 opacity-60 group-hover:opacity-100 transition-opacity"
                          title="Delete photo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        <div className="absolute bottom-2 left-2 right-2 truncate">
                          <p className="text-[10px] font-mono text-white truncate drop-shadow">
                            {photo.filename}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
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
              Event Photos Capacity Limit (Max {capacityWarning.max})
            </h3>
            <p className="text-xs text-rose-300 font-semibold mb-4">
              In one event, maximum photo limit is{' '}
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
              <div className="border-t border-neutral-800 pt-2 flex justify-between font-bold">
                <span className="text-neutral-300">Total would be:</span>
                <span className="text-rose-400 font-mono">
                  {capacityWarning.current + capacityWarning.attempted} / {capacityWarning.max}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setCapacityWarning(null)}
              className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs rounded-xl transition"
            >
              Okay, I Understand
            </button>
          </div>
        </div>
      )}

      {/* Dedicated Folder Deletion Modal (Permanent deletion without broken window.confirm) */}
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
              Kya aap sach me folder <strong className="text-white">"{folderToDelete.name}"</strong> aur uske andar ke sabhi photos permanently delete karna chahte hain? Ye photos gallery aur cloud storage se permanently remove ho jayenge.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeletingFolder}
                onClick={() => setFolderToDelete(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 transition"
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
                      (f) => f.id !== folderToDelete.id && f.name !== folderToDelete.name
                    );
                    setSelectedFolderId(remaining.length > 0 ? remaining[0].id : 'all');
                    setFolderToDelete(null);
                  } finally {
                    setIsDeletingFolder(false);
                  }
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-600/30 transition flex items-center gap-1.5"
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
    </div>
  );
};
