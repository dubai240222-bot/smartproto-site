import { NextResponse } from 'next/server';
import {
  acceptStaffAuthorLink,
  authorizeEditorialDoor,
  normalizeAuthorType,
  publishAuthorContribution,
  type AuthorType,
} from '@/lib/editorial/doors';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * SP-A-094 Staff Author Desk
 * mode=propose_link → queue (no direct publish)
 * mode=author_column (default) → light polish + publish, keep author voice/name/type
 */
export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.', status: 'FAILED' }, { status: 400 });
  }

  const auth = authorizeEditorialDoor(request, body);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error, status: 'FAILED' }, { status: auth.status });
  }

  const modeRaw = String(body.mode || body.deskMode || '')
    .trim()
    .toLowerCase();
  const isProposeLink =
    modeRaw === 'propose_link' ||
    modeRaw === 'author_link' ||
    modeRaw === 'link' ||
    Boolean(body.proposeLink) ||
    (Boolean(body.url) && !String(body.text || body.content || '').trim());

  if (isProposeLink) {
    const result = await acceptStaffAuthorLink({
      url: String(body.url || body.sourceUrl || ''),
      note: body.note ? String(body.note) : undefined,
      authorName: String(body.authorName || body.author || ''),
    });
    if (!result.ok) {
      const status = result.code === 'DUPLICATE' ? 409 : 400;
      return NextResponse.json(
        {
          ok: false,
          mode: 'propose_link',
          status: result.status,
          code: result.code,
          message: result.message,
          duplicateSlug: result.duplicateSlug,
        },
        { status },
      );
    }
    return NextResponse.json({
      ok: true,
      mode: 'propose_link',
      status: 'QUEUED',
      id: result.id,
      message: result.message,
    });
  }

  const typeRaw = String(body.type || body.category || '')
    .trim()
    .toUpperCase() as AuthorType;
  const normalized = normalizeAuthorType(typeRaw);
  if (!normalized) {
    return NextResponse.json(
      {
        ok: false,
        status: 'FAILED',
        code: 'VALIDATION',
        message: 'TYPE must be AUTHOR_ARTICLE | COLUMN | OPINION | REVIEW | REVIEW_OPINION.',
      },
      { status: 400 },
    );
  }

  const result = await publishAuthorContribution({
    authorName: String(body.authorName || body.author || ''),
    title: String(body.title || ''),
    type: normalized,
    text: String(body.text || body.content || ''),
    sourceUrl: body.sourceUrl ? String(body.sourceUrl) : undefined,
    note: body.note ? String(body.note) : undefined,
  });

  if (!result.ok) {
    const status = result.status === 'DUPLICATE' ? 409 : result.code === 'VALIDATION' ? 400 : 500;
    return NextResponse.json(
      {
        ok: false,
        mode: 'author_column',
        status: result.status,
        code: result.code,
        message: result.message,
        duplicateSlug: result.duplicateSlug,
        duplicateTitle: result.duplicateTitle,
        articleUrl: result.articleUrl,
      },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    mode: 'author_column',
    status: 'PUBLISHED',
    slug: result.slug,
    articleUrl: result.articleUrl,
    title: result.title,
    typeLabel: result.typeLabel,
    authorName: String(body.authorName || body.author || '').trim(),
    type: normalized,
  });
}
