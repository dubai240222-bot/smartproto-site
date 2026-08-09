/**
 * SP-A-056 (доп.) — Editorial worker живёт на Hetzner, не в GitHub Actions.
 *
 * Режимы (файл /opt/apps/smartproto/data/worker-mode.json, переживает reboot):
 *   off    — циклы полностью остановлены, AI не расходуется, сайт работает
 *   single — ровно один тик, затем автоматически off
 *   auto   — тики по расписанию (news ~25 мин, article ~3 часа), без GitHub/Vercel
 *
 * Управление: bash-обёртка /usr/local/bin/smartproto {off|single|auto|status}
 * просто перезаписывает mode-файл; воркер перечитывает его каждые несколько секунд.
 */
import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

type Mode = 'off' | 'single' | 'auto';

const DATA_DIR = process.env.SMARTPROTO_DATA_DIR || path.resolve(process.cwd(), 'data');
const MODE_FILE = path.join(DATA_DIR, 'worker-mode.json');
const STATE_FILE = path.join(DATA_DIR, 'worker-state.json');

const NEWS_INTERVAL_MS = Number(process.env.SMARTPROTO_NEWS_INTERVAL_MS || 25 * 60 * 1000);
const ARTICLE_INTERVAL_MS = Number(process.env.SMARTPROTO_ARTICLE_INTERVAL_MS || 3 * 60 * 60 * 1000);
const POLL_MS = 15_000;

mkdirSync(DATA_DIR, { recursive: true });

function readMode(): Mode {
  try {
    const raw = JSON.parse(readFileSync(MODE_FILE, 'utf8'));
    if (raw.mode === 'off' || raw.mode === 'single' || raw.mode === 'auto') return raw.mode;
  } catch {
    /* default below */
  }
  return 'off';
}

function writeMode(mode: Mode) {
  writeFileSync(MODE_FILE, JSON.stringify({ mode, setAt: new Date().toISOString() }, null, 2));
}

interface WorkerState {
  lastNewsAt?: string;
  lastArticleAt?: string;
  lastRunStatus?: string;
  lastRunAt?: string;
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

function runTick(cycle: 'news' | 'article'): Promise<boolean> {
  return new Promise((resolve) => {
    log(`Running ${cycle} tick (direct SQLite publish, no git/GitHub Actions/Vercel)...`);
    const child = spawn(
      'npx',
      ['tsx', 'scripts/run-newsroom-tick.ts', `--cycle=${cycle}`, '--force'],
      {
        cwd: process.cwd(),
        env: { ...process.env, ARTICLES_STORE: 'sqlite', SMARTPROTO_FACTORY_ENABLED: 'true' },
        stdio: 'inherit',
      },
    );
    child.on('exit', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
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
    const ok = await runTick('news');
    writeState({
      lastRunAt: new Date().toISOString(),
      lastRunStatus: ok ? 'ok' : 'error',
      ...(ok ? { lastNewsAt: new Date().toISOString() } : {}),
    });
    writeMode('off');
    log('Single cycle done — mode set back to OFF.');
    return;
  }

  // AUTO
  const state = readState();
  if (isDue(state.lastNewsAt, NEWS_INTERVAL_MS)) {
    const ok = await runTick('news');
    writeState({
      lastRunAt: new Date().toISOString(),
      lastRunStatus: ok ? 'ok' : 'error',
      ...(ok ? { lastNewsAt: new Date().toISOString() } : {}),
    });
    return; // one cycle per poll tick keeps this simple and observable
  }
  if (isDue(state.lastArticleAt, ARTICLE_INTERVAL_MS)) {
    const ok = await runTick('article');
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
