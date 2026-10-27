import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  ArrowLeft,
  Download,
  Terminal,
  FolderArchive,
  Copy,
  Check,
  FileSpreadsheet,
  Heart,
  Sliders,
  Sparkles,
  Info,
  ExternalLink,
  Laptop,
  CheckCircle2,
  Loader2,
  Cpu,
  FileText,
  X,
  Maximize2,
  Image as ImageIcon,
} from 'lucide-react';
import {
  generateLightroomFilenames,
  downloadFile,
} from '../utils/batGenerator';
import {
  downloadExportWithWorker,
  WorkerExportProgress,
} from '../utils/batWorkerExport';

export const SelectionResultsPage: React.FC = () => {
  const { activeEvent, navigateTo, showToast } = useApp();

  const [copiedLightroom, setCopiedLightroom] = useState(false);
  const [includeExtension, setIncludeExtension] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolderFilter, setSelectedFolderFilter] = useState('all');
  const [previewPhoto, setPreviewPhoto] = useState<any | null>(null);

  // Web Worker batch processing state
  const [isExporting, setIsExporting] = useState(false);
  const [exportType, setExportType] = useState<'bat' | 'sh' | 'csv' | null>(null);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportStatusText, setExportStatusText] = useState<string>('');

  const allPhotos = activeEvent?.photos || [];
  const allFolders = activeEvent?.folders || [];
  const effectiveFolders = useMemo(() => {
    if (!activeEvent) return [];

    const result: Array<{ id: string; name: string }> = [];
    const seenNames = new Set<string>();
    const seenIds = new Set<string>();

    (allFolders || []).forEach((f, idx) => {
      const cleanName = (f.name || '').trim();
      if (!cleanName || /^all(\s+folders|\s+photos)?$/i.test(cleanName)) return;
      const lower = cleanName.toLowerCase();
      if (!seenNames.has(lower) && !seenIds.has(f.id)) {
        seenNames.add(lower);
        seenIds.add(f.id);
        result.push({ id: f.id, name: cleanName });
      }
    });

    (allPhotos || []).forEach((p) => {
      const rawName = (p.folderName || '').trim();
      if (!rawName || /^all(\s+folders|\s+photos)?$/i.test(rawName)) return;
      const lower = rawName.toLowerCase();
      if (!seenNames.has(lower)) {
        seenNames.add(lower);
        const folderId = p.folderId && !seenIds.has(p.folderId) ? p.folderId : `fld-${lower.replace(/[^a-z0-9]/g, '-')}`;
        seenIds.add(folderId);
        result.push({ id: folderId, name: rawName });
      }
    });

    return result;
  }, [allFolders, allPhotos, activeEvent]);

  const selectedPhotos = allPhotos.filter((p) => p.isSelected);
  const totalPhotos = Math.max(activeEvent?.photosCount || 0, allPhotos.length);
  const pctSelected = totalPhotos > 0 ? Math.round((selectedPhotos.length / totalPhotos) * 100) : 0;

  // Folder breakdown
  const folderStats = effectiveFolders.map((folder: { id: string; name: string }) => {
    const total = allPhotos.filter(
      (p) =>
        p.folderId === folder.id ||
        (p.folderName && p.folderName.toLowerCase().trim() === folder.name.toLowerCase().trim())
    ).length;
    const selected = allPhotos.filter(
      (p) =>
        (p.folderId === folder.id ||
          (p.folderName && p.folderName.toLowerCase().trim() === folder.name.toLowerCase().trim())) &&
        p.isSelected
    ).length;
    return {
      id: folder.id,
      name: folder.name,
      total,
      selected,
      pct: total > 0 ? Math.round((selected / total) * 100) : 0,
    };
  });

  const handleDownloadBat = async () => {
    if (!activeEvent || isExporting || selectedPhotos.length === 0) return;
    setIsExporting(true);
    setExportType('bat');
    setExportProgress(0);
    setExportStatusText('Initializing background Web Worker...');

    try {
      const result = await downloadExportWithWorker('GENERATE_BAT', activeEvent, {
        onProgress: (p: WorkerExportProgress) => {
          setExportProgress(p.progress);
          setExportStatusText(`Processing batch: ${p.processed} / ${p.total} photos (${p.progress}%)`);
        },
      });
      showToast(`Windows .BAT file generated via Web Worker: ${result.filename}`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to generate .BAT file', 'error');
    } finally {
      setIsExporting(false);
      setExportType(null);
    }
  };

  const handleDownloadSh = async () => {
    if (!activeEvent || isExporting || selectedPhotos.length === 0) return;
    setIsExporting(true);
    setExportType('sh');
    setExportProgress(0);
    setExportStatusText('Initializing background Web Worker...');

    try {
      const result = await downloadExportWithWorker('GENERATE_SH', activeEvent, {
        onProgress: (p: WorkerExportProgress) => {
          setExportProgress(p.progress);
          setExportStatusText(`Processing batch: ${p.processed} / ${p.total} photos (${p.progress}%)`);
        },
      });
      showToast(`Mac/Linux .SH script generated via Web Worker: ${result.filename}`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to generate .SH file', 'error');
    } finally {
      setIsExporting(false);
      setExportType(null);
    }
  };

  const handleDownloadCsv = async () => {
    if (!activeEvent || isExporting || selectedPhotos.length === 0) return;
    setIsExporting(true);
    setExportType('csv');
    setExportProgress(0);
    setExportStatusText('Generating CSV metadata in Web Worker...');

    try {
      const result = await downloadExportWithWorker('GENERATE_CSV', activeEvent, {
        onProgress: (p: WorkerExportProgress) => {
          setExportProgress(p.progress);
          setExportStatusText(`Processing rows: ${p.processed} / ${p.total} (${p.progress}%)`);
        },
      });
      showToast(`CSV selection report downloaded: ${result.filename}`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to generate CSV report', 'error');
    } finally {
      setIsExporting(false);
      setExportType(null);
    }
  };

  const handleCopyLightroom = () => {
    if (!activeEvent) return;
    const filenames = generateLightroomFilenames(activeEvent, includeExtension);
    navigator.clipboard.writeText(filenames);
    setCopiedLightroom(true);
    showToast('Filenames copied for Lightroom search bar!', 'success');
    setTimeout(() => setCopiedLightroom(false), 2500);
  };

  const handleDownloadTxt = () => {
    if (!activeEvent || selectedPhotos.length === 0) return;
    const filenames = generateLightroomFilenames(activeEvent, includeExtension);
    downloadFile(
      filenames,
      `A1_Selected_${activeEvent.slug || activeEvent.id}.txt`,
      'text/plain'
    );
    showToast('Text file of selected filenames downloaded!', 'success');
  };

  // Filtered view of selected photos
  const displayedPhotos = selectedPhotos.filter((p) => {
    if (selectedFolderFilter !== 'all' && p.folderId !== selectedFolderFilter) {
      return false;
    }
    if (searchTerm && !p.filename.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    return true;
  });

  if (!activeEvent) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-bold text-white mb-2">No Event Selected</h2>
        <p className="text-xs text-neutral-400 mb-6">
          Kripya dashboard par jaakar event select karein.
        </p>
        <button
          onClick={() => navigateTo('dashboard')}
          className="px-4 py-2 bg-neutral-800 text-white rounded-xl text-xs hover:bg-neutral-700 transition"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                Selection Results & Exports
              </span>
              <span className="text-neutral-500">•</span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  activeEvent.status === 'completed'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {activeEvent.status === 'completed' ? '✓ Client Submitted' : 'In Progress'}
              </span>
            </div>
            <h1 className="text-2xl font-bold font-heading text-white">{activeEvent.title}</h1>
            <p className="text-xs text-neutral-400">
              Client: {activeEvent.coupleName} ({activeEvent.clientPhone})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateTo('client-gallery', activeEvent.id)}
            className="px-3.5 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 rounded-xl text-xs font-semibold flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
            <span>Open Client Link</span>
          </button>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-6">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
          <span className="text-neutral-400 text-xs">Total Selected</span>
          <div className="text-3xl font-extrabold text-rose-400 font-mono mt-1 flex items-baseline gap-1">
            <span>{selectedPhotos.length}</span>
            <span className="text-xs text-neutral-400 font-sans">/ {totalPhotos}</span>
          </div>
          <p className="text-[11px] text-neutral-500 mt-1">{pctSelected}% of album photos</p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
          <span className="text-neutral-400 text-xs">Selection Status</span>
          <div className="text-lg font-bold text-white mt-1">
            {activeEvent.status === 'completed' ? 'Finalized' : 'Active Selection'}
          </div>
          <p className="text-[11px] text-emerald-400 mt-1">
            {activeEvent.submittedAt
              ? `Submitted on ${new Date(activeEvent.submittedAt).toLocaleDateString()}`
              : 'Auto-saved in real-time'}
          </p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
          <span className="text-neutral-400 text-xs">Folders</span>
          <div className="text-3xl font-extrabold text-white font-mono mt-1">
            {allFolders.length}
          </div>
          <p className="text-[11px] text-neutral-500 mt-1">Ceremony, Reception, etc.</p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
          <span className="text-neutral-400 text-xs">Quota Limit</span>
          <div className="text-2xl font-bold text-amber-400 font-mono mt-1">
            {activeEvent.maxSelectionLimit || 'Unlimited'}
          </div>
          <p className="text-[11px] text-neutral-500 mt-1">Max allowed by photographer</p>
        </div>
      </div>

      {activeEvent.clientNotes && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200">
          <div className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-1 flex items-center gap-1.5">
            <Info className="w-4 h-4" />
            Client's Special Notes / Album Request:
          </div>
          <p className="text-xs leading-relaxed italic font-medium">
            "{activeEvent.clientNotes}"
          </p>
        </div>
      )}

      {/* PRO AUTOMATION SECTION: .BAT & SCRIPTS */}
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-900 to-amber-950/40 border border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-xl mb-8">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-neutral-800">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>1-Click Auto Copy System</span>
            </div>
            <h2 className="text-2xl font-extrabold font-heading text-white">
              Download Automated Copy Script (.BAT / .SH)
            </h2>
            <p className="text-xs text-neutral-300 mt-1 max-w-xl">
              Script ko apne computer par original high-res folder mein rakhein aur double-click karein.
              Yeh automatically sabhi {selectedPhotos.length} selected photos ko "Selected_Photos"
              folder mein copy kar degi!
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Windows .BAT Button */}
            <button
              onClick={handleDownloadBat}
              disabled={selectedPhotos.length === 0 || isExporting}
              className="px-6 py-3.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300 hover:from-amber-400 hover:to-amber-200 text-neutral-950 font-extrabold text-sm rounded-2xl shadow-xl shadow-amber-500/25 transition-all hover:scale-105 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isExporting && exportType === 'bat' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-neutral-950" />
                  <span>Generating .BAT ({exportProgress}%)...</span>
                </>
              ) : (
                <>
                  <Terminal className="w-5 h-5 text-neutral-950" />
                  <span>Download Windows .BAT File</span>
                </>
              )}
            </button>

            {/* Mac / Linux .SH Button */}
            <button
              onClick={handleDownloadSh}
              disabled={selectedPhotos.length === 0 || isExporting}
              className="px-4 py-3.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs rounded-2xl border border-neutral-700 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isExporting && exportType === 'sh' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Processing ({exportProgress}%)...</span>
                </>
              ) : (
                <>
                  <Laptop className="w-4 h-4 text-amber-400" />
                  <span>Mac / Linux (.SH)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Real-time Web Worker Batch Processing Progress Indicator */}
        {isExporting && (
          <div className="my-5 p-4 rounded-2xl bg-neutral-950/80 border border-amber-500/30 animate-in fade-in">
            <div className="flex items-center justify-between text-xs mb-2">
              <div className="flex items-center gap-2 text-amber-300 font-semibold">
                <Cpu className="w-4 h-4 text-amber-400 animate-pulse" />
                <span>Web Worker Batch Export Active: {exportStatusText}</span>
              </div>
              <span className="font-mono font-bold text-white">{exportProgress}%</span>
            </div>
            <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-200 rounded-full"
                style={{ width: `${Math.max(5, exportProgress)}%` }}
              />
            </div>
            <p className="text-[11px] text-neutral-400 mt-2">
              Background Web Worker is handling metadata batching off the main thread. Browser UI remains completely responsive without lag.
            </p>
          </div>
        )}

        {/* 3 Step Visual Guide */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 text-xs">
          <div className="flex items-start gap-3 p-3.5 bg-neutral-950/60 rounded-2xl border border-neutral-800/80">
            <div className="w-7 h-7 rounded-xl bg-amber-500/10 text-amber-400 font-bold flex items-center justify-center flex-shrink-0">
              1
            </div>
            <div>
              <div className="font-bold text-white">.bat File Download Karein</div>
              <p className="text-neutral-400 text-[11px] mt-0.5">
                Upar diye gaye button par click karke batch script download karein.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3.5 bg-neutral-950/60 rounded-2xl border border-neutral-800/80">
            <div className="w-7 h-7 rounded-xl bg-amber-500/10 text-amber-400 font-bold flex items-center justify-center flex-shrink-0">
              2
            </div>
            <div>
              <div className="font-bold text-white">Event Folder Mein Daalein</div>
              <p className="text-neutral-400 text-[11px] mt-0.5">
                File ko computer ke us folder mein rakhein jahan aapke "Haldi", "Reception", etc. folders hain.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3.5 bg-neutral-950/60 rounded-2xl border border-neutral-800/80">
            <div className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-400 font-bold flex items-center justify-center flex-shrink-0">
              3
            </div>
            <div>
              <div className="font-bold text-white">Double-Click Run Karein</div>
              <p className="text-neutral-400 text-[11px] mt-0.5">
                Script 5 second mein sabhi photos copy karke folder khol degi. Kaam khatam!
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Alternative Export Tools: Lightroom / Excel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Lightroom Filter Box */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white font-heading flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              Lightroom / Capture One Filter Code
            </h3>
            <label className="text-[11px] text-neutral-400 flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeExtension}
                onChange={(e) => setIncludeExtension(e.target.checked)}
                className="rounded border-neutral-700 text-amber-500 focus:ring-0"
              />
              <span>With .JPG</span>
            </label>
          </div>

          <p className="text-xs text-neutral-400 mb-3 leading-relaxed">
            Lightroom ke "Library Filter (Text)" mein paste karein taaki selected photos turant filter ho sakein.
          </p>

          <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 font-mono text-xs text-neutral-300 max-h-24 overflow-y-auto break-all select-all mb-4">
            {selectedPhotos.length > 0
              ? generateLightroomFilenames(activeEvent, includeExtension)
              : 'No photos selected yet.'}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={handleCopyLightroom}
              disabled={selectedPhotos.length === 0}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                copiedLightroom
                  ? 'bg-emerald-600 text-white'
                  : 'bg-neutral-800 hover:bg-neutral-750 text-white border border-neutral-700'
              }`}
            >
              {copiedLightroom ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-amber-400" />
                  <span>Copy Filenames</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownloadTxt}
              disabled={selectedPhotos.length === 0}
              className="py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors bg-neutral-800 hover:bg-neutral-750 text-white border border-neutral-700 disabled:opacity-50 cursor-pointer"
              title="Download as .TXT list"
            >
              <FileText className="w-4 h-4 text-amber-400" />
              <span>Download .TXT</span>
            </button>
          </div>
        </div>

        {/* CSV Summary Box */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white font-heading flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                Excel / CSV Selection Report
              </h3>
              <span className="text-[10px] text-neutral-500 uppercase font-mono">
                {selectedPhotos.length} rows
              </span>
            </div>
            <p className="text-xs text-neutral-400 mb-4 leading-relaxed">
              Folder name, exact filename, selection date, aur client comments ke sath full spreadsheet report download karein.
            </p>
          </div>

          <button
            onClick={handleDownloadCsv}
            disabled={selectedPhotos.length === 0 || isExporting}
            className="w-full py-2.5 px-4 bg-neutral-800 hover:bg-neutral-750 text-white border border-neutral-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isExporting && exportType === 'csv' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                <span>Exporting CSV ({exportProgress}%)...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Download CSV Spreadsheet</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Folder-wise Breakdown Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 mb-8 shadow-xl">
        <h3 className="text-sm font-bold text-white font-heading mb-4">
          Folder-Wise Selection Breakdown
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-400 uppercase text-[10px] tracking-wider">
                <th className="pb-3">Folder Name</th>
                <th className="pb-3 text-center">Total Uploaded</th>
                <th className="pb-3 text-center">Selected</th>
                <th className="pb-3">Percentage Selected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 font-mono text-neutral-300">
              {folderStats.map((f: any) => (
                <tr key={f.id} className="hover:bg-neutral-800/30">
                  <td className="py-3 font-sans font-semibold text-white">{f.name}</td>
                  <td className="py-3 text-center text-neutral-400">{f.total} photos</td>
                  <td className="py-3 text-center text-rose-400 font-bold">
                    ❤️ {f.selected}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-32 sm:w-48 h-2 bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-rose-500 to-amber-400"
                          style={{ width: `${f.pct}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-neutral-400">{f.pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Photos Gallery Grid */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-sm font-bold text-white font-heading">
              Selected Photos Thumbnails ({selectedPhotos.length})
            </h3>
            <p className="text-xs text-neutral-400">
              Yeh wo photos hain jo .bat script automatically copy karegi.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedFolderFilter}
              onChange={(e) => setSelectedFolderFilter(e.target.value)}
              className="bg-neutral-950 border border-neutral-800 text-neutral-300 text-xs rounded-xl px-3 py-1.5 focus:outline-none"
            >
              <option value="all">All Folders</option>
              {allFolders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Search filename..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-neutral-950 border border-neutral-800 text-neutral-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {displayedPhotos.length === 0 ? (
          <div className="text-center py-12 text-neutral-500 text-xs">
            No matching selected photos.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {displayedPhotos.map((photo) => (
              <div
                key={photo.id}
                onClick={() => setPreviewPhoto(photo)}
                className="group relative rounded-xl overflow-hidden aspect-[4/5] bg-neutral-950 border border-neutral-800 hover:border-amber-500/50 cursor-pointer transition-all hover:scale-[1.02]"
                title="Click to view full photo"
              >
                {(photo.thumbnailUrl || photo.url) ? (
                  <img
                    src={(photo.thumbnailUrl || photo.url) || undefined}
                    alt={photo.filename}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-900 text-neutral-600">
                    <ImageIcon className="w-6 h-6 opacity-40 mb-1" />
                    <span className="text-[9px] font-mono">{photo.filename}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80" />

                <div className="absolute top-1.5 right-1.5 p-1 rounded-full bg-rose-500 text-white shadow-md">
                  <Heart className="w-3 h-3 fill-white" />
                </div>

                <div className="absolute bottom-1.5 left-1.5 right-1.5">
                  <p className="text-[10px] font-mono font-medium text-white truncate">
                    {photo.filename}
                  </p>
                  <p className="text-[9px] text-neutral-400 truncate">{photo.folderName}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Photographer Photo Zoom / Inspection Modal */}
      {previewPhoto && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6 animate-in fade-in select-none">
          <div className="flex items-center justify-between text-white z-10 max-w-5xl mx-auto w-full">
            <div>
              <h4 className="font-mono font-bold text-sm text-white">
                {previewPhoto.filename}
              </h4>
              <p className="text-xs text-neutral-400">
                Folder: <span className="text-amber-400 font-medium">{previewPhoto.folderName}</span>
                {previewPhoto.sizeBytes ? ` • ${(previewPhoto.sizeBytes / 1024).toFixed(0)} KB` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <a
                href={previewPhoto.url}
                download={previewPhoto.filename}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold rounded-xl border border-neutral-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>Save Image</span>
              </a>
              <button
                onClick={() => setPreviewPhoto(null)}
                className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center p-2 sm:p-4 overflow-hidden">
            {previewPhoto.url ? (
              <img
                src={previewPhoto.url}
                alt={previewPhoto.filename}
                className="max-h-[78vh] max-w-[92vw] object-contain rounded-2xl shadow-2xl border border-white/10"
              />
            ) : (
              <div className="text-neutral-500 text-xs">Image unavailable</div>
            )}
          </div>

          {previewPhoto.clientComment && (
            <div className="max-w-xl mx-auto w-full p-3 rounded-xl bg-neutral-900 border border-amber-500/30 text-amber-200 text-xs text-center">
              Client Comment: "{previewPhoto.clientComment}"
            </div>
          )}
        </div>
      )}
    </div>
  );
};
