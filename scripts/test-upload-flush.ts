import assert from 'node:assert/strict';
import { shouldFlushBuffer } from '../src/utils/uploadBuffer.ts';

interface SimulatedFile {
  id: string;
  name: string;
  willFail: boolean;
}

function simulateUploadRun(files: SimulatedFile[], chunkSize: number = 6, batchLimit: number = 24) {
  let buffer: string[] = [];
  const flushedItems: string[] = [];
  const failedItems: string[] = [];
  let successfulProcessedCount = 0;

  try {
    for (let i = 0; i < files.length; i += chunkSize) {
      const chunk = files.slice(i, i + chunkSize);
      const isFinalChunk = i + chunkSize >= files.length;

      // Process chunk
      for (const f of chunk) {
        if (f.willFail) {
          failedItems.push(f.name);
        } else {
          buffer.push(f.name);
        }
      }

      // Check flush decision using pure helper
      if (shouldFlushBuffer(buffer.length, isFinalChunk, batchLimit)) {
        const toFlush = [...buffer];
        buffer = [];
        // Flush execution
        flushedItems.push(...toFlush);
        successfulProcessedCount += toFlush.length;
      }
    }
  } finally {
    // Flush any leftovers if buffer still has items
    if (buffer.length > 0) {
      const leftovers = [...buffer];
      buffer = [];
      flushedItems.push(...leftovers);
      successfulProcessedCount += leftovers.length;
    }
  }

  return { flushedItems, failedItems, successfulProcessedCount };
}

function runTests() {
  console.log('Testing upload buffer flush logic...');

  // Scenario 1: 10 files where the last 4 fail
  {
    const files: SimulatedFile[] = Array.from({ length: 10 }, (_, idx) => ({
      id: `file-${idx}`,
      name: `photo-${idx}.jpg`,
      willFail: idx >= 6, // 6 success, 4 fail (last 4 fail)
    }));

    const result = simulateUploadRun(files, 6, 24);
    assert.equal(result.failedItems.length, 4, 'Scenario 1: 4 files failed');
    assert.equal(result.flushedItems.length, 6, 'Scenario 1: 6 files flushed');
    assert.equal(result.successfulProcessedCount, 6, 'Scenario 1: count is 6');
    // Ensure every successful file is flushed exactly once
    const expected = files.filter((f) => !f.willFail).map((f) => f.name);
    assert.deepEqual(result.flushedItems, expected, 'Scenario 1: flushed matches expected');
    console.log('✓ Scenario 1 passed: 10 files where last 4 fail');
  }

  // Scenario 2: 30 files where the last 6 fail
  {
    const files: SimulatedFile[] = Array.from({ length: 30 }, (_, idx) => ({
      id: `file-${idx}`,
      name: `photo-${idx}.jpg`,
      willFail: idx >= 24, // 24 success, 6 fail
    }));

    const result = simulateUploadRun(files, 6, 24);
    assert.equal(result.failedItems.length, 6, 'Scenario 2: 6 files failed');
    assert.equal(result.flushedItems.length, 24, 'Scenario 2: 24 files flushed');
    assert.equal(result.successfulProcessedCount, 24, 'Scenario 2: count is 24');
    const expected = files.filter((f) => !f.willFail).map((f) => f.name);
    assert.deepEqual(result.flushedItems, expected, 'Scenario 2: flushed matches expected');
    console.log('✓ Scenario 2 passed: 30 files where last 6 fail');
  }

  // Scenario 3: 0 failures (e.g. 25 files, 0 failures)
  {
    const files: SimulatedFile[] = Array.from({ length: 25 }, (_, idx) => ({
      id: `file-${idx}`,
      name: `photo-${idx}.jpg`,
      willFail: false,
    }));

    const result = simulateUploadRun(files, 6, 24);
    assert.equal(result.failedItems.length, 0, 'Scenario 3: 0 files failed');
    assert.equal(result.flushedItems.length, 25, 'Scenario 3: 25 files flushed');
    assert.equal(result.successfulProcessedCount, 25, 'Scenario 3: count is 25');
    const expected = files.map((f) => f.name);
    assert.deepEqual(result.flushedItems, expected, 'Scenario 3: flushed matches expected');
    console.log('✓ Scenario 3 passed: 0 failures');
  }

  // Scenario 4: All failures (e.g. 12 files, all fail)
  {
    const files: SimulatedFile[] = Array.from({ length: 12 }, (_, idx) => ({
      id: `file-${idx}`,
      name: `photo-${idx}.raw`,
      willFail: true,
    }));

    const result = simulateUploadRun(files, 6, 24);
    assert.equal(result.failedItems.length, 12, 'Scenario 4: 12 files failed');
    assert.equal(result.flushedItems.length, 0, 'Scenario 4: 0 files flushed');
    assert.equal(result.successfulProcessedCount, 0, 'Scenario 4: count is 0');
    console.log('✓ Scenario 4 passed: all failures');
  }

  console.log('All upload buffer tests passed successfully!');
}

runTests();
