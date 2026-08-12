/**
 * SP-A-097F1 — seed controlled EN/TR test localizations into SQLite (or verify JSON).
 * Does NOT mass-translate. Uses fixture text only.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getAllArticles } from '../src/data/articles';
import fixture from '../src/data/article-localizations.json';
import type { ArticleLocalization } from '../src/lib/data-store/localizations-repo';

async function main() {
  const useSqlite = process.env.ARTICLES_STORE === 'sqlite';
  const articles = getAllArticles();
  console.log(`articles=${articles.length} store=${useSqlite ? 'sqlite' : 'json'}`);

  const rows = fixture as ArticleLocalization[];
  let written = 0;

  for (const row of rows) {
    let articleId = row.articleId;
    let canon = articles.find((a) => a.id === articleId);
    if (!canon) {
      // Resolve by well-known slug if id drifted.
      canon = articles.find((a) => a.slug === 'china-iqoo-t') || articles[0];
      if (!canon) throw new Error('No canonical article available for fixture');
      articleId = canon.id;
      console.log(`remapped fixture articleId ${row.articleId} → ${articleId} (${canon.slug})`);
    }

    const loc: ArticleLocalization = {
      ...row,
      articleId,
    };

    if (useSqlite) {
      const { upsertLocalization } = await import('../src/lib/data-store/localizations-repo');
      upsertLocalization(loc);
      written++;
      console.log(`upserted ${loc.language} ${loc.localizedSlug} status=${loc.translationStatus}`);
    } else {
      console.log(`json-mode fixture present ${loc.language} ${loc.localizedSlug}`);
    }
  }

  if (useSqlite) {
    const { listPublishedLocalizations } = await import('../src/lib/data-store/localizations-repo');
    console.log(`published_en=${listPublishedLocalizations('en').length}`);
    console.log(`published_tr=${listPublishedLocalizations('tr').length}`);
  }

  console.log(`SEED OK written=${written}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
