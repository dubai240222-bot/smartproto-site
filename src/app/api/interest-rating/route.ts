import { NextResponse } from 'next/server';
import {
  checkRateLimit,
  cleanAnonId,
  getSlugInterestStats,
  isInterestScore,
  isInterestStoreConfigured,
  isShareChannel,
  isValidSlug,
  recordInterestVote,
  recordMoreLikeThis,
  recordShare,
  resolveArticleMeta,
  toPublicStats,
  type InterestScore,
  type ShareChannel,
} from '@/lib/interest-ratings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Action = 'rating' | 'more_like_this' | 'share';

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('slug') || '';
  if (!isValidSlug(slug) || !resolveArticleMeta(slug)) return bad('Invalid slug');

  const stats = toPublicStats(await getSlugInterestStats(slug));
  return NextResponse.json({
    ok: true,
    slug,
    stats,
    configured: isInterestStoreConfigured(),
  });
}

export async function POST(request: Request) {
  if (!isInterestStoreConfigured()) {
    return bad('Feedback store is not configured', 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad('Invalid JSON');
  }
  if (!body || typeof body !== 'object') return bad('Invalid body');

  const payload = body as Record<string, unknown>;
  const action = (payload.action as Action) || 'rating';
  const slug = typeof payload.slug === 'string' ? payload.slug.trim() : '';

  if (!isValidSlug(slug) || !resolveArticleMeta(slug)) return bad('Invalid slug');

  const anonId = cleanAnonId(payload.anonId);
  if (!anonId && action !== 'share') return bad('Invalid visitor id');
  // Share may omit anonId; still rate-limit when provided.
  if (action === 'share' && !anonId) {
    // no visitor key — skip RL (channel validated below)
  } else if (anonId && !(await checkRateLimit(anonId))) {
    return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 });
  }

  if (action === 'rating') {
    const numericScore =
      typeof payload.score === 'string' ? Number(payload.score) : payload.score;
    if (!isInterestScore(numericScore)) return bad('Score must be an integer from 1 to 10');

    const { stats, updated } = await recordInterestVote({
      slug,
      score: numericScore as InterestScore,
      anonId: anonId!,
    });
    return NextResponse.json({
      ok: true,
      action,
      slug,
      score: numericScore,
      updated,
      stats: toPublicStats(stats),
    });
  }

  if (action === 'more_like_this') {
    const { stats, created } = await recordMoreLikeThis({ slug, anonId: anonId! });
    return NextResponse.json({
      ok: true,
      action,
      slug,
      created,
      stats: toPublicStats(stats),
    });
  }

  if (action === 'share') {
    if (!isShareChannel(payload.channel)) {
      return bad('Invalid share channel');
    }
    // Share allowed without anonId; rate-limited above when present.
    const stats = await recordShare({
      slug,
      channel: payload.channel as ShareChannel,
    });
    return NextResponse.json({
      ok: true,
      action,
      slug,
      channel: payload.channel,
      stats: toPublicStats(stats),
    });
  }

  return bad('Invalid action');
}
