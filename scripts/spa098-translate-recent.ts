/**
 * Bounded EN/TR backlog drip for existing RU articles (max N, default 3).
 * Does NOT run a factory burst. Safe for Hetzner after deploy.
 *
 *   ARTICLES_STORE=sqlite SMARTPROTO_DB_PATH=... npx tsx scripts/spa098-translate-recent.ts --limit=3
 */
import { getAllArticles } from '../src/data/articles';
import { getLocalization } from '../src/data/localizations';
import {
  isPostPublishTranslationEnabled,
  pickArticlesNeedingTranslation,
  runPostPublishTranslation,
} from '../src/lib/i18n/post-publish-translate';

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))?.slice('--limit='.length);
  const limit = Math.max(1, Math.min(Number(limitArg) || 3, 10));

  process.env.SMARTPROTO_TRANSLATE_ENABLED = 'true';
  if (!isPostPublishTranslationEnabled()) {
    console.error('translation disabled');
    process.exit(1);
  }

  const articles = getAllArticles();
  const need = pickArticlesNeedingTranslation(articles, {
    getLocalization,
    limit,
  });

  console.log(`candidates=${need.length} (of ${articles.length} RU) limit=${limit}`);
  if (!need.length) {
    console.log('nothing to translate');
    return;
  }

  for (const article of need) {
    console.log(`--- translating ${article.slug}`);
    // Clear TEST stubs for this id so real translation can publish.
    if (process.env.ARTICLES_STORE === 'sqlite') {
      const { deleteLocalization, getLocalization: getDbLoc } = await import(
        '../src/lib/data-store/localizations-repo'
      );
      for (const lang of ['en', 'tr'] as const) {
        const prev = getDbLoc(article.id, lang);
        if (prev && (/^\[TEST\]/i.test(prev.localizedTitle) || /manual-fixture/i.test(prev.translatorModel || ''))) {
          deleteLocalization(article.id, lang);
          console.log(`cleared TEST stub ${lang}`);
        }
      }
    }

    const report = await runPostPublishTranslation({
      id: article.id,
      slug: article.slug,
      title: article.title,
      summary: article.summary,
      content: article.content,
      category: article.category,
      author: article.author,
      authorDesk: article.authorDesk,
    });
    for (const r of report.results) {
      console.log(
        `${r.language}: ${r.status} ai=${r.aiCalls}` +
          (r.reason ? ` reason=${r.reason}` : '') +
          (r.localization?.localizedSlug ? ` slug=${r.localization.localizedSlug}` : ''),
      );
    }
  }
  console.log('DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
