/**
 * Gadgets-only publish loop (SP-A-030-U1):
 * RSS → hardReject (NOT_ACTUALLY_NEW) → reviewer → editor (calm masculine) →
 * articles.json → git push → vercel --prod.
 */
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { fetchRssFeed, RssItem } from '../src/lib/collectors/rss';
import { extractArticleImage } from '../src/lib/collectors/image-extractor';
import { hardRejectTopic, looksBuyableGadget } from '../src/lib/ai/hard-reject';
import { reviewArticle } from '../src/lib/ai/reviewer';
import { writeDraft } from '../src/lib/ai/editor';
import { filterRemovedArticles, isRemovedSlug } from '../src/lib/removed-slugs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const SOURCES: [string, string][] = [
  ['Yanko Design', 'https://www.yankodesign.com/feed/'],
  ['New Atlas', 'https://newatlas.com/index.rss'],
  ['Hackaday', 'https://hackaday.com/blog/feed/'],
  ['TechCrunch', 'https://techcrunch.com/feed/'],
  ['The Verge', 'https://www.theverge.com/rss/index.xml'],
  ['Engadget', 'https://www.engadget.com/rss.xml'],
  ['9to5Google', 'https://9to5google.com/feed/'],
  ['Android Authority', 'https://www.androidauthority.com/feed'],
];

/** Default ~4 minutes between publishes. */
const INTERVAL_MS = Number(process.env.GADGETS_INTERVAL_MS || 240_000);
const MAX_MINUTES = Number(process.env.GADGETS_MAX_MINUTES || 45);
const TARGET_NEW = Number(process.env.GADGETS_TARGET_NEW || 7);
const SKIP_VERCEL = process.env.GADGETS_SKIP_VERCEL === '1';

interface Article {
  id: string;
  slug: string;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  content: string;
  sourceUrl: string;
  publishedAt: string;
  readTime: string;
  imageUrl?: string;
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/, '') || `gadget-${Date.now()}`
  );
}

function summaryOf(text: string): string {
  const t = text.trim();
  if (t.length <= 200) return t;
  const i = t.indexOf('.', 50);
  if (i > 0 && i <= 200) return t.slice(0, i + 1);
  return `${t.slice(0, 197)}...`;
}

