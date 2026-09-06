/**
 * SMARTPROTO VISUAL DESK V1 — orchestrates photo miner + warehouse + gap report.
 * Extends photo-scout; does not replace Scout thresholds or editorial gates.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  resolveArticlePhotos,
  MAX_GALLERY_IMAGES,
  type PhotoPipelineReport,
  type ScoutImage,
} from './collectors/photo-scout';
import {
  isVisualDuplicate,
  readMediaWarehouse,
  recentVisualFingerprints,
  registerWarehouseAsset,
} from './media-warehouse';

export type VisualBrief = {
  subject?: string;
  scenes?: string[];
  avoid?: string[];
  preferredTiers?: string[];
};

export type VisualGapReport = {
  slug: string;
  status: 'complete' | 'partial' | 'hero_only' | 'none' | 'timeout' | 'error';
  visualPendingMs?: number;
  targetMin: number;
  targetMax: number;
  selected: number;
  hero: boolean;
  galleryCount: number;
  candidatesFound: number;
  duplicatesRejected: number;
  recentPenaltyRejected: number;
  visualBrief?: VisualBrief;
  notes: string[];
  imageMatchLevel?: string;
  generatedAt: string;
};

export type VisualDeskResult = {
  images: ScoutImage[];
  report: PhotoPipelineReport;
  gap: VisualGapReport;
};

const MEDIA_ROOT = process.env.SMARTPROTO_MEDIA_DIR || path.resolve(process.cwd(), 'public', 'media');
const VISUAL_MIN_IMAGES = 2;
const VISUAL_GOOD_SET = 3;
const DEFAULT_TIMEOUT_MS = 4 * 60 * 1000;

function gapReportPath(slug: string): string {
  const root = process.env.SMARTPROTO_DATA_DIR || path.resolve(process.cwd(), 'data');
  return path.join(root, 'visual-gap', `${slug}.json`);
}

export async function writeVisualGapReport(gap: VisualGapReport): Promise<void> {
  const fp = gapReportPath(gap.slug);
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(path.dirname(fp), { recursive: true });
  await writeFile(fp, `${JSON.stringify(gap, null, 2)}\n`, 'utf8');
}

async function localPathFromApiUrl(apiUrl: string, slug: string): Promise<string | null> {
  const m = apiUrl.match(/^\/api\/media\/([^/]+)\/(.+)$/i);
  if (!m) return null;
  return path.join(MEDIA_ROOT, m[1], m[2]);
}

async function registerDownloadedImages(
  slug: string,
  images: ScoutImage[],
): Promise<{ dupRejected: number; recentRejected: number }> {
  let dupRejected = 0;
  let recentRejected = 0;
  const wh = readMediaWarehouse();
  const existing = wh.assets.map((a) => ({ sha256: a.sha256, phash: a.phash }));

  for (const img of images) {
    const fp = await localPathFromApiUrl(img.url, slug);
    if (!fp) continue;
    try {
      const buf = await readFile(fp);
      const asset = registerWarehouseAsset({
        buf,
        provenance: {
          sourceUrl: img.sourceUrl,
          fetchedAt: new Date().toISOString(),
        },
        usage: { slug, role: img.role, at: new Date().toISOString() },
      });
      if (isVisualDuplicate(asset.sha256, asset.phash, existing.slice(0, 1))) {
        dupRejected += 1;
      }
      existing.unshift({ sha256: asset.sha256, phash: asset.phash });
    } catch {
      /* skip unreadable */
    }
  }
  void recentRejected;
  return { dupRejected, recentRejected };
}

/** Filter picks that repeat recent site visuals (last ~25 articles). */
export function filterRecentVisualRepeats(
  images: ScoutImage[],
  recentArticles: { slug: string; images?: { url: string }[]; imageUrl?: string }[],
  currentSlug: string,
): { kept: ScoutImage[]; rejected: number } {
  const recent = recentVisualFingerprints(
    recentArticles.filter((a) => a.slug !== currentSlug),
    25,
  );
  if (!recent.length) return { kept: images, rejected: 0 };

  const kept: ScoutImage[] = [];
  let rejected = 0;
  const accepted: { sha256: string; phash: string }[] = [];

  for (const img of images) {
    // Without buffer here, match via warehouse usage on same sourceUrl
    const wh = readMediaWarehouse();
    const bySource = wh.assets.find((a) => a.provenance.sourceUrl === img.sourceUrl);
    if (bySource && isVisualDuplicate(bySource.sha256, bySource.phash, recent)) {
      rejected += 1;
      continue;
    }
    kept.push(img);
    if (bySource) accepted.push({ sha256: bySource.sha256, phash: bySource.phash });
  }

  // Always keep hero if we had one — never substitute unrelated secondary.
  if (!kept.length && images.length) {
    const hero = images.find((i) => i.role === 'hero') || images.find((i) => i.matchLevel === 'exact');
    if (hero) kept.push(hero);
  }
  return { kept, rejected };
}

