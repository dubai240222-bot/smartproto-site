/**
 * SP-A-056 (доп.) — Editorial worker живёт на Hetzner, не в GitHub Actions.
 *
 * Режимы (файл /opt/apps/smartproto/data/worker-mode.json, переживает reboot):
 *   off     — циклы полностью остановлены, AI не расходуется, сайт работает
 *   single  — ровно один тик, затем автоматически off
 *   auto    — тики по расписанию (news ~25 мин, article ~3 часа), без GitHub/Vercel
 *   test-auto — observation: interval 20 мин, scout=40, auto-OFF after 3h
 *   forced  — SP-A-063: back-to-back ticks with very low scout until N publishes, then test-auto
 *
 * Управление: bash-обёртка /usr/local/bin/smartproto {off|single|auto|test-auto|forced|status}
 * просто перезаписывает mode-файл; воркер перечитывает его каждые несколько секунд.
 */
import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

type Mode = 'off' | 'single' | 'auto' | 'test-auto' | 'forced';

const DATA_DIR = process.env.SMARTPROTO_DATA_DIR || path.resolve(process.cwd(), 'data');
const MODE_FILE = path.join(DATA_DIR, 'worker-mode.json');
const STATE_FILE = path.join(DATA_DIR, 'worker-state.json');

const NEWS_INTERVAL_MS = Number(process.env.SMARTPROTO_NEWS_INTERVAL_MS || 25 * 60 * 1000);
const ARTICLE_INTERVAL_MS = Number(process.env.SMARTPROTO_ARTICLE_INTERVAL_MS || 3 * 60 * 60 * 1000);
/** SP-A-063 — TEST-AUTO observation window: full cycle every 20 minutes. */
const TEST_AUTO_INTERVAL_MS = Number(process.env.SMARTPROTO_TEST_AUTO_INTERVAL_MS || 20 * 60 * 1000);
/** SP-A-063 — auto-expire TEST-AUTO after this many ms (default 3h). */
const TEST_AUTO_DURATION_MS = Number(process.env.SMARTPROTO_TEST_AUTO_DURATION_MS || 3 * 60 * 60 * 1000);
/** SP-A-063 — forced burst: stop after this many publishes (default 2). */
const FORCED_TARGET = Number(process.env.SMARTPROTO_FORCED_TARGET || 2);
/** SP-A-063 — forced burst deadline (default 10 minutes). */
const FORCED_DEADLINE_MS = Number(process.env.SMARTPROTO_FORCED_DEADLINE_MS || 10 * 60 * 1000);
/** Temporary Scout floor for forced live visual check only. Production stays 70. */
const FORCED_SCOUT_THRESHOLD = process.env.SMARTPROTO_FORCED_SCOUT_THRESHOLD || '25';
const POLL_MS = 15_000;

mkdirSync(DATA_DIR, { recursive: true });

function readMode(): Mode {
  try {
    const raw = JSON.parse(readFileSync(MODE_FILE, 'utf8'));
    if (['off', 'single', 'auto', 'test-auto', 'forced'].includes(raw.mode)) return raw.mode;
  } catch {
    /* default below */
  }
  return 'off';
}

