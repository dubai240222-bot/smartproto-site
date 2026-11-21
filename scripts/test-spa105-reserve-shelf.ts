/**
 * SP-A-42 / SP-A-105 — reserve safety + stall/credit cadence (no OpenRouter).
 */
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ackReserveItem,
  countReserveItems,
  isReserveTooStale,
  looksLikeCreditError,
  peekOldestReserve,
  releaseOldestReserveSafely,
  saveReserveItem,
  shouldHoldForReserve,
  shouldReleaseReserve,
  RESERVE_MAX_AGE_MS,
} from '../src/lib/newsroom/reserve-shelf';
import {
  nextNewsTickDecision,
  patchStateAfterNewsTick,
  shouldRecoverStalledOff,
} from '../src/lib/newsroom/worker-control';

async function main() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'spa105-reserve-'));
  process.env.SMARTPROTO_DATA_DIR = tmp;
  process.env.SMARTPROTO_RESERVE_TARGET = '8';
  process.env.SMARTPROTO_RESERVE_RELEASE_INTERVAL_MS = '1000';
  process.env.SMARTPROTO_NEWS_INTERVAL_MS = String(150 * 60 * 1000);

  // hold / capacity
  assert.equal(
    shouldHoldForReserve({
      channel: 'rss',
      cycle: 'news',
      freshnessStatus: 'OK',
      minutesSinceLastAuto: 10,
      shelfCount: 0,
    }),
    true,
  );
  assert.equal(
    shouldHoldForReserve({
      channel: 'rss',
      cycle: 'news',
      freshnessStatus: 'CRITICAL',
      minutesSinceLastAuto: 8000,
      shelfCount: 0,
    }),
    false,
  );
  assert.equal(
    shouldHoldForReserve({
      channel: 'staff-author-link',
      cycle: 'news',
      freshnessStatus: 'OK',
      minutesSinceLastAuto: 10,
      shelfCount: 0,
    }),
    false,
  );
  assert.equal(
    shouldHoldForReserve({
      channel: 'rss',
      cycle: 'news',
      freshnessStatus: 'OK',
      minutesSinceLastAuto: 10,
      shelfCount: 8,
    }),
    false,
  );

  const parked = await saveReserveItem({
    slug: 'parked-one',
    sourceUrl: 'https://news.mit.edu/parked-one',
    channel: 'rss',
    cycle: 'news',
    article: {
      slug: 'parked-one',
      title: 'Parked',
      content: 'x',
      publishedAt: '2026-11-10T00:00:00.000Z',
    },
  });
  await new Promise((r) => setTimeout(r, 25));
  await saveReserveItem({
    slug: 'parked-two',
    sourceUrl: 'https://news.mit.edu/parked-two',
    channel: 'rss',
    cycle: 'news',
    article: { slug: 'parked-two', title: 'Parked 2', content: 'y' },
  });
  assert.equal(countReserveItems(), 2);
  assert.equal(peekOldestReserve()?.slug, 'parked-one');

  // SQLite failure keeps file
  const live = new Map<string, Record<string, unknown>>();
  const failed = await releaseOldestReserveSafely({
    getBySlug: (slug) => live.get(slug) as { slug: string } | undefined,
    upsert: () => {
      throw new Error('sqlite write failed');
    },
  });
  assert.equal(failed.status, 'failed');
  assert.equal(countReserveItems(), 2);
  assert.equal(existsSync(path.join(tmp, 'news-reserve', `${parked.id}.json`)), true);

  // success: peek-publish-ack
  const ok = await releaseOldestReserveSafely({
    getBySlug: (slug) => live.get(slug) as { slug: string } | undefined,
    upsert: (article) => {
      live.set(String(article.slug), article);
    },
  });
  assert.equal(ok.status, 'published');
  assert.equal(ok.slug, 'parked-one');
  assert.equal(countReserveItems(), 1);
  assert.equal(live.get('parked-one')?.publishedAt !== '2026-11-10T00:00:00.000Z', true);

  // crash between write and ack: slug already live → ack without duplicate
  const leftover = peekOldestReserve();
  assert.ok(leftover);
  live.set(leftover!.slug, { slug: leftover!.slug });
  const already = await releaseOldestReserveSafely({
    getBySlug: (slug) => live.get(slug) as { slug: string } | undefined,
    upsert: (article) => {
      if (live.has(String(article.slug))) throw new Error('duplicate insert');
      live.set(String(article.slug), article);
    },
  });
  assert.equal(already.status, 'already');
  assert.equal(countReserveItems(), 0);

  // empty
  const empty = await releaseOldestReserveSafely({
    getBySlug: () => null,
    upsert: () => undefined,
  });
  assert.equal(empty.status, 'empty');

  // stale quarantine
  const staleItem = await saveReserveItem({
    id: 'reserve-stale-1',
    slug: 'stale-story',
    sourceUrl: 'https://news.mit.edu/stale',
    channel: 'rss',
    cycle: 'news',
    article: { slug: 'stale-story', title: 'Breaking tonight', content: 'old' },
  });
  assert.equal(isReserveTooStale(staleItem, Date.parse(staleItem.storedAt) + RESERVE_MAX_AGE_MS + 1), true);
  const staleRel = await releaseOldestReserveSafely(
    { getBySlug: () => null, upsert: () => undefined },
    Date.parse(staleItem.storedAt) + RESERVE_MAX_AGE_MS + 1000,
  );
  assert.equal(staleRel.status, 'stale');
  assert.equal(countReserveItems(), 0);

  assert.equal(
    shouldReleaseReserve({
      freshnessStatus: 'OK',
      minutesSinceLastAuto: 5,
      lastReserveReleaseAt: new Date().toISOString(),
      shelfCount: 1,
    }),
    false,
  );

  assert.equal(looksLikeCreditError('OpenRouter 402 Payment Required insufficient credits'), true);

  // stall recover
  assert.equal(
    shouldRecoverStalledOff({
      holdOff: true,
      setAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      recoverAfterMs: 3 * 60 * 60 * 1000,
    }),
    false,
  );
  assert.equal(
    shouldRecoverStalledOff({
      holdOff: false,
      setAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      recoverAfterMs: 3 * 60 * 60 * 1000,
    }),
    true,
  );

  // credit cadence
  const now = Date.parse('2026-11-21T20:00:00.000Z');
  assert.equal(
    nextNewsTickDecision({
      lastNewsAt: new Date(now - 10 * 60 * 1000).toISOString(),
      lastCreditErrorAt: new Date(now - 5 * 60 * 1000).toISOString(),
      lastRunStatus: 'credit_error',
      newsIntervalMs: 150 * 60 * 1000,
      creditCooldownMs: 30 * 60 * 1000,
      now,
    }),
    'wait-credit-cooldown',
  );
  assert.equal(
    nextNewsTickDecision({
      lastNewsAt: new Date(now - 10 * 60 * 1000).toISOString(),
      lastCreditErrorAt: new Date(now - 40 * 60 * 1000).toISOString(),
      lastRunStatus: 'credit_error',
      newsIntervalMs: 150 * 60 * 1000,
      creditCooldownMs: 30 * 60 * 1000,
      now,
    }),
    'run',
    'after cooldown resume immediately even if lastNewsAt is recent',
  );
  const creditPatch = patchStateAfterNewsTick({
    ok: false,
    published: false,
    reserved: false,
    creditError: true,
    now: new Date(now),
  });
  assert.equal(creditPatch.lastRunStatus, 'credit_error');
  assert.equal(creditPatch.lastNewsAt, undefined);
  const okPatch = patchStateAfterNewsTick({
    ok: true,
    published: false,
    reserved: false,
    creditError: false,
    now: new Date(now),
  });
  assert.equal(okPatch.lastNewsAt, new Date(now).toISOString());
  assert.equal(okPatch.lastCreditError, null);

  const workerSrc = await fs.readFile(path.resolve(__dirname, 'hetzner-worker.ts'), 'utf8');
  assert.match(workerSrc, /releaseOldestReserveSafely/);
  assert.match(workerSrc, /nextNewsTickDecision/);
  assert.doesNotMatch(workerSrc, /takeOldestReserve\(\)/);
  assert.match(workerSrc, /writeMode\(TEST_AUTO_EXPIRE_MODE/);
  assert.match(workerSrc, /holdOff: true, reason: 'single-complete'/);

  ackReserveItem('missing-noop');
  console.log('SP-A-42 reserve + cadence tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
