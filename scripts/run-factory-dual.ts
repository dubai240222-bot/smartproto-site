/**
 * SP-A-050 — Permanent dual factory mode.
 *
 * Two independent publisher cycles:
 *   NEWS    — max 1 every 25 minutes (~2–3/h; interval = min pause, not obligation)
 *   ARTICLE — max 1 every 3 hours (fuller + consumer scenario + Wow Score)
 *
 * One process + lock per cycle type. 3 consecutive errors → stop THAT cycle only.
 * Leaves SMARTPROTO_FACTORY_ENABLED alone (must stay true).
 * Does NOT force `vercel --prod` when git push already triggers Vercel —
 * only force-deploys if live HTTP stays 404 after push settle.
 */
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  appendFileSync,
  readdirSync,
} from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import dotenv from 'dotenv';
import chalk from 'chalk';

const ROOT = process.cwd();
const NEWS_INTERVAL_MS = Number(process.env.SMARTPROTO_NEWS_INTERVAL_MS || String(25 * 60 * 1000));
const ARTICLE_INTERVAL_MS = Number(
  process.env.SMARTPROTO_ARTICLE_INTERVAL_MS || String(3 * 60 * 60 * 1000),
);
const MAX_CONSECUTIVE_ERRORS = 3;

type CycleType = 'news' | 'article';

interface CycleState {
  type: CycleType;
  intervalMs: number;
  lockPath: string;
  progressPath: string;
  logPath: string;
  consecutiveErrors: number;
  ticksRan: number;
  published: number;
  stopped: boolean;
  stopReason?: string;
  lastTitle?: string;
  lastSlug?: string;
}

function loadEnvFiles(): void {
  dotenv.config({ path: path.resolve(ROOT, '.env.local'), override: true, quiet: true });
  dotenv.config({ path: path.resolve(ROOT, '.env'), quiet: true });
}

function parseArgs(argv: string[]) {
  let cycle: CycleType | 'both' = 'both';
  let once = false;
  let cycleFromCli = false;
  for (const a of argv) {
    if (a === '--once') once = true;
    if (a === '--cycle=news' || a === '--news') {
      cycle = 'news';
      cycleFromCli = true;
    }
    if (a === '--cycle=article' || a === '--article') {
      cycle = 'article';
      cycleFromCli = true;
    }
    if (a === '--cycle=both') {
      cycle = 'both';
      cycleFromCli = true;
    }
  }
  // Env for GHA — CLI flags win when present (avoid sticky shell env from prior ticks).
  if (!cycleFromCli) {
    const envCycle = process.env.SMARTPROTO_CYCLE_TYPE?.trim().toLowerCase();
    if (envCycle === 'news' || envCycle === 'article') cycle = envCycle;
  }
  if (process.env.SMARTPROTO_FACTORY_ONCE === '1' || process.env.SMARTPROTO_FACTORY_ONCE === 'true') {
    once = true;
  }
  return { cycle, once };
}

function logLine(cycle: CycleType | 'dual', msg: string, logPath?: string): void {
  const line = `[${new Date().toISOString()}] [${cycle}] ${msg}`;
  console.log(msg);
  if (logPath) {
    try {
      appendFileSync(logPath, line + '\n', 'utf8');
    } catch {
      /* ignore */
    }
  }
}

function pidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock(lockPath: string): boolean {
  if (existsSync(lockPath)) {
    const raw = readFileSync(lockPath, 'utf8').trim();
    const old = Number(raw);
    if (pidAlive(old)) {
      console.error(chalk.red(`Lock ${path.basename(lockPath)} held by PID ${old}. Refusing second process.`));
      return false;
    }
  }
  writeFileSync(lockPath, String(process.pid), 'utf8');
  return true;
}

function releaseLock(lockPath: string): void {
  try {
    if (existsSync(lockPath) && readFileSync(lockPath, 'utf8').trim() === String(process.pid)) {
      unlinkSync(lockPath);
    }
  } catch {
    /* ignore */
  }
}

