import jsonArticles from './articles.json';
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

/**
 * SP-A-056 — storage backend switch.
 * Default (Vercel/GitHub path): unchanged build-time JSON import.
 * ARTICLES_STORE=sqlite (Hetzner direct-publish path): fresh DB read on every
 * call, so a new article appears immediately with no rebuild/redeploy.
 */
const USE_SQLITE = process.env.ARTICLES_STORE === 'sqlite';

const staticArticles = filterRemovedArticles(jsonArticles as Article[]);

export function getAllArticles(): Article[] {
  if (USE_SQLITE) {
    // Lazy require so the JSON/Vercel path never touches better-sqlite3 at all.
    const { getAllArticlesFromDb } = require('@/lib/data-store/articles-repo');
    return filterRemovedArticles(getAllArticlesFromDb() as Article[]);
  }
  return staticArticles;
}

export function getArticleBySlug(slug: string): Article | undefined {
  if (USE_SQLITE) {
    const { getArticleBySlugFromDb } = require('@/lib/data-store/articles-repo');
    const row = getArticleBySlugFromDb(slug) as Article | undefined;
    if (!row) return undefined;
    return filterRemovedArticles([row]).length ? row : undefined;
  }
  return staticArticles.find((article) => article.slug === slug);
}

export function getAllSlugs(): string[] {
  return getAllArticles().map((article) => article.slug);
}

/**
 * Back-compat default export. In JSON mode this is the same frozen snapshot
 * as before (zero behavior change for Vercel). In sqlite mode it is only a
 * best-effort snapshot at module load — call sites that need live data must
 * use getAllArticles()/getArticleBySlug() instead (already updated site-wide).
 */
export default staticArticles;
