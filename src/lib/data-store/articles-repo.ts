/**
 * SP-A-056 — Direct Publisher repository: atomic slug-unique upsert + reads.
 * Used only in ARTICLES_STORE=sqlite mode (Hetzner). Keeps the exact `Article`
 * shape used by src/data/articles.ts so the rest of the app is unaffected.
 */
import { getDb } from './db';

export interface ArticleImage {
  url: string;
  role: 'hero' | 'secondary' | 'detail';
  sourceUrl?: string;
}

export interface StoredArticle {
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
  images?: ArticleImage[];
  author?: string;
  authorDesk?: string;
  agentId?: string;
}

interface Row {
  slug: string;
  id: string;
  title: string;
  category: string;
  tags: string;
  summary: string;
  content: string;
  sourceUrl: string;
  publishedAt: string;
  readTime: string;
  imageUrl: string | null;
  images: string | null;
  author: string | null;
  authorDesk: string | null;
  agentId: string | null;
}

function safeParseImages(raw: string): ArticleImage[] | undefined {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function rowToArticle(row: Row): StoredArticle {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags || '[]');
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    tags,
    summary: row.summary,
    content: row.content,
    sourceUrl: row.sourceUrl,
    publishedAt: row.publishedAt,
    readTime: row.readTime,
    imageUrl: row.imageUrl ?? undefined,
    images: row.images ? safeParseImages(row.images) : undefined,
    author: row.author ?? undefined,
    authorDesk: row.authorDesk ?? undefined,
    agentId: row.agentId ?? undefined,
  };
}

/** Fresh read on every call — no in-process caching, so new publishes are visible immediately. */
export function getAllArticlesFromDb(): StoredArticle[] {
  const rows = getDb()
    .prepare('SELECT * FROM articles ORDER BY publishedAt DESC')
    .all() as Row[];
  return rows.map(rowToArticle);
}

export function getArticleBySlugFromDb(slug: string): StoredArticle | undefined {
  const row = getDb().prepare('SELECT * FROM articles WHERE slug = ?').get(slug) as
    | Row
    | undefined;
  return row ? rowToArticle(row) : undefined;
}

/**
 * Atomic publish: INSERT OR REPLACE inside a transaction guarantees the row is
 * either fully written or not written at all — never a half-article/corrupt row.
 * Re-publishing an existing slug updates it in place (no duplicate).
 */
export function upsertArticle(article: StoredArticle): void {
  const stmt = getDb().prepare(`
    INSERT INTO articles
      (slug, id, title, category, tags, summary, content, sourceUrl, publishedAt, readTime, imageUrl, images, author, authorDesk, agentId, updatedAt)
    VALUES
      (@slug, @id, @title, @category, @tags, @summary, @content, @sourceUrl, @publishedAt, @readTime, @imageUrl, @images, @author, @authorDesk, @agentId, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(slug) DO UPDATE SET
      id=excluded.id, title=excluded.title, category=excluded.category, tags=excluded.tags,
      summary=excluded.summary, content=excluded.content, sourceUrl=excluded.sourceUrl,
      publishedAt=excluded.publishedAt, readTime=excluded.readTime, imageUrl=excluded.imageUrl,
      images=excluded.images,
      author=excluded.author, authorDesk=excluded.authorDesk, agentId=excluded.agentId,
      updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `);
  const tx = getDb().transaction((a: StoredArticle) => {
    stmt.run({
      slug: a.slug,
      id: a.id,
      title: a.title,
      category: a.category,
      tags: JSON.stringify(a.tags ?? []),
      summary: a.summary,
      content: a.content,
      sourceUrl: a.sourceUrl,
      publishedAt: a.publishedAt,
      readTime: a.readTime,
      imageUrl: a.imageUrl ?? null,
      images: JSON.stringify(a.images ?? []),
      author: a.author ?? null,
      authorDesk: a.authorDesk ?? null,
      agentId: a.agentId ?? null,
    });
  });
  tx(article);
}

export function deleteArticleBySlug(slug: string): void {
  getDb().prepare('DELETE FROM articles WHERE slug = ?').run(slug);
}

export function countArticles(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM articles').get() as { n: number };
  return row.n;
}

/** One-time idempotent seed from the existing articles.json (safe to re-run). */
export function migrateFromJson(articles: StoredArticle[]): { inserted: number; total: number } {
  const before = countArticles();
  const tx = getDb().transaction((items: StoredArticle[]) => {
    for (const a of items) upsertArticle(a);
  });
  tx(articles);
  const after = countArticles();
  return { inserted: after - before, total: after };
}
