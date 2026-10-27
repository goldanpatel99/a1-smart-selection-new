import {
  generateBatScript,
  generateShScript,
  generateCsvReport,
  generateLightroomFilenames,
  PhotoExportItem,
  EventExportItem,
} from '../utils/batGenerator';

export type WorkerExportPhoto = PhotoExportItem;

export interface WorkerRequest {
  type: 'GENERATE_BAT' | 'GENERATE_SH' | 'GENERATE_CSV' | 'GENERATE_LIGHTROOM';
  eventId: string;
  event: EventExportItem;
  photos: PhotoExportItem[];
  includeExtension?: boolean;
}

export interface WorkerResponse {
  type: 'PROGRESS' | 'COMPLETE' | 'ERROR';
  progress?: number;
  processed?: number;
  total?: number;
  content?: string;
  filename?: string;
  mimeType?: string;
  error?: string;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { type, event, photos, includeExtension } = e.data;

  try {
    const selectedPhotos = (photos || []).filter((p) => p.isSelected);
    const totalSelected = selectedPhotos.length;

    self.postMessage({
      type: 'PROGRESS',
      progress: 50,
      processed: Math.floor(totalSelected / 2),
      total: totalSelected,
    } as WorkerResponse);

    let content = '';
    let filename = '';
    let mimeType = 'text/plain';

    if (type === 'GENERATE_BAT') {
      content = generateBatScript(event, photos);
      filename = `A1_Copy_${event.slug || event.id}.bat`;
      mimeType = 'text/plain';
    } else if (type === 'GENERATE_SH') {
      content = generateShScript(event, photos);
      filename = `A1_Copy_${event.slug || event.id}.sh`;
      mimeType = 'text/x-sh';
    } else if (type === 'GENERATE_CSV') {
      content = generateCsvReport(event, photos);
      filename = `A1_Selection_${event.slug || event.id}.csv`;
      mimeType = 'text/csv';
    } else if (type === 'GENERATE_LIGHTROOM') {
      content = generateLightroomFilenames(event, photos, includeExtension);
      filename = 'lightroom_query.txt';
      mimeType = 'text/plain';
    }

    self.postMessage({
      type: 'COMPLETE',
      content,
      filename,
      mimeType,
      total: totalSelected,
    } as WorkerResponse);
  } catch (err: any) {
    self.postMessage({
      type: 'ERROR',
      error: err?.message || 'Failed to generate export file in worker',
    } as WorkerResponse);
  }
};
