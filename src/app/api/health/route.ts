import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { buildFreshnessReport } from '@/lib/newsroom/freshness';

export const dynamic = 'force-dynamic';

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function dataDir(): string {
  return (
    process.env.SMARTPROTO_DATA_DIR ||
    (process.env.SMARTPROTO_DB_PATH
      ? path.dirname(process.env.SMARTPROTO_DB_PATH)
      : path.resolve(process.cwd(), 'data'))
  );
}

export async function GET() {
  try {
    const dir = dataDir();
    const modeFile = readJsonFile(path.join(dir, 'worker-mode.json'));
    const stateFile = readJsonFile(path.join(dir, 'worker-state.json'));

    const base: Record<string, unknown> = {
      status: 'ok',
      store: process.env.ARTICLES_STORE === 'sqlite' ? 'sqlite' : 'json',
    };

    if (process.env.ARTICLES_STORE === 'sqlite') {
      const { countArticles, getAllArticlesFromDb } = await import('@/lib/data-store/articles-repo');
      const articles = getAllArticlesFromDb();
      const freshness = buildFreshnessReport({
        articles: articles.map((a) => ({ publishedAt: a.publishedAt, agentId: a.agentId })),
        lastAutoPublicationAt:
          typeof stateFile?.lastAutoPublicationAt === 'string'
            ? stateFile.lastAutoPublicationAt
            : null,
      });
      const latest = articles[0];
      base.articles = countArticles();
      base.auto_publish = {
        mode: typeof modeFile?.mode === 'string' ? modeFile.mode : null,
        holdOff: Boolean(modeFile?.holdOff),
        modeSetAt: typeof modeFile?.setAt === 'string' ? modeFile.setAt : null,
        lastRunAt: typeof stateFile?.lastRunAt === 'string' ? stateFile.lastRunAt : null,
        lastRunStatus: typeof stateFile?.lastRunStatus === 'string' ? stateFile.lastRunStatus : null,
        lastNewsAt: typeof stateFile?.lastNewsAt === 'string' ? stateFile.lastNewsAt : null,
        lastArticleAt:
          typeof stateFile?.lastArticleAt === 'string' ? stateFile.lastArticleAt : null,
        freshnessStatus: freshness.freshnessStatus,
        lastAutoPublicationAt: freshness.lastAutoPublicationAt,
        minutesSinceLastAutoPublication: freshness.minutesSinceLastAutoPublication,
        publicationsLast24h: freshness.publicationsLast24h,
        latestPublishedAt: latest?.publishedAt ?? null,
        latestSlug: latest?.slug ?? null,
      };
    } else {
      base.auto_publish = {
        mode: typeof modeFile?.mode === 'string' ? modeFile.mode : null,
        holdOff: Boolean(modeFile?.holdOff),
        modeSetAt: typeof modeFile?.setAt === 'string' ? modeFile.setAt : null,
      };
    }

    return NextResponse.json(base);
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
