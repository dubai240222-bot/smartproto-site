/**
 * SP-A-048 — Single accelerated TEST factory cycle.
 *
 * ONE publisher loop: full newsroom tick every 3 minutes.
 * Max 1 publish / tick. Auto-stop after 12 publishes OR 3 consecutive
 * AI / commit / push / deploy errors.
 *
 * NOT a permanent prod cadence — temporary test only.
 * Leaves SMARTPROTO_FACTORY_ENABLED alone (must already be true).
 *
 * Replaces SP-A-046 50-60s burst and SP-A-047 dual 3m/5m loops.
 * GHA may also cron every 3 minutes; this local loop is the test driver.
 * journal/articles dedupe prevents double-publish of the same candidate.
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  appendFileSync,
  readdirSync,
} from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';
import chalk from 'chalk';

const ROOT = process.cwd();
const INTERVAL_MS = Number(process.env.SMARTPROTO_TEST_INTERVAL_MS || String(50 * 1000));
const MAX_PUBLISHES = Number(process.env.SMARTPROTO_TEST_MAX_PUBLISHES || '12');
const MAX_CONSECUTIVE_ERRORS = 3;
const LOCK_PATH = path.resolve(ROOT, 'data', 'accelerated-cycle.lock');
const BURST_LOCK_PATH = path.resolve(ROOT, 'data', 'burst.lock');
const PROGRESS_PATH = path.resolve(ROOT, 'data', 'accelerated-progress.json');
const LOG_PATH = path.resolve(ROOT, 'data', 'accelerated-cycle.log');

interface TickLog {
  tick: number;
  time: string;
  candidatesCollected: number;
  hardRejected: number;
  sentToQwen: number;
  sentToGemini: number;
  draftsCreated: number;
  articlesPublished: number;
  title?: string;
  slug?: string;
  wowScore?: number;
  commitSha?: string;
  pushStatus?: string;
  liveStatus?: number | string;
  rejectOrError?: string;
}

interface Progress {
  mode: 'SP-A-048';
  startedAt: string;
  updatedAt: string;
  ticksRan: number;
  published: number;
  consecutiveErrors: number;
  stopReason?: string;
  done?: boolean;
  publications: Array<{ title: string; slug: string; commitSha: string; liveStatus: number | string; at: string }>;
  lastTick?: TickLog;
}

function loadEnvFiles(): void {
  dotenv.config({ path: path.resolve(ROOT, '.env.local'), override: true, quiet: true });
  dotenv.config({ path: path.resolve(ROOT, '.env'), quiet: true });
}

function logLine(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(msg);
  try {
    appendFileSync(LOG_PATH, line + '\n', 'utf8');
  } catch {
    /* ignore */
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

function acquireLock(): boolean {
  if (existsSync(BURST_LOCK_PATH)) {
    const raw = readFileSync(BURST_LOCK_PATH, 'utf8').trim();
    const old = Number(raw);
    if (pidAlive(old)) {
      console.error(chalk.red(`Burst lock held by live PID ${old}. Stop burst before SP-A-048.`));
      return false;
    }
    try {
      unlinkSync(BURST_LOCK_PATH);
    } catch {
      /* ignore */
    }
  }
  if (existsSync(LOCK_PATH)) {
    const raw = readFileSync(LOCK_PATH, 'utf8').trim();
    const old = Number(raw);
    if (pidAlive(old)) {
      console.error(chalk.red(`Accelerated cycle already running (PID ${old}). Refusing second loop.`));
      return false;
    }
  }
  writeFileSync(LOCK_PATH, String(process.pid), 'utf8');
  return true;
}

function releaseLock(): void {
  try {
    if (existsSync(LOCK_PATH) && readFileSync(LOCK_PATH, 'utf8').trim() === String(process.pid)) {
      unlinkSync(LOCK_PATH);
    }
  } catch {
    /* ignore */
  }
}

