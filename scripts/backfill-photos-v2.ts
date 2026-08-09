/**
 * SP-A-064 — one-shot / selective photo backfill for existing SQLite articles.
 * Does NOT rewrite article text. Only fills images[] + imageUrl via Photo V2.
 *
 * Usage:
 *   npx tsx scripts/backfill-photos-v2.ts --slugs=slug1,slug2
 *   npx tsx scripts/backfill-photos-v2.ts --recent=4
 */
import 'dotenv/config';
import { resolveArticlePhotos } from '../src/lib/collectors/photo-scout';
import {
  getAllArticlesFromDb,
  getArticleBySlugFromDb,
  upsertArticle,
} from '../src/lib/data-store/articles-repo';

function parseArgs(argv: string[]) {
  const slugsArg = argv.find((a) => a.startsWith('--slugs='));
  const recentArg = argv.find((a) => a.startsWith('--recent='));
  const slugs = slugsArg
    ? slugsArg
        .slice('--slugs='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const recent = recentArg ? Number(recentArg.slice('--recent='.length)) : 0;
  return { slugs, recent };
}

async function main() {
  if (process.env.ARTICLES_STORE !== 'sqlite') {
    console.error('Set ARTICLES_STORE=sqlite (and SMARTPROTO_DB_PATH) before backfill.');
    process.exit(1);
  }

  const { slugs, recent } = parseArgs(process.argv.slice(2));
  let targets = slugs;
  if (!targets.length && recent > 0) {
    targets = getAllArticlesFromDb()
      .slice(0, recent)
      .map((a) => a.slug);
  }
  if (!targets.length) {
    console.error('Provide --slugs=a,b or --recent=N');
    process.exit(1);
  }

  for (const slug of targets) {
    const article = getArticleBySlugFromDb(slug);
    if (!article) {
      console.log(`SKIP missing slug=${slug}`);
      continue;
    }
    console.log(`\n=== ${slug} ===`);
    console.log(`title: ${article.title}`);
    console.log(`source: ${article.sourceUrl}`);

    const report = await resolveArticlePhotos({
      slug: article.slug,
      title: article.title,
      text: `${article.summary}\n\n${article.content}`,
      sourceUrl: article.sourceUrl,
      fallbackUrl: article.imageUrl,
      category: article.category,
    });

    console.log('entity:', JSON.stringify(report.entity, null, 2));
    console.log('candidatesFound:', report.candidatesFound);
    console.log(
      'candidatesRejected (sample):',
      report.candidatesRejected.slice(0, 8).map((r) => `${r.reason} :: ${r.url.slice(0, 90)}`),
    );
    console.log(
      'selected:',
      report.selected.map(
        (s) => `${s.role} level=${s.matchLevel || '?'} local=${s.url} src=${s.sourceUrl}`,
      ),
    );
    console.log('notes:', report.notes.join(' | '));

    if (!report.selected.length) {
      console.log('RESULT: NO IMAGE (none)');
      upsertArticle({
        ...article,
        imageUrl: undefined,
        images: [],
        imageMatchLevel: 'none',
        imageLabel: undefined,
      });
      continue;
    }

    const level = report.selected[0].matchLevel || 'exact';
    upsertArticle({
      ...article,
      imageUrl: report.selected[0].url,
      images: report.selected,
      imageMatchLevel: level,
      imageLabel: report.selected[0].label,
    });
    console.log(`RESULT: updated SQLite images level=${level}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
