import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  isPidAlive,
  parseWorkerArgv,
  releaseWorkerLock,
  tryAcquireWorkerLock,
  workerLockPath,
} from '../src/lib/newsroom/worker-lock';

assert.deepEqual(parseWorkerArgv([]), { once: false });
assert.deepEqual(parseWorkerArgv(['--once']), { once: true });
assert.equal(isPidAlive(process.pid), true);
assert.equal(isPidAlive(999999991), false);

const dir = mkdtempSync(path.join(tmpdir(), 'sp-lean-lock-'));
const lock = workerLockPath(dir);
const a = tryAcquireWorkerLock(lock);
assert.equal(a.ok, true);
const b = tryAcquireWorkerLock(lock);
assert.equal(b.ok, false, 'live pid must not be stolen');
if (a.ok) releaseWorkerLock(lock, a.fd);
const c = tryAcquireWorkerLock(lock);
assert.equal(c.ok, true);
if (c.ok) releaseWorkerLock(lock, c.fd);

const staleDir = mkdtempSync(path.join(tmpdir(), 'sp-lean-stale-'));
const stale = workerLockPath(staleDir);
writeFileSync(stale, '999999991\n');
const recovered = tryAcquireWorkerLock(stale);
assert.equal(recovered.ok, true, 'dead pid lock must recover');
if (recovered.ok) releaseWorkerLock(stale, recovered.fd);

console.log('test-spa-lean-worker-once: PASS');
