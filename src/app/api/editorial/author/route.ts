import { NextResponse } from 'next/server';
import { authorizeEditorialDoor, publishAuthorContribution, type AuthorType } from '@/lib/editorial/doors';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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

  const typeRaw = String(body.type || body.category || '')
    .trim()
    .toUpperCase() as AuthorType;

  const result = await publishAuthorContribution({
    authorName: String(body.authorName || body.author || ''),
    title: String(body.title || ''),
    type: typeRaw,
    text: String(body.text || body.content || ''),
    sourceUrl: body.sourceUrl ? String(body.sourceUrl) : undefined,
    note: body.note ? String(body.note) : undefined,
  });

  if (!result.ok) {
    const status = result.status === 'DUPLICATE' ? 409 : result.code === 'VALIDATION' ? 400 : 500;
    return NextResponse.json(
      {
        ok: false,
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
    status: 'PUBLISHED',
    slug: result.slug,
    articleUrl: result.articleUrl,
    title: result.title,
    typeLabel: result.typeLabel,
  });
}
