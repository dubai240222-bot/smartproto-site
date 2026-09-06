/**
 * Daily news quota helpers — no API, no network.
 */
import assert from 'node:assert/strict';
import {
  applyQuotaScoutFloor,
  countNewsPublishedLast24h,
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
assert.equal(behind.behind, true);
assert.equal(behind.skipChina, true);
assert.equal(behind.scoutLimit, 8);
assert.equal(applyQuotaScoutFloor(70, behind), 62);

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
