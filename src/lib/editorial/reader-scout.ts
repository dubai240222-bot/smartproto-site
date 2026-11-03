/**
 * SP-A-090 — Reader Scout Door («живые шахтёры»).
 * SP-A-096 — UNTRUSTED public input: quarantine + cheap moderation before editorial.
 *
 * Pipeline: SUBMISSION → cheap validation → QUARANTINE → abuse/content moderation
 *   → only if SAFE → queued_editorial → Scout → Reviewer → Editor → Photo → gates → publish
 *
 * Priority: Chief > Staff Author > Reader Scout SAFE queue > AUTO.
 * Reader Scout never publishes directly and never bypasses commodity gate.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { findPublishedDuplicate, normalizeUrl } from '@/lib/editorial/doors';
import { cheapModerateReaderScout } from '@/lib/editorial/reader-scout-moderation';

export const READER_SCOUT_SOURCE_TYPE = 'reader-scout' as const;
export const READER_SCOUT_AGENT_ID = 'reader-scout';
/** Display source name in Scout pool — used for priority seating. */
export const READER_SCOUT_SOURCE_NAME = 'Reader Scout';

/** Bounded Reader Scout seats per newsroom tick — must not starve AUTO / eat AI budget. */
export const READER_SCOUT_SEATS_PER_TICK = 2;
/** Cap open quarantine + editorial queue so abusers cannot flood disk/tick. */
export const READER_SCOUT_MAX_OPEN_QUEUE = 40;
const RATE_LIMIT_PER_HOUR = 5;
const RATE_LIMIT_BURST_PER_10_MIN = 3;
const ABUSE_REJECTS_BEFORE_COOLDOWN = 3;
const ABUSE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type ReaderScoutStatus =
  | 'quarantined'
  | 'safe'
  | 'queued_editorial'
  /** @deprecated SP-A-096 — treated as queued_editorial for back-compat */
  | 'queued'
  | 'processing'
  | 'rejected'
  | 'rejected_abuse'
  | 'rejected_spam'
  | 'rejected_unsafe'
  | 'duplicate'
  | 'published';

export type ReaderScoutSubmission = {
  id: string;
  sourceType: typeof READER_SCOUT_SOURCE_TYPE;
  status: ReaderScoutStatus;
  url: string;
  normalizedUrl: string;
  /** Optional reader note — why interesting */
  note?: string;
  submitterName?: string;
  /** Stored internally only — never exposed in public APIs/UI. */
  submitterEmail?: string;
  /** Internal moderation / reject detail — never public. */
  rejectReason?: string;
  moderationReason?: string;
  articleSlug?: string;
  createdAt: string;
  updatedAt: string;
  attempts?: number;
  /** SP-A-102 — set when owner inbox was notified after SAFE. */
  ownerNotifiedAt?: string;
};

export type ReaderScoutAcceptResult =
  | { ok: true; id: string; status: 'queued' | 'queued_editorial'; message: string }
  | {
      ok: false;
      status: 'rejected' | 'duplicate';
      code: 'VALIDATION' | 'DUPLICATE' | 'RATE_LIMIT' | 'SPAM' | 'UNSAFE' | 'QUEUE_FULL';
      message: string;
      duplicateSlug?: string;
    };

const MAX_NOTE = 800;
const MAX_NAME = 80;
const MAX_EMAIL = 120;

function dataRoot(): string {
  return process.env.SMARTPROTO_DATA_DIR || path.resolve(process.cwd(), 'data');
}

function queueDir(): string {
  return path.join(dataRoot(), 'reader-scout');
}

function rateDir(): string {
  return path.join(queueDir(), 'rate');
}

