/**
 * SP-A-102 — Article media set (hero + gallery) shared across RU / EN / TR.
 */

import { sanitizeCaption } from './collectors/article-image-miner';

export type ArticleMediaRole = 'hero' | 'secondary' | 'detail' | 'gallery';

export interface ArticleMediaItem {
  url: string;
  role: ArticleMediaRole;
  sourceUrl?: string;
  caption?: string;
  credit?: string;
  sortOrder?: number;
  matchLevel?: 'exact' | 'research' | 'category' | 'weak' | 'none';
  label?: string;
}

export interface ArticleMediaSlide {
  url: string;
  caption?: string;
  credit?: string;
  alt: string;
}

function roleSortOrder(role: ArticleMediaRole, sortOrder?: number): number {
  if (role === 'hero') return 0;
  if (typeof sortOrder === 'number') return 10 + sortOrder;
  if (role === 'secondary') return 20;
  if (role === 'detail') return 30;
  if (role === 'gallery') return 40;
  return 50;
}

/** Normalize legacy secondary/detail + new gallery roles into ordered slides. */
export function getArticleMediaSlides(
  article: {
    title: string;
    imageUrl?: string;
    images?: ArticleMediaItem[];
  },
  displayUrl?: (url: string) => string | undefined,
): ArticleMediaSlide[] {
  const resolve = displayUrl || ((u: string) => u);
  const raw = article.images?.length
    ? [...article.images]
    : article.imageUrl
      ? [{ url: article.imageUrl, role: 'hero' as const }]
      : [];

  const sorted = raw
    .filter((i) => i.url)
    .sort((a, b) => roleSortOrder(a.role, a.sortOrder) - roleSortOrder(b.role, b.sortOrder));

  const seen = new Set<string>();
  const slides: ArticleMediaSlide[] = [];
  for (const img of sorted) {
    const url = resolve(img.url) || img.url;
    if (seen.has(url)) continue;
    seen.add(url);
    slides.push({
      url,
      caption: sanitizeCaption(img.caption?.trim()) || undefined,
      credit: img.credit?.trim() || undefined,
      alt: sanitizeCaption(img.caption?.trim()) || article.title,
    });
  }
  return slides;
}

export function articleMediaCount(article: {
  title?: string;
  images?: ArticleMediaItem[];
  imageUrl?: string;
}): number {
  return getArticleMediaSlides({ title: article.title || 'Article', ...article }).length;
}

/** Hero for publish/DB — prefer explicit hero role; never promote uncertain secondary over verified source. */
export function pickPublishHero(
  images: ArticleMediaItem[],
  opts?: { fallbackUrl?: string; title?: string },
): ArticleMediaItem | null {
  if (!images.length) {
    if (opts?.fallbackUrl?.trim()) {
      return { url: opts.fallbackUrl.trim(), role: 'hero' };
    }
    return null;
  }
  const hero = images.find((i) => i.role === 'hero' && i.url);
  if (hero) return hero;
  const exact = images.find((i) => i.matchLevel === 'exact' && i.url);
  if (exact) return { ...exact, role: 'hero' };
  const research = images.find((i) => i.matchLevel === 'research' && i.url);
  if (research) return { ...research, role: 'hero' };
  // Secondary/gallery only — do not auto-promote without hero/exact/research signal.
  if (opts?.fallbackUrl?.trim()) {
    return { url: opts.fallbackUrl.trim(), role: 'hero' };
  }
  return null;
}

export function orderImagesForArticle(
  images: ArticleMediaItem[],
  hero: ArticleMediaItem | null,
): ArticleMediaItem[] {
  if (!hero?.url) return images;
  const rest = images.filter((i) => i.url !== hero.url);
  return [{ ...hero, role: 'hero' }, ...rest];
}
