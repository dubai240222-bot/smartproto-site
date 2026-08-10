/**
 * SP-A-074 — unit checks for retention math (no AI, no prod deletes).
 */
import assert from 'node:assert/strict';
import type { StoredArticle } from '../src/lib/data-store/articles-repo';
import { buildRetentionPlan, shouldRunNightlyCleanup } from '../src/lib/retention/cleanup';

function fake(n: number, ageDays: number, slug: string): StoredArticle {
  const publishedAt = new Date(Date.now() - ageDays * 86400000).toISOString();
  return {
    id: slug,
    slug,
    title: `Title ${slug}`,
    category: 'Гаджеты',
    tags: [],
    summary: 's',
    content: 'c',
    sourceUrl: `https://example.com/${slug}`,
    publishedAt,
    readTime: '1 мин',
  };
}

process.env.SMARTPROTO_ALLOW_LOCAL_RETENTION = '1';

const cfg = { retentionDays: 10, minArticles: 100, maxDeletePerRun: 25 };

// 100 articles all old → delete 0
{
  const articles = Array.from({ length: 100 }, (_, i) => fake(i, 30, `a${i}`));
  const plan = buildRetentionPlan({ articles, dryRun: true, config: cfg });
  assert.equal(plan.wouldDelete, 0);
  assert.equal(plan.articlesRemaining, 100);
  console.log('OK 100 old → delete 0');
}

// 101 articles, oldest >10d → delete 1
{
  const articles = [
    ...Array.from({ length: 100 }, (_, i) => fake(i, 5, `new${i}`)),
    fake(0, 20, 'old1'),
  ];
  const plan = buildRetentionPlan({ articles, dryRun: true, config: cfg });
  assert.equal(plan.wouldDelete, 1);
  assert.equal(plan.articles[0]?.slug, 'old1');
  assert.equal(plan.articlesRemaining, 100);
  console.log('OK 101 with 1 old → delete 1');
}

// 150 articles all old → max 25, remain 125
{
  const articles = Array.from({ length: 150 }, (_, i) => fake(i, 40, `old${i}`));
  const plan = buildRetentionPlan({ articles, dryRun: true, config: cfg });
  assert.equal(plan.wouldDelete, 25);
  assert.equal(plan.articlesRemaining, 125);
  assert.ok(plan.eligibleToDelete === 50);
  console.log('OK 150 old → delete 25 remain 125');
}

// Nightly window
{
  const at1 = new Date('2026-08-10T01:15:00');
  assert.equal(shouldRunNightlyCleanup({ hour: 1, now: at1 }), true);
  assert.equal(
    shouldRunNightlyCleanup({
      hour: 1,
      now: at1,
      lastRetentionAt: '2026-08-10T01:05:00.000Z',
    }),
    false,
  );
  assert.equal(shouldRunNightlyCleanup({ hour: 1, now: new Date('2026-08-10T14:00:00') }), false);
  console.log('OK nightly schedule gate');
}

console.log('SP-A-074 unit checks passed');
