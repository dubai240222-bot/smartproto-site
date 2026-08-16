/**
 * Bounded EN/TR archive drip (SP-A-098G) — max 1 article/locale per run.
 * Value + coverage ranking; not newest-first only. No factory burst.
 *
 *   ARTICLES_STORE=sqlite SMARTPROTO_DB_PATH=... npx tsx scripts/spa098-translate-recent.ts --limit=1
 *   npx tsx scripts/spa098-translate-recent.ts --dry-run --limit=10
 */
import { getAllArticles } from '../src/data/articles';
import { getLocalization } from '../src/data/localizations';
import {
  isPostPublishTranslationEnabled,
  pickArchiveTranslationJobs,
  runArchiveLocaleTranslation,
} from '../src/lib/i18n/post-publish-translate';
import { computeCoverage } from '../src/lib/i18n/archive-translate-pick';

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))?.slice('--limit='.length);
  const dryRun = process.argv.includes('--dry-run');
  // Archive drip: hard-cap 1 for live jobs; dry-run may show up to 10.
  const requested = Math.max(1, Math.min(Number(limitArg) || (dryRun ? 10 : 1), dryRun ? 10 : 1));
  const limit = dryRun ? requested : 1;

  if (!dryRun) {
    process.env.SMARTPROTO_TRANSLATE_ENABLED = 'true';
    if (!isPostPublishTranslationEnabled()) {
      console.error('translation disabled');
      process.exit(1);
    }
  }

  const articles = getAllArticles();
  const coverage = computeCoverage(articles, getLocalization);
  const jobs = pickArchiveTranslationJobs(articles, {
    getLocalization,
    limit,
    coverage,
  });

  console.log(
    `coverage ru=${coverage.ruTotal} en=${coverage.enCoveragePct}% tr=${coverage.trCoveragePct}% ` +
      `withoutEn=${coverage.withoutEn} withoutTr=${coverage.withoutTr}`,
  );
  console.log(`candidates=${jobs.length} limit=${limit}${dryRun ? ' DRY-RUN' : ''}`);

  if (!jobs.length) {
    console.log('nothing to translate');
    return;
  }

  // Dedup proof for dry-run table
  const pairs = new Set<string>();
  for (const job of jobs) {
    const pair = `${job.article.id}:${job.language}`;
    if (pairs.has(pair)) {
      console.error(`DEDUP FAIL: duplicate ${pair}`);
      process.exit(1);
    }
    pairs.add(pair);
  }

  if (dryRun) {
    console.log('--- DRY-RUN next archive candidates ---');
    console.log(
      '| # | id | title | lang | score | why |',
    );
    jobs.forEach((job, i) => {
      const title = (job.article.title || '').replace(/\|/g, '/').slice(0, 60);
      console.log(
        `| ${i + 1} | ${job.article.id} | ${title} | ${job.language.toUpperCase()} | ${Math.round(job.score)} | ${job.factors.join('; ')} |`,
      );
    });
    console.log(`dedup_ok pairs=${pairs.size}`);
    return;
  }

  const job = jobs[0];
  console.log(
    `--- archive job ${job.article.slug} lang=${job.language} score=${Math.round(job.score)} ` +
      `why=${job.factors.join(',')}`,
  );

  if (process.env.ARTICLES_STORE === 'sqlite') {
    const { deleteLocalization, getLocalization: getDbLoc } = await import(
      '../src/lib/data-store/localizations-repo'
    );
    const prev = getDbLoc(job.article.id, job.language);
    if (
      prev &&
      (/^\[TEST\]/i.test(prev.localizedTitle) || /manual-fixture/i.test(prev.translatorModel || ''))
    ) {
      deleteLocalization(job.article.id, job.language);
      console.log(`cleared TEST stub ${job.language}`);
    }
  }

  const report = await runArchiveLocaleTranslation(
    {
      id: job.article.id,
      slug: job.article.slug,
      title: job.article.title,
      summary: job.article.summary,
      content: job.article.content,
      category: job.article.category,
      author: job.article.author,
      authorDesk: job.article.authorDesk,
    },
    job.language,
  );
  for (const r of report.results) {
    console.log(
      `${r.language}: ${r.status} ai=${r.aiCalls}` +
        (r.reason ? ` reason=${r.reason}` : '') +
        (r.localization?.localizedSlug ? ` slug=${r.localization.localizedSlug}` : ''),
    );
  }
  console.log('DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
