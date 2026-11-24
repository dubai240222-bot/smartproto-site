import assert from 'node:assert/strict';
import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
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

const hostDir = mkdtempSync(path.join(tmpdir(), 'sp-lean-host-'));
const hostLock = workerLockPath(hostDir);
writeFileSync(hostLock, `${process.pid}\nother-container-hostname\n`);
const liveOtherHost = tryAcquireWorkerLock(hostLock);
assert.equal(liveOtherHost.ok, false, 'SP49-LOCK-REPRO: live pid stays busy across hostname');

const emptyDir = mkdtempSync(path.join(tmpdir(), 'sp-lean-empty-'));
const emptyLock = workerLockPath(emptyDir);
writeFileSync(emptyLock, '');
const pending = tryAcquireWorkerLock(emptyLock, Date.now(), { pendingMs: 5_000 });
assert.equal(pending.ok, false, 'SP49-LOCK-REPRO: empty wx file is pending, not stolen');

const old = new Date(Date.now() - 30_000);
utimesSync(emptyLock, old, old);
const emptyStale = tryAcquireWorkerLock(emptyLock, Date.now(), { pendingMs: 5_000 });
assert.equal(emptyStale.ok, true, 'empty leftover older than pendingMs recovers');
if (emptyStale.ok) releaseWorkerLock(emptyLock, emptyStale.fd);

const dockerDir = mkdtempSync(path.join(tmpdir(), 'sp-lean-docker-'));
const dockerLock = workerLockPath(dockerDir);
writeFileSync(dockerLock, `${process.pid}\nother-container-hostname\n`);
const dockerOld = new Date(Date.now() - 60_000);
utimesSync(dockerLock, dockerOld, dockerOld);
const afterRestart = tryAcquireWorkerLock(dockerLock, Date.now(), { staleMs: 45_000 });
assert.equal(afterRestart.ok, true, 'stale live pid leftover after container recreate recovers');
if (afterRestart.ok) releaseWorkerLock(dockerLock, afterRestart.fd);

console.log('test-spa-lean-worker-once: PASS');
