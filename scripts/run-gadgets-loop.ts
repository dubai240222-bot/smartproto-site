/**
 * Gadgets-only publish loop (~20 min): RSS → hard reject → blogger rewrite → articles.json → git push → vercel.
 */
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { fetchRssFeed, RssItem } from '../src/lib/collectors/rss';
import { extractArticleImage } from '../src/lib/collectors/image-extractor';
import { getOpenRouterClient, clampText, parseJsonObject } from '../src/lib/ai/shared';
import { hardRejectTopic, looksBuyableGadget } from '../src/lib/ai/hard-reject';

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

const INTERVAL_MS = 55_000;
const MAX_MINUTES = Number(process.env.GADGETS_MAX_MINUTES || 25);
const TARGET_NEW = Number(process.env.GADGETS_TARGET_NEW || 12);
const MODEL = process.env.OPENROUTER_EDITOR_MODEL ?? 'google/gemini-2.5-flash-lite';

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

async function rewriteBlogger(item: RssItem): Promise<{ title: string; text: string; tags: string[] }> {
  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.45,
    max_tokens: 700,
    messages: [
      {
        role: 'system',
        content: [
          'Ты редактор SmartProto — спокойные взрослые product-карточки ТОЛЬКО про умные полезные гаджеты.',
          'Тон: ясный, компетентный, без патоса и без игривости. Интерес купить — через пользу, не хайп.',
          'ЗАПРЕЩЕНО: клише «будущее уже здесь» / «вчера это казалось невозможным»;',
          'без «вау», guys/ребята, эмодзи, патоса и TikTok-сленга.',
          'Хвали РЕАЛЬНЫЕ фичи, без выдуманных спеков. JSON без markdown.',
          'Reject: title=REJECT, text=off-topic, tags=["#reject"] для культуры/природы/писателей/политики без товара.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          'Сделай русскую карточку гаджета. JSON: {"title":string,"text":string,"tags":string[]}',
          'title до 90 символов, ясный через пользу. text 150–200 слов, спокойное product-объяснение.',
          'tags 5–8 с #новинка #полезно #гаджет.',
          'В конце text: Источник: <имя>.',
          '',
          `Источник: ${item.sourceName}`,
          `URL: ${item.url}`,
          `Title EN: ${item.title}`,
          clampText(item.text || item.title, 4500),
        ].join('\n'),
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('empty rewrite');
  const parsed = parseJsonObject<{ title: string; text: string; tags: string[] }>(raw);
  if (!parsed.title?.trim() || !parsed.text?.trim() || !Array.isArray(parsed.tags)) {
    throw new Error('bad rewrite shape');
  }
  return {
    title: parsed.title.trim(),
    text: parsed.text.trim(),
    tags: parsed.tags.map((t) => String(t).trim()).filter(Boolean),
  };
}

async function main() {
  process.env.SMARTPROTO_FACTORY_ENABLED = 'true';
  const root = process.cwd();
  const articlesPath = path.resolve(root, 'src', 'data', 'articles.json');
  const draftsDir = path.resolve(root, 'drafts');
  await mkdir(draftsDir, { recursive: true });

  let articles: Article[] = JSON.parse((await readFile(articlesPath, 'utf8')).replace(/^\uFEFF/, ''));
  const seen = new Set<string>(articles.flatMap((a) => [a.id, a.slug, a.sourceUrl].filter(Boolean) as string[]));

  const started = Date.now();
  let published = 0;
  let tick = 0;

  console.log(chalk.bold.green('=== GADGETS LOOP 20m ==='));

  while (Date.now() - started < MAX_MINUTES * 60_000 && published < TARGET_NEW) {
    tick++;
    const elapsedMin = Math.round((Date.now() - started) / 60000);
    console.log(chalk.bold(`\n--- tick ${tick} | +${published} new | ${elapsedMin}m ---`));

    let candidates: RssItem[] = [];
    for (const [name, url] of SOURCES) {
      try {
        const items = await fetchRssFeed(url, { limit: 12, sourceName: name });
        for (const item of items) {
          if (!item.url || !item.title) continue;
          if (seen.has(item.url) || seen.has(item.id) || seen.has(slugify(item.title))) continue;
          if (!looksBuyableGadget(item.title, item.text || '', name)) continue;
          const gate = hardRejectTopic(item.title, item.text || '');
          if (gate.reject && !gate.reason.includes('нет явного покупаемого')) continue;
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
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
      continue;
    }

    console.log(chalk.cyan(`[${item.sourceName}] ${item.title}`));
    try {
      const draft = await rewriteBlogger(item);
      if (draft.title.toUpperCase() === 'REJECT' || draft.tags.includes('#reject')) {
        console.log(chalk.yellow('Editor reject'));
        seen.add(item.url);
        seen.add(item.id);
        await new Promise((r) => setTimeout(r, 10_000));
        continue;
      }

      let imageUrl = item.imageUrl;
      try {
        if (!imageUrl) imageUrl = (await extractArticleImage(item.url)) || undefined;
      } catch {}

      const slug = slugify(item.title);
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
        readTime: '1 мин',
        imageUrl,
      };

      articles = [article, ...articles.filter((a) => a.id !== slug && a.slug !== slug)];
      await writeFile(articlesPath, JSON.stringify(articles, null, 2) + '\n', 'utf8');
      await writeFile(
        path.join(draftsDir, `${Date.now()}-${slug}.json`),
        JSON.stringify({ generatedAt: publishedAt, source: item, draft: article }, null, 2),
        'utf8',
      );

      seen.add(item.url);
      seen.add(item.id);
      seen.add(slug);
      published++;

      try {
        execSync('git add src/data/articles.json', { stdio: 'inherit' });
        execSync(`git commit -m ${JSON.stringify(`feat(gadgets): ${draft.title.slice(0, 60)}`)}`, {
          stdio: 'inherit',
        });
        execSync('git push origin main', { stdio: 'inherit' });
        execSync('npx vercel --prod --yes', { stdio: 'inherit' });
        console.log(chalk.green(`LIVE https://www.smartproto.net/articles/${slug}`));
      } catch (gitErr) {
        console.error(chalk.red(`git/deploy: ${gitErr instanceof Error ? gitErr.message : String(gitErr)}`));
      }
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }

    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }

  console.log(chalk.bold.green(`DONE published=${published}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
