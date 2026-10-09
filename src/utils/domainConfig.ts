/**
 * Domain & URL Utility for A1 Smart Selection
 * Ensures all client links, sharing links, and QR codes use the user's custom domain (a1smartselection.sbs).
 */

export const CUSTOM_DOMAIN = 'a1smartselection.sbs';

/**
 * Returns the canonical base URL for the platform.
 * If user has visited via a custom domain, or when sharing client gallery links,
 * it formats with the verified custom domain (https://a1smartselection.sbs).
 */
export const getBaseAppUrl = (): string => {
  if (typeof window !== 'undefined') {
    const currentHost = window.location.hostname;
    // If the browser is running on the custom domain (or localhost for dev testing)
    if (currentHost.includes('a1smartselection.sbs')) {
      return `${window.location.protocol}//${window.location.host}`;
    }
  }
  // Default canonical domain for client sharing
  return `https://${CUSTOM_DOMAIN}`;
};

/**
 * Generates the clean client gallery share link with custom domain
 * e.g. https://a1smartselection.sbs/#gallery/wedding-slug
 */
export const getClientGalleryUrl = (slugOrId: string): string => {
  const base = getBaseAppUrl();
  return `${base}/#gallery/${slugOrId}`;
};
