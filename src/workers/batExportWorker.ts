/**
 * Web Worker for Off-Main-Thread Batch .BAT / .SH / CSV Script Generation
 * Keeps the browser UI 100% responsive (60fps) during massive photo metadata exports (up to 3000+ photos).
 */

export interface WorkerExportPhoto {
  filename: string;
  folderName?: string;
  isSelected: boolean;
  selectedAt?: string;
  clientComment?: string;
  sizeBytes?: number;
}

export interface WorkerExportEvent {
  id: string;
  slug?: string;
  title: string;
  coupleName: string;
}

export interface WorkerRequest {
  type: 'GENERATE_BAT' | 'GENERATE_SH' | 'GENERATE_CSV' | 'GENERATE_LIGHTROOM';
  eventId: string;
  event: WorkerExportEvent;
  photos: WorkerExportPhoto[];
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

// Processing in batches ensures large array transformations yield to the worker loop
const BATCH_SIZE = 250;

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { type, event, photos, includeExtension } = e.data;

  try {
    const selectedPhotos = (photos || []).filter((p) => p.isSelected);
    const totalSelected = selectedPhotos.length;

    if (type === 'GENERATE_BAT') {
      const foldersWithSelections = Array.from(
        new Set(selectedPhotos.map((p) => (p.folderName || 'Selected').trim()))
      );

      const headerLines: string[] = [
        '@echo off',
        'chcp 65001 >nul',
        'title A1 Smart Selection - Auto Photo Copier',
        'color 0A',
        'echo =====================================================================',
        'echo            A1 SMART SELECTION - AUTOMATED PHOTO COPIER                ',
        'echo =====================================================================',
        `echo Event: "${event.title}"`,
        `echo Client: "${event.coupleName}"`,
        `echo Total Selected: ${totalSelected} photos`,
        'echo.',
        'echo INSTRUCTIONS / HIDAYAT:',
        'echo 1. Is .bat file ko apne main event folder mein rakhein (jahan aapke',
        'echo    "Haldi", "Reception", "Wedding" folders hain).',
        'echo 2. Double-click karke chalayein. Ye script automatically "Selected_Photos"',
        'echo    folder banakar sabhi selected photos ko same folder name ke sath copy kar degi.',
        'echo =====================================================================',
        'echo.',
        'pause',
        'echo.',
        'echo [*] Creating destination folders...',
        'if not exist "Selected_Photos" mkdir "Selected_Photos"',
      ];

      foldersWithSelections.forEach((folder) => {
        const sanitized = folder.replace(/[/\\?%*:|"<>]/g, '_');
        headerLines.push(`if not exist "Selected_Photos\\${sanitized}" mkdir "Selected_Photos\\${sanitized}"`);
      });

      headerLines.push('');
      headerLines.push('echo [*] Copying high-resolution selected photos...');
      headerLines.push('set /a copied=0');
      headerLines.push('set /a missing=0');
      headerLines.push('');

      const copyLines: string[] = [];

      // Process photos in non-blocking batches
      for (let i = 0; i < totalSelected; i += BATCH_SIZE) {
        const batch = selectedPhotos.slice(i, i + BATCH_SIZE);

        for (const photo of batch) {
          const filename = photo.filename;
          const baseName = filename.replace(/\.[^/.]+$/, '');
          const folder = (photo.folderName || 'Selected').replace(/[/\\?%*:|"<>]/g, '_');

          copyLines.push(`if exist "${folder}\\${filename}" (`);
          copyLines.push(`    copy /Y "${folder}\\${filename}" "Selected_Photos\\${folder}\\" >nul`);
          copyLines.push(`    set /a copied+=1`);
          copyLines.push(`    echo [OK] Copied ${folder}\\${filename}`);
          copyLines.push(`) else if exist "${filename}" (`);
          copyLines.push(`    copy /Y "${filename}" "Selected_Photos\\${folder}\\" >nul`);
          copyLines.push(`    set /a copied+=1`);
          copyLines.push(`    echo [OK] Copied ${filename} to ${folder}`);
          copyLines.push(`) else if exist "${folder}\\${baseName}.*" (`);
          copyLines.push(`    copy /Y "${folder}\\${baseName}.*" "Selected_Photos\\${folder}\\" >nul`);
          copyLines.push(`    set /a copied+=1`);
          copyLines.push(`    echo [OK] Copied RAW/matching file for ${baseName}`);
          copyLines.push(`) else if exist "${baseName}.*" (`);
          copyLines.push(`    copy /Y "${baseName}.*" "Selected_Photos\\${folder}\\" >nul`);
          copyLines.push(`    set /a copied+=1`);
          copyLines.push(`    echo [OK] Copied RAW/matching file for ${baseName}`);
          copyLines.push(`) else if exist "..\\${folder}\\${filename}" (`);
          copyLines.push(`    copy /Y "..\\${folder}\\${filename}" "Selected_Photos\\${folder}\\" >nul`);
          copyLines.push(`    set /a copied+=1`);
          copyLines.push(`    echo [OK] Copied from parent: ${folder}\\${filename}`);
          copyLines.push(`) else (`);
          copyLines.push(`    set /a missing+=1`);
          copyLines.push(`    echo [MISSING] Could not find: ${folder}\\${filename}`);
          copyLines.push(`)`);
        }

        const processed = Math.min(totalSelected, i + batch.length);
        const progress = Math.round((processed / (totalSelected || 1)) * 100);
        self.postMessage({
          type: 'PROGRESS',
          progress,
          processed,
          total: totalSelected,
        } as WorkerResponse);

        // Yield execution to allow message queue dispatch
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const footerLines: string[] = [
        '',
        'echo =====================================================================',
        'echo                     COPYING COMPLETE!                                ',
        'echo =====================================================================',
        `echo Total Selected : ${totalSelected}`,
        'echo Copied Files   : %copied%',
        'echo Missing Files  : %missing%',
        'echo.',
        'echo All your selected photos are inside the "Selected_Photos" folder!',
        'echo.',
        'if exist "Selected_Photos" explorer "Selected_Photos"',
        'pause',
      ];

      const fullScript = [...headerLines, ...copyLines, ...footerLines].join('\r\n');
      const filename = `A1_Copy_${event.slug || event.id}.bat`;

      self.postMessage({
        type: 'COMPLETE',
        content: fullScript,
        filename,
        mimeType: 'text/plain',
        total: totalSelected,
      } as WorkerResponse);

    } else if (type === 'GENERATE_SH') {
      const foldersWithSelections = Array.from(
        new Set(selectedPhotos.map((p) => (p.folderName || 'Selected').trim()))
      );

      const headerLines: string[] = [
        '#!/bin/bash',
        'echo "====================================================================="',
        'echo "           A1 SMART SELECTION - AUTOMATED PHOTO COPIER (MAC/LINUX)   "',
        'echo "====================================================================="',
        `echo "Event: ${event.title}"`,
        `echo "Total Selected: ${totalSelected} photos"`,
        'echo ""',
        'mkdir -p "Selected_Photos"',
      ];

      foldersWithSelections.forEach((folder) => {
        const sanitized = folder.replace(/[/\\?%*:|"<>]/g, '_');
        headerLines.push(`mkdir -p "Selected_Photos/${sanitized}"`);
      });

      headerLines.push('');
      headerLines.push('copied=0');
      headerLines.push('missing=0');
      headerLines.push('');

      const copyLines: string[] = [];

      for (let i = 0; i < totalSelected; i += BATCH_SIZE) {
        const batch = selectedPhotos.slice(i, i + BATCH_SIZE);

        for (const photo of batch) {
          const filename = photo.filename;
          const folder = (photo.folderName || 'Selected').replace(/[/\\?%*:|"<>]/g, '_');
          copyLines.push(`if [ -f "${folder}/${filename}" ]; then`);
          copyLines.push(`  cp "${folder}/${filename}" "Selected_Photos/${folder}/"`);
          copyLines.push(`  ((copied++))`);
          copyLines.push(`  echo "[OK] Copied ${folder}/${filename}"`);
          copyLines.push(`elif [ -f "${filename}" ]; then`);
          copyLines.push(`  cp "${filename}" "Selected_Photos/${folder}/"`);
          copyLines.push(`  ((copied++))`);
          copyLines.push(`  echo "[OK] Copied ${filename}"`);
          copyLines.push(`elif [ -f "../${folder}/${filename}" ]; then`);
          copyLines.push(`  cp "../${folder}/${filename}" "Selected_Photos/${folder}/"`);
          copyLines.push(`  ((copied++))`);
          copyLines.push(`  echo "[OK] Copied ../${folder}/${filename}"`);
          copyLines.push(`else`);
          copyLines.push(`  ((missing++))`);
          copyLines.push(`  echo "[MISSING] Not found: ${folder}/${filename}"`);
          copyLines.push(`fi`);
        }

        const processed = Math.min(totalSelected, i + batch.length);
        const progress = Math.round((processed / (totalSelected || 1)) * 100);
        self.postMessage({
          type: 'PROGRESS',
          progress,
          processed,
          total: totalSelected,
        } as WorkerResponse);

        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const footerLines: string[] = [
        '',
        'echo "====================================================================="',
        `echo "DONE! Copied: $copied, Missing: $missing out of ${totalSelected}"`,
        'echo "Open Selected_Photos folder to view."',
      ];

      const fullScript = [...headerLines, ...copyLines, ...footerLines].join('\n');
      const filename = `A1_Copy_${event.slug || event.id}.sh`;

      self.postMessage({
        type: 'COMPLETE',
        content: fullScript,
        filename,
        mimeType: 'text/x-sh',
        total: totalSelected,
      } as WorkerResponse);

    } else if (type === 'GENERATE_CSV') {
      const headers = ['Folder', 'Filename', 'Selection Status', 'Selected At', 'Client Notes', 'Estimated Size (KB)'];
      const rows: string[] = [headers.join(',')];

      for (let i = 0; i < totalSelected; i += BATCH_SIZE) {
        const batch = selectedPhotos.slice(i, i + BATCH_SIZE);

        for (const p of batch) {
          const folder = `"${(p.folderName || 'Selected').replace(/"/g, '""')}"`;
          const filename = `"${p.filename.replace(/"/g, '""')}"`;
          const status = '"Selected"';
          const selectedAt = `"${p.selectedAt ? new Date(p.selectedAt).toLocaleString() : ''}"`;
          const comment = `"${(p.clientComment || '').replace(/"/g, '""')}"`;
          const sizeKb = p.sizeBytes ? Math.round(p.sizeBytes / 1024) : 0;
          rows.push([folder, filename, status, selectedAt, comment, sizeKb].join(','));
        }

        const processed = Math.min(totalSelected, i + batch.length);
        self.postMessage({
          type: 'PROGRESS',
          progress: Math.round((processed / (totalSelected || 1)) * 100),
          processed,
          total: totalSelected,
        } as WorkerResponse);

        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const fullCsv = rows.join('\r\n');
      const filename = `A1_Selection_${event.slug || event.id}.csv`;

      self.postMessage({
        type: 'COMPLETE',
        content: fullCsv,
        filename,
        mimeType: 'text/csv',
        total: totalSelected,
      } as WorkerResponse);

    } else if (type === 'GENERATE_LIGHTROOM') {
      const parts: string[] = [];

      for (let i = 0; i < totalSelected; i += BATCH_SIZE) {
        const batch = selectedPhotos.slice(i, i + BATCH_SIZE);
        for (const p of batch) {
          if (includeExtension) {
            parts.push(p.filename);
          } else {
            parts.push(p.filename.replace(/\.[^/.]+$/, ''));
          }
        }
      }

      self.postMessage({
        type: 'COMPLETE',
        content: parts.join(' '),
        filename: 'lightroom_query.txt',
        mimeType: 'text/plain',
        total: totalSelected,
      } as WorkerResponse);
    }
  } catch (err: any) {
    self.postMessage({
      type: 'ERROR',
      error: err?.message || 'Failed to process export batch in web worker',
    } as WorkerResponse);
  }
};
