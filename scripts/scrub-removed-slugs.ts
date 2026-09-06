/**
 * SP-A-100F — scrub removed-slug articles from SQLite + local media.
 * Runs on Hetzner worker boot (and can be invoked manually):
 *   npx tsx scripts/scrub-removed-slugs.ts
 *
 * Durable companion to `src/data/removed-slugs.json` (UI already filters).
 * Also deletes on-disk hero files so /api/media/<slug>/hero.jpg cannot resurface.
 */
import 'dotenv/config';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { REMOVED_SLUGS } from '../src/lib/removed-slugs';
import {
  deleteArticleBySlug,
  getArticleBySlugFromDb,
} from '../src/lib/data-store/articles-repo';

const MEDIA_ROOT =
  process.env.SMARTPROTO_MEDIA_DIR || path.resolve(process.cwd(), 'public', 'media');

function scrubMedia(slug: string): boolean {
  const dir = path.join(MEDIA_ROOT, slug);
  if (!existsSync(dir)) return false;
  rmSync(dir, { recursive: true, force: true });
  return true;
}

export function scrubRemovedSlugs(): {
  deletedDb: string[];
  deletedMedia: string[];
  missing: string[];
} {
  const deletedDb: string[] = [];
  const deletedMedia: string[] = [];
  const missing: string[] = [];

  for (const slug of REMOVED_SLUGS) {
    let touched = false;
    try {
      const row = getArticleBySlugFromDb(slug);
      if (row) {
        deleteArticleBySlug(slug);
        deletedDb.push(slug);
        touched = true;
      }
    } catch (err) {
      console.warn(
        `[scrub] DB skip ${slug}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (scrubMedia(slug)) {
      deletedMedia.push(slug);
      touched = true;
    }
    if (!touched) missing.push(slug);
  }

  return { deletedDb, deletedMedia, missing };
}

const isMain =
  typeof require !== 'undefined' &&
  typeof module !== 'undefined' &&
  require.main === module;

if (isMain) {
  const r = scrubRemovedSlugs();
  console.log(
    JSON.stringify(
      {
        ok: true,
        deletedDb: r.deletedDb,
        deletedMedia: r.deletedMedia,
        untouchedRemovedSlugs: r.missing.length,
      },
      null,
      2,
    ),
  );
}
