import { NextResponse } from 'next/server';
import {
  getSlugInterestStats,
  isInterestScore,
  recordInterestVote,
  type InterestScore,
} from '@/lib/interest-ratings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = (searchParams.get('slug') || '').trim();

  if (!slug || slug.length > 200 || !/^[\w.-]+$/.test(slug)) {
    return badRequest('Invalid slug');
  }

  const stats = await getSlugInterestStats(slug);
  return NextResponse.json({ ok: true, slug, stats });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON');
  }

  if (!body || typeof body !== 'object') {
    return badRequest('Invalid body');
  }

  const { slug, score, anonId } = body as {
    slug?: unknown;
    score?: unknown;
    anonId?: unknown;
  };

  if (typeof slug !== 'string' || !slug.trim() || slug.length > 200 || !/^[\w.-]+$/.test(slug.trim())) {
    return badRequest('Invalid slug');
  }

  const numericScore = typeof score === 'string' ? Number(score) : score;
  if (!isInterestScore(numericScore)) {
    return badRequest('Score must be an integer from 5 to 10');
  }

  const cleanAnon =
    typeof anonId === 'string' && anonId.length > 0 && anonId.length <= 64
      ? anonId.replace(/[^\w-]/g, '').slice(0, 64)
      : undefined;

  const { stats, persisted } = await recordInterestVote({
    slug: slug.trim(),
    score: numericScore as InterestScore,
    ts: new Date().toISOString(),
    anonId: cleanAnon || undefined,
  });

  return NextResponse.json({
    ok: true,
    slug: slug.trim(),
    score: numericScore,
    stats,
    persisted,
  });
}
