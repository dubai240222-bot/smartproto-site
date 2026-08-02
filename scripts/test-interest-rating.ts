/** SP-A-052 reader-feedback unit tests (no Upstash/network). */
import assert from 'node:assert/strict';
import {
  INTEREST_SCORES,
  MIN_PUBLIC_VOTES,
  applyRatingUpdate,
  cleanAnonId,
  emptySlugStats,
  isInterestScore,
  isShareChannel,
  isValidSlug,
  telegramShareUrl,
  toPublicStats,
  whatsappShareUrl,
} from '../src/lib/interest-rating-shared';

let n = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  n += 1;
  console.log(`ok  ${name}`);
};

ok('scores 1–10', () => {
  assert.deepEqual([...INTEREST_SCORES], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(isInterestScore(1) && isInterestScore(10), true);
  assert.equal(isInterestScore(0) || isInterestScore(11) || isInterestScore(5.5), false);
});

ok('re-rate updates previous', () => {
  let s = applyRatingUpdate(emptySlugStats(), 8, null);
  assert.equal(s.count, 1);
  assert.equal(s.sum, 8);
  s = applyRatingUpdate(s, 3, 8);
  assert.equal(s.count, 1);
  assert.equal(s.sum, 3);
  assert.equal(s.scores[8], 0);
  assert.equal(s.scores[3], 1);
});

ok('public avg after 5 votes', () => {
  let s = emptySlugStats();
  for (let i = 0; i < MIN_PUBLIC_VOTES - 1; i++) s = applyRatingUpdate(s, 9, null);
  assert.equal(toPublicStats(s).avg, null);
  s = applyRatingUpdate(s, 9, null);
  assert.equal(toPublicStats(s).avg, 9);
});

ok('share urls', () => {
  const page = 'https://smartproto.example/articles/demo';
  const tg = telegramShareUrl(page, 'Demo');
  const wa = whatsappShareUrl(page, 'Demo');
  assert.ok(tg.includes('t.me/share') && tg.includes(encodeURIComponent(page)));
  assert.ok(wa.startsWith('https://wa.me/?text=') && decodeURIComponent(wa).includes(page));
});

ok('validators', () => {
  assert.equal(isValidSlug('ok-slug_1'), true);
  assert.equal(isValidSlug('../x'), false);
  assert.equal(isShareChannel('telegram'), true);
  assert.equal(isShareChannel('email'), false);
  assert.ok(cleanAnonId('anon-12345678'));
  assert.equal(cleanAnonId('short'), null);
});

console.log(`\n${n} passed`);
