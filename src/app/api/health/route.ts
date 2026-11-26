import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { buildFreshnessReport } from '@/lib/newsroom/freshness';
import { countReserveItems, loadReserveTarget } from '@/lib/newsroom/reserve-shelf';

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
    const reserveCount = countReserveItems();

    const mode =
      typeof modeFile?.mode === 'string' && modeFile.mode.trim()
        ? String(modeFile.mode)
        : 'UNKNOWN';
    const base: Record<string, unknown> = {
      status: 'ok',
      store: process.env.ARTICLES_STORE === 'sqlite' ? 'sqlite' : 'json',
      reserve: {
        count: reserveCount,
        target: loadReserveTarget(),
      },
    };

    if (process.env.ARTICLES_STORE === 'sqlite') {
      const { getArticleHealthSnapshot } = await import('@/lib/data-store/articles-repo');
      const snap = getArticleHealthSnapshot();
      const freshness = buildFreshnessReport({
        lastAutoPublicationAt:
          typeof stateFile?.lastAutoPublicationAt === 'string'
            ? stateFile.lastAutoPublicationAt
            : snap.latestPublishedAt,
      });
      base.articles = snap.count;
      base.auto_publish = {
        mode,
        holdOff: modeFile ? Boolean(modeFile.holdOff) : 'UNKNOWN',
        modeSetAt: typeof modeFile?.setAt === 'string' ? modeFile.setAt : 'UNKNOWN',
        lastRunAt: typeof stateFile?.lastRunAt === 'string' ? stateFile.lastRunAt : 'UNKNOWN',
        lastRunStatus:
          typeof stateFile?.lastRunStatus === 'string' ? stateFile.lastRunStatus : 'UNKNOWN',
        lastNewsAt: typeof stateFile?.lastNewsAt === 'string' ? stateFile.lastNewsAt : 'UNKNOWN',
        lastArticleAt:
          typeof stateFile?.lastArticleAt === 'string' ? stateFile.lastArticleAt : 'UNKNOWN',
        lastCreditErrorAt:
          typeof stateFile?.lastCreditErrorAt === 'string' ? stateFile.lastCreditErrorAt : null,
        freshnessStatus: freshness.freshnessStatus,
        lastAutoPublicationAt: freshness.lastAutoPublicationAt,
        minutesSinceLastAutoPublication: freshness.minutesSinceLastAutoPublication,
        publicationsLast24h: freshness.publicationsLast24h,
        latestPublishedAt: snap.latestPublishedAt,
        latestSlug: snap.latestSlug,
        workerState: stateFile ? 'present' : 'UNKNOWN',
      };
    } else {
      base.auto_publish = {
        mode,
        holdOff: modeFile ? Boolean(modeFile.holdOff) : 'UNKNOWN',
        modeSetAt: typeof modeFile?.setAt === 'string' ? modeFile.setAt : 'UNKNOWN',
        workerState: stateFile ? 'present' : 'UNKNOWN',
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