function enablePipelineFlags(): void {
  if (process.env.SMARTPROTO_FACTORY_ENABLED !== 'true') {
    process.env.SMARTPROTO_FACTORY_ENABLED = 'true';
  }
  process.env.CHINA_DEPARTMENT_ENABLED = 'true';
  process.env.CHINA_ALLOW_RECOMMEND = 'true';
  process.env.SMARTPROTO_COLLECTOR_ENABLED = 'true';
  process.env.SMARTPROTO_SCOUT_ENABLED = 'true';
  process.env.SMARTPROTO_REVIEWER_ENABLED = 'true';
  process.env.SMARTPROTO_EDITOR_ENABLED = 'true';
  process.env.SMARTPROTO_PUBLISHER_ENABLED = 'true';
  process.env.SMARTPROTO_COMMIT_PUSH = 'true';
  // Permanent mode — not accelerated test
  process.env.SMARTPROTO_ACCELERATED_CYCLE = 'false';
  // Per-cycle floors are applied in run-newsroom-tick; don't force 75 on news here.
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function markAcceleratedDone(): void {
  const progressPath = path.resolve(ROOT, 'data', 'accelerated-progress.json');
  const lockPath = path.resolve(ROOT, 'data', 'accelerated-cycle.lock');
  try {
    if (existsSync(lockPath)) {
      const pid = Number(readFileSync(lockPath, 'utf8').trim());
      if (pidAlive(pid)) {
        try {
          process.kill(pid);
        } catch {
          /* ignore */
        }
      }
      unlinkSync(lockPath);
    }
  } catch {
    /* ignore */
  }
  try {
    let prev: Record<string, unknown> = {};
    if (existsSync(progressPath)) {
      prev = JSON.parse(readFileSync(progressPath, 'utf8')) as Record<string, unknown>;
    }
    writeFileSync(
      progressPath,
      JSON.stringify(
        {
          ...prev,
          mode: 'SP-A-048',
          done: true,
          stopReason: 'SP-A-050: left accelerated test; permanent dual factory mode',
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
  } catch {
    /* ignore */
  }
  // Stale burst lock
  try {
    const burst = path.resolve(ROOT, 'data', 'burst.lock');
    if (existsSync(burst)) unlinkSync(burst);
  } catch {
    /* ignore */
  }
}

function runNewsroomTick(cycle: CycleType): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const childEnv = {
      ...process.env,
      SMARTPROTO_FACTORY_ENABLED: 'true',
      SMARTPROTO_CYCLE_TYPE: cycle,
      SMARTPROTO_ACCELERATED_CYCLE: 'false',
      CHINA_DEPARTMENT_ENABLED: 'true',
      CHINA_ALLOW_RECOMMEND: 'true',
      SMARTPROTO_COLLECTOR_ENABLED: 'true',
      SMARTPROTO_SCOUT_ENABLED: 'true',
      SMARTPROTO_REVIEWER_ENABLED: 'true',
      SMARTPROTO_EDITOR_ENABLED: 'true',
      SMARTPROTO_PUBLISHER_ENABLED: 'true',
      SCOUT_SCORE_THRESHOLD:
        process.env.SCOUT_SCORE_THRESHOLD || (cycle === 'article' ? '75' : '70'),
    };
    const child = spawn(
      'npx',
      ['tsx', 'scripts/run-newsroom-tick.ts', `--cycle=${cycle}`],
      { cwd: ROOT, env: childEnv, shell: true },
    );
    let output = '';
    const killTimer = setTimeout(
      () => {
        try {
          child.kill('SIGTERM');
        } catch {
          /* ignore */
        }
      },
      8 * 60 * 1000,
    );
    child.stdout?.on('data', (buf: Buffer) => {
      const s = buf.toString();
      output += s;
      process.stdout.write(s);
    });
    child.stderr?.on('data', (buf: Buffer) => {
      const s = buf.toString();
      output += s;
      process.stderr.write(s);
    });
    child.on('close', (code) => {
      clearTimeout(killTimer);
      resolve({ code: code ?? 1, output });
    });
  });
}

function parsePublishedMeta(output: string): { title?: string; slug?: string; wowScore?: number } {
  const pub =
    output.match(/Published \([^)]+\):\s*"([^"]+)"\s*\(slug:\s*([^)]+)\)/i) ||
    output.match(/Published[^:]*:\s*"([^"]+)"\s*\(slug:\s*([^)]+)\)/i);
  const scout = output.match(/Scout:\s*score=(\d+)/i);
  return {
    title: pub?.[1]?.trim(),
    slug: pub?.[2]?.trim(),
    wowScore: scout ? Number(scout[1]) : undefined,
  };
}

