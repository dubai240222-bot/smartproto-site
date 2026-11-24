/**
 * Single-flight lock so a slow newsroom tick cannot overlap the next --once.
 * File lock (wx): no extra package. Stale after 3h is treated as a crashed tick.
 */
import { closeSync, openSync, statSync, unlinkSync, writeSync } from 'node:fs';
import path from 'node:path';

export const WORKER_LOCK_STALE_MS = 3 * 60 * 60 * 1000;

export function workerLockPath(dataDir: string): string {
  return path.join(dataDir, 'worker-once.lock');
}

export function parseWorkerArgv(argv: string[]): { once: boolean } {
  return { once: argv.includes('--once') };
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
    try {
      const age = now - statSync(lockFile).mtimeMs;
      if (age >= WORKER_LOCK_STALE_MS) {
        unlinkSync(lockFile);
        const fd = openSync(lockFile, 'wx');
        writeSync(fd, `${process.pid}\n${new Date(now).toISOString()}\nstale-recovered\n`);
        return { ok: true, fd };
      }
      return { ok: false, reason: `busy ageMs=${Math.round(age)}` };
    } catch (inner) {
      return { ok: false, reason: `lock-busy ${(inner as Error).message}` };
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
