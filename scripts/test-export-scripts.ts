import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { generateBatScript, generateShScript, type PhotoExportItem, type EventExportItem } from '../src/utils/batGenerator.ts';

const pathologicalPhotos: PhotoExportItem[] = [
  { filename: 'IMG_1234 (1).JPG', folderName: 'Haldi', isSelected: true },
  { filename: 'A&B.jpg', folderName: 'Haldi & Sangeet', isSelected: true },
  { filename: '100%.jpg', folderName: 'Reception', isSelected: true },
  { filename: 'a^b.jpg', folderName: 'Wedding (Main)', isSelected: true },
  { filename: 'DSC !x!.jpg', folderName: 'Reception', isSelected: true },
  { filename: 'DSC_0008_विवाह_मंडप.jpg', folderName: 'फेरे_रस्म', isSelected: true },
  { filename: 'DSC_0009_🎉_celebration.jpg', folderName: 'Party_🎊', isSelected: true },
  { filename: 'DSC spaces in name (2).jpg', folderName: 'Couple Photos & Candid', isSelected: true },
];

const mockEvent: EventExportItem = {
  id: 'evt-test-1234',
  slug: 'test-couple-wedding',
  title: 'Priya & Rahul\'s "Grand" Wedding (2026) %100%',
  coupleName: 'Priya & Rahul (Special)',
};

console.log('Testing export script generator against pathological test cases...');

// 1. Generate Batch script (.bat)
const batScript = generateBatScript(mockEvent, pathologicalPhotos);
const batLines = batScript.split('\r\n');

console.log('Validating Windows .BAT syntax & CMD parser constraints...');

// a) No unmatched parens in blocks
let openParens = 0;
for (let i = 0; i < batLines.length; i++) {
  const line = batLines[i];
  if (line.endsWith('(')) openParens++;
  if (line === ')') openParens--;
}
if (openParens !== 0) {
  throw new Error(`BAT parser validation failed: Unbalanced block parentheses (diff: ${openParens})`);
}

// b) Verify UTF-8 codepage & DisableDelayedExpansion are set
if (!batScript.includes('chcp 65001 >nul')) {
  throw new Error('BAT script missing chcp 65001 >nul header for Unicode support');
}
if (!batScript.includes('setlocal DisableDelayedExpansion')) {
  throw new Error('BAT script missing setlocal DisableDelayedExpansion header');
}

// (1) Assert no line contains user data outside double quotes
for (const photo of pathologicalPhotos) {
  const safeFilename = photo.filename.replace(/"/g, '').replace(/%/g, '%%');
  for (const line of batLines) {
    if (line.includes(safeFilename)) {
      // Must be inside double quotes
      const isQuoted = /^[^"]*"[^"]*"[^"]*$/.test(line) || (line.startsWith('set "') && line.endsWith('"'));
      if (!isQuoted) {
        throw new Error(`User data found outside double quotes in line: ${line}`);
      }
    }
  }
}

// (2) Assert no `call` line carries user data (must be bare `call :copyone`)
const callLines = batLines.filter((l) => l.trim().startsWith('call'));
if (callLines.length === 0) {
  throw new Error('BAT script must have call :copyone lines');
}
for (const callLine of callLines) {
  if (callLine.trim() !== 'call :copyone') {
    throw new Error(`CALL line must be bare call :copyone without user data, but found: ${callLine}`);
  }
}

// (3) Inside any ( ... ) block no line contains %FILE_NAME% / %REL_DIR% / %BASE_NAME% outside double quotes
let inParenthesizedBlock = false;
for (const line of batLines) {
  if (line.endsWith('(')) {
    inParenthesizedBlock = true;
    continue;
  }
  if (line === ')') {
    inParenthesizedBlock = false;
    continue;
  }
  if (inParenthesizedBlock) {
    const varsToCheck = ['%FILE_NAME%', '%REL_DIR%', '%BASE_NAME%'];
    for (const varName of varsToCheck) {
      if (line.includes(varName)) {
        // Strip everything inside double quotes
        const outsideQuotes = line.replace(/"[^"]*"/g, '');
        if (outsideQuotes.includes(varName)) {
          throw new Error(`Found unquoted variable ${varName} inside parenthesized block: ${line}`);
        }
      }
    }
  }
}

// (4) Assert every literal % from a test name appears as %%
if (batScript.includes('100%.jpg')) {
  throw new Error('Raw "100%.jpg" found unescaped in BAT script! Must be "100%%.jpg"');
}
if (!batScript.includes('100%%.jpg')) {
  throw new Error('Escaped "100%%.jpg" missing from BAT script!');
}

console.log('✓ Windows .BAT script passed all strengthened CMD parser & quoting tests.');

// 2. Generate Bash script (.sh) and test with bash -n
console.log('Validating macOS/Linux .SH script with bash -n syntax check...');
const shScript = generateShScript(mockEvent, pathologicalPhotos);

const tempShPath = path.resolve('/tmp', 'test_script.sh');
fs.writeFileSync(tempShPath, shScript, { mode: 0o755 });

try {
  execSync(`bash -n "${tempShPath}"`, { stdio: 'pipe' });
  console.log('✓ macOS/Linux .SH script passed bash -n syntax validation with 0 errors.');
} catch (bashErr: any) {
  throw new Error(`Bash -n syntax error: ${bashErr.stderr?.toString() || bashErr.message}`);
} finally {
  try {
    fs.unlinkSync(tempShPath);
  } catch {}
}

console.log('All export script test assertions PASSED successfully!');
