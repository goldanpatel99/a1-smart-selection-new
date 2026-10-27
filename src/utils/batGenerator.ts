
export interface PhotoExportItem {
  filename: string;
  folderName?: string;
  isSelected: boolean;
  selectedAt?: string;
  clientComment?: string;
  sizeBytes?: number;
}

export interface EventExportItem {
  id: string;
  slug?: string;
  title: string;
  coupleName: string;
}

/**
 * Escapes a string value for Windows Batch `set "VAR=..."`.
 * 1. Double % to %% so CMD does not expand it during parsing.
 * 2. Remove double quotes since Windows NTFS does not allow quotes in file names anyway.
 */
export function escapeBatValue(str: string): string {
  return (str || '').replace(/"/g, '').replace(/%/g, '%%');
}

/**
 * Escapes an argument for a Windows Batch `call :subroutine "arg"` command (legacy compatibility).
 */
export function escapeBatArg(str: string): string {
  return `"${escapeBatValue(str)}"`;
}

/**
 * Escapes an argument for a Unix Bash command using single-quote wrapping.
 * In POSIX bash, everything inside '...' is 100% literal.
 * A single quote is escaped via '\''
 */
export function escapeBashArg(str: string): string {
  return "'" + (str || '').replace(/'/g, "'\\''") + "'";
}

/**
 * Sanitize folder name for filesystem directory creation
 */
export function sanitizeFolderName(folder: string): string {
  return (folder || 'Selected').replace(/[/\\?%*:|"<>^]/g, '_').trim() || 'Selected';
}

/**
 * Generate Windows Batch script (.bat) using quoted SET and bare call :copyone.
 * By setting variables before a bare call :copyone, CMD never parses user data
 * as call arguments (avoiding secondary % expansion) or unquoted tokens inside parenthesized blocks.
 */
export function generateBatScript(
  event: EventExportItem & { photos?: PhotoExportItem[] },
  photos?: PhotoExportItem[]
): string {
  const selectedPhotos = (photos || event.photos || []).filter((p) => p.isSelected);
  const totalSelected = selectedPhotos.length;

  const foldersWithSelections = Array.from(
    new Set(selectedPhotos.map((p) => sanitizeFolderName(p.folderName || 'Selected')))
  );

  const safeTitle = (event.title || 'Wedding Event').replace(/[%^&<>|"]/g, '');
  const safeCouple = (event.coupleName || 'Wedding Couple').replace(/[%^&<>|"]/g, '');

  const lines: string[] = [
    '@echo off',
    'setlocal DisableDelayedExpansion',
    'chcp 65001 >nul',
    'title A1 Smart Selection - Auto Photo Copier',
    'color 0A',
    'echo =====================================================================',
    'echo            A1 SMART SELECTION - AUTOMATED PHOTO COPIER                ',
    'echo =====================================================================',
    `echo Event: "${safeTitle}"`,
    `echo Client: "${safeCouple}"`,
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
    lines.push(`if not exist "Selected_Photos\\${escapeBatValue(folder)}" mkdir "Selected_Photos\\${escapeBatValue(folder)}"`);
  });

  lines.push('');
  lines.push('echo [*] Copying high-resolution selected photos...');
  lines.push('set /a copied=0');
  lines.push('set /a missing=0');
  lines.push('');

  // Set variables and call bare :copyone for each photo
  selectedPhotos.forEach((photo) => {
    const filename = photo.filename;
    const baseName = filename.replace(/\.[^/.]+$/, '');
    const folder = sanitizeFolderName(photo.folderName || 'Selected');

    lines.push(`set "REL_DIR=${escapeBatValue(folder)}"`);
    lines.push(`set "FILE_NAME=${escapeBatValue(filename)}"`);
    lines.push(`set "BASE_NAME=${escapeBatValue(baseName)}"`);
    lines.push('call :copyone');
  });

  lines.push('');
  lines.push('echo =====================================================================');
  lines.push('echo                     COPYING COMPLETE!                                ');
  lines.push('echo =====================================================================');
  lines.push(`echo Total Selected : ${totalSelected}`);
  lines.push('echo Copied Files   : %copied%');
  lines.push('echo Missing Files  : %missing%');
  lines.push('echo.');
  lines.push('echo All your selected photos are inside the "Selected_Photos" folder!');
  lines.push('echo.');
  lines.push('if exist "Selected_Photos" explorer "Selected_Photos"');
  lines.push('pause');
  lines.push('goto :eof');
  lines.push('');

  // Subroutine: copyone (Evaluates variable expansion safely with quoted paths, jumps to :success to show accurate running count outside blocks)
  lines.push(':copyone');
  lines.push('if exist "%REL_DIR%\\%FILE_NAME%" (');
  lines.push('    copy /Y "%REL_DIR%\\%FILE_NAME%" "Selected_Photos\\%REL_DIR%\\" >nul');
  lines.push('    goto :success');
  lines.push(')');
  lines.push('');
  lines.push('if exist "%FILE_NAME%" (');
  lines.push('    copy /Y "%FILE_NAME%" "Selected_Photos\\%REL_DIR%\\" >nul');
  lines.push('    goto :success');
  lines.push(')');
  lines.push('');
  lines.push('if exist "..\\%REL_DIR%\\%FILE_NAME%" (');
  lines.push('    copy /Y "..\\%REL_DIR%\\%FILE_NAME%" "Selected_Photos\\%REL_DIR%\\" >nul');
  lines.push('    goto :success');
  lines.push(')');
  lines.push('');
  lines.push('if exist "%REL_DIR%\\%BASE_NAME%.*" (');
  lines.push('    copy /Y "%REL_DIR%\\%BASE_NAME%.*" "Selected_Photos\\%REL_DIR%\\" >nul');
  lines.push('    goto :success');
  lines.push(')');
  lines.push('');
  lines.push('if exist "%BASE_NAME%.*" (');
  lines.push('    copy /Y "%BASE_NAME%.*" "Selected_Photos\\%REL_DIR%\\" >nul');
  lines.push('    goto :success');
  lines.push(')');
  lines.push('');
  lines.push('set /a missing+=1');
  lines.push('echo [MISSING] File not found in local folders');
  lines.push('exit /b 1');
  lines.push('');
  lines.push(':success');
  lines.push('set /a copied+=1');
  lines.push('echo [OK] %copied% copied');
  lines.push('exit /b 0');
  lines.push('');

  return lines.join('\r\n');
}

/**
 * Generate macOS/Linux Shell script (.sh) with set -euo pipefail and safe quoting.
 */
export function generateShScript(
  event: EventExportItem & { photos?: PhotoExportItem[] },
  photos?: PhotoExportItem[]
): string {
  const selectedPhotos = (photos || event.photos || []).filter((p) => p.isSelected);
  const totalSelected = selectedPhotos.length;

  const foldersWithSelections = Array.from(
    new Set(selectedPhotos.map((p) => sanitizeFolderName(p.folderName || 'Selected')))
  );

  const lines: string[] = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    'printf "=====================================================================\\n"',
    'printf "           A1 SMART SELECTION - AUTOMATED PHOTO COPIER (MAC/LINUX)   \\n"',
    'printf "=====================================================================\\n"',
    `printf "Event: %s\\n" ${escapeBashArg(event.title || 'Wedding Event')}`,
    `printf "Total Selected: %d photos\\n" "${totalSelected}"`,
    'printf "\\n"',
    'mkdir -p "Selected_Photos"',
  ];

  foldersWithSelections.forEach((folder) => {
    lines.push(`mkdir -p "Selected_Photos/${folder}"`);
  });

  lines.push('');
  lines.push('copied=0');
  lines.push('missing=0');
  lines.push('');
  lines.push('copy_one() {');
  lines.push('  local folder="$1"');
  lines.push('  local file="$2"');
  lines.push('  local base="$3"');
  lines.push('');
  lines.push('  if [ -f "${folder}/${file}" ]; then');
  lines.push('    cp "${folder}/${file}" "Selected_Photos/${folder}/"');
  lines.push('    copied=$((copied + 1))');
  lines.push('    printf "[OK] Copied %s/%s\\n" "${folder}" "${file}"');
  lines.push('    return 0');
  lines.push('  fi');
  lines.push('');
  lines.push('  if [ -f "${file}" ]; then');
  lines.push('    cp "${file}" "Selected_Photos/${folder}/"');
  lines.push('    copied=$((copied + 1))');
  lines.push('    printf "[OK] Copied %s to %s\\n" "${file}" "${folder}"');
  lines.push('    return 0');
  lines.push('  fi');
  lines.push('');
  lines.push('  if [ -f "../${folder}/${file}" ]; then');
  lines.push('    cp "../${folder}/${file}" "Selected_Photos/${folder}/"');
  lines.push('    copied=$((copied + 1))');
  lines.push('    printf "[OK] Copied ../%s/%s\\n" "${folder}" "${file}"');
  lines.push('    return 0');
  lines.push('  fi');
  lines.push('');
  lines.push('  local match_found=0');
  lines.push('  for f in "${folder}/${base}".* "${base}".*; do');
  lines.push('    if [ -f "$f" ]; then');
  lines.push('      cp "$f" "Selected_Photos/${folder}/"');
  lines.push('      copied=$((copied + 1))');
  lines.push('      printf "[OK] Copied matching file %s\\n" "$f"');
  lines.push('      match_found=1');
  lines.push('      break');
  lines.push('    fi');
  lines.push('  done');
  lines.push('');
  lines.push('  if [ "$match_found" -eq 1 ]; then');
  lines.push('    return 0');
  lines.push('  fi');
  lines.push('');
  lines.push('  missing=$((missing + 1))');
  lines.push('  printf "[MISSING] Not found: %s/%s\\n" "${folder}" "${file}"');
  lines.push('  return 0');
  lines.push('}');
  lines.push('');

  selectedPhotos.forEach((photo) => {
    const filename = photo.filename;
    const baseName = filename.replace(/\.[^/.]+$/, '');
    const folder = sanitizeFolderName(photo.folderName || 'Selected');

    lines.push(
      `copy_one ${escapeBashArg(folder)} ${escapeBashArg(filename)} ${escapeBashArg(baseName)}`
    );
  });

  lines.push('');
  lines.push('printf "=====================================================================\\n"');
  lines.push(
    `printf "DONE! Copied: %d, Missing: %d out of %d\\n" "$copied" "$missing" "${totalSelected}"`
  );
  lines.push('printf "Open Selected_Photos folder to view.\\n"');

  return lines.join('\n');
}

/**
 * Generate Lightroom Space-Separated Filenames Query
 */
export function generateLightroomFilenames(
  event: EventExportItem & { photos?: PhotoExportItem[] },
  photosOrIncludeExt?: PhotoExportItem[] | boolean,
  includeExtension: boolean = false
): string {
  let photos: PhotoExportItem[] = [];
  let withExt = false;
  if (Array.isArray(photosOrIncludeExt)) {
    photos = photosOrIncludeExt;
    withExt = includeExtension;
  } else {
    photos = event.photos || [];
    withExt = Boolean(photosOrIncludeExt);
  }

  const selectedPhotos = photos.filter((p) => p.isSelected);
  return selectedPhotos
    .map((p) => {
      if (withExt) return p.filename;
      return p.filename.replace(/\.[^/.]+$/, '');
    })
    .join(' ');
}

/**
 * Generate CSV Report
 */
export function generateCsvReport(
  event: EventExportItem & { photos?: PhotoExportItem[] },
  photos?: PhotoExportItem[]
): string {
  const selectedPhotos = (photos || event.photos || []).filter((p) => p.isSelected);
  const rows: string[] = ['Folder,Filename,Selected Date,Client Comment,Size (KB)'];

  selectedPhotos.forEach((p) => {
    const folder = `"${(p.folderName || '').replace(/"/g, '""')}"`;
    const filename = `"${(p.filename || '').replace(/"/g, '""')}"`;
    const date = `"${p.selectedAt || new Date().toISOString()}"`;
    const comment = `"${(p.clientComment || '').replace(/"/g, '""')}"`;
    const sizeKb = p.sizeBytes ? Math.round(p.sizeBytes / 1024) : 0;
    rows.push(`${folder},${filename},${date},${comment},${sizeKb}`);
  });

  return rows.join('\r\n');
}

/**
 * Helper to download content as a file
 */
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
