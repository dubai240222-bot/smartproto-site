import { getPublicSiteUrl } from '@/lib/site-url';

/** Turn relative /api/media/... or /brand/... into absolute https URL for OG/sitemap. */
export function absolutePublicUrl(pathOrUrl: string | undefined | null): string | undefined {
  if (!pathOrUrl) return undefined;
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = getPublicSiteUrl().replace(/\/$/, '');
  return `${base}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}

/** Prefer hero image, then imageUrl. */
export function articleOgImage(article: {
  imageUrl?: string;
  images?: { url: string; role: string }[];
}): string | undefined {
  const hero =
    article.images?.find((i) => i.role === 'hero')?.url ||
    article.imageUrl ||
    undefined;
  return absolutePublicUrl(hero);
}
