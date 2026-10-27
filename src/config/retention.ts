/**
 * Shared Retention Policy Configuration
 * Single source of truth for wedding event retention across client and server.
 */

export const RETENTION_DAYS = 40;
export const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
