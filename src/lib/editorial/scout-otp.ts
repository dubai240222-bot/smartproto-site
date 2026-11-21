/**
 * SP-CONTACT-SCOUT-001 — email OTP for Reader Scout tips.
 * Cheap, server-side only. Never calls OpenRouter / Scout LLM.
 * Stores only a hashed OTP; never returns the code in API responses.
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isEmailTransportConfigured, sendPlainEmail } from '@/lib/email/transport';
import { stripUserText, validateScoutUrl } from '@/lib/editorial/reader-scout';

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_PENDING_PER_EMAIL_HOUR = 5;
const MAX_PENDING_PER_IP_HOUR = 8;
const MAX_VERIFY_PER_IP_HOUR = 30;
const PENDING_RETENTION_MS = 24 * 60 * 60 * 1000;

const MAX_NOTE = 800;
const MAX_NAME = 80;
const MAX_EMAIL = 120;

export type ScoutOtpPending = {
  id: string;
  email: string;
  emailKey: string;
  url: string;
  normalizedUrl: string;
  note?: string;
  name?: string;
  codeHash: string;
  attempts: number;
  createdAt: string;
  expiresAt: string;
  lastSentAt: string;
  consumedAt?: string;
  ipKey: string;
};

function dataRoot(): string {
  return process.env.SMARTPROTO_DATA_DIR || path.resolve(process.cwd(), 'data');
}

function otpDir(): string {
  return path.join(dataRoot(), 'reader-scout', 'otp');
}

function rateDir(): string {
  return path.join(otpDir(), 'rate');
}

function otpSecret(): string {
  return (
    process.env.SMARTPROTO_SCOUT_OTP_SECRET ||
    process.env.SMARTPROTO_SCOUT_SECRET ||
    process.env.EDITORIAL_DOOR_SECRET ||
    process.env.SMARTPROTO_NEWS_PIN ||
    'smartproto-otp-dev'
  );
}

function hashKey(kind: string, value: string): string {
  return createHash('sha256').update(`${kind}:${value}`).digest('hex').slice(0, 32);
}

function hashCode(id: string, code: string): string {
  return createHash('sha256').update(`${otpSecret()}:${id}:${code}`).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= MAX_EMAIL;
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(otpDir(), { recursive: true });
  await fs.mkdir(rateDir(), { recursive: true });
}

async function persistPending(p: ScoutOtpPending): Promise<void> {
  await ensureDirs();
  await fs.writeFile(path.join(otpDir(), `${p.id}.json`), `${JSON.stringify(p, null, 2)}\n`);
}

export async function getOtpPending(id: string): Promise<ScoutOtpPending | null> {
  try {
    const raw = await fs.readFile(path.join(otpDir(), `${id}.json`), 'utf8');
    return JSON.parse(raw) as ScoutOtpPending;
  } catch {
    return null;
  }
}

type RateBucket = { stamps: number[] };

async function readBucket(file: string): Promise<RateBucket> {
  const now = Date.now();
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as RateBucket;
    return {
      stamps: Array.isArray(parsed.stamps)
        ? parsed.stamps.filter((t) => now - t < 60 * 60 * 1000)
        : [],
    };
  } catch {
    return { stamps: [] };
  }
}

async function touchBucket(file: string, limit: number): Promise<'ok' | 'rate'> {
  await ensureDirs();
  const state = await readBucket(file);
  if (state.stamps.length >= limit) return 'rate';
  state.stamps.push(Date.now());
  await fs.writeFile(file, `${JSON.stringify(state, null, 2)}\n`);
  return 'ok';
}

/** Best-effort cleanup of expired / consumed OTP files older than retention. */
export async function cleanupExpiredOtps(now = Date.now()): Promise<number> {
  try {
    await ensureDirs();
    const files = await fs.readdir(otpDir());
    let removed = 0;
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(otpDir(), f), 'utf8');
        const p = JSON.parse(raw) as ScoutOtpPending;
        const exp = Date.parse(p.expiresAt);
        const created = Date.parse(p.createdAt);
        const stale =
          (Number.isFinite(exp) && exp + PENDING_RETENTION_MS < now) ||
          (p.consumedAt && Date.parse(p.consumedAt) + PENDING_RETENTION_MS < now) ||
          (Number.isFinite(created) && created + PENDING_RETENTION_MS < now && Boolean(p.consumedAt));
        if (stale) {
          await fs.unlink(path.join(otpDir(), f));
          removed++;
        }
      } catch {
        /* skip */
      }
    }
    return removed;
  } catch {
    return 0;
  }
}

