/**
 * SP-A-056 — One-time idempotent seed of SQLite from src/data/articles.json.
 * Safe to re-run: upsert by slug, never duplicates.
 */
import 'dotenv/config';
import articlesJson from '../src/data/articles.json';
import { migrateFromJson, countArticles, type StoredArticle } from '../src/lib/data-store/articles-repo';

async function main() {
  const before = countArticles();
  const result = migrateFromJson(articlesJson as StoredArticle[]);
  console.log(`Migration: ${articlesJson.length} in JSON, ${before} already in DB before, ${result.total} in DB after.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
