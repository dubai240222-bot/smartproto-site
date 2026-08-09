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
      updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_articles_publishedAt ON articles(publishedAt DESC);
  `);
  return db;
}
