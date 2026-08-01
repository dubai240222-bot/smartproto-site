import articles from './articles.json';

export interface Article {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  content: string;
  sourceUrl: string;
  publishedAt: string;
  readTime: string;
  imageUrl?: string;
}

const typedArticles = articles as Article[];

export default typedArticles;

export function getArticleBySlug(slug: string): Article | undefined {
  return typedArticles.find((article) => article.slug === slug);
}

export function getAllSlugs(): string[] {
  return typedArticles.map((article) => article.slug);
}
