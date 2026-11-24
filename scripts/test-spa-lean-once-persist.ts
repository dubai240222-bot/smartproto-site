/**
 * Integration: two --once runs keep AUTO cadence files; lock released; no factory tick.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const dataDir = mkdtempSync(path.join(tmpdir(), 'sp-lean-once-'));
mkdirSync(dataDir, { recursive: true });
const now = new Date().toISOString();
writeFileSync(
  path.join(dataDir, 'worker-mode.json'),
  JSON.stringify({ mode: 'auto', setAt: now }, null, 2),
);
writeFileSync(
  path.join(dataDir, 'worker-state.json'),
  JSON.stringify(
    {
      lastNewsAt: now,
      lastArticleAt: now,
      lastAutoPublicationAt: now,
      lastRunAt: now,
      lastRunStatus: 'ok',
    },
    null,
    2,
  ),
);

function runOnce(): { status: number | null; rssKb?: number; out: string } {
  const child = spawnSync('npx', ['tsx', 'scripts/hetzner-worker.ts', '--once'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      SMARTPROTO_DATA_DIR: dataDir,
      SMARTPROTO_RETENTION_ENABLED: 'false',
      SMARTPROTO_TRANSLATE_ENABLED: 'false',
      SMARTPROTO_LIGHT: 'false',
      SMARTPROTO_DEFAULT_MODE: 'auto',
    },
    timeout: 60_000,
  });
  const out = `${child.stdout || ''}${child.stderr || ''}`;
  return { status: child.status, out };
}

const first = runOnce();
assert.equal(first.status, 0, first.out.slice(-800));
assert.match(first.out, /--once/);
assert.doesNotMatch(first.out, /\bLIGHT\b/);
const mode1 = JSON.parse(readFileSync(path.join(dataDir, 'worker-mode.json'), 'utf8'));
assert.equal(mode1.mode, 'auto');
const state1 = JSON.parse(readFileSync(path.join(dataDir, 'worker-state.json'), 'utf8'));
assert.equal(state1.lastNewsAt, now);
assert.equal(existsSync(path.join(dataDir, 'worker-once.lock')), false);

const second = runOnce();
assert.equal(second.status, 0, second.out.slice(-800));
const state2 = JSON.parse(readFileSync(path.join(dataDir, 'worker-state.json'), 'utf8'));
assert.equal(state2.lastNewsAt, now, 'cadence timestamp must survive Node exit');
assert.equal(existsSync(path.join(dataDir, 'worker-once.lock')), false);

const selfRss = readFileSync('/proc/self/status', 'utf8').match(/VmRSS:\s+(\d+)/);
console.log(
  'test-spa-lean-once-persist: PASS',
  `selfRssKb=${selfRss?.[1] || '?'}`,
  'idle RAM is compose sleep (shell), not this Node',
);