export type RequestOtpResult =
  | { ok: true; pendingId: string; expiresInSec: number; delivery: 'sent' }
  | {
      ok: false;
      code:
        | 'VALIDATION'
        | 'RATE_LIMIT'
        | 'EMAIL_CONFIG'
        | 'SPAM'
        | 'DELIVERY_FAILED';
      message: string;
    };

export async function requestScoutOtp(opts: {
  url: string;
  email: string;
  note?: string;
  name?: string;
  honeypot?: string;
  ip?: string;
  locale?: 'ru' | 'en' | 'tr';
}): Promise<RequestOtpResult> {
  void cleanupExpiredOtps();

  if (stripUserText(opts.honeypot, 200)) {
    // Soft trap — fake success without sending or queueing.
    return {
      ok: true,
      pendingId: `otp-ignored-${Date.now().toString(36)}`,
      expiresInSec: 600,
      delivery: 'sent',
    };
  }

  if (!isEmailTransportConfigured()) {
    return {
      ok: false,
      code: 'EMAIL_CONFIG',
      message:
        'Подтверждение email временно недоступно: почтовый транспорт не настроен. Напишите редакции напрямую.',
    };
  }

  const urlCheck = validateScoutUrl(opts.url);
  if (!urlCheck.ok) {
    return { ok: false, code: 'VALIDATION', message: urlCheck.message };
  }

  const email = stripUserText(opts.email, MAX_EMAIL).toLowerCase();
  if (!email || !isValidEmail(email)) {
    return { ok: false, code: 'VALIDATION', message: 'Укажите корректный email.' };
  }

  const note = stripUserText(opts.note, MAX_NOTE);
  const name = stripUserText(opts.name, MAX_NAME);
  const ip = opts.ip || 'unknown';
  const emailKey = hashKey('email', email);
  const ipKey = hashKey('ip', ip);

  const emailRate = await touchBucket(
    path.join(rateDir(), `email-${emailKey}.json`),
    MAX_PENDING_PER_EMAIL_HOUR,
  );
  if (emailRate !== 'ok') {
    return {
      ok: false,
      code: 'RATE_LIMIT',
      message: 'Слишком много запросов кода для этого email. Попробуйте позже.',
    };
  }
  const ipRate = await touchBucket(
    path.join(rateDir(), `ip-otp-${ipKey}.json`),
    MAX_PENDING_PER_IP_HOUR,
  );
  if (ipRate !== 'ok') {
    return {
      ok: false,
      code: 'RATE_LIMIT',
      message: 'Слишком много запросов кода. Попробуйте позже.',
    };
  }

  const code = generateCode();
  const now = Date.now();
  const id = `otp-${now.toString(36)}-${randomInt(1e6).toString(36)}`;
  const pending: ScoutOtpPending = {
    id,
    email,
    emailKey,
    url: urlCheck.url,
    normalizedUrl: urlCheck.normalized,
    note: note || undefined,
    name: name || undefined,
    codeHash: hashCode(id, code),
    attempts: 0,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + OTP_TTL_MS).toISOString(),
    lastSentAt: new Date(now).toISOString(),
    ipKey,
  };
  await persistPending(pending);

  const locale = opts.locale || 'ru';
  const subject =
    locale === 'en'
      ? 'SmartProto verification code'
      : locale === 'tr'
        ? 'SmartProto doğrulama kodu'
        : 'Код подтверждения SmartProto';
  const text =
    locale === 'en'
      ? `Your SmartProto tip verification code: ${code}\n\nIt expires in 10 minutes. If you did not request this, ignore the email.`
      : locale === 'tr'
        ? `SmartProto doğrulama kodunuz: ${code}\n\nKod 10 dakika geçerlidir. Bu isteği siz yapmadıysanız e-postayı yok sayın.`
        : `Код подтверждения находки SmartProto: ${code}\n\nДействует 10 минут. Если вы не запрашивали код — проигнорируйте письмо.`;

  const sent = await sendPlainEmail({ to: email, subject, text });
  if (!sent.ok) {
    // Invalidate pending so unused codes cannot be guessed later from a failed send.
    pending.consumedAt = new Date().toISOString();
    await persistPending(pending);
    if (sent.reason === 'not_configured') {
      return {
        ok: false,
        code: 'EMAIL_CONFIG',
        message: 'Подтверждение email временно недоступно.',
      };
    }
    return {
      ok: false,
      code: 'DELIVERY_FAILED',
      message: 'Не удалось отправить код. Попробуйте позже или напишите редакции.',
    };
  }

  // Dev-only capture for automated tests — never enable in production.
  if (process.env.SMARTPROTO_OTP_DEV_CAPTURE === '1') {
    await fs.writeFile(
      path.join(otpDir(), `${id}.dev-code`),
      `${JSON.stringify({ pendingId: id })}\n`,
    );
    // Intentionally do NOT write the plaintext code even in capture mode files used by CI;
    // tests exercise hash/verify via direct module helpers instead.
  }

  return { ok: true, pendingId: id, expiresInSec: Math.floor(OTP_TTL_MS / 1000), delivery: 'sent' };
}

