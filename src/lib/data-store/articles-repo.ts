/**
 * SP-A-056 — Direct Publisher repository: atomic slug-unique upsert + reads.
 * Used only in ARTICLES_STORE=sqlite mode (Hetzner). Keeps the exact `Article`
 * shape used by src/data/articles.ts so the rest of the app is unaffected.
 *
 * SP-A-082 — new AUTO inserts pass through finalAutoCommodityGate before write.
 * Chief / Author / existing-row updates / explicit skip are not blocked.
 */
import { getDb } from './db';
import { getNewsDailyMax } from '../newsroom/daily-quota';
import {
  FinalAutoGateError,
  assertFinalAutoPublishAllowed,
} from '../ai/final-auto-commodity-gate';

export { FinalAutoGateError };

export class DailyMaxError extends Error {
  readonly code = 'DAILY_MAX';
  constructor(
    readonly count: number,
    readonly max: number,
  ) {
    super(`DAILY_MAX: ${count}/${max} public articles in 24h`);
    this.name = 'DailyMaxError';
  }
}

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

export type UpsertArticleOptions = {
  /** Photo backfill / migration / explicit ops — skip SP-A-082 gate. */
  skipFinalAutoGate?: boolean;
  /** JSON seed / migrate — do not apply rolling 24h public cap. */
  skipDailyMax?: boolean;
  /** Skip SP-A-098 post-publish EN/TR translation (backfill/migrate/re-edit). */
  skipPostPublishTranslation?: boolean;
};

/**
 * Atomic publish: INSERT OR REPLACE inside a transaction guarantees the row is
 * either fully written or not written at all — never a half-article/corrupt row.
 * Re-publishing an existing slug updates it in place (no duplicate).
 *
 * SP-A-082: brand-new AUTO rows are blocked when the final commodity gate rejects.
 * SP-A-098: brand-new publishes schedule isolated EN/TR translation (never throws).
 */
export function upsertArticle(article: StoredArticle, opts?: UpsertArticleOptions): void {
  const dbh = getDb();
  const max = getNewsDailyMax();
  const stmt = dbh.prepare(`
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
  const bySlug = dbh.prepare('SELECT slug FROM articles WHERE slug = ?');
  const countStmt = dbh.prepare('SELECT COUNT(*) AS n FROM articles WHERE publishedAt >= ?');

  const run = dbh.transaction((a: StoredArticle) => {
    const existing = bySlug.get(a.slug) as { slug: string } | undefined;
    if (!existing) {
      if (!opts?.skipDailyMax) {
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const n = (countStmt.get(dayAgo) as { n: number }).n;
        if (n >= max) throw new DailyMaxError(n, max);
      }
      if (!opts?.skipFinalAutoGate) {
        assertFinalAutoPublishAllowed({
          title: a.title,
          summary: a.summary,
          content: a.content,
          tags: a.tags,
          category: a.category,
          agentId: a.agentId,
        });
      }
    }
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
    return Boolean(existing);
  });
  const wasExisting = run.immediate(article) as boolean;

  const shouldTranslate =
    !wasExisting &&
    !opts?.skipFinalAutoGate &&
    !opts?.skipPostPublishTranslation;
  if (shouldTranslate) {
    try {
      const { schedulePostPublishTranslation } = require('@/lib/i18n/post-publish-translate');
      schedulePostPublishTranslation({
        id: article.id,
        slug: article.slug,
        title: article.title,
        summary: article.summary,
        content: article.content,
        category: article.category,
        author: article.author,
        authorDesk: article.authorDesk,
      });
    } catch (err) {
      console.log(
        `[spa098] upsert schedule swallowed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

export function deleteArticleBySlug(slug: string): void {
  getDb().prepare('DELETE FROM articles WHERE slug = ?').run(slug);
}

export function countArticles(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM articles').get() as { n: number };
  return row.n;
}

/** Cheap health snapshot — no full table load (docker wget timeout is 5–10s). */
export function getArticleHealthSnapshot(): {
  count: number;
  latestPublishedAt: string | null;
  latestSlug: string | null;
} {
  const db = getDb();
  const count = (db.prepare('SELECT COUNT(*) AS n FROM articles').get() as { n: number }).n;
  const latest = db
    .prepare('SELECT slug, publishedAt FROM articles ORDER BY publishedAt DESC LIMIT 1')
    .get() as { slug: string; publishedAt: string } | undefined;
  return {
    count,
    latestPublishedAt: latest?.publishedAt ?? null,
    latestSlug: latest?.slug ?? null,
  };
}

/** One-time idempotent seed from the existing articles.json (safe to re-run). */
export function migrateFromJson(articles: StoredArticle[]): { inserted: number; total: number } {
  const before = countArticles();
  const tx = getDb().transaction((items: StoredArticle[]) => {
    for (const a of items) upsertArticle(a, { skipFinalAutoGate: true, skipDailyMax: true });
  });
  tx(articles);
  const after = countArticles();
  return { inserted: after - before, total: after };
}
