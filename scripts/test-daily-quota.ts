/**
 * Daily news quota helpers — no API, no network.
 */
import assert from 'node:assert/strict';
import {
  applyQuotaScoutFloor,
  countNewsPublishedLast24h,
  countPublicPublishedLast24h,
  isNewsCycleArticle,
  resolveNewsQuotaPolicy,
} from '../src/lib/newsroom/daily-quota';

assert.equal(isNewsCycleArticle({ tags: ['новость', 'гаджет'] }), true);
assert.equal(isNewsCycleArticle({ tags: ['обзор', 'гаджет'] }), false);

const now = new Date('2026-08-16T12:00:00.000Z');
const behind = resolveNewsQuotaPolicy({
  now,
  articles: [
    {
      publishedAt: '2026-08-16T08:00:00.000Z',
      agentId: 'newsroom-scout',
      tags: ['новость'],
    },
    {
      publishedAt: '2026-08-16T09:00:00.000Z',
      agentId: 'chief-fast-lane',
      tags: ['новость'],
    },
  ],
  freshnessStatus: 'WARNING',
  minutesSinceLastAuto: 120,
});
assert.equal(behind.newsPublishedLast24h, 1);
assert.equal(behind.publicPublishedLast24h, 2);
assert.equal(behind.hardStop, false);
assert.equal(behind.behind, true);
assert.equal(behind.skipChina, true);
assert.equal(behind.scoutLimit, 8);
assert.equal(applyQuotaScoutFloor(70, behind), 62);

const critical = resolveNewsQuotaPolicy({
  now,
  articles: [],
  freshnessStatus: 'CRITICAL',
  minutesSinceLastAuto: 7689,
});
assert.equal(critical.behind, true);
assert.equal(critical.skipChina, false);
assert.equal(critical.chinaMaxAttempts, 2);

const met = resolveNewsQuotaPolicy({
  now,
  articles: Array.from({ length: 6 }, (_, i) => ({
    publishedAt: `2026-08-16T0${i}:00:00.000Z`,
    agentId: 'newsroom-scout',
    tags: ['новость'],
  })),
});
assert.equal(met.behind, false);
assert.equal(met.atOrOverTarget, true);
assert.equal(met.chinaMaxAttempts, 1);
assert.equal(met.scoutFloorRelax, 0);
assert.equal(met.hardStop, false);
assert.equal(met.publicPublishedLast24h, 6);
assert.equal(met.max, 7);

const capped = resolveNewsQuotaPolicy({
  now,
  articles: [
    ...Array.from({ length: 4 }, (_, i) => ({
      publishedAt: `2026-08-16T0${i}:00:00.000Z`,
      agentId: 'newsroom-scout',
      tags: ['новость'],
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      publishedAt: `2026-08-16T1${i}:00:00.000Z`,
      agentId: 'chief-fast-lane',
      tags: ['новость'],
    })),
  ],
});
assert.equal(capped.publicPublishedLast24h, 7);
assert.equal(capped.hardStop, true);
assert.equal(capped.newsPublishedLast24h, 4);
assert.equal(
  countPublicPublishedLast24h({
    now,
    articles: [{ publishedAt: '2026-08-16T10:00:00.000Z' }, { publishedAt: '2026-08-15T10:00:00.000Z' }],
  }),
  1,
);

assert.equal(
  countNewsPublishedLast24h({
    now,
    journalEntries: [
      { processedAt: '2026-08-16T10:00:00.000Z', status: 'published', cycle: 'news' },
      { processedAt: '2026-08-16T11:00:00.000Z', status: 'published', cycle: 'article' },
    ],
  }),
  1,
);

console.log('test-daily-quota: PASS');
