/**
 * Isolated: 6 public rows, two concurrent inserts (AUTO + Chief) → exactly one lands.
 * Temp SQLite file only. Does not touch production.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

function sample(slug: string, agentId: string, n: number) {
  return {
    slug,
    id: slug,
    title: `Gadget ${n} with enough title`,
    category: 'Технологии',
    tags: ['новость'],
    summary: 'Short summary for a gadget news item.',
    content: 'Body '.repeat(40),
    sourceUrl: `https://example.test/${slug}`,
    publishedAt: new Date().toISOString(),
    readTime: '1 мин',
    agentId,
  };
}

async function workerMain() {
  process.env.ARTICLES_STORE = 'sqlite';
  process.env.SMARTPROTO_DB_PATH = workerData.dbPath;
  process.env.SMARTPROTO_NEWS_DAILY_MAX = '7';
  const { upsertArticle, DailyMaxError } = await import('../src/lib/data-store/articles-repo');
  try {
    upsertArticle(workerData.article, { skipFinalAutoGate: true, skipPostPublishTranslation: true });
    parentPort?.postMessage({ ok: true });
  } catch (err) {
    const blocked =
      err instanceof DailyMaxError ||
      (err instanceof Error && (err.name === 'DailyMaxError' || err.message.startsWith('DAILY_MAX:')));
    parentPort?.postMessage({
      ok: false,
      blocked,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

async function parentMain() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-daily-max-'));
  const dbPath = path.join(dir, 'smartproto.db');
  process.env.ARTICLES_STORE = 'sqlite';
  process.env.SMARTPROTO_DB_PATH = dbPath;
  process.env.SMARTPROTO_NEWS_DAILY_MAX = '7';

  const { closeDb } = await import('../src/lib/data-store/db');
  const { upsertArticle, getAllArticlesFromDb } = await import('../src/lib/data-store/articles-repo');

  for (let i = 0; i < 6; i += 1) {
    upsertArticle(sample(`seed-${i}`, 'newsroom-scout', i), {
      skipFinalAutoGate: true,
      skipDailyMax: true,
      skipPostPublishTranslation: true,
    });
  }
  assert.equal(getAllArticlesFromDb().length, 6);
  closeDb();

  const self = path.resolve('scripts/test-daily-max-sqlite.ts');
  const run = (article: ReturnType<typeof sample>) =>
    new Promise<{ ok: boolean; blocked?: boolean; message?: string }>((resolve, reject) => {
      const w = new Worker(self, {
        workerData: { dbPath, article },
        execArgv: ['--import', 'tsx'],
      });
      w.once('message', resolve);
      w.once('error', reject);
    });

  const [a, b] = await Promise.all([
    run(sample('race-auto', 'newsroom-scout', 90)),
    run(sample('race-chief', 'chief-fast-lane', 91)),
  ]);
  const wins = [a, b].filter((r) => r.ok).length;
  const blocks = [a, b].filter((r) => r.blocked).length;
  assert.equal(
    wins,
    1,
    `expected 1 insert, got wins=${wins} a=${JSON.stringify(a)} b=${JSON.stringify(b)}`,
  );
  assert.equal(blocks, 1, `expected 1 daily-max block, got blocks=${blocks}`);

  const { getAllArticlesFromDb: reread } = await import('../src/lib/data-store/articles-repo');
  assert.equal(reread().length, 7);
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('test-daily-max-sqlite: PASS');
}

void (isMainThread ? parentMain() : workerMain()).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
