/**
 * SP-A-097F1 — public site URL for canonical / sitemap / metadata.
 * Never emit localhost in production SEO surfaces.
 */
const PRODUCTION_SITE_URL = 'https://www.smartproto.net';

export function getPublicSiteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/$/, '');
  if (!raw) return PRODUCTION_SITE_URL;

  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host.endsWith('.local')
    ) {
      // Misconfigured deploy (compose default was localhost:3100) — fall back to public host.
      return PRODUCTION_SITE_URL;
    }
    return `${u.protocol}//${u.host}`;
  } catch {
    return PRODUCTION_SITE_URL;
  }
}
