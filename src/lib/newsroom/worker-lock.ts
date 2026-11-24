/**
 * Single-flight lock so a slow --once tick cannot overlap the next wake.
 * Same container: recover only if holder pid is dead (do not steal a live tick).
 * New Docker container: hostname changes, leftover lock is recovered even if
 * that pid number is alive in the new namespace.
 */
import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';

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

export function tryAcquireWorkerLock(
  lockFile: string,
  now = Date.now(),
): { ok: true; fd: number } | { ok: false; reason: string } {
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
    const sameHost = !holder.host || holder.host === hostname();
    if (sameHost && holder.pid != null && isPidAlive(holder.pid)) {
      return { ok: false, reason: `busy pid=${holder.pid}` };
    }
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