function readModeFile(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(MODE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeMode(mode: Mode, extra: Record<string, unknown> = {}) {
  writeFileSync(
    MODE_FILE,
    JSON.stringify({ mode, setAt: new Date().toISOString(), ...extra }, null, 2),
  );
}

interface WorkerState {
  lastNewsAt?: string;
  lastArticleAt?: string;
  lastRunStatus?: string;
  lastRunAt?: string;
  forcedPublished?: number;
}

function readState(): WorkerState {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(patch: Partial<WorkerState>) {
  const next = { ...readState(), ...patch };
  writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function runTick(
  cycle: 'news' | 'article',
  opts: { lenient?: boolean; forced?: boolean } = {},
): Promise<{ ok: boolean; published: boolean }> {
  return new Promise((resolve) => {
    log(`Running ${cycle} tick (direct SQLite publish, no git/GitHub Actions/Vercel)...`);
    let published = false;
    const child = spawn(
      'npx',
      ['tsx', 'scripts/run-newsroom-tick.ts', `--cycle=${cycle}`, '--force'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ARTICLES_STORE: 'sqlite',
          SMARTPROTO_FACTORY_ENABLED: 'true',
          // TEST-AUTO only: scout=40. Forced burst: even lower, temporary.
          ...(opts.forced
            ? { SCOUT_SCORE_THRESHOLD: FORCED_SCOUT_THRESHOLD }
            : opts.lenient
              ? { SCOUT_SCORE_THRESHOLD: '40' }
              : {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const onChunk = (buf: Buffer) => {
      const text = buf.toString();
      process.stdout.write(text);
      if (/articlesPublished:\s*[1-9]/i.test(text) || /Direct publish OK/i.test(text)) {
        published = true;
      }
    };
    child.stdout?.on('data', onChunk);
    child.stderr?.on('data', (buf: Buffer) => {
      process.stderr.write(buf);
      onChunk(buf);
    });
    child.on('exit', (code) => resolve({ ok: code === 0, published }));
    child.on('error', () => resolve({ ok: false, published: false }));
  });
}

function isDue(lastIso: string | undefined, intervalMs: number): boolean {
  if (!lastIso) return true;
  const last = Date.parse(lastIso);
  if (!Number.isFinite(last)) return true;
  return Date.now() - last >= intervalMs;
}

async function loopOnce(): Promise<void> {
  const mode = readMode();

  if (mode === 'off') {
    return;
  }

  if (mode === 'single') {
    log('Mode SINGLE — running exactly one cycle, then back to OFF.');
    const { ok } = await runTick('news');
    writeState({
      lastRunAt: new Date().toISOString(),
      lastRunStatus: ok ? 'ok' : 'error',
      ...(ok ? { lastNewsAt: new Date().toISOString() } : {}),
    });
    writeMode('off');
    log('Single cycle done — mode set back to OFF.');
    return;
  }

  if (mode === 'forced') {
    const meta = readModeFile();
    const setAt = meta.setAt ? Date.parse(String(meta.setAt)) : Date.now();
    const target = Number(meta.target ?? FORCED_TARGET) || FORCED_TARGET;
    const state = readState();
    const publishedSoFar = Number(state.forcedPublished || 0);
    if (Number.isFinite(setAt) && Date.now() - setAt >= FORCED_DEADLINE_MS) {
      log(
        `FORCED deadline ${FORCED_DEADLINE_MS}ms elapsed (published ${publishedSoFar}/${target}) — switching to TEST-AUTO.`,
      );
      writeState({ forcedPublished: 0 });
      writeMode('test-auto');
      return;
    }
    if (publishedSoFar >= target) {
      log(`FORCED target ${target} reached — switching to TEST-AUTO.`);
      writeState({ forcedPublished: 0 });
      writeMode('test-auto');
      return;
    }
    log(
      `Mode FORCED — burst tick ${publishedSoFar + 1}/${target} (scout=${FORCED_SCOUT_THRESHOLD}).`,
    );
    const { ok, published } = await runTick('news', { forced: true });
    const nextCount = publishedSoFar + (published ? 1 : 0);
    writeState({
      lastRunAt: new Date().toISOString(),
      lastRunStatus: ok ? 'ok' : 'error',
      forcedPublished: nextCount,
      ...(ok ? { lastNewsAt: new Date().toISOString() } : {}),
    });
    if (nextCount >= target) {
      log(`FORCED target ${target} reached after this tick — switching to TEST-AUTO.`);
      writeState({ forcedPublished: 0 });
      writeMode('test-auto');
    }
    return;
  }

  if (mode === 'test-auto') {
    // SP-A-063: expire after TEST_AUTO_DURATION_MS from setAt, then OFF.
    try {
      const raw = readModeFile();
      const setAt = raw.setAt ? Date.parse(String(raw.setAt)) : NaN;
      if (Number.isFinite(setAt) && Date.now() - setAt >= TEST_AUTO_DURATION_MS) {
        log(`TEST-AUTO duration ${TEST_AUTO_DURATION_MS}ms elapsed — switching to OFF.`);
        writeMode('off');
        return;
      }
    } catch {
      /* ignore */
    }
    const state = readState();
    if (isDue(state.lastRunAt, TEST_AUTO_INTERVAL_MS)) {
      log(
        `Mode TEST-AUTO — running full editorial cycle (${Math.round(TEST_AUTO_INTERVAL_MS / 60000)} min interval, scout=40).`,
      );
      const { ok } = await runTick('news', { lenient: true });
      writeState({
        lastRunAt: new Date().toISOString(),
        lastRunStatus: ok ? 'ok' : 'error',
        ...(ok ? { lastNewsAt: new Date().toISOString() } : {}),
      });
    }
    return;
  }

  // AUTO
  const state = readState();
  if (isDue(state.lastNewsAt, NEWS_INTERVAL_MS)) {
    const { ok } = await runTick('news');
    writeState({
      lastRunAt: new Date().toISOString(),
      lastRunStatus: ok ? 'ok' : 'error',
      ...(ok ? { lastNewsAt: new Date().toISOString() } : {}),
    });
    return; // one cycle per poll tick keeps this simple and observable
  }
  if (isDue(state.lastArticleAt, ARTICLE_INTERVAL_MS)) {
    const { ok } = await runTick('article');
    writeState({
      lastRunAt: new Date().toISOString(),
      lastRunStatus: ok ? 'ok' : 'error',
      ...(ok ? { lastArticleAt: new Date().toISOString() } : {}),
    });
  }
}

async function main() {
  if (!existsSync(MODE_FILE)) writeMode('off');
  log(`SmartProto Hetzner worker started. Mode file: ${MODE_FILE}`);
  for (;;) {
    try {
      await loopOnce();
    } catch (err) {
      log(`Worker loop error: ${err instanceof Error ? err.message : String(err)}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main();
