/**
 * SP-A-105 — reserve carousel unit tests (no OpenRouter, no live publish).
 */
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  countReserveItems,
  looksLikeCreditError,
  saveReserveItem,
  shouldHoldForReserve,
  shouldReleaseReserve,
  takeOldestReserve,
} from '../src/lib/newsroom/reserve-shelf';

async function main() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'spa105-reserve-'));
  process.env.SMARTPROTO_DATA_DIR = tmp;
  process.env.SMARTPROTO_RESERVE_TARGET = '8';
  process.env.SMARTPROTO_RESERVE_RELEASE_INTERVAL_MS = '1000';

  assert.equal(
    shouldHoldForReserve({
      channel: 'rss',
      cycle: 'news',
      freshnessStatus: 'OK',
      minutesSinceLastAuto: 10,
      shelfCount: 0,
    }),
    true,
    'fresh homepage should stockpile',
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
    'stale homepage must publish live',
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
    'staff author never parked',
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
    'full shelf publishes live',
  );

  await saveReserveItem({
    slug: 'parked-one',
    sourceUrl: 'https://news.mit.edu/parked-one',
    channel: 'rss',
    cycle: 'news',
    article: { slug: 'parked-one', title: 'Parked', content: 'x' },
  });
  await saveReserveItem({
    slug: 'parked-two',
    sourceUrl: 'https://news.mit.edu/parked-two',
    channel: 'rss',
    cycle: 'news',
    article: { slug: 'parked-two', title: 'Parked 2', content: 'y' },
  });
  assert.equal(countReserveItems(), 2);

  assert.equal(
    shouldReleaseReserve({
      freshnessStatus: 'CRITICAL',
      minutesSinceLastAuto: 5000,
      lastReserveReleaseAt: null,
      shelfCount: 2,
    }),
    true,
  );
  assert.equal(
    shouldReleaseReserve({
      freshnessStatus: 'OK',
      minutesSinceLastAuto: 5,
      lastReserveReleaseAt: new Date().toISOString(),
      shelfCount: 2,
    }),
    false,
    'do not dump the shelf while homepage is fresh',
  );
  assert.equal(
    shouldReleaseReserve({
      freshnessStatus: 'OK',
      minutesSinceLastAuto: 5,
      lastReserveReleaseAt: null,
      lastCreditErrorAt: new Date().toISOString(),
      shelfCount: 2,
    }),
    true,
    'credit outage may drip the carousel',
  );

  const first = takeOldestReserve();
  assert.equal(first?.slug, 'parked-one');
  assert.equal(countReserveItems(), 1);

  assert.equal(looksLikeCreditError('OpenRouter 402 Payment Required insufficient credits'), true);
  assert.equal(looksLikeCreditError('scout reject score 40'), false);

  const tickSrc = await fs.readFile(path.resolve(__dirname, 'run-newsroom-tick.ts'), 'utf8');
  assert.match(tickSrc, /maybeParkOnReserve/);
  assert.match(tickSrc, /status: 'reserved'/);

  console.log('SP-A-105 reserve shelf tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
