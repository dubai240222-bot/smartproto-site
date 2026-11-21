/**
 * SP-CONTACT-SCOUT-001 — notify owner ONLY after Reader Scout SAFE promotion.
 * Raw / unverified tips never reach the owner inbox.
 * Does not touch newsroom tick — called from the verified scout API adapter only.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ReaderScoutSubmission } from '@/lib/editorial/reader-scout';
import { isEmailTransportConfigured, sendPlainEmail } from '@/lib/email/transport';
import { publicEditorialEmail } from '@/lib/site-contact';

function dataRoot(): string {
  return process.env.SMARTPROTO_DATA_DIR || path.resolve(process.cwd(), 'data');
}

function notifyDir(): string {
  return path.join(dataRoot(), 'owner-notify');
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
  delivered: boolean;
  persisted: boolean;
  emailed: boolean;
  webhooked: boolean;
  reason?: string;
};

function ownerNotifyTo(): string | null {
  const raw = (process.env.SMARTPROTO_OWNER_NOTIFY_EMAIL || '').trim();
  if (raw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) && raw.length <= 120) return raw;
  // Fallback to the public editorial mailbox chosen by the owner.
  return publicEditorialEmail();
}

function buildPlainBody(sub: ReaderScoutSubmission): string {
  const lines = [
    'SmartProto — проверенная находка читателя (email подтверждён, SAFE-фильтр пройден).',
    'Сырые непроверенные письма сюда не попадают.',
    '',
    `ID: ${sub.id}`,
    `URL: ${stripForEmail(sub.url, 2000)}`,
    `Когда: ${sub.createdAt}`,
    `Статус: ${sub.status}`,
  ];
  if (sub.note) lines.push(`Заметка: ${stripForEmail(sub.note, 800)}`);
  if (sub.submitterName) lines.push(`Имя: ${stripForEmail(sub.submitterName, 80)}`);
  if (sub.submitterEmail) {
    lines.push(`Email читателя: ${stripForEmail(sub.submitterEmail, 120)}`);
  }
  lines.push('', 'Ссылку не открывайте автоматически — проверьте хост вручную.');
  return lines.join('\n');
}

async function persistNotify(
  sub: ReaderScoutSubmission,
  body: string,
  delivery: { emailed: boolean; webhooked: boolean; delivered: boolean; reason?: string },
): Promise<void> {
  await fs.mkdir(notifyDir(), { recursive: true });
  const file = path.join(notifyDir(), `${sub.id}.json`);
  await fs.writeFile(
    file,
    `${JSON.stringify(
      {
        id: sub.id,
        kind: 'reader-scout-safe',
        createdAt: new Date().toISOString(),
        submissionId: sub.id,
        url: sub.url,
        status: sub.status,
        body,
        to: ownerNotifyTo(),
        delivered: delivery.delivered,
        emailed: delivery.emailed,
        webhooked: delivery.webhooked,
        reason: delivery.reason || null,
      },
      null,
      2,
    )}\n`,
  );
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

/**
 * Notify owner that a tip cleared SAFE moderation after email verification.
 * Delivery = email or webhook success. Disk audit alone is not delivery.
 */
export async function notifyOwnerOfSafeTip(
  sub: ReaderScoutSubmission,
): Promise<OwnerNotifyResult> {
  if (sub.status !== 'queued_editorial' && sub.status !== 'safe') {
    return {
      ok: false,
      delivered: false,
      persisted: false,
      emailed: false,
      webhooked: false,
      reason: 'not-safe-status',
    };
  }

  const body = buildPlainBody(sub);
  const webhook = (process.env.SMARTPROTO_OWNER_NOTIFY_WEBHOOK || '').trim();
  const canEmail = isEmailTransportConfigured() && Boolean(ownerNotifyTo());
  if (!webhook && !canEmail) {
    try {
      await persistNotify(sub, body, {
        emailed: false,
        webhooked: false,
        delivered: false,
        reason: 'no-delivery-channel',
      });
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      delivered: false,
      persisted: true,
      emailed: false,
      webhooked: false,
      reason: 'no-delivery-channel',
    };
  }

  const webhooked = await postWebhook(sub, body);
  let emailed = false;
  if (canEmail) {
    const to = ownerNotifyTo()!;
    const sent = await sendPlainEmail({
      to,
      subject: `[SmartProto] SAFE tip ${sub.id}`,
      text: body,
    });
    emailed = sent.ok;
  }
  const delivered = webhooked || emailed;
  try {
    await persistNotify(sub, body, {
      emailed,
      webhooked,
      delivered,
      reason: delivered ? undefined : 'delivery-failed',
    });
  } catch (err) {
    return {
      ok: false,
      delivered: false,
      persisted: false,
      emailed,
      webhooked,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
  return {
    ok: delivered,
    delivered,
    persisted: true,
    emailed,
    webhooked,
    reason: delivered ? undefined : 'delivery-failed',
  };
}
