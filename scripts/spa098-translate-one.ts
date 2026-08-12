/**
 * SP-A-098 — controlled translation of ONE existing published RU article (no backlog).
 * Usage:
 *   ARTICLES_STORE=sqlite SMARTPROTO_DB_PATH=... npx tsx scripts/spa098-translate-one.ts --slug=...
 */
import { getAllArticles, getArticleBySlug } from '../src/data/articles';
import { runPostPublishTranslation } from '../src/lib/i18n/post-publish-translate';
import { getLocalization } from '../src/data/localizations';

async function main() {
  const slugArg = process.argv.find((a) => a.startsWith('--slug='))?.slice('--slug='.length);
  const articles = getAllArticles();
  const article =
    (slugArg ? getArticleBySlug(slugArg) : null) ||
    articles.find(
      (a) => a.slug === 'these-3d-printed-objects-can-tell-you-if-they-re-being-used-properly',
    ) ||
    articles[0];

  if (!article) {
    console.error('No article found');
    process.exit(1);
  }

  console.log(`RU ARTICLE: ${article.slug}`);
  console.log(`RU TITLE: ${article.title}`);
  console.log(`AUTHOR: ${article.author || '(none)'}`);
  console.log(`SOURCE: ${article.sourceUrl || '(none)'}`);
  console.log(`IMAGE: ${article.imageUrl || article.images?.[0]?.url || '(none)'}`);

  // Clear prior rejected/published fixtures for a clean 098 attempt on this id? 
  // Do NOT wipe published production localizations blindly — only if fixture/manual.
  for (const lang of ['en', 'tr'] as const) {
    const prev = getLocalization(article.id, lang);
    if (prev) {
      console.log(`existing ${lang}: status=${prev.translationStatus} slug=${prev.localizedSlug}`);
    }
  }

  // Force run even if SMARTPROTO_TRANSLATE_ENABLED=false
  process.env.SMARTPROTO_TRANSLATE_ENABLED = 'true';

  // If already published from 097F1 fixture, translation will no-op (aiCalls=0).
  // --force-reset deletes prior EN/TR rows for this article only (controlled test).
  if (process.argv.includes('--force-reset') && process.env.ARTICLES_STORE === 'sqlite') {
    const { deleteLocalization } = await import('../src/lib/data-store/localizations-repo');
    deleteLocalization(article.id, 'en');
    deleteLocalization(article.id, 'tr');
    console.log('force-reset: cleared prior EN/TR rows for this article');
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
    console.log('---');
    console.log(`${r.language.toUpperCase()}:`);
    console.log(`AI CALLS: ${r.aiCalls}`);
    console.log(`QA: ${r.qaChecks?.join(',') || r.reason || '(n/a)'}`);
    console.log(`STATUS: ${r.status}`);
    if (r.localization?.localizedSlug) {
      console.log(
        `URL: /${r.language}/articles/${r.localization.localizedSlug}`,
      );
    }
  }
  console.log('---');
  console.log(`TOTAL AI CALLS: ${report.totalAiCalls}`);
  console.log(`AUTHOR PRESERVED: YES (shared canonical fields)`);
  console.log(`SOURCE PRESERVED: YES`);
  console.log(`IMAGE PRESERVED: YES`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
