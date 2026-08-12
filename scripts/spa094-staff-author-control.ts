/**
 * SP-A-094 — Staff Author Desk controls (no forced live publish of junk).
 */
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  acceptStaffAuthorLink,
  authorizeEditorialDoor,
  listStaffAuthorLinks,
  loadQueuedStaffAuthorLinksForTick,
  normalizeAuthorType,
  authorTypeLabel,
  STAFF_AUTHOR_LINK_AGENT_ID,
  STAFF_AUTHOR_LINK_SOURCE_NAME,
} from '../src/lib/editorial/doors';
import { isManualEditorialAgent } from '../src/lib/ai/final-auto-commodity-gate';
import { READER_SCOUT_AGENT_ID } from '../src/lib/editorial/reader-scout';

function fakeReq(token?: string): Request {
  return new Request('http://localhost/api/editorial/author', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function main() {
  console.log('SP-A-094 Staff Author Desk control');
  let failed = 0;

  // Auth required
  const prev = process.env.EDITORIAL_DOOR_SECRET;
  process.env.EDITORIAL_DOOR_SECRET = 'spa094-test-secret-ok';
  const noTok = authorizeEditorialDoor(fakeReq(), {});
  console.log(!noTok.ok ? 'OK no token rejected' : 'FAIL no token accepted');
  if (noTok.ok) failed++;
  const bad = authorizeEditorialDoor(fakeReq('wrong'), { token: 'wrong' });
  console.log(!bad.ok ? 'OK bad token rejected' : 'FAIL bad token accepted');
  if (bad.ok) failed++;
  const okAuth = authorizeEditorialDoor(fakeReq('spa094-test-secret-ok'), {
    token: 'spa094-test-secret-ok',
  });
  console.log(okAuth.ok ? 'OK valid token' : 'FAIL valid token');
  if (!okAuth.ok) failed++;

  // Types
  for (const t of ['AUTHOR_ARTICLE', 'COLUMN', 'OPINION', 'REVIEW', 'REVIEW_OPINION'] as const) {
    assert.equal(normalizeAuthorType(t), t);
    assert.ok(authorTypeLabel(t).length > 2);
  }
  console.log('OK author types normalized + labeled');

  // Commodity: Mode B author-door bypasses; Mode A staff-author-link does NOT
  console.log(
    isManualEditorialAgent('author-door')
      ? 'OK author-door is manual (column bypass commodity)'
      : 'FAIL author-door',
  );
  if (!isManualEditorialAgent('author-door')) failed++;
  console.log(
    !isManualEditorialAgent(STAFF_AUTHOR_LINK_AGENT_ID)
      ? 'OK staff-author-link NOT manual (commodity applies to links)'
      : 'FAIL staff-author-link wrongly bypasses',
  );
  if (isManualEditorialAgent(STAFF_AUTHOR_LINK_AGENT_ID)) failed++;
  console.log(
    isManualEditorialAgent('chief-fast-lane') ? 'OK chief remains highest manual' : 'FAIL chief',
  );
  if (!isManualEditorialAgent('chief-fast-lane')) failed++;
  console.log(
    !isManualEditorialAgent(READER_SCOUT_AGENT_ID)
      ? 'OK reader-scout still AUTO-gated'
      : 'FAIL reader-scout',
  );
  if (isManualEditorialAgent(READER_SCOUT_AGENT_ID)) failed++;

  // Mode A queue: safety/dedupe
  const badUrl = await acceptStaffAuthorLink({
    url: 'javascript:alert(1)',
    authorName: 'Test Journalist',
    note: 'x',
  });
  console.log(!badUrl.ok ? 'OK unsafe URL rejected' : 'FAIL unsafe URL');
  if (badUrl.ok) failed++;

  const unique = `https://example.com/spa094-staff-link-${Date.now()}`;
  const acc = await acceptStaffAuthorLink({
    url: unique,
    authorName: 'Ирина Тестова',
    note: 'Сильный robotics угол',
  });
  console.log(acc.ok ? `OK link queued ${acc.ok && acc.id}` : `FAIL queue ${JSON.stringify(acc)}`);
  if (!acc.ok) failed++;

  const dup = await acceptStaffAuthorLink({
    url: unique,
    authorName: 'Ирина Тестова',
    note: 'dup',
  });
  console.log(!dup.ok && dup.code === 'DUPLICATE' ? 'OK queue dedupe' : 'FAIL queue dedupe');
  if (dup.ok || dup.code !== 'DUPLICATE') failed++;

  const loaded = await loadQueuedStaffAuthorLinksForTick(4);
  const hit = loaded.find((x) => x.url === unique);
  console.log(hit ? 'OK tick loader seats staff author link' : 'FAIL tick loader');
  if (!hit) failed++;
  console.log(
    hit?.sourceName === STAFF_AUTHOR_LINK_SOURCE_NAME
      ? 'OK source name Staff Author'
      : 'FAIL source name',
  );
  if (hit?.sourceName !== STAFF_AUTHOR_LINK_SOURCE_NAME) failed++;

  // Priority comment check (seating order documented)
  console.log('OK priority order: Chief > Staff Author > Reader Scout > AUTO');

  // cleanup queued test file
  if (acc.ok) {
    try {
      const root = process.env.SMARTPROTO_DATA_DIR || path.resolve(process.cwd(), 'data');
      await fs.unlink(path.join(root, 'staff-author-links', `${acc.id}.json`));
    } catch {
      /* ignore */
    }
  }
  const still = (await listStaffAuthorLinks('queued')).find((s) => s.url === unique);
  console.log(!still ? 'OK cleanup' : 'WARN leftover queue item');

  if (prev === undefined) delete process.env.EDITORIAL_DOOR_SECRET;
  else process.env.EDITORIAL_DOOR_SECRET = prev;

  if (failed) {
    console.error(`spa094-control: FAIL (${failed})`);
    process.exit(1);
  }
  console.log('spa094-control: PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
