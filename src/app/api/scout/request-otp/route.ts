import { NextResponse } from 'next/server';
import { requestScoutOtp } from '@/lib/editorial/scout-otp';
import { isAppLocale, type AppLocale } from '@/lib/i18n/locales';

export const dynamic = 'force-dynamic';

function clientIp(request: Request): string {
  const xf = request.headers.get('x-forwarded-for') || '';
  const real = request.headers.get('x-real-ip') || '';
  const first = xf.split(',')[0]?.trim();
  return first || real || 'unknown';
}

/** Issue email OTP for a tip — never queues editorial work, never calls AI. */
export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const localeRaw = String(body.locale || 'ru').toLowerCase();
  const locale: AppLocale = isAppLocale(localeRaw) ? localeRaw : 'ru';

  const result = await requestScoutOtp({
    url: String(body.url || body.link || ''),
    email: String(body.email || ''),
    note: body.note != null ? String(body.note) : body.why != null ? String(body.why) : undefined,
    name:
      body.name != null
        ? String(body.name)
        : body.submitterName != null
          ? String(body.submitterName)
          : undefined,
    honeypot:
      body.website != null
        ? String(body.website)
        : body.company != null
          ? String(body.company)
          : undefined,
    ip: clientIp(request),
    locale,
  });

  if (!result.ok) {
    const status =
      result.code === 'RATE_LIMIT'
        ? 429
        : result.code === 'EMAIL_CONFIG'
          ? 503
          : result.code === 'DELIVERY_FAILED'
            ? 502
            : 400;
    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        message: result.message,
      },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    pendingId: result.pendingId,
    expiresInSec: result.expiresInSec,
    // Never include the OTP code.
  });
}
