/**
 * Single-flight lock so a slow --once tick cannot overlap the next wake.
 * Recover only if the recorded pid is dead (mtime-only steal can interrupt a
 * live photo-scout tick).
 */
import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
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

export function readLockPid(lockFile: string): number | null {
  try {
    const n = parseInt(readFileSync(lockFile, 'utf8').split(/\s+/)[0] || '', 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function tryAcquireWorkerLock(
  lockFile: string,
  now = Date.now(),
): { ok: true; fd: number } | { ok: false; reason: string } {
  try {
    const fd = openSync(lockFile, 'wx');
    writeSync(fd, `${process.pid}\n${new Date(now).toISOString()}\n`);
    return { ok: true, fd };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST') {
      return { ok: false, reason: `lock-open ${(err as Error).message}` };
    }
    const holder = readLockPid(lockFile);
    if (holder != null && isPidAlive(holder)) {
      return { ok: false, reason: `busy pid=${holder}` };
    }
    try {
      unlinkSync(lockFile);
      const fd = openSync(lockFile, 'wx');
      writeSync(fd, `${process.pid}\n${new Date(now).toISOString()}\ndead-pid-recovered\n`);
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
