/**
 * SP-A-074 — path safety for retention cleanup.
 * Never touch files outside the SmartProto app root.
 */

import path from 'node:path';
import fs from 'node:fs';

/** Host + container roots that are allowed for DELETE. */
export function allowedSmartProtoRoots(): string[] {
  const roots = [
    '/opt/apps/smartproto',
    '/app/data',
    '/app/public',
  ];
  // Local / CI dry-runs and unit tests
  if (process.env.SMARTPROTO_ALLOW_LOCAL_RETENTION === '1') {
    roots.push(path.resolve(process.cwd()));
    const dataDir = process.env.SMARTPROTO_DATA_DIR;
    if (dataDir) roots.push(path.resolve(dataDir));
    const mediaDir = process.env.SMARTPROTO_MEDIA_DIR;
    if (mediaDir) roots.push(path.resolve(mediaDir));
  }
  return roots.map((r) => path.resolve(r));
}

export function resolveDbPath(): string {
  return path.resolve(
    process.env.SMARTPROTO_DB_PATH || path.resolve(process.cwd(), 'data', 'smartproto.db'),
  );
}

export function resolveMediaRoot(): string {
  // Hetzner host images volume; container uses /app/public/media
  if (process.env.SMARTPROTO_MEDIA_DIR) {
    return path.resolve(process.env.SMARTPROTO_MEDIA_DIR);
  }
  const hostImages = '/opt/apps/smartproto/images';
  if (fs.existsSync(hostImages)) return hostImages;
  return path.resolve(process.cwd(), 'public', 'media');
}

export function resolveDataDir(): string {
  if (process.env.SMARTPROTO_DATA_DIR) return path.resolve(process.env.SMARTPROTO_DATA_DIR);
  if (fs.existsSync('/opt/apps/smartproto/data')) return '/opt/apps/smartproto/data';
  return path.resolve(process.cwd(), 'data');
}

/** True if absolute path is under at least one allowed root (no .. escape). */
export function isPathAllowed(targetPath: string, roots = allowedSmartProtoRoots()): boolean {
  const resolved = path.resolve(targetPath);
  if (resolved.includes('..')) return false;
  return roots.some((root) => resolved === root || resolved.startsWith(root + path.sep));
}

export function assertPathAllowed(targetPath: string, label: string): void {
  if (!isPathAllowed(targetPath)) {
    throw new Error(
      `SP-A-074 safety: refusing ${label} path outside SmartProto roots: ${targetPath}`,
    );
  }
}

/** Confirm production-shaped paths (or explicit local override). */
export function confirmStoragePaths(dbPath: string, mediaRoot: string): {
  ok: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  assertPathAllowed(dbPath, 'DB');
  assertPathAllowed(mediaRoot, 'media');

  const prodDb = '/opt/apps/smartproto/data/smartproto.db';
  const containerDb = '/app/data/smartproto.db';
  const isProdShape =
    path.resolve(dbPath) === prodDb ||
    path.resolve(dbPath) === containerDb ||
    process.env.SMARTPROTO_ALLOW_LOCAL_RETENTION === '1';

  if (!isProdShape) {
    warnings.push(
      `DB path ${dbPath} is not the known Hetzner/container path — set SMARTPROTO_ALLOW_LOCAL_RETENTION=1 to proceed.`,
    );
  }
  if (!fs.existsSync(dbPath) && !fs.existsSync(`${dbPath}-wal`)) {
    warnings.push(`DB file missing: ${dbPath}`);
  }
  return { ok: warnings.length === 0 || process.env.SMARTPROTO_ALLOW_LOCAL_RETENTION === '1', warnings };
}

/** Shared / system media dirs that must never be deleted. */
export const PROTECTED_MEDIA_NAMES = new Set([
  '_category',
  'shared',
  'system',
  'brand',
  'favicon',
]);
