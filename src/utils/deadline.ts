/**
 * Deadline utility for converting Firestore Timestamps, ISO strings, {seconds}, or deadlineDate
 * to a standardized epoch millisecond timestamp and ISO string.
 * End-of-day in IST is 23:59:59.999 IST = 18:29:59.999 UTC.
 */

export function getDeadlineMs(event: {
  deadlineAt?: any;
  deadlineDate?: string;
}): number {
  if (event.deadlineAt) {
    if (typeof event.deadlineAt === 'number') {
      return event.deadlineAt;
    }
    if (typeof event.deadlineAt.toMillis === 'function') {
      return event.deadlineAt.toMillis();
    }
    if (typeof event.deadlineAt.toDate === 'function') {
      return event.deadlineAt.toDate().getTime();
    }
    if (typeof event.deadlineAt === 'object' && typeof event.deadlineAt.seconds === 'number') {
      return event.deadlineAt.seconds * 1000 + Math.floor((event.deadlineAt.nanoseconds || 0) / 1e6);
    }
    if (typeof event.deadlineAt === 'string') {
      const parsed = Date.parse(event.deadlineAt);
      if (!isNaN(parsed)) return parsed;
    }
    if (event.deadlineAt instanceof Date) {
      return event.deadlineAt.getTime();
    }
  }

  // Fallback to deadlineDate (YYYY-MM-DD) -> IST 23:59:59.999 (UTC 18:29:59.999)
  if (event.deadlineDate && /^\d{4}-\d{2}-\d{2}$/.test(event.deadlineDate.trim())) {
    const [y, m, d] = event.deadlineDate.trim().split('-').map(Number);
    return Date.UTC(y, m - 1, d, 18, 29, 59, 999);
  }

  // Fallback: 30 days from now
  return Date.now() + 30 * 24 * 60 * 60 * 1000;
}

export function isEventExpired(event: {
  status?: string;
  deadlineAt?: any;
  deadlineDate?: string;
}): boolean {
  if (event.status === 'expired') return true;
  const deadlineMs = getDeadlineMs(event);
  return Date.now() > deadlineMs;
}

export function normalizeDeadlineAt(deadlineAt: any, deadlineDate?: string): string {
  const ms = getDeadlineMs({ deadlineAt, deadlineDate });
  return new Date(ms).toISOString();
}
