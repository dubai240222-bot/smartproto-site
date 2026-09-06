/**
 * SP-A-100F2 — Restore a scrubbed article from SQLite (+ WAL) and attach an official hero.
 *
 * Hetzner recipe (Neakasa):
 *
 *   # 1) Pull code so slug is gone from removed-slugs.json; rebuild/restart web
 *   # 2) Restore row + hero:
 *   SMARTPROTO_DB_PATH=/opt/apps/smartproto/data/smartproto.db \
 *   SMARTPROTO_MEDIA_DIR=/opt/apps/smartproto/images \
 *   npx tsx scripts/restore-article-from-wal.ts \
 *     --slug=neakasa-riko-fresh-made-wet-meal-feeder \
 *     --hero-url=https://cdn.shopify.com/s/files/1/0600/4736/0185/files/neakasa_riko_main_2.webp
 *
 * Recovery order: live DB → sqlite3 .recover (WAL) → --from-json fallback.
 * Refuses hero if product-photo gate detects a family mismatch.
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { gateProductPhotoMatch } from '../src/lib/collectors/product-photo-gate';

const SLUG_DEFAULT = 'neakasa-riko-fresh-made-wet-meal-feeder';
const HERO_DEFAULT =
  'https://cdn.shopify.com/s/files/1/0600/4736/0185/files/neakasa_riko_main_2.webp';

type ArticleRow = {
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
};

type LocRow = {
  article_id: string;
  language: string;
  localized_title: string;
  localized_excerpt: string;
  localized_content: string;
  localized_slug: string;
  translation_status: string;
  translated_at: string | null;
  translator_model: string | null;
};

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

function openDb(dbPath: string, readonly: boolean): Database.Database {
  return new Database(dbPath, { readonly, fileMustExist: true });
}

function findArticle(db: Database.Database, slug: string): ArticleRow | undefined {
  return db.prepare('SELECT * FROM articles WHERE slug = ?').get(slug) as ArticleRow | undefined;
}

function findLocalizations(db: Database.Database, articleId: string): LocRow[] {
  try {
    return db
      .prepare('SELECT * FROM article_localizations WHERE article_id = ?')
      .all(articleId) as LocRow[];
  } catch {
    return [];
  }
}

function recoverFromWal(
  dbPath: string,
  slug: string,
): { article?: ArticleRow; locs: LocRow[] } {
  const wal = `${dbPath}-wal`;
  if (!existsSync(wal)) {
    console.log(`[restore] no WAL at ${wal}`);
    return { locs: [] };
  }
  const tmp = mkdtempSync(path.join(tmpdir(), 'smartproto-recover-'));
  const recovered = path.join(tmp, 'recovered.db');
  try {
    const sql = execFileSync('sqlite3', [dbPath, '.recover'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    writeFileSync(path.join(tmp, 'recover.sql'), sql);
    execFileSync('sqlite3', [recovered], {
      input: sql,
      maxBuffer: 64 * 1024 * 1024,
    });
    const rdb = openDb(recovered, true);
    const article = findArticle(rdb, slug);
    const locs = article ? findLocalizations(rdb, article.id) : [];
    rdb.close();
    console.log(
      `[restore] WAL recover: article=${article ? 'YES' : 'NO'} locs=${locs.length}`,
    );
    return { article, locs };
  } catch (err) {
    console.warn(
      `[restore] WAL recover failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { locs: [] };
  }
}

async function downloadHero(url: string, destJpg: string): Promise<void> {
  mkdirSync(path.dirname(destJpg), { recursive: true });
  const res = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    headers: { 'User-Agent': 'SmartProtoRestore/1.0' },
  });
  if (!res.ok) throw new Error(`hero download HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new Error(`hero too small (${buf.length} bytes)`);
  writeFileSync(destJpg, buf);
  console.log(`[restore] wrote hero ${destJpg} (${buf.length} bytes)`);
}

function upsertArticle(
  db: Database.Database,
  a: ArticleRow,
  imageUrl: string,
  heroUrl: string,
): void {
  db.prepare(
    `INSERT INTO articles
      (slug, id, title, category, tags, summary, content, sourceUrl, publishedAt, readTime, imageUrl, images, author, authorDesk, agentId, updatedAt)
    VALUES
      (@slug, @id, @title, @category, @tags, @summary, @content, @sourceUrl, @publishedAt, @readTime, @imageUrl, @images, @author, @authorDesk, @agentId, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(slug) DO UPDATE SET
      id=excluded.id, title=excluded.title, category=excluded.category, tags=excluded.tags,
      summary=excluded.summary, content=excluded.content, sourceUrl=excluded.sourceUrl,
      publishedAt=excluded.publishedAt, readTime=excluded.readTime, imageUrl=excluded.imageUrl,
      images=excluded.images,
      author=excluded.author, authorDesk=excluded.authorDesk, agentId=excluded.agentId,
      updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  ).run({
    ...a,
    imageUrl,
    images: JSON.stringify([{ url: imageUrl, role: 'hero', sourceUrl: heroUrl }]),
  });
}

function upsertLoc(db: Database.Database, loc: LocRow): void {
  db.prepare(
    `INSERT INTO article_localizations (
      article_id, language, localized_title, localized_excerpt, localized_content,
      localized_slug, translation_status, translated_at, translator_model, updated_at
    ) VALUES (
      @article_id, @language, @localized_title, @localized_excerpt, @localized_content,
      @localized_slug, @translation_status, @translated_at, @translator_model,
      strftime('%Y-%m-%dT%H:%M:%fZ','now')
    )
    ON CONFLICT(article_id, language) DO UPDATE SET
      localized_title=excluded.localized_title,
      localized_excerpt=excluded.localized_excerpt,
      localized_content=excluded.localized_content,
      localized_slug=excluded.localized_slug,
      translation_status=excluded.translation_status,
      translated_at=excluded.translated_at,
      translator_model=excluded.translator_model,
      updated_at=excluded.updated_at`,
  ).run(loc);
}

async function main() {
  const slug = arg('slug') || SLUG_DEFAULT;
  const heroUrl = arg('hero-url') || HERO_DEFAULT;
  const fromJson = arg('from-json');
  const dbPath =
    process.env.SMARTPROTO_DB_PATH || '/opt/apps/smartproto/data/smartproto.db';
  const mediaRoot =
    process.env.SMARTPROTO_MEDIA_DIR || '/opt/apps/smartproto/images';

  console.log(`[restore] slug=${slug}`);
  console.log(`[restore] db=${dbPath}`);
  console.log(`[restore] media=${mediaRoot}`);
  console.log(`[restore] heroUrl=${heroUrl}`);

  let article: ArticleRow | undefined;
  let locs: LocRow[] = [];

  if (fromJson) {
    const raw = JSON.parse(readFileSync(fromJson, 'utf8'));
    article = (raw.article || raw) as ArticleRow;
    locs = (raw.localizations || []) as LocRow[];
    console.log(`[restore] loaded --from-json (locs=${locs.length})`);
  } else {
    if (!existsSync(dbPath)) throw new Error(`DB not found: ${dbPath}`);
    const live = openDb(dbPath, true);
    article = findArticle(live, slug);
    if (article) {
      locs = findLocalizations(live, article.id);
      console.log(`[restore] found in live DB (locs=${locs.length})`);
    }
    live.close();

    if (!article) {
      const recovered = recoverFromWal(dbPath, slug);
      article = recovered.article;
      locs = recovered.locs;
    }
  }

  if (!article) {
    throw new Error(
      `Article ${slug} not found in live DB or WAL. ` +
        `Extract fields and re-run with --from-json=article.json`,
    );
  }

  const gate = gateProductPhotoMatch({
    articleTitle: article.title,
    articleText: `${article.summary}\n${article.content}`.slice(0, 2000),
    photoUrl: heroUrl,
    photoContext: heroUrl,
  });
  if (!gate.ok) {
    throw new Error(`[restore] refused hero by product-photo gate: ${gate.reason}`);
  }

  const heroRel = `/api/media/${slug}/hero.jpg`;
  const heroPath = path.join(mediaRoot, slug, 'hero.jpg');
  await downloadHero(heroUrl, heroPath);

  const rw = openDb(dbPath, false);
  const tx = rw.transaction(() => {
    upsertArticle(rw, article!, heroRel, heroUrl);
    for (const loc of locs) upsertLoc(rw, loc);
  });
  tx();
  rw.close();

  console.log(
    JSON.stringify(
      {
        ok: true,
        slug,
        id: article.id,
        title: article.title,
        imageUrl: heroRel,
        heroPath,
        localizations: locs.map((l) => `${l.language}:${l.localized_slug}`),
        note: 'Slug must NOT be in src/data/removed-slugs.json; restart web if filter was baked in.',
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
