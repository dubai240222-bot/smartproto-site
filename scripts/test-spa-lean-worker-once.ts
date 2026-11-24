import assert from 'node:assert/strict';
import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  parseWorkerArgv,
  releaseWorkerLock,
  tryAcquireWorkerLock,
  WORKER_LOCK_STALE_MS,
  workerLockPath,
} from '../src/lib/newsroom/worker-lock';

assert.deepEqual(parseWorkerArgv([]), { once: false });
assert.deepEqual(parseWorkerArgv(['--cycle=news']), { once: false });
assert.deepEqual(parseWorkerArgv(['--once']), { once: true });

const dir = mkdtempSync(path.join(tmpdir(), 'sp-lean-lock-'));
const lock = workerLockPath(dir);
const a = tryAcquireWorkerLock(lock);
assert.equal(a.ok, true);
const b = tryAcquireWorkerLock(lock);
assert.equal(b.ok, false);
if (a.ok) releaseWorkerLock(lock, a.fd);
const c = tryAcquireWorkerLock(lock);
assert.equal(c.ok, true);
if (c.ok) releaseWorkerLock(lock, c.fd);

const staleDir = mkdtempSync(path.join(tmpdir(), 'sp-lean-stale-'));
const stale = workerLockPath(staleDir);
writeFileSync(stale, 'old\n');
const past = (Date.now() - WORKER_LOCK_STALE_MS - 5000) / 1000;
utimesSync(stale, past, past);
const recovered = tryAcquireWorkerLock(stale);
assert.equal(recovered.ok, true, 'stale lock must recover');
if (recovered.ok) releaseWorkerLock(stale, recovered.fd);

console.log('test-spa-lean-worker-once: PASS');
