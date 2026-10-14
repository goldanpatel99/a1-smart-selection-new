/**
 * Domain & URL Utility for A1 Smart Selection
 * Ensures all client links, sharing links, and QR codes use the user's custom domain (a1smartselection.sbs).
 */

export const CUSTOM_DOMAIN = 'a1smartselection.sbs';

/**
 * Returns the canonical base URL for the platform.
 * Dynamically detects window.location.origin so client links work directly on whatever host
 * the user is operating on (e.g., custom domain a1smartselection.sbs, Netlify, or local).
 */
export const getBaseAppUrl = (): string => {
  if (typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null') {
    return window.location.origin;
  }
  return `https://${CUSTOM_DOMAIN}`;
};

/**
 * Generates the clean client gallery share link
 * e.g. https://a1smartselection.sbs/#gallery/wedding-slug
 */
export const getClientGalleryUrl = (slugOrId: string): string => {
  const base = getBaseAppUrl();
  return `${base}/#gallery/${slugOrId}`;
};
