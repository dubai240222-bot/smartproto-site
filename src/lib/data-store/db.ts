/**
 * SP-A-056 — SQLite-backed persistent store for SmartProto (Hetzner deployment only).
 * Vercel/JSON-import mode is untouched; this module is only loaded when
 * ARTICLES_STORE=sqlite (set in the Hetzner docker-compose env).
 */
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';

const DB_PATH = process.env.SMARTPROTO_DB_PATH || path.resolve(process.cwd(), 'data', 'smartproto.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      slug TEXT PRIMARY KEY,
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      summary TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      sourceUrl TEXT NOT NULL DEFAULT '',
      publishedAt TEXT NOT NULL,
      readTime TEXT NOT NULL DEFAULT '',
      imageUrl TEXT,
      author TEXT,
      authorDesk TEXT,
      agentId TEXT,
      images TEXT NOT NULL DEFAULT '[]',
      updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_articles_publishedAt ON articles(publishedAt DESC);
  `);
  // SP-A-061: safe migration for the 141 pre-existing rows — add column if an
  // older DB file is reused, never touches existing content.
  const cols = db.prepare('PRAGMA table_info(articles)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'images')) {
    db.exec("ALTER TABLE articles ADD COLUMN images TEXT NOT NULL DEFAULT '[]'");
  }

  // SP-A-097F1 — additive EN/TR localizations (RU stays on articles row).
  db.exec(`
    CREATE TABLE IF NOT EXISTS article_localizations (
      article_id TEXT NOT NULL,
      language TEXT NOT NULL,
      localized_title TEXT NOT NULL,
      localized_excerpt TEXT NOT NULL DEFAULT '',
      localized_content TEXT NOT NULL DEFAULT '',
      localized_slug TEXT NOT NULL,
      translation_status TEXT NOT NULL DEFAULT 'draft',
      translated_at TEXT,
      translator_model TEXT,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      PRIMARY KEY (article_id, language),
      UNIQUE (language, localized_slug)
    );
    CREATE INDEX IF NOT EXISTS idx_loc_lang_status
      ON article_localizations(language, translation_status);
    CREATE INDEX IF NOT EXISTS idx_loc_slug
      ON article_localizations(language, localized_slug);
  `);
  return db;
}
