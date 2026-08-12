import { NextResponse } from 'next/server';
import {
  acceptReaderScoutSubmission,
  getReaderScoutSubmission,
  toPublicScoutView,
} from '@/lib/editorial/reader-scout';

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

/** Public POST — queue only, never publishes. */
export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const result = await acceptReaderScoutSubmission({
    url: String(body.url || body.link || ''),
    note: body.note != null ? String(body.note) : body.why != null ? String(body.why) : undefined,
    name: body.name != null ? String(body.name) : body.submitterName != null ? String(body.submitterName) : undefined,
    email: body.email != null ? String(body.email) : undefined,
    honeypot: body.website != null ? String(body.website) : body.company != null ? String(body.company) : undefined,
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
        // Public codes only — never leak internal moderation taxonomy beyond coarse buckets.
        code: result.code,
        message: result.message,
        duplicateSlug: result.duplicateSlug,
      },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    // Public: always "queued" — hide quarantine/editorial internals.
    status: 'queued',
    id: result.id,
    message: result.message,
  });
}
