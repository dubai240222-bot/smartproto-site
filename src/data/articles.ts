import articles from './articles.json';
import { filterRemovedArticles } from '@/lib/removed-slugs';

export interface Article {
  id: string;
  slug: string;
  title: string;
  category: string;
  tags?: string[];
  summary: string;
  content: string;
  sourceUrl: string;
  publishedAt: string;
  readTime: string;
  imageUrl?: string;
  author?: string;
  authorDesk?: string;
  agentId?: string;
}

const typedArticles = filterRemovedArticles(articles as Article[]);

export default typedArticles;

export function getArticleBySlug(slug: string): Article | undefined {
  return typedArticles.find((article) => article.slug === slug);
}

export function getAllSlugs(): string[] {
  return typedArticles.map((article) => article.slug);
}
