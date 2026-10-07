import React, { useState, useRef } from 'react';
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
} from 'lucide-react';
import { compressAndWatermarkImage } from '../utils/imageCompressor';

// Helper to recursively read all files from a dropped FileSystemDirectoryEntry
async function readFilesFromDirectoryEntry(
  dirEntry: any,
  parentPath = ''
): Promise<{ file: File; folderName: string }[]> {
  const currentFolderName = parentPath || dirEntry.name;
  const reader = dirEntry.createReader();

  const readEntries = (): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
  };

  const results: { file: File; folderName: string }[] = [];
  let entries: any[] = await readEntries();

  while (entries.length > 0) {
    for (const entry of entries) {
      if (entry.isFile) {
        const file: File = await new Promise((res, rej) => entry.file(res, rej));
        if (file.type.startsWith('image/') || /\.(jpe?g|png|webp|arw|cr2|nef)$/i.test(file.name)) {
          results.push({ file, folderName: currentFolderName });
        }
      } else if (entry.isDirectory) {
        const subFiles = await readFilesFromDirectoryEntry(entry, entry.name);
        results.push(...subFiles);
      }
    }
    entries = await readEntries();
  }

  return results;
}

export const PhotoUploadPage: React.FC = () => {
  const {
    activeEvent,
    currentUser,
    navigateTo,
    addFolder,
    deleteFolder,
    toggleFolderVisibility,
    addPhotosToEvent,
    deletePhotoFromEvent,
    showToast,
  } = useApp();

  // Hidden folder-only input with webkitdirectory
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(
    activeEvent?.folders?.[0]?.id || ''
  );
  const [newFolderName, setNewFolderName] = useState('');
  const [showAddFolderInput, setShowAddFolderInput] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState({ current: 0, total: 0, folder: '' });
  const [applyWatermark, setApplyWatermark] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [looseFileWarning, setLooseFileWarning] = useState<string | null>(null);

  // Maximum 3000 photos capacity warning state
  const [capacityWarning, setCapacityWarning] = useState<{
    current: number;
    attempted: number;
    max: number;
  } | null>(null);

  // Live active uploading thumbnail previews
  const [liveThumbnails, setLiveThumbnails] = useState<
    Array<{ name: string; url: string; folder: string; id: string }>
  >([]);

  if (!activeEvent) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-bold text-white mb-2">No Event Selected</h2>
        <button
          onClick={() => navigateTo('dashboard')}
          className="px-4 py-2 bg-neutral-800 text-white rounded-xl text-xs"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  // Safe folders and photos collections
  const eventFolders = activeEvent.folders || [];
  const eventPhotos = activeEvent.photos || [];

  // Active folder for viewing photos
  const currentFolder =
    eventFolders.find((f) => f.id === selectedFolderId) || eventFolders[0];
  const activeFolderPhotos = eventPhotos.filter(
    (p) => p.folderId === currentFolder?.id
  );

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    addFolder(activeEvent.id, newFolderName.trim());
    setNewFolderName('');
    setShowAddFolderInput(false);
  };

  // Process and upload a list of { file, folderName }
  const processFolderUpload = async (items: { file: File; folderName: string }[]) => {
    if (items.length === 0) {
      showToast('No valid image files found inside the selected folder', 'error');
      return;
    }

    // STRICT CHECK: One Event Max Photos Capacity = 3000 photos
    const MAX_EVENT_CAPACITY = 3000;
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
    setLooseFileWarning(null);
    setLiveThumbnails([]);

    const newPhotosData: Array<{
      filename: string;
      originalName: string;
      folderId: string;
      folderName: string;
      url: string;
      thumbnailUrl?: string;
      sizeBytes: number;
    }> = [];

    // Parallel multi-worker chunk processing (5 concurrent workers for ultra-high speed)
    const CONCURRENCY = 5;
    for (let i = 0; i < items.length; i += CONCURRENCY) {
      const chunk = items.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        chunk.map(async ({ file, folderName }) => {
          try {
            const compressed = await compressAndWatermarkImage(file, {
              maxWidth: 1100,
              maxHeight: 900,
              quality: 0.65, // Hard compression for highest storage efficiency
              watermarkText: applyWatermark
                ? currentUser?.watermarkText || currentUser?.studioName?.toUpperCase() || 'PREVIEW'
                : '',
              watermarkPosition: currentUser?.watermarkPosition || 'bottom-right',
              watermarkOpacity: currentUser?.watermarkOpacity || 0.35,
            });

            return {
              filename: file.name,
              originalName: file.name,
              folderId: '',
              folderName: folderName,
              url: compressed.dataUrl,
              thumbnailUrl: compressed.dataUrl,
              sizeBytes: compressed.sizeBytes,
            };
          } catch (err) {
            console.error('Failed to compress file', file.name, err);
            return null;
          }
        })
      );

      const validPhotos = results.filter(Boolean) as any[];
      newPhotosData.push(...validPhotos);

      const processedCount = Math.min(items.length, i + chunk.length);
      const latest = validPhotos[validPhotos.length - 1];
      if (latest) {
        setLiveThumbnails((prev) => [
          { id: `${Date.now()}-${Math.random()}`, name: latest.filename, url: latest.url, folder: latest.folderName },
          ...prev.slice(0, 5),
        ]);
      }

      setProcessingStatus({
        current: processedCount,
        total: items.length,
        folder: chunk[0]?.folderName || 'Photos',
      });
    }

    addPhotosToEvent(activeEvent.id, newPhotosData);
    setIsProcessing(false);
  };

  // Handler for <input webkitdirectory />
  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const items: { file: File; folderName: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|arw|cr2|nef)$/i.test(file.name)) {
        continue;
      }

      // webkitRelativePath contains e.g. "Haldi/DSC_001.JPG" or "Event/Reception/DSC_010.JPG"
      const relativePath = file.webkitRelativePath || '';
      const pathParts = relativePath.split('/');

      let detectedFolderName = 'Photos';
      if (pathParts.length >= 2) {
        // If there's an immediate parent directory, pick it
        // E.g. "Haldi/DSC_001.JPG" -> "Haldi"
        // E.g. "Event/Haldi/DSC_001.JPG" -> "Haldi"
        detectedFolderName = pathParts[pathParts.length - 2];
      }

      items.push({
        file,
        folderName: detectedFolderName,
      });
    }

    if (items.length === 0) {
      showToast('Selected folder has no image files', 'error');
      return;
    }

    processFolderUpload(items);
    // Reset file input
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
  };

  // Handler for Drag & Drop
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setLooseFileWarning(null);

    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;

    let hasDirectories = false;
    let looseFileCount = 0;
    const collectedFiles: { file: File; folderName: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const entry = (item as any).webkitGetAsEntry ? (item as any).webkitGetAsEntry() : null;

      if (entry) {
        if (entry.isDirectory) {
          hasDirectories = true;
          const folderFiles = await readFilesFromDirectoryEntry(entry);
          collectedFiles.push(...folderFiles);
        } else if (entry.isFile) {
          looseFileCount++;
        }
      }
    }

    // STRICT CHECK: Disallow direct loose photo uploads!
    if (!hasDirectories && looseFileCount > 0) {
      setLooseFileWarning(
        `⚠️ Loose photos upload direct allow nahi hai (${looseFileCount} files dropped)! Kripya poora FOLDER drag & drop karein (e.g. 'Haldi', 'Reception' folder) taaki final .bat file same folder name se photos copy kar sake.`
      );
      showToast('Loose photos upload is blocked. Please drop a folder!', 'error');
      return;
    }

    if (collectedFiles.length > 0) {
      processFolderUpload(collectedFiles);
    }
  };

  const handleCopyClientLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#gallery/${activeEvent.slug || activeEvent.id}`;
    navigator.clipboard.writeText(url);
    showToast('Client link copied! Send this on WhatsApp to your client.', 'success');
  };

  const handleWhatsAppClient = () => {
    const url = `${window.location.origin}${window.location.pathname}#gallery/${activeEvent.slug || activeEvent.id}`;
    let phoneDigits = activeEvent.clientPhone.replace(/[^0-9]/g, '');
    if (phoneDigits.length === 10) {
      phoneDigits = '91' + phoneDigits;
    }
    const text = encodeURIComponent(
      `Namaste ${activeEvent.coupleName}! 🙏\n\n` +
      `Aapke wedding event ("${activeEvent.title}") ke photos selection ke liye upload ho chuke hain!\n\n` +
      `Kripya niche diye gaye direct link par click karke apni favorite photos heart (❤️) karke select karein:\n\n` +
      `🔗 Client Gallery Link:\n${url}\n\n` +
      `⏳ Selection Deadline: ${activeEvent.deadlineDate}\n` +
      `📸 Studio: ${activeEvent.studioName}\n\n` +
      `Selection complete hone ke baad gallery mein "Submit Final Selection" par click karein. Dhanyawad!`
    );
    showToast(`Opening WhatsApp chat for ${activeEvent.coupleName}...`, 'success');
    window.open(`https://wa.me/${phoneDigits}?text=${text}`, '_blank');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateTo('dashboard')}
            className="p-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-bold text-amber-400">
                Folder-Based Photo Upload
              </span>
              <span className="text-neutral-500">•</span>
              <span className="text-xs text-neutral-400 font-mono">
                {eventPhotos.length} Total Previews
              </span>
            </div>
            <h1 className="text-2xl font-bold font-heading text-white">{activeEvent.title}</h1>
            <p className="text-xs text-neutral-400">
              Client: {activeEvent.coupleName} ({activeEvent.clientPhone})
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleWhatsAppClient}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20 hover:scale-105"
          >
            <MessageCircle className="w-3.5 h-3.5 fill-white" />
            <span>WhatsApp to {activeEvent.coupleName}</span>
          </button>

          <button
            onClick={handleCopyClientLink}
            className="px-3.5 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Copy className="w-3.5 h-3.5 text-amber-400" />
            <span>Copy Link</span>
          </button>

          <button
            onClick={() => navigateTo('client-gallery', activeEvent.id)}
            className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open Gallery</span>
          </button>
        </div>
      </div>

      {/* STRICT RULE CALLOUT BANNER */}
      <div className="mt-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start sm:items-center gap-3.5 text-xs text-amber-200">
        <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0">
          <FolderCheck className="w-5 h-5" />
        </div>
        <div className="leading-relaxed">
          <span className="font-bold text-amber-300">Folder-Only Upload Policy:</span> Yahan loose
          photos upload nahi hoti hain. Aapko apne computer se seedha{' '}
          <span className="font-bold text-white underline">Folder (e.g., 'Haldi', 'Reception')</span>{' '}
          select ya drop karna hai. Isse system exact folder name save karta hai aur final{' '}
          <span className="font-mono font-bold text-white">.bat</span> file bina kisi dikkat ke exact
          folder name se photos copy karti hai!
        </div>
      </div>

      {/* Loose File Warning Banner if triggered */}
      {looseFileWarning && (
        <div className="mt-4 p-4 rounded-2xl bg-rose-950/80 border border-rose-500/50 flex items-start justify-between gap-3 text-xs text-rose-200 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <span>{looseFileWarning}</span>
          </div>
          <button
            onClick={() => setLooseFileWarning(null)}
            className="text-rose-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mt-6">
        {/* Left Column: Folders List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-400" />
                Event Folders ({eventFolders.length})
              </h3>
              <button
                onClick={() => setShowAddFolderInput(!showAddFolderInput)}
                className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                + Custom
              </button>
            </div>

            {showAddFolderInput && (
              <form onSubmit={handleCreateFolder} className="mb-4">
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
                    className="px-3 py-1.5 bg-amber-500 text-neutral-950 font-bold text-xs rounded-xl shadow"
                  >
                    Add
                  </button>
                </div>
              </form>
            )}

            {eventFolders.length === 0 ? (
              <div className="py-6 text-center text-neutral-500 text-xs">
                No folders added yet. Select or drop a folder from your computer.
              </div>
            ) : (
              <div className="space-y-1.5">
                {eventFolders.map((folder) => {
                  const folderPhotosCount = eventPhotos.filter(
                    (p) => p.folderId === folder.id
                  ).length;
                  const isSelected = selectedFolderId === folder.id;

                  return (
                    <div
                      key={folder.id}
                      onClick={() => setSelectedFolderId(folder.id)}
                      className={`group px-3 py-2.5 rounded-xl cursor-pointer flex items-center justify-between transition-all ${
                        isSelected
                          ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold'
                          : 'hover:bg-neutral-800 text-neutral-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FolderOpen className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <span className="text-xs truncate">{folder.name}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] bg-neutral-950 px-2 py-0.5 rounded-full font-mono text-neutral-400">
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
                            if (confirm(`Delete folder "${folder.name}" and its photos?`)) {
                              deleteFolder(activeEvent.id, folder.id);
                            }
                          }}
                          className="text-neutral-500 hover:text-rose-400 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Folder Upload Dropzone & Grid */}
        <div className="lg:col-span-3 space-y-5">
          {/* Strictly FOLDER-ONLY Upload Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`relative rounded-3xl border-2 border-dashed p-8 text-center transition-all ${
              isDragging
                ? 'border-amber-400 bg-amber-500/10 scale-[0.99]'
                : 'border-neutral-800 bg-neutral-900/80 hover:border-neutral-700'
            }`}
          >
            {/* Hidden Input configured strictly for DIRECTORY / FOLDER selection */}
            <input
              ref={folderInputRef}
              type="file"
              // Webkitdirectory triggers native folder picker
              // @ts-ignore
              webkitdirectory=""
              // @ts-ignore
              directory=""
              multiple
              className="hidden"
              onChange={handleFolderInputChange}
            />

            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto mb-4">
              <FolderUp className="w-8 h-8" />
            </div>

            <h3 className="text-xl font-bold text-white font-heading mb-1">
              Select or Drop Entire Wedding Folder
            </h3>
            <p className="text-xs text-neutral-300 max-w-md mx-auto mb-2">
              Apne computer se poora folder (jaise <span className="text-amber-400 font-bold">"Haldi"</span>,{' '}
              <span className="text-amber-400 font-bold">"Reception"</span>, ya poora wedding event folder)
              yahan drop karein ya select karein.
            </p>
            <p className="text-[11px] text-neutral-400 font-medium mb-6">
              Folder name automatically detect hota hai taaki final .bat script 100% accurate file copy kare.
            </p>

            {/* Folder Select Action Button */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => folderInputRef.current?.click()}
                className="px-7 py-3.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300 text-neutral-950 font-extrabold text-sm rounded-2xl shadow-xl shadow-amber-500/20 hover:scale-105 transition-all flex items-center gap-2.5"
              >
                <FolderOpen className="w-5 h-5 text-neutral-950" />
                <span>Select Folder From Computer</span>
              </button>
            </div>

            {/* Watermark toggle */}
            <div className="mt-5 flex items-center justify-center gap-2 text-xs text-neutral-400">
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

            {/* High-Speed Concurrent Processing Overlay with Live Thumbnails */}
            {isProcessing && (
              <div className="absolute inset-0 bg-neutral-950/95 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center p-6 sm:p-8 z-30 animate-in fade-in">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3 shadow-lg shadow-amber-500/10">
                  <div className="w-6 h-6 border-3 border-amber-400 border-t-transparent rounded-full animate-spin" />
                </div>

                <div className="text-base font-extrabold text-white font-heading mb-1 text-center">
                  Compressing & Uploading: "{processingStatus.folder}"
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 font-mono font-bold px-2 py-0.5 rounded border border-amber-500/30">
                    ⚡ 5x Concurrent Acceleration
                  </span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono font-bold px-2 py-0.5 rounded border border-emerald-500/30">
                    🗜️ Ultra Storage Compression (~55 KB)
                  </span>
                </div>

                <div className="text-xs font-mono text-neutral-300 mb-2">
                  Processed <strong className="text-white">{processingStatus.current}</strong> of{' '}
                  <strong className="text-white">{processingStatus.total}</strong> photos (
                  {Math.round(((processingStatus.current || 0) / (processingStatus.total || 1)) * 100)}%)
                </div>

                {/* Main Progress Bar */}
                <div className="w-full max-w-md h-3 bg-neutral-900 rounded-full border border-neutral-800 overflow-hidden shadow-inner mb-5">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 transition-all duration-200 rounded-full"
                    style={{
                      width: `${Math.max(3, ((processingStatus.current || 0) / (processingStatus.total || 1)) * 100)}%`,
                    }}
                  />
                </div>

                {/* Live Real-time Thumbnail Preview Strip (Small/Medium thumbnails) */}
                {liveThumbnails.length > 0 && (
                  <div className="w-full max-w-lg">
                    <div className="text-[11px] font-semibold text-neutral-400 mb-2 flex items-center justify-between">
                      <span>Live Uploading Thumbnails:</span>
                      <span className="text-[10px] text-emerald-400 font-mono">✓ High Speed Encoded</span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {liveThumbnails.map((thumb) => (
                        <div
                          key={thumb.id}
                          className="relative aspect-square rounded-xl overflow-hidden border border-amber-500/40 bg-neutral-900 shadow-md animate-in fade-in zoom-in-95"
                        >
                          <img
                            src={thumb.url}
                            alt={thumb.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                          <span className="absolute bottom-1 left-1 right-1 text-[9px] font-mono text-white truncate drop-shadow">
                            {thumb.name}
                          </span>
                          <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-emerald-500 text-white rounded-full flex items-center justify-center text-[8px] font-bold shadow">
                            ✓
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Photos View for Currently Selected Folder */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white font-heading flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-amber-400" />
                <span>Photos in "{currentFolder?.name}"</span>
                <span className="text-xs font-mono text-neutral-400 font-normal">
                  ({activeFolderPhotos.length} photos)
                </span>
              </h3>
            </div>

            {activeFolderPhotos.length === 0 ? (
              <div className="text-center py-12 bg-neutral-900/40 border border-neutral-800 rounded-3xl">
                <ImageIcon className="w-10 h-10 text-neutral-600 mx-auto mb-2" />
                <p className="text-xs text-neutral-400">No photos in this folder yet.</p>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Upload this folder from your PC or click a Quick Demo Folder on the left.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                {activeFolderPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    className="group relative rounded-2xl overflow-hidden aspect-[4/5] bg-neutral-900 border border-neutral-800"
                  >
                    <img
                      src={photo.url}
                      alt={photo.filename}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80" />

                    {/* Delete Photo Button */}
                    <button
                      type="button"
                      onClick={() => deletePhotoFromEvent(activeEvent.id, photo.id)}
                      className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-rose-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      title="Delete photo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Selection status indicator */}
                    {photo.isSelected && (
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold shadow flex items-center gap-1">
                        <span>❤️ Selected</span>
                      </div>
                    )}

                    {/* Filename footer */}
                    <div className="absolute bottom-2 left-2 right-2">
                      <p className="text-[11px] font-mono font-medium text-white truncate drop-shadow">
                        {photo.filename}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-neutral-400">
                        <span className="text-amber-400/90 font-sans">{photo.folderName}</span>
                        <span>
                          {photo.sizeBytes ? `${Math.round(photo.sizeBytes / 1024)} KB` : 'Preview'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* POP-WARNING MODAL: In one event max photos capacity 3000 */}
      {capacityWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-md bg-neutral-900 border border-rose-500/50 rounded-3xl p-6 sm:p-7 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h3 className="text-xl font-extrabold text-white font-heading mb-1.5">
              Event Photos Capacity Limit (Max 3000)
            </h3>
            <p className="text-xs text-rose-300 font-semibold mb-4">
              In one event max photos capacity is 3000 photos!
            </p>

            <div className="p-3.5 bg-neutral-950 rounded-2xl border border-neutral-800 text-xs space-y-2 mb-5 text-left font-mono">
              <div className="flex items-center justify-between text-neutral-300">
                <span>Already Uploaded:</span>
                <span className="font-bold text-white">{capacityWarning.current} photos</span>
              </div>
              <div className="flex items-center justify-between text-neutral-300">
                <span>You Tried To Add:</span>
                <span className="font-bold text-rose-400">+{capacityWarning.attempted} photos</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-neutral-800 text-neutral-300">
                <span>Total Would Be:</span>
                <span className="font-extrabold text-rose-300 font-sans text-sm">
                  {capacityWarning.current + capacityWarning.attempted} / {capacityWarning.max}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-neutral-400 mb-5 leading-relaxed">
              Ek event mein maximum 3,000 photos upload karne ki limit hai taaki client browser aur mobile par gallery bina kisi lag ke fast open ho sake. Kripya folder se kam photos select karein.
            </p>

            <button
              type="button"
              onClick={() => setCapacityWarning(null)}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-bold text-xs rounded-xl shadow-lg hover:scale-105 transition-all"
            >
              OK, Got It (Theek Hai)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
