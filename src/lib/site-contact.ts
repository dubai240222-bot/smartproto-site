/**
 * SP-A-102 — public editorial contact (shown on site).
 * Owner personal inbox is NEVER public — see owner-notify.ts.
 */

export function publicEditorialEmail(): string | null {
  const raw = (process.env.SMARTPROTO_CONTACT_EMAIL || '').trim();
  if (!raw) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) || raw.length > 120) return null;
  return raw;
}

export function publicEditorialMailto(subject?: string): string | null {
  const email = publicEditorialEmail();
  if (!email) return null;
  const q = subject ? `?subject=${encodeURIComponent(subject)}` : '';
  return `mailto:${email}${q}`;
}
