import removedSlugsJson from '../data/removed-slugs.json';

export const REMOVED_SLUGS = new Set(
  (removedSlugsJson as string[]).map((s) => s.trim()).filter(Boolean),
);

export function isRemovedSlug(slug: string): boolean {
  return REMOVED_SLUGS.has(slug);
}

export function filterRemovedArticles<T extends { slug: string }>(articles: T[]): T[] {
  return articles.filter((a) => !isRemovedSlug(a.slug));
}