function parseMetric(output: string, key: string): number {
  const re = new RegExp(`^${key}:\\s*(\\d+)\\s*$`, 'mi');
  const m = output.match(re);
  return m ? Number(m[1]) : 0;
}

function gitHeadSha(): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

async function checkLive(slug: string): Promise<number | string> {
  const url = `https://www.smartproto.net/articles/${slug}`;
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    return res.status;
  } catch (err) {
    return err instanceof Error ? err.message : 'fetch-failed';
  }
}

/**
 * Commit + push publish artifacts. Prefer GitHub→Vercel auto-deploy.
 * Force `vercel --prod` only if live stays 404 after settle.
 */
async function commitPushDeploy(
  cycle: CycleType,
  title: string,
  slug?: string,
  logPath?: string,
): Promise<{ ok: boolean; sha: string; pushStatus: string; liveStatus?: number | string; error?: string }> {
  try {
    try {
      execSync('git reset HEAD', { cwd: ROOT, stdio: 'pipe' });
    } catch {
      /* nothing staged */
    }
    const paths = ['src/data/articles.json', 'data/factory-journal.json'];
    if (existsSync(path.resolve(ROOT, 'data', 'topic-rotation.json'))) {
      paths.push('data/topic-rotation.json');
    }
    if (slug) {
      const draftsDir = path.resolve(ROOT, 'drafts');
      if (existsSync(draftsDir)) {
        const match = readdirSync(draftsDir)
          .filter((f) => f.includes(`-${slug}.json`))
          .sort()
          .pop();
        if (match) paths.push(path.join('drafts', match));
      }
    }
    for (const p of paths) {
      execSync(`git add -- ${JSON.stringify(p)}`, { cwd: ROOT, stdio: 'pipe' });
    }
    const staged = execSync('git diff --cached --name-only', { cwd: ROOT, encoding: 'utf8' }).trim();
    if (!staged) {
      return { ok: false, sha: gitHeadSha(), pushStatus: 'skipped-no-staged', error: 'no staged publish files' };
    }
    const allowed = new Set([
      'src/data/articles.json',
      'data/factory-journal.json',
      'data/topic-rotation.json',
    ]);
    for (const f of staged.split(/\r?\n/).filter(Boolean)) {
      if (allowed.has(f) || (f.startsWith('drafts/') && (!slug || f.includes(slug)))) continue;
      execSync('git reset HEAD', { cwd: ROOT, stdio: 'pipe' });
      return {
        ok: false,
        sha: gitHeadSha(),
        pushStatus: 'aborted-unrelated-staged',
        error: `refused to commit unrelated file: ${f}`,
      };
    }
    const msg = `feat(newsroom): ${cycle} tick — ${title.slice(0, 60)}`;
    execSync(`git commit -m ${JSON.stringify(msg)}`, { cwd: ROOT, stdio: 'inherit' });
    const sha = gitHeadSha();
    execSync('git push origin HEAD:main', { cwd: ROOT, stdio: 'inherit' });
    logLine(cycle, chalk.cyan('Pushed to origin/main — waiting for Vercel auto-deploy...'), logPath);

    if (!slug) {
      return { ok: true, sha, pushStatus: 'pushed', liveStatus: 'n/a' };
    }

    // Settle + check live before forcing vercel
    await sleep(20_000);
    let live = await checkLive(slug);
    if (live === 404) {
      await sleep(40_000);
      live = await checkLive(slug);
    }
    if (live === 200) {
      return { ok: true, sha, pushStatus: 'pushed+auto-deploy-ok', liveStatus: live };
    }

    // Auto-deploy still broken — force prod once
    logLine(
      cycle,
      chalk.yellow(`Live HTTP ${live} after push — forcing vercel --prod once`),
      logPath,
    );
    try {
      execSync('npx vercel --prod --yes', {
        cwd: ROOT,
        stdio: 'inherit',
        timeout: 8 * 60 * 1000,
      });
      await sleep(15_000);
      live = await checkLive(slug);
      return {
        ok: live === 200 || live === 404, // 404 after force still "infra attempted"
        sha,
        pushStatus: live === 200 ? 'pushed+vercel-prod-ok' : 'pushed+vercel-prod-still-404',
        liveStatus: live,
      };
    } catch (deployErr) {
      return {
        ok: false,
        sha,
        pushStatus: 'pushed-vercel-failed',
        liveStatus: live,
        error: deployErr instanceof Error ? deployErr.message : String(deployErr),
      };
    }
  } catch (err) {
    return {
      ok: false,
      sha: gitHeadSha(),
      pushStatus: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function saveCycleProgress(state: CycleState): Promise<void> {
  await mkdir(path.resolve(ROOT, 'data'), { recursive: true });
  await writeFile(
    state.progressPath,
    JSON.stringify(
      {
        mode: 'SP-A-050',
        cycle: state.type,
        intervalMs: state.intervalMs,
        updatedAt: new Date().toISOString(),
        ticksRan: state.ticksRan,
        published: state.published,
        consecutiveErrors: state.consecutiveErrors,
        stopped: state.stopped,
        stopReason: state.stopReason,
        lastTitle: state.lastTitle,
        lastSlug: state.lastSlug,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
}

async function runOneTick(state: CycleState): Promise<void> {
  if (state.stopped) return;
  state.ticksRan += 1;
  const tickStart = Date.now();
  logLine(
    state.type,
    chalk.bold(
      `\n===== ${state.type.toUpperCase()} tick ${state.ticksRan} | published ${state.published} | interval ${state.intervalMs / 1000}s =====`,
    ),
    state.logPath,
  );

  const { code, output } = await runNewsroomTick(state.type);
  const meta = parsePublishedMeta(output);
  const articlesPublished = parseMetric(output, 'articlesPublished');
  const publishedThisTick = articlesPublished > 0 || Boolean(meta.slug);
  let infraError = false;

  if (publishedThisTick && meta.slug) {
    const title = meta.title || meta.slug;
    const git = await commitPushDeploy(state.type, title, meta.slug, state.logPath);
    if (!git.ok) {
      infraError = true;
      logLine(state.type, chalk.red(`commit/push/deploy: ${git.error || git.pushStatus}`), state.logPath);
    } else {
      state.published += 1;
      state.lastTitle = title;
      state.lastSlug = meta.slug;
      logLine(
        state.type,
        [
          `PUBLISHED ${state.type}`,
          `title=${title}`,
          `slug=${meta.slug}`,
          `wow=${meta.wowScore ?? '-'}`,
          `sha=${git.sha}`,
          `push=${git.pushStatus}`,
          `live=${git.liveStatus ?? '-'}`,
        ].join(' | '),
        state.logPath,
      );
    }
  } else {
    const skip =
      output.match(/^skipReason:\s*(.+)$/im)?.[1]?.trim() ||
      output.match(/^reason:\s*(.+)$/im)?.[1]?.trim() ||
      'no publish this tick';
    logLine(state.type, chalk.gray(`Idle/skip: ${skip}`), state.logPath);
    const soft =
      /scout reject|no rss|no china|editor hard|reviewer reject|incomplete|tick idle|no publish|product-identity|rss error|china candidates|china collect|china skip|not worthy|interval|cross-cycle/i.test(
        skip,
      );
    if (!soft && code !== 0) {
      infraError = true;
      logLine(state.type, chalk.red(`tick exit ${code}: ${skip}`), state.logPath);
    }
  }

  if (infraError) {
    state.consecutiveErrors += 1;
    logLine(
      state.type,
      chalk.red(`Error ${state.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}`),
      state.logPath,
    );
    if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      state.stopped = true;
      state.stopReason = `${MAX_CONSECUTIVE_ERRORS} consecutive errors — ${state.type} cycle stopped (other cycle unaffected)`;
      logLine(state.type, chalk.red(state.stopReason), state.logPath);
    }
  } else {
    state.consecutiveErrors = 0;
  }

  await saveCycleProgress(state);
  const spent = Date.now() - tickStart;
  logLine(state.type, chalk.gray(`Tick spent ${Math.round(spent / 1000)}s`), state.logPath);
}

async function loopCycle(state: CycleState, once: boolean): Promise<void> {
  if (!acquireLock(state.lockPath)) {
    state.stopped = true;
    state.stopReason = 'lock held by another process';
    return;
  }
  const release = () => releaseLock(state.lockPath);
  process.on('exit', release);

  logLine(
    state.type,
    chalk.green(
      `SP-A-050 ${state.type} cycle ON | interval=${state.intervalMs / 1000}s | once=${once}`,
    ),
    state.logPath,
  );

  while (!state.stopped) {
    await runOneTick(state);
    if (once || state.stopped) break;
    logLine(
      state.type,
      chalk.gray(`Sleeping ${Math.round(state.intervalMs / 1000)}s until next ${state.type} tick...`),
      state.logPath,
    );
    await sleep(state.intervalMs);
  }

  release();
  await saveCycleProgress(state);
}

async function main(): Promise<void> {
  loadEnvFiles();
  enablePipelineFlags();
  markAcceleratedDone();

  const { cycle, once } = parseArgs(process.argv.slice(2));
  await mkdir(path.resolve(ROOT, 'data'), { recursive: true });

  console.log(chalk.bold.green('=== SP-A-050 PERMANENT DUAL FACTORY ==='));
  console.log(`Factory: ON | news every ${NEWS_INTERVAL_MS / 1000}s | article every ${ARTICLE_INTERVAL_MS / 1000}s`);
  console.log(`Run: cycle=${cycle} once=${once}`);
  console.log('China/Qwen/Gemini may run internally; public labels stripped.');

  const news: CycleState = {
    type: 'news',
    intervalMs: NEWS_INTERVAL_MS,
    lockPath: path.resolve(ROOT, 'data', 'factory-news.lock'),
    progressPath: path.resolve(ROOT, 'data', 'factory-news-progress.json'),
    logPath: path.resolve(ROOT, 'data', 'factory-news.log'),
    consecutiveErrors: 0,
    ticksRan: 0,
    published: 0,
    stopped: false,
  };
  const article: CycleState = {
    type: 'article',
    intervalMs: ARTICLE_INTERVAL_MS,
    lockPath: path.resolve(ROOT, 'data', 'factory-article.lock'),
    progressPath: path.resolve(ROOT, 'data', 'factory-article-progress.json'),
    logPath: path.resolve(ROOT, 'data', 'factory-article.log'),
    consecutiveErrors: 0,
    ticksRan: 0,
    published: 0,
    stopped: false,
  };

  if (cycle === 'news') {
    await loopCycle(news, once);
  } else if (cycle === 'article') {
    await loopCycle(article, once);
  } else if (once) {
    // Control: both once, sequentially (independence still via separate locks/state)
    await loopCycle(news, true);
    await loopCycle(article, true);
  } else {
    // Permanent: both loops concurrent, independent error stops
    await Promise.all([loopCycle(news, false), loopCycle(article, false)]);
  }

  console.log(chalk.bold('\n=== SP-A-050 SUMMARY ==='));
  if (cycle === 'news' || cycle === 'both') {
    console.log(
      `NEWS: ticks=${news.ticksRan} published=${news.published} stopped=${news.stopped} ${news.stopReason || ''} last=${news.lastSlug || '-'}`,
    );
  }
  if (cycle === 'article' || cycle === 'both') {
    console.log(
      `ARTICLE: ticks=${article.ticksRan} published=${article.published} stopped=${article.stopped} ${article.stopReason || ''} last=${article.lastSlug || '-'}`,
    );
  }
  console.log(chalk.yellow('Factory left ON. Dual permanent cadence active.'));
}

main().catch((err) => {
  console.error(chalk.red(`Factory dual failed: ${err instanceof Error ? err.message : String(err)}`));
  process.exitCode = 1;
});
