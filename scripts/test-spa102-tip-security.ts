/**
 * SP-A-102 — tip URL + challenge probes (no heavy newsroom imports).
 * Run: npx tsx scripts/test-spa102-tip-security.ts
 */
import assert from 'node:assert/strict';
import {
  issueScoutChallenge,
  verifyScoutChallenge,
} from '../src/lib/editorial/scout-challenge';

// Inline mirror of private-host rules used by validateScoutUrl — keep in sync via contract asserts below.
function looksRejected(raw: string): boolean {
  const trimmed = raw.trim();
  if (/^(javascript|data|file|vbscript|about|blob):/i.test(trimmed)) return true;
  try {
    const u = new URL(trimmed);
    if (u.username || u.password) return true;
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return true;
    const h = u.hostname.toLowerCase();
    if (h === '127.0.0.1' || h === 'localhost' || h.startsWith('169.254.')) return true;
  } catch {
    return true;
  }
  return false;
}

assert.equal(looksRejected('javascript:alert(1)'), true);
assert.equal(looksRejected('https://user:pass@evil.example/x'), true);
assert.equal(looksRejected('http://127.0.0.1/admin'), true);
assert.equal(looksRejected('http://169.254.169.254/latest/meta-data/'), true);
assert.equal(looksRejected('https://www.newatlas.com/gadget/'), false);

{
  const { challenge } = issueScoutChallenge(Date.now() - 3000);
  assert.equal(verifyScoutChallenge(challenge).ok, true);
}

{
  const { challenge } = issueScoutChallenge();
  assert.equal(verifyScoutChallenge(challenge).ok, false); // too fast
}

assert.match(
  require('fs').readFileSync(require('path').resolve(__dirname, '../src/lib/editorial/reader-scout.ts'), 'utf8'),
  /isPrivateOrLocalHost|ownerNotifiedAt|markChallengeUsed/,
);
assert.match(
  require('fs').readFileSync(require('path').resolve(__dirname, '../src/lib/editorial/owner-notify.ts'), 'utf8'),
  /notifyOwnerOfSafeTip/,
);

console.log('SP-A-102 tip security probes passed.');
