/**
 * SP-A-090 — Reader Scout Door («живые шахтёры»).
 * Public submissions enter an editorial queue. No direct publish.
 * Priority: Chief > Author > Reader Scout > AUTO parsers.
 * Does NOT bypass safety, dedupe, Scout, Reviewer, Editor, Photo, commodity gate.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { findPublishedDuplicate, normalizeUrl } from '@/lib/editorial/doors';

export const READER_SCOUT_SOURCE_TYPE = 'reader-scout' as const;
export const READER_SCOUT_AGENT_ID = 'reader-scout';
/** Display source name in Scout pool — used for priority seating. */
export const READER_SCOUT_SOURCE_NAME = 'Reader Scout';

export type ReaderScoutStatus =
  | 'queued'
  | 'processing'
  | 'rejected'
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
  rejectReason?: string;
  articleSlug?: string;
  createdAt: string;
  updatedAt: string;
  attempts?: number;
};

export type ReaderScoutAcceptResult =
  | { ok: true; id: string; status: 'queued'; message: string }
  | {
      ok: false;
      status: 'rejected' | 'duplicate';
      code: 'VALIDATION' | 'DUPLICATE' | 'RATE_LIMIT' | 'SPAM';
      message: string;
      duplicateSlug?: string;
    };

const MAX_NOTE = 800;
const MAX_NAME = 80;
const MAX_EMAIL = 120;
const RATE_LIMIT_PER_HOUR = 5;

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

/** Strict http(s) URL validation — no javascript:/data:/file:. */
export function validateScoutUrl(raw: string): { ok: true; url: string; normalized: string } | { ok: false; message: string } {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { ok: false, message: 'Укажите ссылку.' };
  if (/\s/.test(trimmed)) return { ok: false, message: 'Ссылка содержит пробелы.' };
  if (/^(javascript|data|file|vbscript|about):/i.test(trimmed)) {
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
  if (!parsed.hostname || parsed.hostname.length < 3 || !parsed.hostname.includes('.')) {
    return { ok: false, message: 'Некорректный адрес сайта.' };
  }
  if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.)/i.test(parsed.hostname)) {
    return { ok: false, message: 'Локальные адреса не принимаются.' };
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

async function findQueuedDuplicate(normalizedUrl: string): Promise<ReaderScoutSubmission | null> {
  const all = await listReaderScoutSubmissions();
  return (
    all.find(
      (s) =>
        s.normalizedUrl === normalizedUrl &&
        (s.status === 'queued' || s.status === 'processing' || s.status === 'published'),
    ) || null
  );
}

function clientKey(ip: string): string {
  return createHash('sha256').update(`scout:${ip || 'unknown'}`).digest('hex').slice(0, 24);
}

async function checkRateLimit(ip: string): Promise<boolean> {
  await ensureDirs();
  const key = clientKey(ip);
  const file = path.join(rateDir(), `${key}.json`);
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  let stamps: number[] = [];
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as { stamps?: number[] };
    stamps = Array.isArray(parsed.stamps) ? parsed.stamps.filter((t) => now - t < windowMs) : [];
  } catch {
    stamps = [];
  }
  if (stamps.length >= RATE_LIMIT_PER_HOUR) return false;
  stamps.push(now);
  await fs.writeFile(file, `${JSON.stringify({ stamps }, null, 2)}\n`);
  return true;
}

/**
 * Accept a public Reader Scout submission into the editorial queue.
 * Never publishes. Never returns submitter email.
 */
export async function acceptReaderScoutSubmission(opts: {
  url: string;
  note?: string;
  name?: string;
  email?: string;
  /** Honeypot — if filled, fake OK without queueing. */
  honeypot?: string;
  ip?: string;
}): Promise<ReaderScoutAcceptResult> {
  // Soft spam trap
  if (stripUserText(opts.honeypot, 200)) {
    return {
      ok: true,
      id: `scout-ignored-${Date.now().toString(36)}`,
      status: 'queued',
      message: 'Спасибо. Находка передана в редакцию SmartProto.',
    };
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

  if (!(await checkRateLimit(opts.ip || 'unknown'))) {
    return {
      ok: false,
      status: 'rejected',
      code: 'RATE_LIMIT',
      message: 'Слишком много отправок. Попробуйте позже.',
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
    status: 'queued',
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

  return {
    ok: true,
    id,
    status: 'queued',
    message: 'Спасибо. Находка передана в редакцию SmartProto.',
  };
}

/** Public-safe view — never includes email. */
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
    status: sub.status,
    url: sub.url,
    note: sub.note,
    submitterName: sub.submitterName,
    createdAt: sub.createdAt,
  };
}

/**
 * Load queued finds for newsroom tick — seated ahead of AUTO parser intake.
 */
export async function loadQueuedReaderScoutForTick(limit = 4): Promise<
  Array<{
    submissionId: string;
    id: string;
    title: string;
    url: string;
    text: string;
    publishedAt: string;
    sourceName: string;
  }>
> {
  const queued = await listReaderScoutSubmissions('queued');
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
    };
  });
}
