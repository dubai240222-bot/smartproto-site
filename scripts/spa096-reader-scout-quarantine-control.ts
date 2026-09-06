/**
 * SP-A-096 — Reader Scout quarantine / cheap moderation controls (no live publish).
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  acceptReaderScoutSubmission,
  getReaderScoutSubmission,
  loadQueuedReaderScoutForTick,
  READER_SCOUT_AGENT_ID,
  READER_SCOUT_SEATS_PER_TICK,
  toPublicScoutView,
} from '../src/lib/editorial/reader-scout';
import { cheapModerateReaderScout } from '../src/lib/editorial/reader-scout-moderation';
import { isManualEditorialAgent } from '../src/lib/ai/final-auto-commodity-gate';

async function withTempData<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'spa096-scout-'));
  const prev = process.env.SMARTPROTO_DATA_DIR;
  process.env.SMARTPROTO_DATA_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    if (prev === undefined) delete process.env.SMARTPROTO_DATA_DIR;
    else process.env.SMARTPROTO_DATA_DIR = prev;
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  console.log('SP-A-096 Reader Scout quarantine control');
  let failed = 0;

  // —— unit: cheap moderator ——
  const cases: Array<{
    name: string;
    url: string;
    note?: string;
    expectOk: boolean;
    expectStatus?: string;
  }> = [
    {
      name: 'porn',
      url: 'https://evil-porn-site.example/gallery/xxx',
      note: 'hot porn videos',
      expectOk: false,
      expectStatus: 'rejected_unsafe',
    },
    {
      name: 'illegal_drugs',
      url: 'https://darknet-shop.example/buy-cocaine',
      note: 'buy cocaine online marketplace',
      expectOk: false,
      expectStatus: 'rejected_unsafe',
    },
    {
      name: 'gambling',
      url: 'https://ai-casino-bonus.example/promo',
      note: 'AI casino free spins no deposit bonus',
      expectOk: false,
      expectStatus: 'rejected_spam',
    },
    {
      name: 'malware',
      url: 'https://steal-creds.example/phishing-kit',
      note: 'phishing credential harvest toolkit',
      expectOk: false,
      expectStatus: 'rejected_unsafe',
    },
    {
      name: 'legit_mit',
      url: 'https://news.mit.edu/2026/shiftlens-3d-printed-objects',
      note: 'MIT research on sensing in printed objects',
      expectOk: true,
    },
    {
      name: 'legit_ieee_security',
      url: 'https://spectrum.ieee.org/cybersecurity-malware-analysis-tool',
      note: 'cybersecurity research on malware analysis',
      expectOk: true,
    },
  ];

  for (const c of cases) {
    const v = cheapModerateReaderScout({ url: c.url, note: c.note });
    const ok = v.ok === c.expectOk && (!c.expectStatus || (!v.ok && v.status === c.expectStatus));
    console.log(ok ? `OK cheap:${c.name}` : `FAIL cheap:${c.name} → ${JSON.stringify(v)}`);
    if (!ok) failed++;
  }

  await withTempData(async () => {
    // legit → queued_editorial
    const legit = await acceptReaderScoutSubmission({
      url: `https://news.mit.edu/2026/spa096-control-${Date.now()}`,
      note: 'MIT robotics research prototype',
      email: 'reader@example.com',
      ip: '203.0.113.10',
    });
    if (!legit.ok) {
      console.log('FAIL legit accept', legit);
      failed++;
    } else {
      const sub = await getReaderScoutSubmission(legit.id);
      const ok = sub?.status === 'queued_editorial' && Boolean(sub.moderationReason);
      console.log(ok ? 'OK legit→queued_editorial' : `FAIL legit status=${sub?.status}`);
      if (!ok) failed++;
      const pub = toPublicScoutView(sub!);
      if ((pub as { rejectReason?: string }).rejectReason || pub.status === 'queued_editorial') {
        // public must not expose queued_editorial internals
        if (pub.status !== 'queued') {
          console.log(`FAIL public status leak ${pub.status}`);
          failed++;
        } else console.log('OK public status sanitized');
      } else {
        console.log('OK public status sanitized');
      }
      if ((pub as { submitterEmail?: string }).submitterEmail) {
        console.log('FAIL email leaked');
        failed++;
      } else console.log('OK email not public');
    }

    // porn → reject before editorial
    const porn = await acceptReaderScoutSubmission({
      url: `https://adult-spam-${Date.now()}.biz/porn-gallery`,
      note: 'xxx porn videos',
      ip: '203.0.113.11',
    });
    const pornOk = !porn.ok && (porn.code === 'UNSAFE' || porn.code === 'SPAM');
    console.log(pornOk ? 'OK porn rejected' : `FAIL porn ${JSON.stringify(porn)}`);
    if (!pornOk) failed++;

    // gambling
    const gamb = await acceptReaderScoutSubmission({
      url: `https://bonus-casino-${Date.now()}.top/ai-casino-bonus`,
      note: 'AI casino free spins betting bonus',
      ip: '203.0.113.12',
    });
    console.log(!gamb.ok ? 'OK gambling rejected' : 'FAIL gambling accepted');
    if (gamb.ok) failed++;

    // malware
    const mal = await acceptReaderScoutSubmission({
      url: `https://phish-${Date.now()}.example/malware-download`,
      note: 'phishing steal passwords malware download',
      ip: '203.0.113.13',
    });
    console.log(!mal.ok ? 'OK malware rejected' : 'FAIL malware accepted');
    if (mal.ok) failed++;

    // illegal goods
    const drugs = await acceptReaderScoutSubmission({
      url: `https://shop-${Date.now()}.example/buy-cocaine`,
      note: 'buy cocaine drug marketplace',
      ip: '203.0.113.14',
    });
    console.log(!drugs.ok ? 'OK illegal goods rejected' : 'FAIL illegal goods');
    if (drugs.ok) failed++;

    // seat bound + only SAFE
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const a = await acceptReaderScoutSubmission({
        url: `https://spectrum.ieee.org/spa096-seat-${Date.now()}-${i}`,
        note: 'IEEE robotics research',
        ip: `203.0.113.${20 + i}`,
      });
      if (a.ok) ids.push(a.id);
    }
    const loaded = await loadQueuedReaderScoutForTick(READER_SCOUT_SEATS_PER_TICK);
    const seatOk = loaded.length <= READER_SCOUT_SEATS_PER_TICK;
    console.log(
      seatOk
        ? `OK seats_per_tick<=${READER_SCOUT_SEATS_PER_TICK} got=${loaded.length}`
        : `FAIL seats ${loaded.length}`,
    );
    if (!seatOk) failed++;

    // rejected must not appear in tick loader
    const pornStill = await acceptReaderScoutSubmission({
      url: `https://evil-${Date.now()}.example/xxx-porn`,
      note: 'pornography explicit',
      ip: '203.0.113.99',
    });
    if (pornStill.ok) {
      console.log('FAIL second porn accepted');
      failed++;
    }
    const loaded2 = await loadQueuedReaderScoutForTick(50);
    const leak = loaded2.some((x) => /porn|xxx/i.test(x.url) || /porn|xxx/i.test(x.text));
    console.log(!leak ? 'OK unsafe not seated for Editor/Scout' : 'FAIL unsafe seated');
    if (leak) failed++;

    // burst rate limit same IP
    let rateHits = 0;
    const burstIp = '198.51.100.77';
    for (let i = 0; i < 6; i++) {
      const r = await acceptReaderScoutSubmission({
        url: `https://newatlas.com/spa096-burst-${Date.now()}-${i}`,
        note: 'gadget prototype',
        ip: burstIp,
      });
      if (!r.ok && r.code === 'RATE_LIMIT') rateHits++;
    }
    console.log(rateHits > 0 ? `OK burst rate limited (${rateHits})` : 'FAIL burst not limited');
    if (rateHits <= 0) failed++;
  });

  // assertions
  console.log(
    !isManualEditorialAgent(READER_SCOUT_AGENT_ID)
      ? 'OK CANNOT publish directly / no commodity bypass'
      : 'FAIL reader bypass',
  );
  if (isManualEditorialAgent(READER_SCOUT_AGENT_ID)) failed++;

  console.log(`READER_SEATS_PER_TICK=${READER_SCOUT_SEATS_PER_TICK}`);
  console.log('ASSERT UNSAFE→EDITOR POSSIBLE: NO');
  console.log('ASSERT READER CAN STARVE AUTO: NO (bounded seats)');

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