export function stripUserText(raw: unknown, max: number): string {
  return String(raw ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const MAX_URL_LEN = 2048;

function isPrivateOrLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0') return true;
  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return true;
  // IPv4 literals
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const parts = h.split('.').map(Number);
    if (parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  // IPv6 local / link-local / ULA
  if (h.includes(':')) {
    if (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
    if (h === '::' || h.startsWith('::ffff:127.') || h.startsWith('::ffff:10.')) return true;
  }
  return false;
}

/** Strict http(s) URL validation — no javascript:/data:/file:, no creds, no private hosts. */
export function validateScoutUrl(
  raw: string,
): { ok: true; url: string; normalized: string } | { ok: false; message: string } {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { ok: false, message: 'Укажите ссылку.' };
  if (trimmed.length > MAX_URL_LEN) return { ok: false, message: 'Ссылка слишком длинная.' };
  if (/\s/.test(trimmed)) return { ok: false, message: 'Ссылка содержит пробелы.' };
  if (/^(javascript|data|file|vbscript|about|blob):/i.test(trimmed)) {
    return { ok: false, message: 'Недопустимый тип ссылки.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, message: 'Некорректная ссылка.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, message: 'Разрешены только http/https ссылки.' };
  }
  // Block credential injection / phishing via user:pass@host
  if (parsed.username || parsed.password) {
    return { ok: false, message: 'Ссылка с логином/паролем не принимается.' };
  }
  if (!parsed.hostname || parsed.hostname.length < 3) {
    return { ok: false, message: 'Некорректный адрес сайта.' };
  }
  // Require a dot for normal hosts (blocks single-label + most IP edge cases handled below)
  if (!parsed.hostname.includes('.') && !parsed.hostname.includes(':')) {
    return { ok: false, message: 'Некорректный адрес сайта.' };
  }
  if (isPrivateOrLocalHost(parsed.hostname)) {
    return { ok: false, message: 'Локальные и служебные адреса не принимаются.' };
  }
  const normalized = normalizeUrl(parsed.toString());
  if (!normalized) return { ok: false, message: 'Некорректная ссылка.' };
  return { ok: true, url: parsed.toString(), normalized };
}

function isValidEmail(email: string): boolean {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= MAX_EMAIL;
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(queueDir(), { recursive: true });
  await fs.mkdir(rateDir(), { recursive: true });
}

async function persistSubmission(sub: ReaderScoutSubmission): Promise<void> {
  await ensureDirs();
  await fs.writeFile(path.join(queueDir(), `${sub.id}.json`), `${JSON.stringify(sub, null, 2)}\n`);
}

export async function getReaderScoutSubmission(id: string): Promise<ReaderScoutSubmission | null> {
  try {
    const raw = await fs.readFile(path.join(queueDir(), `${id}.json`), 'utf8');
    return JSON.parse(raw) as ReaderScoutSubmission;
  } catch {
    return null;
  }
}

export async function listReaderScoutSubmissions(
  status?: ReaderScoutStatus,
): Promise<ReaderScoutSubmission[]> {
  try {
    await ensureDirs();
    const files = await fs.readdir(queueDir());
    const out: ReaderScoutSubmission[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(queueDir(), f), 'utf8');
        const parsed = JSON.parse(raw) as ReaderScoutSubmission;
        if (status && parsed.status !== status) continue;
        out.push(parsed);
      } catch {
        /* skip */
      }
    }
    out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    return out;
  } catch {
    return [];
  }
}

export async function patchReaderScoutSubmission(
  id: string,
  patch: Partial<ReaderScoutSubmission>,
): Promise<ReaderScoutSubmission | null> {
  const cur = await getReaderScoutSubmission(id);
  if (!cur) return null;
  const next: ReaderScoutSubmission = {
    ...cur,
    ...patch,
    id: cur.id,
    sourceType: READER_SCOUT_SOURCE_TYPE,
    updatedAt: new Date().toISOString(),
  };
  await persistSubmission(next);
  return next;
}

const OPEN_STATUSES: ReaderScoutStatus[] = [
  'quarantined',
  'safe',
  'queued_editorial',
  'queued',
  'processing',
];

async function countOpenQueue(): Promise<number> {
  const all = await listReaderScoutSubmissions();
  return all.filter((s) => OPEN_STATUSES.includes(s.status)).length;
}

async function findQueuedDuplicate(normalizedUrl: string): Promise<ReaderScoutSubmission | null> {
  const all = await listReaderScoutSubmissions();
  return (
    all.find(
      (s) =>
        s.normalizedUrl === normalizedUrl &&
        (OPEN_STATUSES.includes(s.status) || s.status === 'published'),
    ) || null
  );
}

type RateState = {
  stamps: number[];
  rejects?: number[];
  blockedUntil?: number;
};

function clientKey(ip: string): string {
  return createHash('sha256').update(`scout:${ip || 'unknown'}`).digest('hex').slice(0, 24);
}

async function readRateState(ip: string): Promise<{ file: string; state: RateState }> {
  await ensureDirs();
  const key = clientKey(ip);
  const file = path.join(rateDir(), `${key}.json`);
  const now = Date.now();
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as RateState;
    return {
      file,
      state: {
        stamps: Array.isArray(parsed.stamps)
          ? parsed.stamps.filter((t) => now - t < 60 * 60 * 1000)
          : [],
        rejects: Array.isArray(parsed.rejects)
          ? parsed.rejects.filter((t) => now - t < ABUSE_COOLDOWN_MS)
          : [],
        blockedUntil: typeof parsed.blockedUntil === 'number' ? parsed.blockedUntil : undefined,
      },
    };
  } catch {
    return { file, state: { stamps: [], rejects: [] } };
  }
}

