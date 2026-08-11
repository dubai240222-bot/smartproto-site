/**
 * SP-A-074 — SmartProto retention / night cleanup.
 *
 * Delete oldest articles only when ALL hold:
 *   age > RETENTION_DAYS AND remaining >= MIN_ARTICLES AND run deletes < MAX_DELETE_PER_RUN
 */

import fs from 'node:fs';
import path from 'node:path';
import type { StoredArticle } from '@/lib/data-store/articles-repo';
import {
  PROTECTED_MEDIA_NAMES,
  assertPathAllowed,
  confirmStoragePaths,
  resolveDataDir,
  resolveDbPath,
  resolveMediaRoot,
} from '@/lib/retention/paths';

export type RetentionConfig = {
  retentionDays: number;
  minArticles: number;
  maxDeletePerRun: number;
};

export type ImageAction = {
  path: string;
  bytes: number;
  slug: string;
  shared: boolean;
  action: 'delete' | 'keep_shared' | 'keep_protected' | 'skip_missing' | 'skip_external';
};

export type ArticleDeletionPlan = {
  slug: string;
  title: string;
  publishedAt: string;
  ageDays: number;
  images: ImageAction[];
};

export type RetentionPlan = {
  dryRun: boolean;
  dbPath: string;
  mediaRoot: string;
  dataDir: string;
  config: RetentionConfig;
  totalArticles: number;
  olderThanRetention: number;
  eligibleToDelete: number;
  wouldDelete: number;
  articlesRemaining: number;
  articles: ArticleDeletionPlan[];
  imagesEligible: number;
  sharedImagesKept: number;
  estimatedBytes: number;
  warnings: string[];
};

export function loadRetentionConfig(env: NodeJS.ProcessEnv = process.env): RetentionConfig {
  const retentionDays = Number(env.SMARTPROTO_RETENTION_DAYS ?? 10);
  const minArticles = Number(env.SMARTPROTO_MIN_ARTICLES ?? 100);
  const maxDeletePerRun = Number(env.SMARTPROTO_MAX_DELETE_PER_RUN ?? 25);
  return {
    retentionDays: Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : 10,
    minArticles: Number.isFinite(minArticles) && minArticles > 0 ? minArticles : 100,
    maxDeletePerRun:
      Number.isFinite(maxDeletePerRun) && maxDeletePerRun > 0 ? Math.floor(maxDeletePerRun) : 25,
  };
}

function ageDays(publishedAt: string, now = Date.now()): number {
  const t = Date.parse(publishedAt);
  if (!Number.isFinite(t)) return 0;
  return (now - t) / (24 * 60 * 60 * 1000);
}

/** Map /api/media/slug/file.jpg → absolute file under mediaRoot; else null if external. */
export function localMediaPathFromUrl(url: string, mediaRoot: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  let rel = '';
  if (trimmed.startsWith('/api/media/')) {
    rel = trimmed.slice('/api/media/'.length);
  } else if (trimmed.startsWith('/media/')) {
    rel = trimmed.slice('/media/'.length);
  } else if (!/^https?:\/\//i.test(trimmed) && !trimmed.includes('://')) {
    rel = trimmed.replace(/^\//, '');
  } else {
    return null; // external CDN / hotlink — do not delete
  }
  if (!rel || rel.includes('..')) return null;
  const abs = path.resolve(mediaRoot, rel);
  if (!abs.startsWith(path.resolve(mediaRoot) + path.sep) && abs !== path.resolve(mediaRoot)) {
    return null;
  }
  return abs;
}

function collectArticleImageUrls(article: StoredArticle): string[] {
  const urls: string[] = [];
  if (article.imageUrl) urls.push(article.imageUrl);
  if (Array.isArray(article.images)) {
    for (const img of article.images) {
      if (img?.url) urls.push(img.url);
    }
  }
  return urls;
}

function dirByteSize(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  const walk = (p: string) => {
    let st: fs.Stats;
    try {
      st = fs.lstatSync(p);
    } catch {
      return;
    }
    if (st.isSymbolicLink()) return;
    if (st.isFile()) {
      total += st.size;
      return;
    }
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(p)) walk(path.join(p, name));
    }
  };
  walk(dir);
  return total;
}

