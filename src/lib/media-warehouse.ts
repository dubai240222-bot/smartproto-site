/**
 * SP-A-VD1 — Minimal media warehouse (sha256, phash, provenance, usage).
 * File-backed JSON; no extra DB schema. Used for hard dup + recent visual penalty.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type MediaProvenance = {
  sourceUrl?: string;
  pageUrl?: string;
  tier?: string;
  fetchedAt?: string;
};

export type MediaUsage = {
  slug: string;
  role: string;
  at: string;
};

export type WarehouseAsset = {
  id: string;
  sha256: string;
  phash: string;
  provenance: MediaProvenance;
  usage: MediaUsage[];
  bytes?: number;
};

export type MediaWarehouseFile = {
  version: 1;
  updatedAt: string;
  assets: WarehouseAsset[];
};

const MAX_ASSETS = 5000;

function warehousePath(): string {
  const root = process.env.SMARTPROTO_DATA_DIR || path.resolve(process.cwd(), 'data');
  return path.join(root, 'media-warehouse.json');
}

export function readMediaWarehouse(): MediaWarehouseFile {
  const fp = warehousePath();
  try {
    if (existsSync(fp)) {
      const parsed = JSON.parse(readFileSync(fp, 'utf8')) as MediaWarehouseFile;
      if (parsed?.assets) return parsed;
    }
  } catch {
    /* fresh */
  }
  return { version: 1, updatedAt: new Date().toISOString(), assets: [] };
}

export function writeMediaWarehouse(data: MediaWarehouseFile): void {
  const fp = warehousePath();
  mkdirSync(path.dirname(fp), { recursive: true });
  writeFileSync(
    fp,
    `${JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2)}\n`,
  );
}

/** Lightweight 64-bit average hash from byte samples (no native image codec). */
export function computePhash(buf: Buffer): string {
  const n = 64;
  const samples: number[] = [];
  if (buf.length < 64) {
    return createHash('sha256').update(buf).digest('hex').slice(0, 16);
  }
  const step = Math.max(1, Math.floor(buf.length / n));
  for (let i = 0; i < n; i++) {
    samples.push(buf[Math.min(buf.length - 1, i * step)] ?? 0);
  }
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  let bits = '';
  for (const s of samples) bits += s >= avg ? '1' : '0';
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex.padStart(16, '0');
}

export function computeSha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function hammingHex(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    dist += (x & 1) + ((x >> 1) & 1) + ((x >> 2) & 1) + ((x >> 3) & 1);
  }
  return dist;
}

/** Hard duplicate (sha256) or near-duplicate (phash ≤ threshold). */
export function isVisualDuplicate(
  sha256: string,
  phash: string,
  against: { sha256: string; phash: string }[],
  phashThreshold = 6,
): boolean {
  for (const a of against) {
    if (a.sha256 && a.sha256 === sha256) return true;
    if (a.phash && phash && hammingHex(a.phash, phash) <= phashThreshold) return true;
  }
  return false;
}

export function registerWarehouseAsset(opts: {
  buf: Buffer;
  provenance?: MediaProvenance;
  usage?: MediaUsage;
}): WarehouseAsset {
  const sha256 = computeSha256(opts.buf);
  const phash = computePhash(opts.buf);
  const wh = readMediaWarehouse();
  let asset = wh.assets.find((a) => a.sha256 === sha256);
  if (!asset) {
    asset = {
      id: sha256.slice(0, 24),
      sha256,
      phash,
      provenance: opts.provenance || {},
      usage: [],
      bytes: opts.buf.length,
    };
    wh.assets.unshift(asset);
    if (wh.assets.length > MAX_ASSETS) wh.assets.length = MAX_ASSETS;
  }
  if (opts.usage && !asset.usage.some((u) => u.slug === opts.usage!.slug && u.role === opts.usage!.role)) {
    asset.usage.unshift(opts.usage);
    if (asset.usage.length > 40) asset.usage.length = 40;
  }
  if (opts.provenance) asset.provenance = { ...asset.provenance, ...opts.provenance };
  writeMediaWarehouse(wh);
  return asset;
}

/** Fingerprints from last N published articles (for anti-repeat penalty). */
export function recentVisualFingerprints(
  articles: { slug: string; images?: { url: string }[]; imageUrl?: string }[],
  limit = 25,
): { sha256: string; phash: string; slug: string }[] {
  const wh = readMediaWarehouse();
  const out: { sha256: string; phash: string; slug: string }[] = [];
  for (const art of articles.slice(0, limit)) {
    const urls = [
      ...(art.images?.map((i) => i.url) || []),
      ...(art.imageUrl ? [art.imageUrl] : []),
    ];
    for (const url of urls) {
      for (const a of wh.assets) {
        if (a.usage.some((u) => u.slug === art.slug)) {
          out.push({ sha256: a.sha256, phash: a.phash, slug: art.slug });
          break;
        }
      }
      void url;
    }
  }
  // Also scan warehouse usage order for recent slugs
  const seenSlugs = new Set<string>();
  for (const a of wh.assets) {
    for (const u of a.usage) {
      if (seenSlugs.has(u.slug)) continue;
      seenSlugs.add(u.slug);
      out.push({ sha256: a.sha256, phash: a.phash, slug: u.slug });
      if (out.length >= limit * 3) return out;
    }
  }
  return out;
}
