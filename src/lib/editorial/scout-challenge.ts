/**
 * SP-A-102 — signed anti-bot challenge for /api/scout.
 * No third-party captcha; HMAC + time window + one-time nonce file.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const MIN_AGE_MS = 2_500;
const MAX_AGE_MS = 30 * 60 * 1000;

function secret(): string {
  return (
    process.env.SMARTPROTO_SCOUT_SECRET ||
    process.env.EDITORIAL_DOOR_SECRET ||
    process.env.SMARTPROTO_NEWS_PIN ||
    'smartproto-scout-dev'
  );
}

function dataRoot(): string {
  return process.env.SMARTPROTO_DATA_DIR || path.resolve(process.cwd(), 'data');
}

function usedDir(): string {
  return path.join(dataRoot(), 'reader-scout', 'challenges');
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export type ScoutChallenge = {
  challenge: string;
  issuedAt: number;
};

/** Issue a fresh challenge for the tip form. */
export function issueScoutChallenge(now = Date.now()): ScoutChallenge {
  const nonce = randomBytes(12).toString('base64url');
  const issuedAt = now;
  const payload = `${issuedAt}.${nonce}`;
  const challenge = `${payload}.${sign(payload)}`;
  return { challenge, issuedAt };
}

export type ChallengeVerdict =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'format' | 'signature' | 'too_fast' | 'expired' | 'reused' };

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Validate challenge age + HMAC. Caller should markUsed after accept. */
export function verifyScoutChallenge(raw: unknown, now = Date.now()): ChallengeVerdict {
  const challenge = String(raw ?? '').trim();
  if (!challenge) return { ok: false, reason: 'missing' };
  const parts = challenge.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'format' };
  const [issuedRaw, nonce, mac] = parts;
  if (!issuedRaw || !nonce || !mac) return { ok: false, reason: 'format' };
  if (!/^\d+$/.test(issuedRaw) || nonce.length < 8 || mac.length < 16) {
    return { ok: false, reason: 'format' };
  }
  const issuedAt = Number(issuedRaw);
  if (!Number.isFinite(issuedAt)) return { ok: false, reason: 'format' };
  const payload = `${issuedAt}.${nonce}`;
  const expected = sign(payload);
  if (!safeEqual(mac, expected)) return { ok: false, reason: 'signature' };
  const age = now - issuedAt;
  if (age < MIN_AGE_MS) return { ok: false, reason: 'too_fast' };
  if (age > MAX_AGE_MS) return { ok: false, reason: 'expired' };
  return { ok: true };
}

export async function wasChallengeUsed(challenge: string): Promise<boolean> {
  const key = createHmac('sha256', secret()).update(challenge).digest('hex').slice(0, 32);
  try {
    await fs.access(path.join(usedDir(), `${key}.used`));
    return true;
  } catch {
    return false;
  }
}

export async function markChallengeUsed(challenge: string): Promise<void> {
  await fs.mkdir(usedDir(), { recursive: true });
  const key = createHmac('sha256', secret()).update(challenge).digest('hex').slice(0, 32);
  await fs.writeFile(
    path.join(usedDir(), `${key}.used`),
    `${JSON.stringify({ usedAt: new Date().toISOString() })}\n`,
  );
}
