/**
 * SP-A-077 — local Chief Fast Lane retest for ForkLog URL + required photo.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  process.env.ARTICLES_STORE = 'sqlite';
  process.env.SMARTPROTO_DB_PATH = path.resolve('/workspace/data/spa077-test.db');
  process.env.SMARTPROTO_DATA_DIR = path.resolve('/workspace/data');
  process.env.SMARTPROTO_MEDIA_DIR = path.resolve('/workspace/data/spa077-media');
  process.env.NEXT_PUBLIC_SITE_URL = 'https://smartproto.net';
  process.env.EDITORIAL_DOOR_SECRET = process.env.EDITORIAL_DOOR_SECRET || 'test-secret-spa077';

  for (const f of [
    '/workspace/data/spa077-test.db',
    '/workspace/data/spa077-test.db-wal',
    '/workspace/data/spa077-test.db-shm',
  ]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* ignore */
    }
  }
  fs.mkdirSync('/workspace/data/spa077-media', { recursive: true });

  const articlesPath = path.resolve('/workspace/src/data/articles.json');
  const articles = JSON.parse(fs.readFileSync(articlesPath, 'utf8')) as Array<Record<string, unknown>>;
  const { upsertArticle } = await import('../src/lib/data-store/articles-repo');
  for (const a of articles.slice(0, 30)) {
    upsertArticle({
      id: String(a.id || a.slug),
      slug: String(a.slug),
      title: String(a.title),
      category: String(a.category || 'Гаджеты'),
      tags: (a.tags as string[]) || [],
      summary: String(a.summary || ''),
      content: String(a.content || ''),
      sourceUrl: String(a.sourceUrl || ''),
      publishedAt: String(a.publishedAt || new Date().toISOString()),
      readTime: String(a.readTime || '1 мин'),
    });
  }

  const { createChiefJob, runChiefFastLane, getChiefJob } = await import('../src/lib/editorial/doors');
  const url =
    'https://forklog.com/news/ai/agibot-oboshla-unitree-i-stala-liderom-mirovogo-rynka-gumanoidov';
  const job = createChiefJob(url, 'тест SP-A-077: Chief gate + required photo');
  const result = await runChiefFastLane(job.id);
  const final = (await getChiefJob(job.id)) || result;

  const mediaSlug = final.articleSlug
    ? path.join('/workspace/data/spa077-media', final.articleSlug)
    : '';
  const mediaFiles = mediaSlug && fs.existsSync(mediaSlug) ? fs.readdirSync(mediaSlug) : [];

  console.log(
    JSON.stringify(
      {
        status: final.status,
        message: final.message,
        slug: final.articleSlug,
        articleUrl: final.articleUrl,
        photoKind: final.photoKind || null,
        photoUrl: final.photoUrl || null,
        mediaFiles,
      },
      null,
      2,
    ),
  );

  if (!['PUBLISHED', 'DUPLICATE'].includes(final.status)) process.exit(1);
  if (final.status === 'PUBLISHED' && !final.photoKind) {
    console.error('PUBLISHED without photoKind');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
