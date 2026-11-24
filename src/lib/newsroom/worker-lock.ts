/**
 * Single-flight lock so a slow --once tick cannot overlap the next wake.
 *
 * SP49-LOCK-REPRO:
 * 1) Empty file between openSync(wx) and writeSync is "pending", not stealable.
 * 2) A live pid is busy even when hostname differs (do not treat other host as dead).
 *
 * Recover leftover volume locks only when the recorded pid is dead, the file is
 * empty longer than pendingMs, or a live pid's lock is older than staleMs
 * (Docker pid reuse after recreate). Alpine worker image has no flock; do not unlink
 * a live holder.
 */
import { closeSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';

/** Empty wx file is pending this long before recovery (covers the writeSync race). */
export const LOCK_PENDING_MS = 5_000;
/** Live pid leftover (container recreate / pid reuse) may be recovered after this. */
export const LOCK_STALE_MS = Number(process.env.SMARTPROTO_LOCK_STALE_MS || 45 * 60 * 1000);

export function workerLockPath(dataDir: string): string {
  return path.join(dataDir, 'worker-once.lock');
}

export function parseWorkerArgv(argv: string[]): { once: boolean } {
  return { once: argv.includes('--once') };
}

export function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readLockRecord(lockFile: string): { pid: number | null; host: string | null } {
  try {
    const [pidLine, hostLine] = readFileSync(lockFile, 'utf8').split('\n');
    const n = parseInt((pidLine || '').trim(), 10);
    const host = (hostLine || '').trim();
    return {
      pid: Number.isFinite(n) && n > 0 ? n : null,
      host: host && !host.includes('T') ? host : null,
    };
  } catch {
    return { pid: null, host: null };
  }
}

export function lockAgeMs(lockFile: string, now = Date.now()): number {
  try {
    return Math.max(0, now - statSync(lockFile).mtimeMs);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function mayRecover(
  lockFile: string,
  holder: { pid: number | null },
  now: number,
  pendingMs: number,
  staleMs: number,
): { ok: true } | { ok: false; reason: string } {
  const age = lockAgeMs(lockFile, now);
  if (holder.pid == null) {
    if (age < pendingMs) return { ok: false, reason: 'lock-pending' };
    return { ok: true };
  }
  if (isPidAlive(holder.pid)) {
    if (age < staleMs) return { ok: false, reason: `busy pid=${holder.pid}` };
    return { ok: true };
  }
  return { ok: true };
}

export function tryAcquireWorkerLock(
  lockFile: string,
  now = Date.now(),
  opts?: { pendingMs?: number; staleMs?: number },
): { ok: true; fd: number } | { ok: false; reason: string } {
  const pendingMs = opts?.pendingMs ?? LOCK_PENDING_MS;
  const staleMs = opts?.staleMs ?? LOCK_STALE_MS;
  const stamp = `${process.pid}\n${hostname()}\n${new Date(now).toISOString()}\n`;
  try {
    const fd = openSync(lockFile, 'wx');
    writeSync(fd, stamp);
    return { ok: true, fd };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST') {
      return { ok: false, reason: `lock-open ${(err as Error).message}` };
    }
    const holder = readLockRecord(lockFile);
    const recover = mayRecover(lockFile, holder, now, pendingMs, staleMs);
    if (!recover.ok) return recover;
    try {
      unlinkSync(lockFile);
      const fd = openSync(lockFile, 'wx');
      writeSync(fd, `${stamp}recovered host=${holder.host || '?'} pid=${holder.pid || '?'}\n`);
      return { ok: true, fd };
    } catch (inner) {
      return { ok: false, reason: `lock-recover ${(inner as Error).message}` };
    }
  }
}

export function releaseWorkerLock(lockFile: string, fd: number | null): void {
  if (fd != null) {
    try {
      closeSync(fd);
    } catch {
      /* ignore */
    }
  }
  try {
    unlinkSync(lockFile);
  } catch {
    /* ignore */
  }
}
