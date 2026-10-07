import { WeddingEvent } from '../types';

export function generateBatScript(event: WeddingEvent): string {
  const allPhotos = event.photos || [];
  const selectedPhotos = allPhotos.filter((p) => p.isSelected);
  const foldersWithSelections = Array.from(
    new Set(selectedPhotos.map((p) => p.folderName || 'Selected'))
  );

  const lines: string[] = [
    '@echo off',
    'chcp 65001 >nul',
    'title A1 Smart Selection - Auto Photo Copier',
    'color 0A',
    'echo =====================================================================',
    'echo            A1 SMART SELECTION - AUTOMATED PHOTO COPIER                ',
    'echo =====================================================================',
    `echo Event: "${event.title}"`,
    `echo Client: "${event.coupleName}"`,
    `echo Total Selected: ${selectedPhotos.length} photos`,
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
    lines.push(`if not exist "Selected_Photos\\${sanitized}" mkdir "Selected_Photos\\${sanitized}"`);
  });

  lines.push('');
  lines.push('echo [*] Copying high-resolution selected photos...');
  lines.push('set /a copied=0');
  lines.push('set /a missing=0');
  lines.push('');

  selectedPhotos.forEach((photo) => {
    const filename = photo.filename;
    const baseName = filename.replace(/\.[^/.]+$/, '');
    const folder = (photo.folderName || 'Selected').replace(/[/\\?%*:|"<>]/g, '_');

    lines.push(`if exist "${folder}\\${filename}" (`);
    lines.push(`    copy /Y "${folder}\\${filename}" "Selected_Photos\\${folder}\\" >nul`);
    lines.push(`    set /a copied+=1`);
    lines.push(`    echo [OK] Copied ${folder}\\${filename}`);
    lines.push(`) else if exist "${filename}" (`);
    lines.push(`    copy /Y "${filename}" "Selected_Photos\\${folder}\\" >nul`);
    lines.push(`    set /a copied+=1`);
    lines.push(`    echo [OK] Copied ${filename} to ${folder}`);
    lines.push(`) else if exist "${folder}\\${baseName}.*" (`);
    lines.push(`    copy /Y "${folder}\\${baseName}.*" "Selected_Photos\\${folder}\\" >nul`);
    lines.push(`    set /a copied+=1`);
    lines.push(`    echo [OK] Copied RAW/matching file for ${baseName}`);
    lines.push(`) else if exist "${baseName}.*" (`);
    lines.push(`    copy /Y "${baseName}.*" "Selected_Photos\\${folder}\\" >nul`);
    lines.push(`    set /a copied+=1`);
    lines.push(`    echo [OK] Copied RAW/matching file for ${baseName}`);
    lines.push(`) else if exist "..\\${folder}\\${filename}" (`);
    lines.push(`    copy /Y "..\\${folder}\\${filename}" "Selected_Photos\\${folder}\\" >nul`);
    lines.push(`    set /a copied+=1`);
    lines.push(`    echo [OK] Copied from parent: ${folder}\\${filename}`);
    lines.push(`) else (`);
    lines.push(`    set /a missing+=1`);
    lines.push(`    echo [MISSING] Could not find: ${folder}\\${filename}`);
    lines.push(`)`);
  });

  lines.push('');
  lines.push('echo =====================================================================');
  lines.push('echo                     COPYING COMPLETE!                                ');
  lines.push('echo =====================================================================');
  lines.push(`echo Total Selected : ${selectedPhotos.length}`);
  lines.push('echo Copied Files   : %copied%');
  lines.push('echo Missing Files  : %missing%');
  lines.push('echo.');
  lines.push('echo All your selected photos are inside the "Selected_Photos" folder!');
  lines.push('echo.');
  lines.push('if exist "Selected_Photos" explorer "Selected_Photos"');
  lines.push('pause');

  return lines.join('\r\n');
}

export function generateShScript(event: WeddingEvent): string {
  const allPhotos = event.photos || [];
  const selectedPhotos = allPhotos.filter((p) => p.isSelected);
  const foldersWithSelections = Array.from(
    new Set(selectedPhotos.map((p) => p.folderName || 'Selected'))
  );

  const lines: string[] = [
    '#!/bin/bash',
    'echo "====================================================================="',
    'echo "           A1 SMART SELECTION - AUTOMATED PHOTO COPIER (MAC/LINUX)   "',
    'echo "====================================================================="',
    `echo "Event: ${event.title}"`,
    `echo "Total Selected: ${selectedPhotos.length} photos"`,
    'echo ""',
    'mkdir -p "Selected_Photos"',
  ];

  foldersWithSelections.forEach((folder) => {
    const sanitized = folder.replace(/[/\\?%*:|"<>]/g, '_');
    lines.push(`mkdir -p "Selected_Photos/${sanitized}"`);
  });

  lines.push('');
  lines.push('copied=0');
  lines.push('missing=0');
  lines.push('');

  selectedPhotos.forEach((photo) => {
    const filename = photo.filename;
    const folder = (photo.folderName || 'Selected').replace(/[/\\?%*:|"<>]/g, '_');
    lines.push(`if [ -f "${folder}/${filename}" ]; then`);
    lines.push(`  cp "${folder}/${filename}" "Selected_Photos/${folder}/"`);
    lines.push(`  ((copied++))`);
    lines.push(`  echo "[OK] Copied ${folder}/${filename}"`);
    lines.push(`elif [ -f "${filename}" ]; then`);
    lines.push(`  cp "${filename}" "Selected_Photos/${folder}/"`);
    lines.push(`  ((copied++))`);
    lines.push(`  echo "[OK] Copied ${filename}"`);
    lines.push(`elif [ -f "../${folder}/${filename}" ]; then`);
    lines.push(`  cp "../${folder}/${filename}" "Selected_Photos/${folder}/"`);
    lines.push(`  ((copied++))`);
    lines.push(`  echo "[OK] Copied ../${folder}/${filename}"`);
    lines.push(`else`);
    lines.push(`  ((missing++))`);
    lines.push(`  echo "[MISSING] Not found: ${folder}/${filename}"`);
    lines.push(`fi`);
  });

  lines.push('');
  lines.push('echo "====================================================================="');
  lines.push(`echo "DONE! Copied: $copied, Missing: $missing out of ${selectedPhotos.length}"`);
  lines.push('echo "Open Selected_Photos folder to view."');

  return lines.join('\n');
}

export function generateLightroomFilenames(event: WeddingEvent, includeExtension: boolean = false): string {
  const allPhotos = event.photos || [];
  const selectedPhotos = allPhotos.filter((p) => p.isSelected);
  return selectedPhotos
    .map((p) => {
      if (includeExtension) return p.filename;
      return p.filename.replace(/\.[^/.]+$/, '');
    })
    .join(' ');
}

export function generateCsvReport(event: WeddingEvent): string {
  const allPhotos = event.photos || [];
  const selectedPhotos = allPhotos.filter((p) => p.isSelected);
  const rows: string[] = ['Folder,Filename,Selected Date,Client Comment'];

  selectedPhotos.forEach((p) => {
    const folder = `"${(p.folderName || '').replace(/"/g, '""')}"`;
    const filename = `"${(p.filename || '').replace(/"/g, '""')}"`;
    const date = `"${p.selectedAt || event.submittedAt || new Date().toISOString()}"`;
    const comment = `"${(p.clientComment || '').replace(/"/g, '""')}"`;
    rows.push(`${folder},${filename},${date},${comment}`);
  });

  return rows.join('\n');
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
