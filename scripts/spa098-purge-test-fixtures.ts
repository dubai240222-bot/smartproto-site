/**
 * Remove SP-A-097F1 [TEST] localization stubs from SQLite (and report JSON mode).
 * Usage:
 *   ARTICLES_STORE=sqlite SMARTPROTO_DB_PATH=... npx tsx scripts/spa098-purge-test-fixtures.ts
 */
import { isTestLocalization } from '../src/lib/i18n/post-publish-translate';

async function main() {
  const useSqlite = process.env.ARTICLES_STORE === 'sqlite';
  if (!useSqlite) {
    console.log('json-mode: article-localizations.json fixtures cleared in repo; nothing to purge in DB');
    return;
  }

  const { getDb } = await import('../src/lib/data-store/db');
  const { listPublishedLocalizations, deleteLocalization } = await import(
    '../src/lib/data-store/localizations-repo'
  );

  let removed = 0;
  for (const language of ['en', 'tr'] as const) {
    const rows = listPublishedLocalizations(language);
    for (const row of rows) {
      if (!isTestLocalization(row)) continue;
      deleteLocalization(row.articleId, language);
      removed++;
      console.log(`deleted ${language} ${row.localizedSlug} (${row.translatorModel || 'n/a'})`);
    }
  }

  // Also wipe any non-published husks that look like fixtures.
  const husks = getDb()
    .prepare(
      `SELECT article_id, language, localized_title, translator_model FROM article_localizations
       WHERE localized_title LIKE '[TEST]%' OR translator_model LIKE '%manual-fixture%'`,
    )
    .all() as Array<{
    article_id: string;
    language: string;
    localized_title: string;
    translator_model: string | null;
  }>;
  for (const h of husks) {
    getDb()
      .prepare(`DELETE FROM article_localizations WHERE article_id = ? AND language = ?`)
      .run(h.article_id, h.language);
    removed++;
    console.log(`deleted husk ${h.language} ${h.localized_title}`);
  }

  console.log(`PURGE OK removed=${removed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