async function main() {
  process.env.SMARTPROTO_FACTORY_ENABLED = 'true';
  const root = process.cwd();
  const articlesPath = path.resolve(root, 'src', 'data', 'articles.json');
  const draftsDir = path.resolve(root, 'drafts');
  await mkdir(draftsDir, { recursive: true });

  let articles: Article[] = JSON.parse((await readFile(articlesPath, 'utf8')).replace(/^\uFEFF/, ''));
  const seen = new Set<string>(
    articles.flatMap((a) => [a.id, a.slug, a.sourceUrl].filter(Boolean) as string[]),
  );

  const started = Date.now();
  let published = 0;
  let tick = 0;
  const liveUrls: string[] = [];

  console.log(
    chalk.bold.green(
      `=== GADGETS LOOP SP-A-030 | interval=${INTERVAL_MS / 1000}s | max=${MAX_MINUTES}m | target=${TARGET_NEW} ===`,
    ),
  );

  while (Date.now() - started < MAX_MINUTES * 60_000 && published < TARGET_NEW) {
    tick++;
    const elapsedMin = Math.round((Date.now() - started) / 60000);
    console.log(chalk.bold(`\n--- tick ${tick} | +${published} new | ${elapsedMin}m ---`));

    const candidates: RssItem[] = [];
    for (const [name, url] of SOURCES) {
      try {
        const items = await fetchRssFeed(url, { limit: 14, sourceName: name });
        for (const item of items) {
          if (!item.url || !item.title) continue;
          if (seen.has(item.url) || seen.has(item.id) || seen.has(slugify(item.title))) continue;
          if (isRemovedSlug(slugify(item.title))) continue;
          if (!looksBuyableGadget(item.title, item.text || '', name)) continue;
          const gate = hardRejectTopic(item.title, item.text || '');
          // SP-A-030: full hard reject including NOT_ACTUALLY_NEW / NO_PRODUCT.
          if (gate.reject) continue;
          candidates.push(item);
        }
        console.log(chalk.gray(`  ${name}: ok`));
      } catch (e) {
        console.log(chalk.yellow(`  ${name}: ${e instanceof Error ? e.message : String(e)}`));
      }
    }

    candidates.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    const item = candidates[0];
    if (!item) {
      console.log(chalk.yellow('No gadget candidates — sleep'));
      await new Promise((r) => setTimeout(r, Math.min(INTERVAL_MS, 60_000)));
      continue;
    }

    console.log(chalk.cyan(`[${item.sourceName}] ${item.title}`));
    console.log(chalk.gray(item.url));
    try {
      const sourcePayload = {
        title: item.title,
        text: item.text || item.title,
        url: item.url,
        sourceName: item.sourceName,
      };
      const review = await reviewArticle(sourcePayload);
      if (/^REJECT\b/i.test(review.technicalVerdict)) {
        console.log(chalk.yellow(`Reviewer reject: ${review.technicalVerdict}`));
        seen.add(item.url);
        seen.add(item.id);
        await new Promise((r) => setTimeout(r, 15_000));
        continue;
      }

      const draft = await writeDraft(sourcePayload, review);
      if (draft.title.toUpperCase() === 'REJECT' || draft.tags.includes('#reject')) {
        console.log(chalk.yellow('Editor reject'));
        seen.add(item.url);
        seen.add(item.id);
        await new Promise((r) => setTimeout(r, 15_000));
        continue;
      }

      let imageUrl = item.imageUrl;
      try {
        if (!imageUrl) imageUrl = (await extractArticleImage(item.url)) || undefined;
      } catch {
        /* optional */
      }

      const slug = slugify(item.title);
      if (isRemovedSlug(slug) || seen.has(slug)) {
        console.log(chalk.yellow(`Skipped denylisted/seen slug: ${slug}`));
        seen.add(item.url);
        seen.add(item.id);
        continue;
      }

      const publishedAt = new Date().toISOString();
      const article: Article = {
        id: slug,
        slug,
        title: draft.title,
        category: 'ГАДЖЕТ / ПОЛЕЗНО',
        tags: draft.tags,
        summary: summaryOf(draft.text),
        content: draft.text,
        sourceUrl: item.url,
        publishedAt,
        readTime: '2 мин',
        imageUrl,
      };

      let latest: Article[] = articles;
      try {
        const fresh = JSON.parse((await readFile(articlesPath, 'utf8')).replace(/^\uFEFF/, ''));
        if (Array.isArray(fresh)) latest = fresh as Article[];
      } catch {
        /* keep in-memory fallback */
      }
      const deduped = filterRemovedArticles(
        latest.filter(
          (a) => a.id !== article.id && a.slug !== article.slug && a.sourceUrl !== article.sourceUrl,
        ),
      );
      deduped.unshift(article);
      articles = deduped;
      await writeFile(articlesPath, JSON.stringify(articles, null, 2) + '\n', 'utf8');
      await writeFile(
        path.join(draftsDir, `${Date.now()}-${slug}.json`),
        JSON.stringify({ generatedAt: publishedAt, source: item, review, draft: article }, null, 2),
        'utf8',
      );

      seen.add(item.url);
      seen.add(item.id);
      seen.add(slug);
      published++;

      const live = `https://www.smartproto.net/articles/${slug}`;
      try {
        execSync('git add src/data/articles.json', { stdio: 'inherit' });
        execSync(`git commit -m ${JSON.stringify(`feat(gadgets): ${draft.title.slice(0, 60)}`)}`, {
          stdio: 'inherit',
        });
        execSync('git push origin main', { stdio: 'inherit' });
        if (!SKIP_VERCEL) {
          try {
            execSync('npx vercel --prod --yes', { stdio: 'inherit', cwd: root });
          } catch (vercelErr) {
            console.error(
              chalk.yellow(
                `vercel CLI failed (git push may still auto-deploy): ${
                  vercelErr instanceof Error ? vercelErr.message : String(vercelErr)
                }`,
              ),
            );
          }
        }
        liveUrls.push(live);
        console.log(chalk.green(`LIVE ${live}`));
      } catch (gitErr) {
        console.error(chalk.red(`git/deploy: ${gitErr instanceof Error ? gitErr.message : String(gitErr)}`));
      }
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      seen.add(item.url);
      seen.add(item.id);
    }

    if (published < TARGET_NEW && Date.now() - started < MAX_MINUTES * 60_000) {
      console.log(chalk.gray(`Sleeping ${INTERVAL_MS / 1000}s until next tick...`));
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
    }
  }

  console.log(chalk.bold.green(`\nDONE published=${published}`));
  for (const u of liveUrls) console.log(chalk.green(`  ${u}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
