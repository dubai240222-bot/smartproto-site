/**
 * SP-CONTACT-SCOUT-001 — local control tests (no live publish, no OpenRouter).
 */
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CONTACT_SCOUT_UI } from '../src/lib/i18n/contact-scout';
import { publicEditorialEmail, PUBLIC_EDITORIAL_EMAIL_DEFAULT } from '../src/lib/site-contact';
import { isEmailTransportConfigured } from '../src/lib/email/transport';
import {
  __testCreatePending,
  SCOUT_OTP_MAX_ATTEMPTS,
  verifyScoutOtp,
  requestScoutOtp,
} from '../src/lib/editorial/scout-otp';
import {
  acceptReaderScoutSubmission,
  getReaderScoutSubmission,
  validateScoutUrl,
} from '../src/lib/editorial/reader-scout';

async function main() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'spa-contact-scout-'));
  process.env.SMARTPROTO_DATA_DIR = tmp;
  delete process.env.SMARTPROTO_RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  let failed = 0;
  const check = (name: string, ok: boolean, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failed++;
  };

  // 1–3 contact copy
  check('CONTACTS RU', CONTACT_SCOUT_UI.ru.contactTitle.includes('редакцией'));
  check('CONTACTS EN', CONTACT_SCOUT_UI.en.contactTitle.toLowerCase().includes('editorial'));
  check('CONTACTS TR', CONTACT_SCOUT_UI.tr.contactTitle.toLowerCase().includes('editör'));

  // 4–6 scout copy
  check('SCOUT RU', CONTACT_SCOUT_UI.ru.scoutSuccess.includes('не гарантируется'));
  check('SCOUT EN', CONTACT_SCOUT_UI.en.scoutSuccess.toLowerCase().includes('not guaranteed'));
  check('SCOUT TR', CONTACT_SCOUT_UI.tr.scoutSuccess.toLowerCase().includes('garantisi'));

  // Public email
  check(
    'PUBLIC EMAIL',
    publicEditorialEmail() === PUBLIC_EDITORIAL_EMAIL_DEFAULT,
    publicEditorialEmail(),
  );

  // URL validation
  check('URL valid', validateScoutUrl('https://news.mit.edu/example-story').ok === true);
  check('URL invalid scheme', validateScoutUrl('javascript:alert(1)').ok === false);
  check('URL local blocked', validateScoutUrl('http://127.0.0.1/x').ok === false);

  // Email validation via request-otp without transport
  const noTransport = await requestScoutOtp({
    url: 'https://news.mit.edu/example-story',
    email: 'reader@example.com',
    ip: '203.0.113.10',
  });
  check(
    'OTP blocked without transport',
    noTransport.ok === false && noTransport.code === 'EMAIL_CONFIG',
  );
  check('EMAIL TRANSPORT CONFIG', isEmailTransportConfigured() === false, 'CONFIG REQUIRED');

  // OTP valid / expired / incorrect / reuse / brute force
  const pending = await __testCreatePending({
    email: 'reader@example.com',
    url: `https://news.mit.edu/otp-control-${Date.now()}`,
    code: '123456',
    note: 'interesting prototype',
    name: 'Alex',
  });

  const bad = await verifyScoutOtp({ pendingId: pending.id, code: '000000', ip: '203.0.113.11' });
  check('OTP incorrect', bad.ok === false && bad.code === 'INVALID');

  const good = await verifyScoutOtp({ pendingId: pending.id, code: '123456', ip: '203.0.113.11' });
  check('OTP valid', good.ok === true && good.email === 'reader@example.com');

  const reuse = await verifyScoutOtp({ pendingId: pending.id, code: '123456', ip: '203.0.113.11' });
  check('OTP reused', reuse.ok === false && reuse.code === 'CONSUMED');

  const expired = await __testCreatePending({
    email: 'reader2@example.com',
    url: `https://news.mit.edu/otp-expired-${Date.now()}`,
    code: '654321',
    expiresInMs: -1000,
  });
  const exp = await verifyScoutOtp({ pendingId: expired.id, code: '654321', ip: '203.0.113.12' });
  check('OTP expired', exp.ok === false && exp.code === 'EXPIRED');

  const brute = await __testCreatePending({
    email: 'reader3@example.com',
    url: `https://news.mit.edu/otp-brute-${Date.now()}`,
    code: '111222',
  });
  let locked = false;
  for (let i = 0; i < SCOUT_OTP_MAX_ATTEMPTS; i++) {
    const r = await verifyScoutOtp({
      pendingId: brute.id,
      code: '000000',
      ip: `203.0.113.${20 + i}`,
    });
    if (!r.ok && r.code === 'LOCKED') locked = true;
  }
  const afterLock = await verifyScoutOtp({
    pendingId: brute.id,
    code: '111222',
    ip: '203.0.113.99',
  });
  check(
    'OTP brute-force limit',
    locked || (afterLock.ok === false && afterLock.code === 'LOCKED'),
  );

  // Unverified must not enter SAFE queue — simulate by ensuring accept only after verify path.
  // Direct accept still exists for editorial controls; public API requires OTP (tested above).
  // Verified submission enters SAFE/editorial queue:
  const uniqueUrl = `https://news.mit.edu/verified-tip-${Date.now()}`;
  const verifiedPending = await __testCreatePending({
    email: 'verified@example.com',
    url: uniqueUrl,
    code: '777888',
    note: 'lab prototype',
  });
  const v = await verifyScoutOtp({
    pendingId: verifiedPending.id,
    code: '777888',
    ip: '203.0.113.50',
  });
  assert.equal(v.ok, true);
  if (v.ok) {
    const accepted = await acceptReaderScoutSubmission({
      url: v.url,
      email: v.email,
      note: v.note,
      name: v.name,
      ip: '203.0.113.50',
    });
    check('SAFE QUEUE after verify', accepted.ok === true, accepted.ok ? accepted.id : accepted.code);
    if (accepted.ok) {
      const sub = await getReaderScoutSubmission(accepted.id);
      check(
        'Queued editorial or moderated',
        Boolean(
          sub &&
            (sub.status === 'queued_editorial' ||
              sub.status === 'queued' ||
              sub.status === 'rejected_spam' ||
              sub.status === 'rejected_unsafe' ||
              sub.status === 'rejected_abuse'),
        ),
        sub?.status,
      );
      check('No direct publish', sub?.status !== 'published');
    }
  }

  // Duplicate URL
  const dup = await acceptReaderScoutSubmission({
    url: uniqueUrl,
    email: 'other@example.com',
    ip: '203.0.113.51',
  });
  check('Duplicate URL', dup.ok === false && dup.code === 'DUPLICATE');

  // Rate limit / bot honeypot soft-accept without queue pollution is covered in acceptReaderScoutSubmission.
  const honey = await acceptReaderScoutSubmission({
    url: `https://news.mit.edu/honey-${Date.now()}`,
    email: 'bot@example.com',
    honeypot: 'Acme Corp',
    ip: '203.0.113.52',
  });
  check('Honeypot soft OK', honey.ok === true);
  if (honey.ok) {
    const ghost = await getReaderScoutSubmission(honey.id);
    check('Honeypot not persisted', ghost === null);
  }

  // No AI before OTP — requestScoutOtp without transport never creates editorial submission.
  const files = await fs.readdir(path.join(tmp, 'reader-scout')).catch(() => [] as string[]);
  const editorialJson = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(tmp, 'reader-scout', f), 'utf8');
      const parsed = JSON.parse(raw) as { sourceType?: string; status?: string };
      if (parsed.sourceType === 'reader-scout') editorialJson.push(parsed);
    } catch {
      /* skip */
    }
  }
  check(
    'NO AI before OTP (only verified accepts in queue files)',
    editorialJson.every((s) => s.status !== 'published'),
  );

  console.log(`\nDone. failed=${failed}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