function goodSetFound(images: ScoutImage[]): boolean {
  if (images.length >= VISUAL_GOOD_SET) return true;
  if (images.length >= VISUAL_MIN_IMAGES && images.some((i) => i.role === 'hero')) return true;
  return false;
}

/**
 * VISUAL_PENDING wrapper — bounded wait, early exit when a good set is found.
 * Never throws; publish path must continue with partial/none.
 */
export async function runVisualDesk(opts: {
  slug: string;
  title: string;
  text: string;
  sourceUrl: string;
  fallbackUrl?: string;
  html?: string;
  visualBrief?: VisualBrief;
  recentArticles?: { slug: string; images?: { url: string }[]; imageUrl?: string }[];
  timeoutMs?: number;
  maxResearchPages?: number;
}): Promise<VisualDeskResult> {
  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const notes: string[] = ['VISUAL_PENDING'];

  let report: PhotoPipelineReport;
  try {
    const briefHint = opts.visualBrief
      ? ` visual_brief=${JSON.stringify(opts.visualBrief).slice(0, 200)}`
      : '';
    notes.push(`miner start${briefHint}`);

    report = await Promise.race([
      resolveArticlePhotos({
        slug: opts.slug,
        title: opts.title,
        text: opts.text,
        sourceUrl: opts.sourceUrl,
        fallbackUrl: opts.fallbackUrl,
        html: opts.html,
        visualBrief: opts.visualBrief,
        maxResearchPages: opts.maxResearchPages,
      }),
      new Promise<PhotoPipelineReport>((_, reject) =>
        setTimeout(() => reject(new Error('VISUAL_PENDING timeout')), timeoutMs),
      ),
    ]);
    notes.push(...report.notes.slice(-6));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    notes.push(msg.includes('timeout') ? 'VISUAL_PENDING timeout — partial/none' : `error: ${msg}`);
    report = {
      entity: {
        company: null,
        brand: null,
        model: null,
        object: null,
        lab: null,
        objectType: 'unknown',
        aliases: [],
        status: 'unknown',
        matchTokens: [],
      },
      candidatesFound: 0,
      candidatesRejected: [],
      selected: [],
      notes: [msg],
      imageMatchLevel: 'none',
    };
  }

  let images = [...report.selected];
  if (goodSetFound(images)) notes.push('early exit: good set found');

  if (opts.recentArticles?.length) {
    const { kept, rejected } = filterRecentVisualRepeats(images, opts.recentArticles, opts.slug);
    if (rejected) notes.push(`recent visual penalty: rejected ${rejected}`);
    images = kept;
  }

  const reg = await registerDownloadedImages(opts.slug, images);
  const elapsed = Date.now() - started;

  const galleryCount = images.filter((i) => i.role !== 'hero').length;
  const hero = images.some((i) => i.role === 'hero');
  let status: VisualGapReport['status'] = 'none';
  if (images.length >= VISUAL_GOOD_SET) status = 'complete';
  else if (images.length >= VISUAL_MIN_IMAGES) status = 'partial';
  else if (hero && galleryCount === 0) status = 'hero_only';
  else if (report.notes.some((n) => /timeout/i.test(n))) status = 'timeout';
  else if (!images.length) status = 'none';

  const gap: VisualGapReport = {
    slug: opts.slug,
    status,
    visualPendingMs: elapsed,
    targetMin: VISUAL_MIN_IMAGES,
    targetMax: MAX_GALLERY_IMAGES,
    selected: images.length,
    hero,
    galleryCount,
    candidatesFound: report.candidatesFound,
    duplicatesRejected: reg.dupRejected + report.candidatesRejected.length,
    recentPenaltyRejected: reg.recentRejected,
    visualBrief: opts.visualBrief,
    notes: [...notes, ...report.notes].slice(-20),
    imageMatchLevel: report.imageMatchLevel,
    generatedAt: new Date().toISOString(),
  };

  try {
    await writeVisualGapReport(gap);
  } catch {
    /* non-blocking */
  }

  return { images, report: { ...report, selected: images }, gap };
}
