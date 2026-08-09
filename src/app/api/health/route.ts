import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (process.env.ARTICLES_STORE === 'sqlite') {
      const { countArticles } = await import('@/lib/data-store/articles-repo');
      const total = countArticles();
      return NextResponse.json({ status: 'ok', store: 'sqlite', articles: total });
    }
    return NextResponse.json({ status: 'ok', store: 'json' });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
