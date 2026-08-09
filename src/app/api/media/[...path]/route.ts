import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';

const MEDIA_ROOT = process.env.SMARTPROTO_MEDIA_DIR || path.resolve(process.cwd(), 'public', 'media');

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * SP-A-061 — serves locally downloaded article photos straight from disk on
 * every request (no Next.js static-asset cache), so a freshly downloaded
 * image is live immediately after Direct Publisher writes it — no container
 * restart required.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await ctx.params;
  const rel = segments.join('/');
  if (rel.includes('..')) return new NextResponse('Not found', { status: 404 });

  const filePath = path.join(MEDIA_ROOT, rel);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext];
  if (!contentType) return new NextResponse('Not found', { status: 404 });

  try {
    const buf = await readFile(filePath);
    return new NextResponse(new Uint8Array(buf), {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
