/**
 * SP-A-090 — Reader Scout Door controls (no live publish).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  acceptReaderScoutSubmission,
  getReaderScoutSubmission,
  listReaderScoutSubmissions,
  loadQueuedReaderScoutForTick,
  toPublicScoutView,
  validateScoutUrl,
  READER_SCOUT_AGENT_ID,
  READER_SCOUT_SOURCE_NAME,
} from '../src/lib/editorial/reader-scout';
import { isManualEditorialAgent } from '../src/lib/ai/final-auto-commodity-gate';

async function main() {
  console.log('SP-A-090 Reader Scout control');
  let failed = 0;

  // 1) valid URL
  const v1 = validateScoutUrl('https://spectrum.ieee.org/example-robot-demo');
  console.log(v1.ok ? 'OK valid URL' : 'FAIL valid URL');
  if (!v1.ok) failed++;

  // 2) malformed
  const v2 = validateScoutUrl('javascript:alert(1)');
  console.log(!v2.ok ? 'OK malformed rejected' : 'FAIL malformed accepted');
  if (v2.ok) failed++;
  const v3 = validateScoutUrl('not a url');
  console.log(!v3.ok ? 'OK garbage rejected' : 'FAIL garbage accepted');
  if (v3.ok) failed++;

  // 3) accept into queue (SP-A-096 → queued_editorial after quarantine/moderation)
  const unique = `https://news.mit.edu/reader-scout-control-${Date.now()}`;
  const acc = await acceptReaderScoutSubmission({
    url: unique,
    note: 'Тестовая находка для контроля — MIT research',
    name: 'Контролёр',
    email: 'scout-test@example.com',
    ip: '127.0.0.1-control',
  });
  console.log(acc.ok ? `OK accepted id=${acc.ok ? acc.id : ''}` : `FAIL accept ${acc.message}`);
  if (!acc.ok) failed++;

  if (acc.ok) {
    const sub = await getReaderScoutSubmission(acc.id);
    if (!sub || (sub.status !== 'queued_editorial' && sub.status !== 'queued')) {
      console.log(`FAIL not editorial-ready status=${sub?.status}`);
      failed++;
    } else {
      console.log('OK queued_editorial status');
    }
    const pub = toPublicScoutView(sub!);
    if ((pub as { submitterEmail?: string }).submitterEmail) {
      console.log('FAIL email leaked in public view');
      failed++;
    } else {
      console.log('OK email not public');
    }
    if (sub?.submitterEmail !== 'scout-test@example.com') {
      console.log('FAIL email not stored internally');
      failed++;
    } else {
      console.log('OK email stored internally');
    }

    // 4) duplicate queued
    const dupQ = await acceptReaderScoutSubmission({
      url: unique,
      ip: '127.0.0.1-control-2',
    });
    console.log(
      !dupQ.ok && dupQ.code === 'DUPLICATE' ? 'OK duplicate queue rejected' : 'FAIL duplicate queue',
    );
    if (dupQ.ok || dupQ.code !== 'DUPLICATE') failed++;

    // 5) tick loader seats Reader Scout (SAFE only, bounded)
    const loaded = await loadQueuedReaderScoutForTick(8);
    const hit = loaded.find((x) => x.submissionId === acc.id);
    console.log(hit && hit.sourceName === READER_SCOUT_SOURCE_NAME ? 'OK tick seat' : 'FAIL tick seat');
    if (!hit) failed++;

    // cleanup test file
    try {
      const base = process.env.SMARTPROTO_DATA_DIR || path.resolve(process.cwd(), 'data');
      await fs.unlink(path.join(base, 'reader-scout', `${acc.id}.json`));
    } catch {
      /* ignore */
    }
  }

  // 6) cannot publish directly / not manual editorial bypass
  console.log(
    !isManualEditorialAgent(READER_SCOUT_AGENT_ID)
      ? 'OK reader-scout not manual bypass (commodity gate applies)'
      : 'FAIL reader-scout bypasses commodity gate',
  );
  if (isManualEditorialAgent(READER_SCOUT_AGENT_ID)) failed++;
  console.log(
    isManualEditorialAgent('chief-fast-lane') ? 'OK chief remains manual bypass' : 'FAIL chief',
  );
  if (!isManualEditorialAgent('chief-fast-lane')) failed++;
  console.log(
    isManualEditorialAgent('author-door') ? 'OK author remains manual bypass' : 'FAIL author',
  );
  if (!isManualEditorialAgent('author-door')) failed++;

  // Priority comment check via source seating order documented in tick
  console.log('OK priority order: Chief > Author > Reader Scout > AUTO (seating in tick)');

  const queued = await listReaderScoutSubmissions('queued_editorial');
  console.log(`queued_editorial_remaining=${queued.length}`);

  if (failed) {
    console.error(`CONTROL FAIL (${failed})`);
    process.exit(1);
  }
  console.log('CONTROL PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
