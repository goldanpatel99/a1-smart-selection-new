import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'a1smartselection-photos';
export const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');

let s3ClientInstance: S3Client | null = null;

export function isR2Configured(): boolean {
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);
}

export function isR2PublicUrlConfigured(): boolean {
  return Boolean(R2_PUBLIC_URL && R2_PUBLIC_URL.trim().length > 0);
}

export function getR2Client(): S3Client | null {
  if (!isR2Configured()) {
    return null;
  }
  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3ClientInstance;
}

export async function createPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 900
): Promise<{ uploadUrl: string; publicUrl: string; key: string } | null> {
  const client = getR2Client();
  if (!client || !isR2PublicUrlConfigured()) {
    return null;
  }

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  // NEVER return S3 API URL as public URL - strictly use R2_PUBLIC_URL
  const publicUrl = `${R2_PUBLIC_URL}/${key}`;

  return { uploadUrl, publicUrl, key };
}

export interface ListR2ObjectsResult {
  ok: boolean;
  keys: string[];
  error?: string;
}

export interface DeleteR2ObjectsResult {
  ok: boolean;
  errorCount: number;
  errors?: any[];
}

/**
 * List all object keys matching a prefix using ListObjectsV2 with pagination.
 * If R2 is not configured, returns { ok: false, error: 'R2_NOT_CONFIGURED', keys: [] }.
 */
export async function listR2ObjectsByPrefix(prefix: string): Promise<ListR2ObjectsResult> {
  if (!isR2Configured()) {
    return { ok: false, keys: [], error: 'R2_NOT_CONFIGURED' };
  }

  const client = getR2Client();
  if (!client) {
    return { ok: false, keys: [], error: 'R2_NOT_CONFIGURED' };
  }

  const allKeys: string[] = [];
  let continuationToken: string | undefined = undefined;

  try {
    do {
      const command: ListObjectsV2Command = new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await client.send(command);
      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key) {
            allKeys.push(obj.Key);
          }
        }
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return { ok: true, keys: allKeys };
  } catch (err: any) {
    console.error(`Failed to list R2 objects for prefix "${prefix}":`, err);
    return { ok: false, keys: allKeys, error: err.message || 'LIST_FAILED' };
  }
}

/**
 * Delete R2 objects chunked into batches of at most 1000 keys (S3 DeleteObjects limit).
 * Explicitly inspects response.Errors from R2.
 */
export async function deleteR2Objects(keys: string[]): Promise<DeleteR2ObjectsResult> {
  if (!keys.length) return { ok: true, errorCount: 0 };

  if (!isR2Configured()) {
    return { ok: false, errorCount: keys.length, errors: [{ message: 'R2_NOT_CONFIGURED' }] };
  }

  const client = getR2Client();
  if (!client) {
    return { ok: false, errorCount: keys.length, errors: [{ message: 'R2_NOT_CONFIGURED' }] };
  }

  const CHUNK_SIZE = 1000;
  let errorCount = 0;
  const allErrors: any[] = [];

  for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
    const chunk = keys.slice(i, i + CHUNK_SIZE);
    try {
      const command = new DeleteObjectsCommand({
        Bucket: R2_BUCKET_NAME,
        Delete: {
          Objects: chunk.map((k) => ({ Key: k })),
          Quiet: false, // Do not suppress errors; we inspect response.Errors
        },
      });
      const response = await client.send(command);
      if (response.Errors && response.Errors.length > 0) {
        console.error(`R2 deleteObjects returned ${response.Errors.length} errors:`, response.Errors);
        errorCount += response.Errors.length;
        allErrors.push(...response.Errors);
      }
    } catch (err: any) {
      console.error(`Failed to delete R2 objects chunk (${chunk.length} items):`, err);
      errorCount += chunk.length;
      allErrors.push({ message: err.message || 'Delete chunk failed' });
    }
  }

  return { ok: errorCount === 0, errorCount, errors: allErrors };
}

/**
 * Delete all R2 objects under a given folder prefix, looping with pagination and verifying
 * that 0 keys remain.
 */
export async function deleteR2Folder(prefix: string): Promise<{ ok: boolean; deletedCount: number; error?: string }> {
  const listResult = await listR2ObjectsByPrefix(prefix);
  if (!listResult.ok) {
    return { ok: false, deletedCount: 0, error: listResult.error };
  }

  if (listResult.keys.length === 0) {
    return { ok: true, deletedCount: 0 };
  }

  const deleteResult = await deleteR2Objects(listResult.keys);
  if (!deleteResult.ok) {
    return { ok: false, deletedCount: listResult.keys.length - deleteResult.errorCount, error: 'DELETE_FAILED' };
  }

  // Re-verify that 0 keys remain
  const verifyList = await listR2ObjectsByPrefix(prefix);
  if (!verifyList.ok) {
    return { ok: false, deletedCount: listResult.keys.length, error: verifyList.error };
  }
  if (verifyList.keys.length > 0) {
    console.warn(`Folder ${prefix} still contains ${verifyList.keys.length} items after deletion.`);
    return { ok: false, deletedCount: listResult.keys.length - verifyList.keys.length, error: 'KEYS_REMAIN' };
  }

  return { ok: true, deletedCount: listResult.keys.length };
}
