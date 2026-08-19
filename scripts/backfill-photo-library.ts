/**
 * SP-A-101 — Backfill last N articles with empty/weak/duplicate heroes
 * using the global photo library rotation.
 *
 * Usage:
 *   ARTICLES_STORE=sqlite npx tsx scripts/backfill-photo-library.ts --limit=15
 *   ARTICLES_STORE=sqlite npx tsx scripts/backfill-photo-library.ts --limit=15 --dry-run
 */
import 'dotenv/config';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { getAllArticlesFromDb, upsertArticle } from '../src/lib/data-store/articles-repo';
import {
  assignLibraryHeroToSlug,
  heroNeedsLibraryReplacement,
  librarySize,
  readPhotoLibraryCycle,
} from '../src/lib/photo-library';

function parseArgs() {
  const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] || 15);
  const dryRun = process.argv.includes('--dry-run');
  return { limit, dryRun };
}

/** Tiny local hero files are usually logos/icons, not editorial photos. */
function isTinyLocalHero(imageUrl: string): boolean {
  const m = imageUrl.match(/^\/api\/media\/([^/]+)\/(hero\.(?:jpg|jpeg|png|webp))$/i);
  if (!m) return false;
  const mediaRoot =
    process.env.SMARTPROTO_MEDIA_DIR || path.resolve(process.cwd(), 'public', 'media');
  const fp = path.join(mediaRoot, m[1], m[2]);
  if (!existsSync(fp)) return true;
  try {
    return statSync(fp).size < 18_000;
  } catch {
    return true;
  }
}

function articleNeedsFix(
  hero: string,
  dup: number,
): { needs: boolean; reason: string } {
  if (!hero.trim()) return { needs: true, reason: 'empty' };
  if (dup >= 2) return { needs: true, reason: `duplicate×${dup}` };
  if (heroNeedsLibraryReplacement(hero, { duplicateCount: dup }))
    return { needs: true, reason: 'weak/logo' };
  if (isTinyLocalHero(hero)) return { needs: true, reason: 'tiny-local-logo' };
  return { needs: false, reason: 'ok' };
}

async function main() {
  if (process.env.ARTICLES_STORE !== 'sqlite') {
    console.error('Set ARTICLES_STORE=sqlite for Direct Publisher backfill.');
    process.exit(1);
  }

  const { limit, dryRun } = parseArgs();
  const all = getAllArticlesFromDb();
  const recent = all.slice(0, limit);

  const urlCounts = new Map<string, number>();
  for (const a of recent) {
    const u = (a.imageUrl || '').trim();
    if (!u) continue;
    urlCounts.set(u, (urlCounts.get(u) || 0) + 1);
  }

  console.log(`Photo library size: ${librarySize()} templates`);
  console.log(`Cycle state: ${JSON.stringify(readPhotoLibraryCycle())}`);
  console.log(`Checking last ${recent.length} articles…\n`);

  let fixed = 0;
  const usedAssetIds: string[] = [];

  for (const article of recent) {
    const hero = article.imageUrl || '';
    const dup = urlCounts.get(hero) || 0;
    const { needs, reason } = articleNeedsFix(hero, dup);

    if (!needs) {
      console.log(`OK  ${article.slug.slice(0, 48)} — keep hero`);
      continue;
    }

    if (dryRun) {
      console.log(`DRY ${article.slug.slice(0, 48)} — would replace (${reason})`);
      fixed++;
      continue;
    }

    const assigned = await assignLibraryHeroToSlug(article.slug, {
      avoidIds: usedAssetIds,
    });
    if (!assigned) {
      console.log(`FAIL ${article.slug.slice(0, 48)} — download failed (${reason})`);
      continue;
    }

    usedAssetIds.push(assigned.assetId);
    upsertArticle(
      {
        ...article,
        imageUrl: assigned.imageUrl,
        images: [{ url: assigned.imageUrl, role: 'hero', sourceUrl: assigned.assetId }],
      },
      { skipFinalAutoGate: true, skipPostPublishTranslation: true },
    );
    console.log(
      `FIX ${article.slug.slice(0, 48)} — ${reason} → ${assigned.assetId} (${assigned.imageUrl})`,
    );
    fixed++;
  }

  console.log(`\nDone: ${fixed}/${recent.length} ${dryRun ? 'would fix' : 'fixed'}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