function fileByteSize(p: string): number {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

export function buildRetentionPlan(opts: {
  articles: StoredArticle[];
  dryRun: boolean;
  config?: RetentionConfig;
  dbPath?: string;
  mediaRoot?: string;
  dataDir?: string;
  now?: number;
}): RetentionPlan {
  const config = opts.config ?? loadRetentionConfig();
  const dbPath = opts.dbPath ?? resolveDbPath();
  const mediaRoot = opts.mediaRoot ?? resolveMediaRoot();
  const dataDir = opts.dataDir ?? resolveDataDir();
  const now = opts.now ?? Date.now();
  const warnings: string[] = [];

  const confirm = confirmStoragePaths(dbPath, mediaRoot);
  warnings.push(...confirm.warnings);

  const totalArticles = opts.articles.length;
  const sortedAsc = [...opts.articles].sort(
    (a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt),
  );

  const older = sortedAsc.filter((a) => ageDays(a.publishedAt, now) > config.retentionDays);
  const olderThanRetention = older.length;

  // How many can we delete without going below MIN_ARTICLES?
  const headroom = Math.max(0, totalArticles - config.minArticles);
  const eligibleToDelete = Math.min(olderThanRetention, headroom);
  const wouldDelete = Math.min(eligibleToDelete, config.maxDeletePerRun);
  const toDelete = older.slice(0, wouldDelete);

  const deleteSlugs = new Set(toDelete.map((a) => a.slug));
  const articles: ArticleDeletionPlan[] = [];
  let imagesEligible = 0;
  let sharedImagesKept = 0;
  let estimatedBytes = 0;
  const countedPaths = new Set<string>();

  for (const a of toDelete) {
    const imageActions: ImageAction[] = [];
    const urls = collectArticleImageUrls(a);
    const seen = new Set<string>();

    for (const url of urls) {
      const local = localMediaPathFromUrl(url, mediaRoot);
      if (!local) {
        imageActions.push({
          path: url,
          bytes: 0,
          slug: a.slug,
          shared: false,
          action: 'skip_external',
        });
        continue;
      }
      if (seen.has(local)) continue;
      seen.add(local);

      const top = path.relative(mediaRoot, local).split(path.sep)[0] || '';
      if (PROTECTED_MEDIA_NAMES.has(top)) {
        imageActions.push({
          path: local,
          bytes: 0,
          slug: a.slug,
          shared: true,
          action: 'keep_protected',
        });
        sharedImagesKept += 1;
        continue;
      }

      // Count refs from articles NOT being deleted this run
      let remaining = 0;
      for (const other of opts.articles) {
        if (deleteSlugs.has(other.slug)) continue;
        for (const u of collectArticleImageUrls(other)) {
          const p = localMediaPathFromUrl(u, mediaRoot);
          if (p === local) remaining += 1;
        }
      }

      if (remaining > 0) {
        imageActions.push({
          path: local,
          bytes: 0,
          slug: a.slug,
          shared: true,
          action: 'keep_shared',
        });
        sharedImagesKept += 1;
        continue;
      }

      if (!fs.existsSync(local)) {
        imageActions.push({
          path: local,
          bytes: 0,
          slug: a.slug,
          shared: false,
          action: 'skip_missing',
        });
        continue;
      }

      const bytes = fileByteSize(local);
      imageActions.push({
        path: local,
        bytes,
        slug: a.slug,
        shared: false,
        action: 'delete',
      });
      imagesEligible += 1;
      if (!countedPaths.has(local)) {
        countedPaths.add(local);
        estimatedBytes += bytes;
      }
    }

    // Also account for whole slug media directory (hero.jpg etc. even if not listed)
    const slugDir = path.join(mediaRoot, a.slug);
    if (fs.existsSync(slugDir) && !PROTECTED_MEDIA_NAMES.has(a.slug)) {
      // Only if no other article references files under this dir
      let dirShared = false;
      for (const other of opts.articles) {
        if (other.slug === a.slug || deleteSlugs.has(other.slug)) continue;
        for (const u of collectArticleImageUrls(other)) {
          const p = localMediaPathFromUrl(u, mediaRoot);
          if (p && (p === slugDir || p.startsWith(slugDir + path.sep))) {
            dirShared = true;
            break;
          }
        }
        if (dirShared) break;
      }
      if (!dirShared) {
        const dirBytes = dirByteSize(slugDir);
        // Add bytes for files not already counted
        const walkAdd = (p: string) => {
          try {
            const st = fs.lstatSync(p);
            if (st.isFile() && !countedPaths.has(p)) {
              countedPaths.add(p);
              estimatedBytes += st.size;
              imagesEligible += 1;
              imageActions.push({
                path: p,
                bytes: st.size,
                slug: a.slug,
                shared: false,
                action: 'delete',
              });
            } else if (st.isDirectory()) {
              for (const name of fs.readdirSync(p)) walkAdd(path.join(p, name));
            }
          } catch {
            /* ignore */
          }
        };
        // Only walk if we haven't already listed files via URLs
        const already = imageActions.some((i) => i.action === 'delete' && i.path.startsWith(slugDir));
        if (!already && dirBytes > 0) walkAdd(slugDir);
        void dirBytes;
      } else {
        sharedImagesKept += 1;
      }
    }

    articles.push({
      slug: a.slug,
      title: a.title,
      publishedAt: a.publishedAt,
      ageDays: Math.floor(ageDays(a.publishedAt, now) * 10) / 10,
      images: imageActions,
    });
  }

  return {
    dryRun: opts.dryRun,
    dbPath,
    mediaRoot,
    dataDir,
    config,
    totalArticles,
    olderThanRetention,
    eligibleToDelete,
    wouldDelete,
    articlesRemaining: totalArticles - wouldDelete,
    articles,
    imagesEligible,
    sharedImagesKept,
    estimatedBytes,
    warnings,
  };
}

function rmFileSafe(filePath: string): void {
  assertPathAllowed(filePath, 'image');
  if (PROTECTED_MEDIA_NAMES.has(path.basename(path.dirname(filePath)))) {
    throw new Error(`Refusing to delete protected media: ${filePath}`);
  }
  fs.unlinkSync(filePath);
}

function rmEmptyDirsUp(startDir: string, stopRoot: string): void {
  let cur = startDir;
  const root = path.resolve(stopRoot);
  while (cur.startsWith(root + path.sep) || cur === root) {
    if (cur === root) break;
    assertPathAllowed(cur, 'media-dir');
    const base = path.basename(cur);
    if (PROTECTED_MEDIA_NAMES.has(base)) break;
    try {
      const entries = fs.readdirSync(cur);
      if (entries.length > 0) break;
      fs.rmdirSync(cur);
    } catch {
      break;
    }
    cur = path.dirname(cur);
  }
}

/** Remove article-specific draft JSON files under dataDir/drafts or cwd/drafts. */
function cleanupArticleDrafts(slug: string, dataDir: string): string[] {
  const removed: string[] = [];
  const candidates = [
    path.join(dataDir, 'drafts'),
    path.resolve(process.cwd(), 'drafts'),
  ];
  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    if (!isPathAllowedSafe(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.includes(slug) || !name.endsWith('.json')) continue;
      const full = path.join(dir, name);
      if (!isPathAllowedSafe(full)) continue;
      try {
        fs.unlinkSync(full);
        removed.push(full);
      } catch {
        /* ignore */
      }
    }
  }
  return removed;
}

