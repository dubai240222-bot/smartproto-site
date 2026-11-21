import { NextResponse } from 'next/server';
import {
  acceptReaderScoutSubmission,
  getReaderScoutSubmission,
  toPublicScoutView,
} from '@/lib/editorial/reader-scout';
import { verifyScoutOtp } from '@/lib/editorial/scout-otp';
import { notifyOwnerOfSafeTip } from '@/lib/editorial/owner-notify';
import { CONTACT_SCOUT_UI } from '@/lib/i18n/contact-scout';
import { isAppLocale, type AppLocale } from '@/lib/i18n/locales';

export const dynamic = 'force-dynamic';

function clientIp(request: Request): string {
  const xf = request.headers.get('x-forwarded-for') || '';
  const real = request.headers.get('x-real-ip') || '';
  const first = xf.split(',')[0]?.trim();
  return first || real || 'unknown';
}

/** Public GET — status only, never email. */
export async function GET(request: Request) {
  const u = new URL(request.url);
  const id = (u.searchParams.get('id') || '').trim();
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }
  const sub = await getReaderScoutSubmission(id);
  if (!sub) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, submission: toPublicScoutView(sub) });
}

/**
 * Public POST — requires email OTP verification first.
 * Unverified payloads are rejected and never enter Reader Scout / OpenRouter.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const localeRaw = String(body.locale || 'ru').toLowerCase();
  const locale: AppLocale = isAppLocale(localeRaw) ? localeRaw : 'ru';
  const copy = CONTACT_SCOUT_UI[locale];

  const honeypot =
    body.website != null
      ? String(body.website)
      : body.company != null
        ? String(body.company)
        : undefined;

  // Soft honeypot — fake success, never queue.
  if (honeypot && String(honeypot).trim()) {
    return NextResponse.json({
      ok: true,
      status: 'queued',
      id: `scout-ignored-${Date.now().toString(36)}`,
      message: copy.scoutSuccess,
    });
  }

  const pendingId = String(body.pendingId || body.otpId || '').trim();
  const code = String(body.code || body.otp || '').trim();
  if (!pendingId || !code) {
    return NextResponse.json(
      {
        ok: false,
        code: 'OTP_REQUIRED',
        message:
          locale === 'en'
            ? 'Email verification is required before submitting a tip.'
            : locale === 'tr'
              ? 'Göndermeden önce e-posta doğrulaması gerekir.'
              : 'Перед отправкой нужно подтвердить email.',
      },
      { status: 401 },
    );
  }

  const verified = await verifyScoutOtp({
    pendingId,
    code,
    ip: clientIp(request),
  });
  if (!verified.ok) {
    const status =
      verified.code === 'RATE_LIMIT' || verified.code === 'LOCKED'
        ? 429
        : verified.code === 'EXPIRED'
          ? 410
          : 400;
    return NextResponse.json(
      {
        ok: false,
        code: verified.code,
        message: verified.message,
      },
      { status },
    );
  }

  // Verified tip → existing Reader Scout SAFE pipeline (quarantine → cheap mod → editorial).
  const result = await acceptReaderScoutSubmission({
    url: verified.url,
    note: verified.note,
    name: verified.name,
    email: verified.email,
    honeypot: undefined,
    ip: clientIp(request),
  });

  if (!result.ok) {
    const status =
      result.code === 'DUPLICATE'
        ? 409
        : result.code === 'RATE_LIMIT' || result.code === 'QUEUE_FULL'
          ? 429
          : 400;
    return NextResponse.json(
      {
        ok: false,
        status: result.status,
        code: result.code,
        message: result.message,
        duplicateSlug: result.duplicateSlug,
      },
      { status },
    );
  }

  // Best-effort owner notify after SAFE only — never blocks the reader response.
  // Does not touch newsroom tick / worker.
  void (async () => {
    try {
      const sub = await getReaderScoutSubmission(result.id);
      if (sub && (sub.status === 'queued_editorial' || sub.status === 'safe')) {
        await notifyOwnerOfSafeTip(sub);
      }
    } catch {
      /* ignore */
    }
  })();

  return NextResponse.json({
    ok: true,
    status: 'queued',
    id: result.id,
    message: copy.scoutSuccess,
  });
}