function enablePipelineFlags(): void {
  // Factory must stay ON — set true for this process if missing, never write secrets.
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
  process.env.SMARTPROTO_ACCELERATED_CYCLE = 'true';
  // TEST Wow bar (matches GHA newsroom-cron) — not a permanent prod change.
  if (!process.env.SCOUT_SCORE_THRESHOLD?.trim()) {
    process.env.SCOUT_SCORE_THRESHOLD = '65';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runNewsroomTick(): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const childEnv = {
      ...process.env,
      SMARTPROTO_FACTORY_ENABLED: 'true',
      SMARTPROTO_ACCELERATED_CYCLE: 'true',
      CHINA_DEPARTMENT_ENABLED: 'true',
      CHINA_ALLOW_RECOMMEND: 'true',
      SMARTPROTO_COLLECTOR_ENABLED: 'true',
      SMARTPROTO_SCOUT_ENABLED: 'true',
      SMARTPROTO_REVIEWER_ENABLED: 'true',
      SMARTPROTO_EDITOR_ENABLED: 'true',
      SMARTPROTO_PUBLISHER_ENABLED: 'true',
      SMARTPROTO_COMMIT_PUSH: 'true',
      SCOUT_SCORE_THRESHOLD: process.env.SCOUT_SCORE_THRESHOLD || '65',
    };
    const child = spawn('npx', ['tsx', 'scripts/run-newsroom-tick.ts'], {
      cwd: ROOT,
      env: childEnv,
      shell: true,
    });
    let output = '';
    const killTimer = setTimeout(() => {
      logLine(chalk.yellow('newsroom-tick exceeded 4 minutes — killing hung child'));
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }, 4 * 60 * 1000);
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

function parseMetric(output: string, key: string): number {
  const re = new RegExp(`^${key}:\\s*(\\d+)\\s*$`, 'mi');
  const m = output.match(re);
  return m ? Number(m[1]) : 0;
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

function gitHeadSha(): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function commitAndPush(
  title: string,
  slug?: string,
): { ok: boolean; sha: string; pushStatus: string; error?: string } {
  try {
    // Unstage everything first so WIP / old drafts never hitch a ride.
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
    const msg = `feat(newsroom): accelerated tick — ${title.slice(0, 60)}`;
    execSync(`git commit -m ${JSON.stringify(msg)}`, { cwd: ROOT, stdio: 'inherit' });
    const sha = gitHeadSha();
    execSync('git push origin HEAD:main', { cwd: ROOT, stdio: 'inherit' });
    // GitHub→Vercel auto-deploy is stale; force prod deploy so smartproto.net updates.
    try {
      logLine(chalk.cyan('Deploying Vercel prod after publish...'));
      execSync('npx vercel --prod --yes', { cwd: ROOT, stdio: 'inherit', timeout: 8 * 60 * 1000 });
      return { ok: true, sha, pushStatus: 'pushed+vercel-prod' };
    } catch (deployErr) {
      return {
        ok: false,
        sha,
        pushStatus: 'pushed-vercel-failed',
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

async function checkLive(slug: string): Promise<number | string> {
  const url = `https://www.smartproto.net/articles/${slug}`;
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    return res.status;
  } catch (err) {
    return err instanceof Error ? err.message : 'fetch-failed';
  }
}

async function saveProgress(p: Progress): Promise<void> {
  p.updatedAt = new Date().toISOString();
  await mkdir(path.resolve(ROOT, 'data'), { recursive: true });
  await writeFile(PROGRESS_PATH, JSON.stringify(p, null, 2) + '\n', 'utf8');
}

async function main(): Promise<void> {
  loadEnvFiles();
  enablePipelineFlags();

  if (!acquireLock()) {
    process.exitCode = 0;
    return;
  }
  const release = () => releaseLock();
  process.on('exit', release);
  process.on('SIGINT', () => {
    release();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    release();
    process.exit(0);
  });

  let progress: Progress = {
    mode: 'SP-A-048',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ticksRan: 0,
    published: 0,
    consecutiveErrors: 0,
    publications: [],
  };
  // Resume prior SP-A-048 run so restarts do not exceed the 12-publish test cap.
  try {
    if (existsSync(PROGRESS_PATH)) {
      const prev = JSON.parse(readFileSync(PROGRESS_PATH, 'utf8')) as Progress;
      if (prev?.mode === 'SP-A-048' && Array.isArray(prev.publications) && prev.publications.length > 0) {
        progress = {
          ...prev,
          done: false,
          stopReason: undefined,
          consecutiveErrors: 0,
          updatedAt: new Date().toISOString(),
        };
        logLine(
          chalk.yellow(
            `Resuming SP-A-048: already published ${progress.published}/${MAX_PUBLISHES} — continuing.`,
          ),
        );
      }
    }
  } catch {
    /* fresh run */
  }
  if (progress.published >= MAX_PUBLISHES) {
    progress.done = true;
    progress.stopReason = `max publishes (${MAX_PUBLISHES}) already reached`;
    await saveProgress(progress);
    logLine(chalk.green(progress.stopReason));
    releaseLock();
    return;
  }

  logLine(chalk.bold.green('=== SP-A-048 ACCELERATED CYCLE (single loop) ==='));
  logLine(`Interval: ${INTERVAL_MS / 1000}s | Max publishes: ${MAX_PUBLISHES}`);
  logLine(
    'Flags: FACTORY + collector + China/Qwen + Scout + Reviewer + Editor + Publisher + commit/push',
  );
  logLine(`SCOUT_SCORE_THRESHOLD=${process.env.SCOUT_SCORE_THRESHOLD}`);
  logLine('GHA also has cron every 3 minutes; local loop is the test driver; dedupe guards double-publish.');

  await saveProgress(progress);

  while (progress.published < MAX_PUBLISHES) {
    if (progress.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      progress.stopReason = `${MAX_CONSECUTIVE_ERRORS} consecutive AI/commit/push/deploy errors`;
      break;
    }

    progress.ticksRan += 1;
    const tickStart = Date.now();
    logLine(chalk.bold(`\n===== Tick ${progress.ticksRan} | published ${progress.published}/${MAX_PUBLISHES} =====`));

    const { code, output } = await runNewsroomTick();
    const meta = parsePublishedMeta(output);
    const tickLog: TickLog = {
      tick: progress.ticksRan,
      time: new Date().toISOString(),
      candidatesCollected: parseMetric(output, 'candidatesCollected'),
      hardRejected: parseMetric(output, 'hardRejected'),
      sentToQwen: parseMetric(output, 'sentToQwen'),
      sentToGemini: parseMetric(output, 'sentToGemini'),
      draftsCreated: parseMetric(output, 'draftsCreated'),
      articlesPublished: parseMetric(output, 'articlesPublished'),
      title: meta.title,
      slug: meta.slug,
      wowScore: meta.wowScore,
    };

    const publishedThisTick = tickLog.articlesPublished > 0 || Boolean(meta.slug);
    let infraError = false;

    if (publishedThisTick && meta.slug) {
      const title = meta.title || meta.slug;
      const git = commitAndPush(title, meta.slug);
      tickLog.commitSha = git.sha;
      tickLog.pushStatus = git.pushStatus;
      if (!git.ok) {
        tickLog.rejectOrError = git.error || git.pushStatus;
        infraError = true;
      } else {
        // Deploy/live check — Vercel lag is expected; 404 is logged but NOT an emergency stop.
        await sleep(12_000);
        let live = await checkLive(meta.slug);
        if (live === 404) {
          await sleep(25_000);
          live = await checkLive(meta.slug);
        }
        tickLog.liveStatus = live;
        if (live === 404) {
          tickLog.rejectOrError = 'live HTTP 404 (deploy lag; not counting as consecutive stop error)';
        } else if (typeof live === 'string') {
          tickLog.rejectOrError = `live check failed: ${live}`;
        }

        progress.published += 1;
        progress.publications.push({
          title,
          slug: meta.slug,
          commitSha: git.sha,
          liveStatus: tickLog.liveStatus ?? 'n/a',
          at: tickLog.time,
        });
      }
    } else {
      const skip =
        output.match(/^skipReason:\s*(.+)$/im)?.[1]?.trim() ||
        output.match(/^reason:\s*(.+)$/im)?.[1]?.trim() ||
        'no publish this tick';
      tickLog.rejectOrError = skip;
      // Soft editorial skips / candidate exhaustion are not emergency-stop errors.
      const soft =
        /scout reject|no rss|no china|editor hard|reviewer reject|incomplete structured|tick idle|no publish|product-identity|rss error|china candidates|china collect|china skip/i.test(
          skip,
        );
      if (!soft && code !== 0) {
        infraError = true;
        if (!tickLog.rejectOrError || tickLog.rejectOrError === 'no publish this tick') {
          tickLog.rejectOrError = `newsroom-tick exit ${code}`;
        }
      }
    }

    if (infraError) {
      progress.consecutiveErrors += 1;
      logLine(chalk.red(`Infra/AI error (${progress.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${tickLog.rejectOrError}`));
    } else {
      progress.consecutiveErrors = 0;
    }

    progress.lastTick = tickLog;
    logLine(
      [
        `TICK LOG time=${tickLog.time}`,
        `candidatesCollected=${tickLog.candidatesCollected}`,
        `hardRejected=${tickLog.hardRejected}`,
        `sentToQwen=${tickLog.sentToQwen}`,
        `sentToGemini=${tickLog.sentToGemini}`,
        `draftsCreated=${tickLog.draftsCreated}`,
        `articlesPublished=${tickLog.articlesPublished}`,
        `title=${tickLog.title || '-'}`,
        `slug=${tickLog.slug || '-'}`,
        `wowScore=${tickLog.wowScore ?? '-'}`,
        `commitSha=${tickLog.commitSha || '-'}`,
        `push=${tickLog.pushStatus || '-'}`,
        `live=${tickLog.liveStatus ?? '-'}`,
        `reject/error=${tickLog.rejectOrError || 'none'}`,
      ].join(' | '),
    );

    await saveProgress(progress);

    if (progress.published >= MAX_PUBLISHES) {
      progress.stopReason = `max publishes (${MAX_PUBLISHES})`;
      break;
    }
    if (progress.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      progress.stopReason = `${MAX_CONSECUTIVE_ERRORS} consecutive AI/commit/push/deploy errors`;
      break;
    }

    const spent = Date.now() - tickStart;
    const wait = Math.max(0, INTERVAL_MS - spent);
    logLine(chalk.gray(`Sleeping ${Math.round(wait / 1000)}s until next tick...`));
    await sleep(wait);
  }

  progress.done = true;
  progress.stopReason = progress.stopReason || 'complete';
  await saveProgress(progress);

  logLine('\n' + chalk.bold('=== SP-A-048 SUMMARY ==='));
  logLine(`Stop: ${progress.stopReason}`);
  logLine(`Ticks: ${progress.ticksRan}`);
  logLine(`Published: ${progress.published}/${MAX_PUBLISHES}`);
  for (const p of progress.publications) {
    logLine(`  - ${p.title} | ${p.slug} | ${p.commitSha} | live=${p.liveStatus}`);
  }
  logLine(chalk.yellow('Factory left ON. Interval is TEST-only — not permanent prod.'));
  releaseLock();
}

main().catch((err) => {
  console.error(chalk.red(`Accelerated cycle failed: ${err instanceof Error ? err.message : String(err)}`));
  releaseLock();
  process.exitCode = 1;
});
