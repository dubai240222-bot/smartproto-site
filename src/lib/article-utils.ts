import articles, { type Article } from '@/data/articles';

export function formatPublishedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function parseReadTimeMinutes(value: string): number {
  const match = value.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

export function sortArticlesByPublishedDate(list: Article[] = articles): Article[] {
  return [...list].sort(
    (left, right) =>
      new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime(),
  );
}

export function getLatestArticle(list: Article[] = articles): Article | undefined {
  return sortArticlesByPublishedDate(list)[0];
}

export function getLatestArticles(limit = 3, list: Article[] = articles): Article[] {
  return sortArticlesByPublishedDate(list).slice(0, limit);
}

export function getRelatedArticles(
  slug: string,
  limit = 3,
  list: Article[] = articles,
): Article[] {
  return sortArticlesByPublishedDate(list).filter((article) => article.slug !== slug).slice(0, limit);
}

export function getUniqueCategories(list: Article[] = articles): string[] {
  return Array.from(new Set(list.map((article) => article.category)));
}

export function getCategoryHighlights(list: Article[] = articles): Array<{
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
    .sort((left, right) => right.count - left.count || right.latest.publishedAt.localeCompare(left.latest.publishedAt));
}

export function getArticleStats(list: Article[] = articles) {
  const latestArticle = getLatestArticle(list);
  const categories = getUniqueCategories(list);
  const totalReadMinutes = list.reduce((sum, article) => sum + parseReadTimeMinutes(article.readTime), 0);

  return {
    totalArticles: list.length,
    totalCategories: categories.length,
    totalReadMinutes,
    latestArticle,
    latestPublishedLabel: latestArticle ? formatPublishedAt(latestArticle.publishedAt) : 'Нет публикаций',
  };
}
