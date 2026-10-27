import { useState, useEffect } from 'react';
import { Photo, isRemoteUrl } from '../types';
import { idbStorage } from './idbStorage';

interface CacheEntry {
  url: string;
  lastUsed: number;
}

// Memory cache of ephemeral Object URLs for fast UI rendering
const memoryCache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 300;

function evictLru() {
  if (memoryCache.size <= MAX_CACHE_ENTRIES) return;
  const entries = Array.from(memoryCache.entries());
  entries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  const toRemove = entries.slice(0, 50);
  for (const [key, item] of toRemove) {
    try {
      URL.revokeObjectURL(item.url);
    } catch {}
    memoryCache.delete(key);
  }
}

function setInCache(key: string, url: string) {
  evictLru();
  memoryCache.set(key, { url, lastUsed: Date.now() });
}

/**
 * Synchronous resolver for immediate render (checks remote URL or existing memory cache)
 */
export function getSynchronousPhotoSrc(
  photo?: Photo | null,
  variant: 'thumb' | 'full' = 'thumb'
): string | null {
  if (!photo) return null;

  if (variant === 'thumb') {
    if (isRemoteUrl(photo.thumbnailUrl)) return photo.thumbnailUrl!;
    if (isRemoteUrl(photo.url)) return photo.url;
  } else {
    if (isRemoteUrl(photo.url)) return photo.url;
    if (isRemoteUrl(photo.thumbnailUrl)) return photo.thumbnailUrl!;
  }

  const cacheKey = `${photo.id}:${variant}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.url;
  }

  return null;
}

/**
 * Asynchronously resolves photo src:
 * - If synced (remote HTTPS), returns remote URL immediately
 * - If local, fetches compressed Blob from IndexedDB and returns a cached, revocable Object URL
 */
export async function resolvePhotoSrc(
  photo: Photo,
  variant: 'thumb' | 'full' = 'thumb'
): Promise<string> {
  const syncSrc = getSynchronousPhotoSrc(photo, variant);
  if (syncSrc) return syncSrc;

  const cacheKey = `${photo.id}:${variant}`;

  try {
    const record = await idbStorage.getPhotoBlob(photo.id);
    if (record) {
      const blob = variant === 'thumb' ? (record.thumbBlob || record.blob) : record.blob;
      if (blob && blob.size > 0) {
        const objectUrl = URL.createObjectURL(blob);
        setInCache(cacheKey, objectUrl);
        return objectUrl;
      }
    }
  } catch (err) {
    console.warn(`Failed to resolve local photo blob for ${photo.id}:`, err);
  }

  // Fallback to whatever URL is stored if valid
  if (isRemoteUrl(photo.thumbnailUrl)) return photo.thumbnailUrl!;
  if (isRemoteUrl(photo.url)) return photo.url;
  return '';
}

/**
 * React hook to resolve photo src smoothly with loading / fallback support
 */
export function usePhotoSrc(photo?: Photo | null, variant: 'thumb' | 'full' = 'thumb'): string {
  const [src, setSrc] = useState<string>(() => getSynchronousPhotoSrc(photo, variant) || '');

  useEffect(() => {
    if (!photo) {
      setSrc('');
      return;
    }

    const immediate = getSynchronousPhotoSrc(photo, variant);
    if (immediate) {
      setSrc(immediate);
      return;
    }

    let isMounted = true;
    resolvePhotoSrc(photo, variant).then((resolved) => {
      if (isMounted && resolved) {
        setSrc(resolved);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [photo?.id, photo?.url, photo?.thumbnailUrl, variant]);

  return src;
}

/**
 * Revokes all cached Object URLs and clears memory cache (e.g. on logout or app reset)
 */
export function cleanupPhotoSrcCache(): void {
  for (const [, item] of memoryCache) {
    try {
      URL.revokeObjectURL(item.url);
    } catch {}
  }
  memoryCache.clear();
}