export type VerifyOtpResult =
  | {
      ok: true;
      email: string;
      url: string;
      note?: string;
      name?: string;
      pendingId: string;
    }
  | {
      ok: false;
      code: 'VALIDATION' | 'EXPIRED' | 'INVALID' | 'RATE_LIMIT' | 'CONSUMED' | 'LOCKED';
      message: string;
    };

export async function verifyScoutOtp(opts: {
  pendingId: string;
  code: string;
  ip?: string;
}): Promise<VerifyOtpResult> {
  const ip = opts.ip || 'unknown';
  const ipKey = hashKey('ip', ip);
  const verifyRate = await touchBucket(
    path.join(rateDir(), `ip-verify-${ipKey}.json`),
    MAX_VERIFY_PER_IP_HOUR,
  );
  if (verifyRate !== 'ok') {
    return {
      ok: false,
      code: 'RATE_LIMIT',
      message: 'Слишком много попыток. Попробуйте позже.',
    };
  }

  const pendingId = stripUserText(opts.pendingId, 80);
  if (!pendingId || !pendingId.startsWith('otp-')) {
    return { ok: false, code: 'VALIDATION', message: 'Некорректный запрос.' };
  }

  const code = String(opts.code || '')
    .replace(/\s+/g, '')
    .trim();
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, code: 'VALIDATION', message: 'Введите шестизначный код.' };
  }

  const pending = await getOtpPending(pendingId);
  if (!pending) {
    return { ok: false, code: 'INVALID', message: 'Код недействителен или устарел.' };
  }
  if (pending.consumedAt) {
    return { ok: false, code: 'CONSUMED', message: 'Код уже использован.' };
  }
  if (Date.parse(pending.expiresAt) < Date.now()) {
    return { ok: false, code: 'EXPIRED', message: 'Срок действия кода истёк. Запросите новый.' };
  }
  if (pending.attempts >= MAX_ATTEMPTS) {
    return {
      ok: false,
      code: 'LOCKED',
      message: 'Слишком много неверных попыток. Запросите новый код.',
    };
  }

  const expected = pending.codeHash;
  const actual = hashCode(pending.id, code);
  if (!safeEqualHex(expected, actual)) {
    pending.attempts += 1;
    await persistPending(pending);
    if (pending.attempts >= MAX_ATTEMPTS) {
      return {
        ok: false,
        code: 'LOCKED',
        message: 'Слишком много неверных попыток. Запросите новый код.',
      };
    }
    return { ok: false, code: 'INVALID', message: 'Неверный код.' };
  }

  pending.consumedAt = new Date().toISOString();
  await persistPending(pending);

  return {
    ok: true,
    pendingId: pending.id,
    email: pending.email,
    url: pending.url,
    note: pending.note,
    name: pending.name,
  };
}

/** Test helper — create a pending OTP with a known code (no email send). */
export async function __testCreatePending(opts: {
  email: string;
  url: string;
  code: string;
  note?: string;
  name?: string;
  expiresInMs?: number;
  attempts?: number;
}): Promise<ScoutOtpPending> {
  const urlCheck = validateScoutUrl(opts.url);
  if (!urlCheck.ok) throw new Error(urlCheck.message);
  const now = Date.now();
  const id = `otp-test-${now.toString(36)}-${randomInt(1e6).toString(36)}`;
  const pending: ScoutOtpPending = {
    id,
    email: opts.email.toLowerCase(),
    emailKey: hashKey('email', opts.email.toLowerCase()),
    url: urlCheck.url,
    normalizedUrl: urlCheck.normalized,
    note: opts.note,
    name: opts.name,
    codeHash: hashCode(id, opts.code),
    attempts: opts.attempts || 0,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (opts.expiresInMs ?? OTP_TTL_MS)).toISOString(),
    lastSentAt: new Date(now).toISOString(),
    ipKey: hashKey('ip', 'test'),
  };
  await persistPending(pending);
  return pending;
}

export const SCOUT_OTP_MAX_ATTEMPTS = MAX_ATTEMPTS;
export const SCOUT_OTP_TTL_MS = OTP_TTL_MS;
export const SCOUT_OTP_RESEND_COOLDOWN_MS = RESEND_COOLDOWN_MS;