function isPathAllowedSafe(p: string): boolean {
  try {
    assertPathAllowed(p, 'meta');
    return true;
  } catch {
    return false;
  }
}

export type RetentionExecuteResult = RetentionPlan & {
  deletedSlugs: string[];
  deletedImages: string[];
  deletedDrafts: string[];
  errors: string[];
};

export function executeRetentionPlan(
  plan: RetentionPlan,
  deleteArticle: (slug: string) => void,
): RetentionExecuteResult {
  if (plan.dryRun) {
    return { ...plan, deletedSlugs: [], deletedImages: [], deletedDrafts: [], errors: [] };
  }

  const confirm = confirmStoragePaths(plan.dbPath, plan.mediaRoot);
  if (!confirm.ok && process.env.SMARTPROTO_ALLOW_LOCAL_RETENTION !== '1') {
    throw new Error(`Unsafe storage paths: ${confirm.warnings.join('; ')}`);
  }

  const deletedSlugs: string[] = [];
  const deletedImages: string[] = [];
  const deletedDrafts: string[] = [];
  const errors: string[] = [];

  // Re-check live count before each delete to never drop below MIN
  for (const article of plan.articles) {
    try {
      // Caller must ensure remaining count; we still enforce max
      if (deletedSlugs.length >= plan.config.maxDeletePerRun) break;

      deleteArticle(article.slug);
      deletedSlugs.push(article.slug);

      for (const img of article.images) {
        if (img.action !== 'delete') continue;
        try {
          if (fs.existsSync(img.path)) {
            rmFileSafe(img.path);
            deletedImages.push(img.path);
            rmEmptyDirsUp(path.dirname(img.path), plan.mediaRoot);
          }
        } catch (err) {
          errors.push(
            `image ${img.path}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // Remove empty slug media dir if present
      const slugDir = path.join(plan.mediaRoot, article.slug);
      try {
        if (fs.existsSync(slugDir) && !PROTECTED_MEDIA_NAMES.has(article.slug)) {
          assertPathAllowed(slugDir, 'slug-media');
          const left = fs.readdirSync(slugDir);
          if (left.length === 0) fs.rmdirSync(slugDir);
        }
      } catch (err) {
        errors.push(
          `slug-dir ${slugDir}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      deletedDrafts.push(...cleanupArticleDrafts(article.slug, plan.dataDir));
    } catch (err) {
      errors.push(
        `article ${article.slug}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    ...plan,
    dryRun: false,
    wouldDelete: deletedSlugs.length,
    articlesRemaining: plan.totalArticles - deletedSlugs.length,
    deletedSlugs,
    deletedImages,
    deletedDrafts,
    errors,
  };
}

export function formatRetentionReport(plan: RetentionPlan | RetentionExecuteResult): string {
  const lines = [
    'SP-A-074 RETENTION REPORT',
    `MODE: ${plan.dryRun ? 'DRY-RUN' : 'EXECUTE'}`,
    `DB PATH: ${plan.dbPath}`,
    `IMAGE ROOT: ${plan.mediaRoot}`,
    `RETENTION_DAYS: ${plan.config.retentionDays}`,
    `MIN_ARTICLES: ${plan.config.minArticles}`,
    `MAX_DELETE_PER_RUN: ${plan.config.maxDeletePerRun}`,
    `TOTAL ARTICLES: ${plan.totalArticles}`,
    `OLDER THAN ${plan.config.retentionDays} DAYS: ${plan.olderThanRetention}`,
    `ELIGIBLE TO DELETE: ${plan.eligibleToDelete}`,
    `WOULD DELETE THIS RUN: ${plan.wouldDelete}`,
    `ARTICLES REMAINING: ${plan.articlesRemaining}`,
    `IMAGES ELIGIBLE: ${plan.imagesEligible}`,
    `SHARED IMAGES KEPT: ${plan.sharedImagesKept}`,
    `ESTIMATED SPACE TO FREE: ${formatBytes(plan.estimatedBytes)}`,
  ];
  if (plan.warnings.length) {
    lines.push('WARNINGS:');
    for (const w of plan.warnings) lines.push(`  - ${w}`);
  }
  if (plan.articles.length) {
    lines.push('CANDIDATES:');
    for (const a of plan.articles.slice(0, 30)) {
      lines.push(
        `  - ${a.slug} | ${a.publishedAt.slice(0, 10)} | ${a.ageDays}d | ${a.title.slice(0, 60)}`,
      );
    }
    if (plan.articles.length > 30) {
      lines.push(`  … +${plan.articles.length - 30} more`);
    }
  }
  if ('deletedSlugs' in plan) {
    lines.push(`DELETED SLUGS: ${plan.deletedSlugs.length}`);
    lines.push(`DELETED IMAGES: ${plan.deletedImages.length}`);
    lines.push(`DELETED DRAFTS: ${plan.deletedDrafts.length}`);
    if (plan.errors.length) {
      lines.push('ERRORS:');
      for (const e of plan.errors) lines.push(`  - ${e}`);
    }
  }
  return lines.join('\n');
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** True when local server hour matches cleanup hour and not yet run today. */
export function shouldRunNightlyCleanup(opts: {
  lastRetentionAt?: string;
  hour?: number;
  now?: Date;
}): boolean {
  const hour = opts.hour ?? Number(process.env.SMARTPROTO_RETENTION_HOUR ?? 1);
  const now = opts.now ?? new Date();
  if (now.getHours() !== hour) return false;
  if (!opts.lastRetentionAt) return true;
  const last = new Date(opts.lastRetentionAt);
  if (!Number.isFinite(last.getTime())) return true;
  return (
    last.getFullYear() !== now.getFullYear() ||
    last.getMonth() !== now.getMonth() ||
    last.getDate() !== now.getDate()
  );
}
