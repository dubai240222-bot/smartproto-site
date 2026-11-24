/**
 * SP-LIGHT-001 — economy mode: cap 2/day, no catch-up, no standard drop.
 */
import assert from 'node:assert/strict';
import { shouldCatchUp } from '../src/lib/newsroom/worker-control';
import {
  countAutoPublishedLast24h,
  resolveNewsQuotaPolicy,
  applyQuotaScoutFloor,
} from '../src/lib/newsroom/daily-quota';
import { getArticleIntervalMs, getNewsIntervalMs } from '../src/lib/newsroom/cadence';
import { isLightMode, LIGHT_DAILY_CAP } from '../src/lib/newsroom/light-mode';

const prev = process.env.SMARTPROTO_LIGHT;
const prevNews = process.env.SMARTPROTO_NEWS_INTERVAL_MS;
const prevArt = process.env.SMARTPROTO_ARTICLE_INTERVAL_MS;
delete process.env.SMARTPROTO_NEWS_INTERVAL_MS;
delete process.env.SMARTPROTO_ARTICLE_INTERVAL_MS;

try {
  delete process.env.SMARTPROTO_LIGHT;
  assert.equal(isLightMode(), false);
  const catchupNow = Date.parse('2026-11-22T04:00:00.000Z');
  assert.equal(
    shouldCatchUp({
      lastAutoPublicationAt: new Date(catchupNow - 5 * 24 * 60 * 60 * 1000).toISOString(),
      lastRunAt: new Date(catchupNow - 40 * 60 * 1000).toISOString(),
      now: catchupNow,
    }).run,
    true,
  );

  process.env.SMARTPROTO_LIGHT = 'true';
  assert.equal(isLightMode(), true);
  assert.equal(getNewsIntervalMs(), 12 * 60 * 60 * 1000);
  assert.equal(getArticleIntervalMs(), 24 * 60 * 60 * 1000);
  assert.equal(
    shouldCatchUp({
      lastAutoPublicationAt: new Date(catchupNow - 5 * 24 * 60 * 60 * 1000).toISOString(),
      lastRunAt: new Date(catchupNow - 40 * 60 * 1000).toISOString(),
      now: catchupNow,
    }).run,
    false,
  );

  const now = new Date('2026-11-23T12:00:00.000Z');
  const under = resolveNewsQuotaPolicy({
    now,
    articles: [
      {
        publishedAt: '2026-11-23T08:00:00.000Z',
        agentId: 'newsroom-scout',
        tags: ['новость'],
      },
    ],
    freshnessStatus: 'CRITICAL',
    minutesSinceLastAuto: 9000,
  });
  assert.equal(under.target, LIGHT_DAILY_CAP);
  assert.equal(under.behind, false);
  assert.equal(under.skipChina, true);
  assert.equal(under.chinaMaxAttempts, 0);
  assert.equal(under.allowPublishWithoutImage, false);
  assert.equal(under.scoutFloorRelax, 0);
  assert.equal(applyQuotaScoutFloor(70, under), 70);

  const over = resolveNewsQuotaPolicy({
    now,
    articles: [
      { publishedAt: '2026-11-23T08:00:00.000Z', agentId: 'newsroom-scout', tags: ['новость'] },
      { publishedAt: '2026-11-23T10:00:00.000Z', agentId: 'newsroom-scout', tags: ['обзор'] },
    ],
  });
  assert.equal(over.atOrOverTarget, true);
  assert.equal(
    countAutoPublishedLast24h({
      now,
      articles: over === under ? [] : [
        { publishedAt: '2026-11-23T08:00:00.000Z', agentId: 'newsroom-scout' },
        { publishedAt: '2026-11-23T10:00:00.000Z', agentId: 'newsroom-scout' },
      ],
    }),
    2,
  );
} finally {
  if (prev === undefined) delete process.env.SMARTPROTO_LIGHT;
  else process.env.SMARTPROTO_LIGHT = prev;
  if (prevNews === undefined) delete process.env.SMARTPROTO_NEWS_INTERVAL_MS;
  else process.env.SMARTPROTO_NEWS_INTERVAL_MS = prevNews;
  if (prevArt === undefined) delete process.env.SMARTPROTO_ARTICLE_INTERVAL_MS;
  else process.env.SMARTPROTO_ARTICLE_INTERVAL_MS = prevArt;
}

console.log('test-spa-light-001: PASS');