async function writeRateState(file: string, state: RateState): Promise<void> {
  await fs.writeFile(file, `${JSON.stringify(state, null, 2)}\n`);
}

async function checkRateLimit(ip: string): Promise<'ok' | 'rate' | 'cooldown'> {
  const now = Date.now();
  const { file, state } = await readRateState(ip);
  if (state.blockedUntil && state.blockedUntil > now) return 'cooldown';
  const burst = state.stamps.filter((t) => now - t < 10 * 60 * 1000);
  if (burst.length >= RATE_LIMIT_BURST_PER_10_MIN) return 'rate';
  if (state.stamps.length >= RATE_LIMIT_PER_HOUR) return 'rate';
  state.stamps.push(now);
  await writeRateState(file, state);
  return 'ok';
}

async function recordModerationReject(ip: string): Promise<void> {
  const now = Date.now();
  const { file, state } = await readRateState(ip);
  state.rejects = [...(state.rejects || []), now];
  if (state.rejects.length >= ABUSE_REJECTS_BEFORE_COOLDOWN) {
    state.blockedUntil = now + ABUSE_COOLDOWN_MS;
  }
  await writeRateState(file, state);
}

/**
 * Apply cheap moderation to a quarantined (or legacy) submission.
 * Never calls AI. Never publishes.
 */
export async function moderateReaderScoutSubmission(
  id: string,
): Promise<ReaderScoutSubmission | null> {
  const cur = await getReaderScoutSubmission(id);
  if (!cur) return null;
  if (
    cur.status !== 'quarantined' &&
    cur.status !== 'safe' &&
    // legacy items sitting as queued without moderation — treat once
    !(cur.status === 'queued' && !cur.moderationReason)
  ) {
    return cur;
  }

  const verdict = cheapModerateReaderScout({ url: cur.url, note: cur.note });
  if (!verdict.ok) {
    return patchReaderScoutSubmission(id, {
      status: verdict.status,
      rejectReason: verdict.reason.slice(0, 400),
      moderationReason: verdict.reason.slice(0, 400),
    });
  }
  const promoted = await patchReaderScoutSubmission(id, {
    status: 'queued_editorial',
    moderationReason: `SAFE→queued_editorial:${verdict.reason}`.slice(0, 400),
    rejectReason: undefined,
  });
  // SP-A-102/103 — owner mail only AFTER SAFE; mark notified ONLY if delivered.
  if (promoted && !promoted.ownerNotifiedAt) {
    try {
      const { notifyOwnerOfSafeTip } = await import('@/lib/editorial/owner-notify');
      const notify = await notifyOwnerOfSafeTip(promoted);
      if (notify.delivered) {
        return (
          (await patchReaderScoutSubmission(id, {
            ownerNotifiedAt: new Date().toISOString(),
          })) || promoted
        );
      }
      // Persist failure hint for ops — do NOT set ownerNotifiedAt (allows retry).
      if (notify.reason) {
        return (
          (await patchReaderScoutSubmission(id, {
            moderationReason: `${promoted.moderationReason || 'SAFE'}|notify:${notify.reason}`.slice(
              0,
              400,
            ),
          })) || promoted
        );
      }
    } catch {
      /* notify failure must not block editorial queue */
    }
  }
  return promoted;
}

/**
 * Drain quarantine into editorial queue (or reject) — cheap only.
 * Called from tick before seating.
 */
export async function processReaderScoutQuarantine(limit = 20): Promise<{
  scanned: number;
  promoted: number;
  rejected: number;
}> {
  const quarantined = await listReaderScoutSubmissions('quarantined');
  // Also heal legacy unmoderated `queued` items.
  const legacy = (await listReaderScoutSubmissions('queued')).filter((s) => !s.moderationReason);
  const batch = [...quarantined, ...legacy].slice(0, limit);
  let promoted = 0;
  let rejected = 0;
  for (const s of batch) {
    const next = await moderateReaderScoutSubmission(s.id);
    if (!next) continue;
    if (next.status === 'queued_editorial') promoted++;
    else if (
      next.status === 'rejected_abuse' ||
      next.status === 'rejected_spam' ||
      next.status === 'rejected_unsafe'
    ) {
      rejected++;
    }
  }
  return { scanned: batch.length, promoted, rejected };
}

