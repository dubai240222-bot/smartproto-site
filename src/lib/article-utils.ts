import type { Article } from '@/data/articles';

/**
 * Relative-friendly timestamps for test observation (~minute freshness).
 * Older than 7 days → classic long date.
 */
export function formatPublishedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const now = Date.now();
  const diffMs = Math.max(0, now - date.getTime());
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин назад`;
  if (diffHour < 24) {
    const time = new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
    return diffHour === 1 ? `1 ч назад · ${time}` : `${diffHour} ч назад · ${time}`;
  }
  if (diffDay < 7) {
    const time = new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
    if (diffDay === 1) return `вчера · ${time}`;
    return `${diffDay} дн. назад · ${time}`;
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/** True when article is from China/Qwen channel (category, tags, or agentId). */
export function isChinaArticle(
  article: Pick<Article, 'category' | 'tags'> & { agentId?: string; authorDesk?: string },
): boolean {
  const cat = (article.category || '').toLowerCase();
  if (cat.includes('китай') || cat.includes('china')) return true;
  if ((article.agentId || '').toLowerCase().includes('china')) return true;
  if ((article.authorDesk || '').toLowerCase().includes('china')) return true;
  const tags = Array.isArray(article.tags) ? article.tags : [];
  return tags.some((t) => {
    const n = String(t).toLowerCase().replace(/^#/, '');
    return n === 'китай' || n === 'china' || n === 'qwen';
  });
}

export function parseReadTimeMinutes(value: string): number {
  const match = value.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

export function sortArticlesByPublishedDate(list: Article[] = []): Article[] {
  return [...list].sort(
    (left, right) =>
      new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime(),
  );
}

export function getLatestArticle(list: Article[] = []): Article | undefined {
  return sortArticlesByPublishedDate(list)[0];
}

export function getLatestArticles(limit = 3, list: Article[] = []): Article[] {
  return sortArticlesByPublishedDate(list).slice(0, limit);
}

export function getRelatedArticles(
  slug: string,
  limit = 3,
  list: Article[] = [],
): Article[] {
  return sortArticlesByPublishedDate(list).filter((article) => article.slug !== slug).slice(0, limit);
}

export function getUniqueCategories(list: Article[] = []): string[] {
  return Array.from(new Set(list.map((article) => article.category)));
}

export function getCategoryHighlights(list: Article[] = []): Array<{
  category: string;
  count: number;
  latest: Article;
}> {
  const categoryMap = new Map<string, Article[]>();

  for (const article of list) {
    const bucket = categoryMap.get(article.category) ?? [];
    bucket.push(article);
    categoryMap.set(article.category, bucket);
  }

  return Array.from(categoryMap.entries())
    .map(([category, bucket]) => ({
      category,
      count: bucket.length,
      latest: sortArticlesByPublishedDate(bucket)[0],
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        right.latest.publishedAt.localeCompare(left.latest.publishedAt),
    );
}

export function getArticleStats(list: Article[] = []) {
  const latestArticle = getLatestArticle(list);
  const categories = getUniqueCategories(list);
  const totalReadMinutes = list.reduce(
    (sum, article) => sum + parseReadTimeMinutes(article.readTime),
    0,
  );

  return {
    totalArticles: list.length,
    totalCategories: categories.length,
    totalReadMinutes,
    latestArticle,
    latestPublishedLabel: latestArticle
      ? formatPublishedAt(latestArticle.publishedAt)
      : 'Нет публикаций',
  };
}
