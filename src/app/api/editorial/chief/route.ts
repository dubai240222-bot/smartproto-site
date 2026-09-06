import { NextResponse } from 'next/server';
import {
  authorizeEditorialDoor,
  createChiefJob,
  getChiefJob,
  removeChiefVisualAsset,
  reviseChiefPublishedArticle,
  runChiefFastLane,
} from '@/lib/editorial/doors';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function GET(request: Request) {
  const auth = authorizeEditorialDoor(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const jobId = new URL(request.url).searchParams.get('jobId') || '';
  if (!jobId) return NextResponse.json({ error: 'jobId is required.' }, { status: 400 });
  const job = await getChiefJob(jobId);
  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  return NextResponse.json({ ok: true, job });
}

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

  const modeRaw = String(body.mode || '')
    .trim()
    .toLowerCase();
  const isRemoveVisual = modeRaw === 'remove-visual' || modeRaw === 'remove_visual';

  if (isRemoveVisual) {
    const slugOrUrl = String(body.slug || body.articleUrl || '').trim();
    const imageUrl = String(body.imageUrl || body.url || '').trim();
    if (!slugOrUrl || !imageUrl) {
      return NextResponse.json(
        { error: 'slug and imageUrl are required for remove-visual.', status: 'FAILED' },
        { status: 400 },
      );
    }
    const result = await removeChiefVisualAsset({ slugOrUrl, imageUrl });
    if (!result.ok) {
      const status = result.status === 'NOT_FOUND' ? 404 : 400;
      const { ok: _ok, ...payload } = result;
      return NextResponse.json({ ok: false, mode: 'remove-visual', ...payload }, { status });
    }
    const { ok: _ok, ...payload } = result;
    return NextResponse.json({ ok: true, mode: 'remove-visual', ...payload });
  }

  const isRevise =
    modeRaw === 'revise' ||
    modeRaw === 'fix' ||
    modeRaw === 'edit' ||
    Boolean(body.revise) ||
    Boolean(body.slug && !body.url && !body.sourceUrl);

  if (isRevise) {
    const slugOrUrl = String(body.slug || body.articleUrl || body.url || '').trim();
    const note = body.note ? String(body.note).trim() : '';
    if (!slugOrUrl) {
      return NextResponse.json({ error: 'Slug or article URL is required.', status: 'FAILED' }, { status: 400 });
    }
    const result = await reviseChiefPublishedArticle({ slugOrUrl, note });
    if (!result.ok) {
      const status = result.status === 'NOT_FOUND' ? 404 : 400;
      const { ok: _ok, ...payload } = result;
      return NextResponse.json({ ok: false, mode: 'revise', ...payload }, { status });
    }
    const { ok: _ok, ...payload } = result;
    return NextResponse.json({ ok: true, mode: 'revise', ...payload });
  }

  const sourceUrl = String(body.url || body.sourceUrl || '').trim();
  const note = body.note ? String(body.note).trim() : undefined;
  const replaceSlug = body.replaceSlug ? String(body.replaceSlug).trim() : undefined;
  if (!sourceUrl) {
    return NextResponse.json({ error: 'URL is required.', status: 'FAILED' }, { status: 400 });
  }

  const job = createChiefJob(sourceUrl, note, replaceSlug);
  // Scout bypass: run immediately, do not enqueue into AUTO cycle.
  const runPromise = runChiefFastLane(job.id);
  const raced = await Promise.race([
    runPromise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
  ]);
  void runPromise.catch(() => undefined);
  const current = raced || (await getChiefJob(job.id));
  return NextResponse.json({
    ok: true,
    job: current || { ...job, status: 'CHECKING' },
  });
}
