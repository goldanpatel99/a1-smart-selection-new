import { WeddingEvent } from '../types';
import {
  WorkerRequest,
  WorkerResponse,
  WorkerExportPhoto,
} from '../workers/batExportWorker';
import {
  generateBatScript,
  generateShScript,
  generateCsvReport,
  generateLightroomFilenames,
  downloadFile,
} from './batGenerator';

export interface WorkerExportProgress {
  progress: number;
  processed: number;
  total: number;
}

export interface WorkerExportResult {
  content: string;
  filename: string;
  mimeType: string;
  total: number;
}

/**
 * Executes batch export processing in a client-side Web Worker.
 * If Web Workers are unavailable or blocked in the browser environment,
 * automatically and safely falls back to synchronous main-thread generator.
 */
export async function generateExportWithWorker(
  type: 'GENERATE_BAT' | 'GENERATE_SH' | 'GENERATE_CSV' | 'GENERATE_LIGHTROOM',
  event: WeddingEvent,
  options?: {
    includeExtension?: boolean;
    onProgress?: (progress: WorkerExportProgress) => void;
  }
): Promise<WorkerExportResult> {
  const allPhotos = event.photos || [];
  const selectedPhotos = allPhotos.filter((p) => p.isSelected);
  const total = selectedPhotos.length;

  const folderNameMap = new Map<string, string>();
  (event.folders || []).forEach((f) => {
    if (f.id && f.name) folderNameMap.set(f.id, f.name);
  });

  const workerPhotosPayload: WorkerExportPhoto[] = allPhotos.map((p) => ({
    filename: p.filename,
    folderName:
      p.folderName ||
      (p.folderId ? folderNameMap.get(p.folderId) : undefined) ||
      'Selected',
    isSelected: !!p.isSelected,
    selectedAt: p.selectedAt,
    clientComment: p.clientComment,
    sizeBytes: p.sizeBytes,
  }));

  const workerEventPayload = {
    id: event.id,
    slug: event.slug,
    title: event.title,
    coupleName: event.coupleName,
  };

  // Try executing via Web Worker off the main UI thread
  if (typeof Worker !== 'undefined') {
    try {
      return await new Promise<WorkerExportResult>((resolve, reject) => {
        let worker: Worker | null = null;
        try {
          worker = new Worker(
            new URL('../workers/batExportWorker.ts', import.meta.url),
            { type: 'module' }
          );
        } catch (workerInitErr) {
          // If module worker instantiation fails, reject to trigger fallback
          reject(workerInitErr);
          return;
        }

        const cleanup = () => {
          if (worker) {
            worker.terminate();
            worker = null;
          }
        };

        worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
          const res = e.data;
          if (res.type === 'PROGRESS') {
            options?.onProgress?.({
              progress: res.progress ?? 0,
              processed: res.processed ?? 0,
              total: res.total ?? total,
            });
          } else if (res.type === 'COMPLETE') {
            cleanup();
            resolve({
              content: res.content || '',
              filename: res.filename || `export_${Date.now()}`,
              mimeType: res.mimeType || 'text/plain',
              total: res.total ?? total,
            });
          } else if (res.type === 'ERROR') {
            cleanup();
            reject(new Error(res.error || 'Worker export error'));
          }
        };

        worker.onerror = (err) => {
          cleanup();
          reject(err);
        };

        const req: WorkerRequest = {
          type,
          eventId: event.id,
          event: workerEventPayload,
          photos: workerPhotosPayload,
          includeExtension: options?.includeExtension,
        };

        worker.postMessage(req);
      });
    } catch (workerErr) {
      console.warn('Worker batch processing failed or not supported, falling back to local generator:', workerErr);
      // Fall through to synchronous fallback below
    }
  }

  // Fallback: Synchronous execution on main thread
  options?.onProgress?.({ progress: 50, processed: Math.round(total / 2), total });

  let content = '';
  let filename = '';
  let mimeType = 'text/plain';

  if (type === 'GENERATE_BAT') {
    content = generateBatScript(event);
    filename = `A1_Copy_${event.slug || event.id}.bat`;
    mimeType = 'text/plain';
  } else if (type === 'GENERATE_SH') {
    content = generateShScript(event);
    filename = `A1_Copy_${event.slug || event.id}.sh`;
    mimeType = 'text/x-sh';
  } else if (type === 'GENERATE_CSV') {
    content = generateCsvReport(event);
    filename = `A1_Selection_${event.slug || event.id}.csv`;
    mimeType = 'text/csv';
  } else if (type === 'GENERATE_LIGHTROOM') {
    content = generateLightroomFilenames(event, options?.includeExtension);
    filename = 'lightroom_query.txt';
    mimeType = 'text/plain';
  }

  options?.onProgress?.({ progress: 100, processed: total, total });

  return {
    content,
    filename,
    mimeType,
    total,
  };
}

/**
 * Downloads the exported file generated via Web Worker.
 */
export async function downloadExportWithWorker(
  type: 'GENERATE_BAT' | 'GENERATE_SH' | 'GENERATE_CSV',
  event: WeddingEvent,
  options?: {
    onProgress?: (progress: WorkerExportProgress) => void;
  }
): Promise<WorkerExportResult> {
  const result = await generateExportWithWorker(type, event, options);
  downloadFile(result.content, result.filename, result.mimeType);
  return result;
}
