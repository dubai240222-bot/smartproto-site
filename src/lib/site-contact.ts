/**
 * SP-CONTACT-SCOUT-001 — public editorial contact only.
 * Never expose owner personal inbox, SMTP credentials, or admin routes.
 */

export const PUBLIC_EDITORIAL_EMAIL_DEFAULT = 'hesim.notifications@gmail.com';

export function publicEditorialEmail(): string {
  const raw = (process.env.SMARTPROTO_CONTACT_EMAIL || '').trim();
  if (raw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) && raw.length <= 120) {
    return raw;
  }
  return PUBLIC_EDITORIAL_EMAIL_DEFAULT;
}

export function publicEditorialMailto(subject?: string): string {
  const email = publicEditorialEmail();
  const q = subject ? `?subject=${encodeURIComponent(subject)}` : '';
  return `mailto:${email}${q}`;
}

export function localePath(locale: 'ru' | 'en' | 'tr', path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (locale === 'ru') return clean;
  return `/${locale}${clean}`;
}
