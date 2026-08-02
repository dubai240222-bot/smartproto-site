/**
 * FAST one-shot: fetch RSS → hard filter → blogger rewrite → publish 6–8 gadgets.
 * Skip Scout. No sleep loop.
 */
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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
  ['Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index'],
];

const TARGET = 7;
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

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function rewriteBlogger(item: RssItem, openerHint: string): Promise<{ title: string; text: string; tags: string[] }> {
  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.55,
    max_tokens: 900,
    messages: [
      {
        role: 'system',
        content: [
          'Ты уверенный product-блогер SmartProto ТОЛЬКО про умные полезные гаджеты, которые можно купить или предзаказать.',
          'Спокойная уверенность, желание узнать больше и купить ASAP; без мелодрамы и эмодзи.',
          'Уникальный хук под КОНКРЕТНЫЙ продукт. ЗАПРЕЩЕНО: клише «будущее уже здесь» / «вчера это была фантастика».',
          'Хвали РЕАЛЬНЫЕ фичи из источника, без выдуманных спеков. JSON без markdown.',
          'Reject: title=REJECT, text=off-topic, tags=["#reject"] для культуры/природы/писателей/политики/авто без гаджета/непокупаемого.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          'Сделай русскую карточку гаджета. JSON: {"title":string,"text":string,"tags":string[]}',
          'title до 90 символов. text 150–200 слов, голос блогера.',
          `Стартуй текст НЕ шаблонно. Вариация хука: ${openerHint}`,
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

const OPENERS = [
  'вопрос к читателю про боль/сценарий',
  'конкретная фича продукта сразу в первой фразе',
  'короткое удивление ценой или формой',
  'сценарий «утром / на работе / дома»',
  'сравнение со старым способом без гаджета',
  'прямой совет «возьми, если…»',
  'деталь дизайна как крючок',
];

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

  console.log(chalk.bold.green(`=== FAST GADGETS BATCH target=${TARGET} ===`));

  const candidates: RssItem[] = [];
  for (const [name, url] of SOURCES) {
    try {
      const items = await fetchRssFeed(url, { limit: 20, sourceName: name });
      let added = 0;
      for (const item of items) {
        if (!item.url || !item.title) continue;
        if (seen.has(item.url) || seen.has(item.id) || seen.has(slugify(item.title))) continue;
        if (!looksBuyableGadget(item.title, item.text || '', name)) continue;
        const gate = hardRejectTopic(item.title, item.text || '');
        if (gate.reject && !gate.reason.includes('нет явного покупаемого')) continue;
        // Extra reject: cars / culture / architecture leftovers
        if (/\b(suv|automobile|museum|skyscraper|wildlife|memoir|singer|album|election|trump)\b/i.test(`${item.title} ${item.text}`)) {
          continue;
        }
        candidates.push(item);
        added++;
      }
      console.log(chalk.gray(`  ${name}: +${added} candidates`));
    } catch (e) {
      console.log(chalk.yellow(`  ${name}: ${e instanceof Error ? e.message : String(e)}`));
    }
  }

  candidates.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  // de-dupe by slug
  const uniq: RssItem[] = [];
  const seenSlugs = new Set<string>();
  for (const c of candidates) {
    const s = slugify(c.title);
    if (seenSlugs.has(s) || seen.has(s)) continue;
    seenSlugs.add(s);
    uniq.push(c);
  }

  console.log(chalk.cyan(`Unique candidates: ${uniq.length}`));
  const publishedSlugs: string[] = [];

  for (let i = 0; i < uniq.length && publishedSlugs.length < TARGET; i++) {
    const item = uniq[i];
    console.log(chalk.bold(`\n[${publishedSlugs.length + 1}/${TARGET}] ${item.sourceName}: ${item.title}`));
    try {
      const draft = await rewriteBlogger(item, OPENERS[i % OPENERS.length]);
      if (draft.title.toUpperCase() === 'REJECT' || draft.tags.includes('#reject')) {
        console.log(chalk.yellow('  editor reject'));
        seen.add(item.url);
        continue;
      }
      if (/дожил(?:и|а|о)?|вчера казалось фантастикой|вчера фантастика/i.test(draft.title + draft.text)) {
        console.log(chalk.yellow('  banned stock cliché — skip'));
        continue;
      }
      const wc = wordCount(draft.text);
      if (wc < 110) {
        console.log(chalk.yellow(`  too short (${wc} words) — skip`));
        continue;
      }

      let imageUrl = item.imageUrl;
      try {
        if (!imageUrl) imageUrl = (await extractArticleImage(item.url)) || undefined;
      } catch {
        /* ignore */
      }
      if (!imageUrl) {
        console.log(chalk.yellow('  no imageUrl — skip'));
        continue;
      }

      const slug = slugify(item.title);
      if (seen.has(slug) || articles.some((a) => a.slug === slug || a.sourceUrl === item.url)) {
        console.log(chalk.yellow('  duplicate — skip'));
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
        readTime: `${Math.max(1, Math.ceil(wc / 150))} мин`,
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
      publishedSlugs.push(slug);
      console.log(chalk.green(`  OK ${slug} (${wc} words)`));
      console.log(chalk.green(`  https://www.smartproto.net/articles/${slug}`));
    } catch (err) {
      console.error(chalk.red(`  ${err instanceof Error ? err.message : String(err)}`));
    }
  }

  console.log(chalk.bold.green(`\nDONE published=${publishedSlugs.length}`));
  for (const s of publishedSlugs) {
    console.log(`https://www.smartproto.net/articles/${s}`);
  }
  if (publishedSlugs.length < 5) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
