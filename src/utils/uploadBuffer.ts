/**
 * Pure helper for upload buffer flushing decisions.
 * Used by PhotoUploadPage to guarantee buffered photos are flushed
 * when reaching threshold or upon final chunk, even if subsequent/final chunks contain errors.
 */

export interface UploadBufferDecision {
  bufferLength: number;
  isFinalChunk: boolean;
  minBatchSize?: number;
}

export function shouldFlushBuffer(
  bufferLength: number,
  isFinalChunk: boolean,
  minBatchSize: number = 24
): boolean {
  if (bufferLength <= 0) return false;
  return bufferLength >= minBatchSize || isFinalChunk;
}