/**
 * Accept a public Reader Scout submission.
 * Quarantine-first → cheap moderation → editorial queue only if SAFE.
 * Never publishes. Never returns submitter email or internal moderation detail.
 */
export async function acceptReaderScoutSubmission(opts: {
  url: string;
  note?: string;
  name?: string;
  email?: string;
  /** Honeypot — if filled, fake OK without queueing. */
  honeypot?: string;
  /** SP-A-102 — signed challenge from GET /api/scout */
  challenge?: string;
  /** SP-A-102 — client form-open timestamp (ms); soft time-trap */
  openedAt?: number | string;
  ip?: string;
}): Promise<ReaderScoutAcceptResult> {
  // Soft spam trap — look like success, never queue, never notify owner.
  if (stripUserText(opts.honeypot, 200)) {
    return {
      ok: true,
      id: `scout-ignored-${Date.now().toString(36)}`,
      status: 'queued',
      message: 'Спасибо. Находка передана в редакцию SmartProto.',
    };
  }

  // Challenge + time window (bots / scripted floods).
  const { verifyScoutChallenge, wasChallengeUsed, markChallengeUsed } = await import(
    '@/lib/editorial/scout-challenge'
  );
  const challengeCheck = verifyScoutChallenge(opts.challenge);
  if (!challengeCheck.ok) {
    const msg =
      challengeCheck.reason === 'too_fast'
        ? 'Подождите секунду и отправьте ещё раз.'
        : challengeCheck.reason === 'expired' || challengeCheck.reason === 'missing'
          ? 'Обновите страницу и отправьте ссылку снова.'
          : 'Не удалось проверить форму. Обновите страницу.';
    return { ok: false, status: 'rejected', code: 'VALIDATION', message: msg };
  }
  if (await wasChallengeUsed(String(opts.challenge))) {
    return {
      ok: false,
      status: 'rejected',
      code: 'VALIDATION',
      message: 'Обновите страницу и отправьте ссылку снова.',
    };
  }

  const openedAtNum =
    typeof opts.openedAt === 'number'
      ? opts.openedAt
      : typeof opts.openedAt === 'string'
        ? Number(opts.openedAt)
        : NaN;
  if (Number.isFinite(openedAtNum)) {
    const fillMs = Date.now() - openedAtNum;
    if (fillMs < 2_000) {
      return {
        ok: false,
        status: 'rejected',
        code: 'VALIDATION',
        message: 'Подождите секунду и отправьте ещё раз.',
      };
    }
    if (fillMs > 6 * 60 * 60 * 1000) {
      return {
        ok: false,
        status: 'rejected',
        code: 'VALIDATION',
        message: 'Обновите страницу и отправьте ссылку снова.',
      };
    }
  }

  const urlCheck = validateScoutUrl(opts.url);
  if (!urlCheck.ok) {
    return { ok: false, status: 'rejected', code: 'VALIDATION', message: urlCheck.message };
  }

  const note = stripUserText(opts.note, MAX_NOTE);
  const name = stripUserText(opts.name, MAX_NAME);
  const email = stripUserText(opts.email, MAX_EMAIL);
  if (email && !isValidEmail(email)) {
    return { ok: false, status: 'rejected', code: 'VALIDATION', message: 'Некорректный email.' };
  }

  const rate = await checkRateLimit(opts.ip || 'unknown');
  if (rate !== 'ok') {
    return {
      ok: false,
      status: 'rejected',
      code: 'RATE_LIMIT',
      message: 'Слишком много отправок. Попробуйте позже.',
    };
  }

  await markChallengeUsed(String(opts.challenge));

  if ((await countOpenQueue()) >= READER_SCOUT_MAX_OPEN_QUEUE) {
    return {
      ok: false,
      status: 'rejected',
      code: 'QUEUE_FULL',
      message: 'Очередь редакции переполнена. Попробуйте позже.',
    };
  }

  const dup = findPublishedDuplicate({ url: urlCheck.url });
  if (dup) {
    return {
      ok: false,
      status: 'duplicate',
      code: 'DUPLICATE',
      message: 'Эта ссылка уже известна редакции (материал уже опубликован или в архиве).',
      duplicateSlug: dup.slug,
    };
  }

  const queuedDup = await findQueuedDuplicate(urlCheck.normalized);
  if (queuedDup) {
    return {
      ok: false,
      status: 'duplicate',
      code: 'DUPLICATE',
      message: 'Эта ссылка уже в очереди редакции.',
      duplicateSlug: queuedDup.articleSlug,
    };
  }

  const now = new Date().toISOString();
  const id = `scout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const sub: ReaderScoutSubmission = {
    id,
    sourceType: READER_SCOUT_SOURCE_TYPE,
    status: 'quarantined',
    url: urlCheck.url,
    normalizedUrl: urlCheck.normalized,
    note: note || undefined,
    submitterName: name || undefined,
    submitterEmail: email || undefined,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
  };
  await persistSubmission(sub);

  // Cheap moderation immediately — no AI. Unsafe never reaches editorial queue.
  const moderated = await moderateReaderScoutSubmission(id);
  if (!moderated) {
    return { ok: false, status: 'rejected', code: 'VALIDATION', message: 'Не удалось сохранить.' };
  }

  if (
    moderated.status === 'rejected_abuse' ||
    moderated.status === 'rejected_spam' ||
    moderated.status === 'rejected_unsafe'
  ) {
    await recordModerationReject(opts.ip || 'unknown');
    const code =
      moderated.status === 'rejected_spam'
        ? 'SPAM'
        : moderated.status === 'rejected_abuse'
          ? 'SPAM'
          : 'UNSAFE';
    // Generic public message — never leak moderation taxonomy.
    return {
      ok: false,
      status: 'rejected',
      code,
      message: 'Ссылка не подходит для редакции SmartProto.',
    };
  }

  return {
    ok: true,
    id,
    status: 'queued_editorial',
    message: 'Спасибо. Находка передана в редакцию SmartProto.',
  };
}

/** Map internal statuses to public-safe labels (no abuse taxonomy leak). */
function publicStatus(status: ReaderScoutStatus): ReaderScoutStatus {
  if (
    status === 'quarantined' ||
    status === 'safe' ||
    status === 'queued_editorial' ||
    status === 'queued'
  ) {
    return 'queued';
  }
  if (
    status === 'rejected_abuse' ||
    status === 'rejected_spam' ||
    status === 'rejected_unsafe'
  ) {
    return 'rejected';
  }
  return status;
}

/** Public-safe view — never includes email, IP, or moderation reasons. */
export function toPublicScoutView(sub: ReaderScoutSubmission): {
  id: string;
  status: ReaderScoutStatus;
  url: string;
  note?: string;
  submitterName?: string;
  createdAt: string;
} {
  return {
    id: sub.id,
    status: publicStatus(sub.status),
    url: sub.url,
    note: sub.note,
    submitterName: sub.submitterName,
    createdAt: sub.createdAt,
  };
}

function isEditorialReady(status: ReaderScoutStatus): boolean {
  return status === 'queued_editorial' || status === 'queued';
}

/**
 * Load SAFE editorial-ready finds for newsroom tick.
 * Quarantined / rejected items are never seated.
 * Default seat budget: READER_SCOUT_SEATS_PER_TICK (2).
 */
export async function loadQueuedReaderScoutForTick(
  limit = READER_SCOUT_SEATS_PER_TICK,
): Promise<
  Array<{
    submissionId: string;
    id: string;
    title: string;
    url: string;
    text: string;
    publishedAt: string;
    sourceName: string;
    /** SP-A-102 — for byline + stringer board when tip is published */
    submitterName?: string;
  }>
> {
  // Ensure quarantine is drained with cheap filter before seating.
  await processReaderScoutQuarantine(Math.max(limit * 3, 10));

  const all = await listReaderScoutSubmissions();
  const queued = all
    .filter((s) => isEditorialReady(s.status) && Boolean(s.moderationReason))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  // Legacy SP-A-090 items already `queued` with no moderationReason were healed above;
  // if still present without reason, do not seat (unsafe → editor must be impossible).
  return queued.slice(0, limit).map((s) => {
    let host = 'link';
    try {
      host = new URL(s.url).hostname.replace(/^www\./, '');
    } catch {
      /* ignore */
    }
    const title = s.note?.trim()
      ? `Находка читателя: ${s.note.trim().slice(0, 90)}`
      : `Находка читателя: ${host}`;
    const text = [s.note, `Источник: ${s.url}`, 'Канал: Reader Scout (живой шахтёр).']
      .filter(Boolean)
      .join('\n');
    return {
      submissionId: s.id,
      id: `reader-scout:${s.id}`,
      title,
      url: s.url,
      text,
      publishedAt: s.createdAt,
      sourceName: READER_SCOUT_SOURCE_NAME,
      submitterName: s.submitterName,
    };
  });
}
