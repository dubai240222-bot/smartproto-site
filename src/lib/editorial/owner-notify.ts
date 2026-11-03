/**
 * SP-A-102 — notify site owner ONLY after editorial SAFE gate.
 *
 * Raw reader tips never go to the owner inbox.
 * Flow: public tip → quarantine → cheap moderation → queued_editorial → owner notify.
 *
 * Delivery (first that works):
 * 1) SMARTPROTO_OWNER_NOTIFY_WEBHOOK (POST JSON)
 * 2) SMARTPROTO_RESEND_API_KEY + SMARTPROTO_OWNER_NOTIFY_EMAIL
 * 3) Always persist to data/owner-notify/ (audit / fallback inbox)
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ReaderScoutSubmission } from '@/lib/editorial/reader-scout';

function dataRoot(): string {
  return process.env.SMARTPROTO_DATA_DIR || path.resolve(process.cwd(), 'data');
}

function notifyDir(): string {
  return path.join(dataRoot(), 'owner-notify');
}

export function ownerNotifyEmail(): string | null {
  const raw = (process.env.SMARTPROTO_OWNER_NOTIFY_EMAIL || '').trim();
  if (!raw) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) || raw.length > 120) return null;
  return raw;
}

function stripForEmail(s: string, max: number): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export type OwnerNotifyResult = {
  ok: boolean;
  persisted: boolean;
  emailed: boolean;
  webhooked: boolean;
  reason?: string;
};

function buildPlainBody(sub: ReaderScoutSubmission): string {
  const lines = [
    'SmartProto — находка прошла редакционный SAFE-фильтр.',
    'Сырые непроверенные письма сюда не попадают.',
    '',
    `ID: ${sub.id}`,
    `URL: ${stripForEmail(sub.url, 2000)}`,
    `Когда: ${sub.createdAt}`,
    `Статус: ${sub.status}`,
  ];
  if (sub.note) lines.push(`Заметка читателя: ${stripForEmail(sub.note, 800)}`);
  if (sub.submitterName) lines.push(`Имя: ${stripForEmail(sub.submitterName, 80)}`);
  // Email of submitter — only after SAFE, still treat carefully
  if (sub.submitterEmail) {
    lines.push(`Email читателя: ${stripForEmail(sub.submitterEmail, 120)}`);
  }
  lines.push('', 'Ссылку не открывайте автоматически — проверьте хост вручную.');
  return lines.join('\n');
}

async function persistNotify(sub: ReaderScoutSubmission, body: string): Promise<string> {
  await fs.mkdir(notifyDir(), { recursive: true });
  const file = path.join(notifyDir(), `${sub.id}.json`);
  const payload = {
    id: sub.id,
    kind: 'reader-scout-safe',
    createdAt: new Date().toISOString(),
    submissionId: sub.id,
    url: sub.url,
    status: sub.status,
    body,
    to: ownerNotifyEmail(),
  };
  await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`);
  return file;
}

async function postWebhook(sub: ReaderScoutSubmission, body: string): Promise<boolean> {
  const url = (process.env.SMARTPROTO_OWNER_NOTIFY_WEBHOOK || '').trim();
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'smartproto.reader_scout.safe',
        id: sub.id,
        url: sub.url,
        note: sub.note || null,
        submitterName: sub.submitterName || null,
        text: body,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendResend(sub: ReaderScoutSubmission, body: string): Promise<boolean> {
  const apiKey = (process.env.SMARTPROTO_RESEND_API_KEY || process.env.RESEND_API_KEY || '').trim();
  const to = ownerNotifyEmail();
  if (!apiKey || !to) return false;
  const from =
    (process.env.SMARTPROTO_NOTIFY_FROM || '').trim() || 'SmartProto Tips <onboarding@resend.dev>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `[SmartProto] SAFE tip ${sub.id}`,
        text: body,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Notify owner that a tip cleared editorial SAFE moderation.
 * Idempotent via submission.ownerNotifiedAt (caller patches).
 */
export async function notifyOwnerOfSafeTip(
  sub: ReaderScoutSubmission,
): Promise<OwnerNotifyResult> {
  if (sub.status !== 'queued_editorial' && sub.status !== 'safe') {
    return {
      ok: false,
      persisted: false,
      emailed: false,
      webhooked: false,
      reason: 'not-safe-status',
    };
  }
  const body = buildPlainBody(sub);
  let persisted = false;
  try {
    await persistNotify(sub, body);
    persisted = true;
  } catch (err) {
    return {
      ok: false,
      persisted: false,
      emailed: false,
      webhooked: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
  const webhooked = await postWebhook(sub, body);
  const emailed = await sendResend(sub, body);
  return { ok: true, persisted, emailed, webhooked };
}
