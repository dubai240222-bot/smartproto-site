/**
 * USER BURST MODE — ~1 hour high-cadence publisher.
 * - Every ~60s: short news item (RU blurb + image)
 * - Every ~3 min: fuller article
 * - Skip Scout gate. Real RSS only. Git push each publish.
 */
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { fetchRssFeed, RssItem } from '../src/lib/collectors/rss';
import { extractArticleImage } from '../src/lib/collectors/image-extractor';
import { getOpenRouterClient, clampText, parseJsonObject } from '../src/lib/ai/shared';

function loadEnvFiles(): void {
  const root = process.cwd();
  dotenv.config({ path: path.resolve(root, '.env.local'), override: true, quiet: true });
  dotenv.config({ path: path.resolve(root, '.env'), quiet: true });
}

interface JournalEntry {
  id: string;
  url: string;
  title: string;
  processedAt: string;
  status: 'published' | 'rejected' | 'error';
  reason?: string;
  slug?: string;
  kind?: 'news' | 'article';
}

interface JournalData {
  processedUrls: string[];
  processedIds: string[];
  entries: JournalEntry[];
}

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

interface DraftResult {
  title: string;
  text: string;
  tags: string[];
}

const SOURCES: [string, string][] = [
  ['New Atlas', 'https://newatlas.com/index.rss'],
  ['Yanko Design', 'https://www.yankodesign.com/feed/'],
  ['The Verge', 'https://www.theverge.com/rss/index.xml'],
  ['TechCrunch', 'https://techcrunch.com/feed/'],
  ['Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index'],
  ['Hackaday', 'https://hackaday.com/blog/feed/'],
  ['Kickstarter', 'https://www.kickstarter.com/blog.atom'],
];

const BURST_HOURS = Number(process.env.BURST_HOURS || '1');
const INTERVAL_MS = 60_000;
const ARTICLE_EVERY_N = 3; // every 3rd tick = fuller article
const MAX_TOTAL = Number(process.env.BURST_MAX_TOTAL || '50');
const MODEL = process.env.OPENROUTER_EDITOR_MODEL ?? 'google/gemini-2.5-flash-lite';

function tagsToCategory(tags: string[]): string {
  const topics = tags
    .map((t) => t.trim().replace(/^#/, '').toLowerCase())
    .filter(Boolean)
    .filter(
      (t) =>
        !t.startsWith('бренд-') &&
        !t.startsWith('человек-') &&
        !t.startsWith('стиль-') &&
        !t.startsWith('бренд:') &&
        !t.startsWith('человек:') &&
        !t.startsWith('стиль:'),
    )
    .slice(0, 2)
    .map((t) => t.replace(/-/g, ' ').toUpperCase());
  return topics.length > 0 ? topics.join(' / ') : 'ГАДЖЕТЫ';
}

function isTestOrDemo(item: { id: string; url: string }): boolean {
  const lowerId = (item.id || '').toLowerCase();
  const lowerUrl = (item.url || '').toLowerCase();
  if (lowerId === 'demo-good' || lowerUrl.includes('example.com')) return true;
  if (lowerId.includes('test') || lowerId.includes('demo') || lowerId.includes('mock')) return true;
  if (lowerUrl.includes('/test') || lowerUrl.includes('demo') || lowerUrl.includes('mock')) return true;
  return false;
}

function looksGadgetRelevant(item: RssItem): boolean {
  const hay = `${item.title} ${item.text} ${item.url}`.toLowerCase();
  const bad = [
    'opinion:',
    'how to watch',
    'stock market',
    'earnings',
    'layoffs',
    'lawsuit',
    'politics',
    'election',
    // Hard editorial reject: culture / nature / celebs / writers — no product.
    'wildlife',
    'elephant',
    'natural history',
    'museum',
    'architecture',
    'skyscraper',
    'mossy',
    'billboard hot 100',
    'singer',
    'rapper',
    'memoir',
    'author',
    'writer',
    'grief',
    'spider-man',
    'spiderman',
    'box office',
    'celebrity',
    'celebrities',
    'governor',
    'trump ',
    'film leak',
    'movie leak',
    '/entertainment/',
    '/policy/',
    '/architecture/',
    'shopping guide',
    'back-to-school',
  ];
  if (bad.some((b) => hay.includes(b))) return false;
  const good = [
    'gadget',
    'device',
    'wearable',
    'projector',
    'keyboard',
    'headphone',
    'earbuds',
    'toothbrush',
    'power bank',
    'tablet',
    'phone',
    'camera',
    'smart home',
    'smart glass',
    'translator',
    'kickstarter',
    'indiegogo',
    'dock',
    'ssd',
    'charger',
    'pillow',
    'roaster',
    'skillet',
    'frying',
    'mp3',
    'night vision',
    'security key',
    'e-ink',
    'eink',
    'ai ',
  ];
  // Prefer clear product signals; still allow design/gadget feeds without keyword hit.
  if (good.some((g) => hay.includes(g))) return true;
  const source = (item.sourceName || '').toLowerCase();
  if (source.includes('yanko') || source.includes('new atlas') || source.includes('hackaday')) {
    // Secondary reject for pure culture/architecture titles on mixed feeds.
    if (/\b(tower|museum|building|architecture|wildlife|nature|author|memoir|singer|album|film|movie)\b/.test(hay)) {
      return false;
    }
    return true;
  }
  return false;
}

function transliterateCyrillic(text: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  return text.toLowerCase().split('').map((c) => map[c] || c).join('');
}

function generateSlug(title: string, englishTitle?: string): string {
  const source = englishTitle || transliterateCyrillic(title);
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return slug || `article-${Date.now()}`;
}

function estimateReadTime(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 150));
  return `${minutes} мин`;
}

function generateSummary(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 200) return trimmed;
  const periodIndex = trimmed.indexOf('.', 50);
  if (periodIndex > 0 && periodIndex <= 200) {
    return trimmed.slice(0, periodIndex + 1);
  }
  return `${trimmed.slice(0, 197)}...`;
}

async function loadExistingUrlsAndIds(journalPath: string, articlesPath: string) {
  const urls = new Set<string>();
  const ids = new Set<string>();
  let journal: JournalData = { processedUrls: [], processedIds: [], entries: [] };

  try {
    const articlesRaw = await readFile(articlesPath, 'utf8');
    const articles = JSON.parse(articlesRaw.replace(/^\uFEFF/, ''));
    if (Array.isArray(articles)) {
      for (const a of articles) {
        if (a.sourceUrl) urls.add(a.sourceUrl);
        if (a.url) urls.add(a.url);
        if (a.id) ids.add(String(a.id));
        if (a.slug) ids.add(String(a.slug));
      }
    }
  } catch {}

  try {
    const journalRaw = await readFile(journalPath, 'utf8');
    const parsed = JSON.parse(journalRaw);
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.processedUrls)) {
        parsed.processedUrls.forEach((u: string) => urls.add(u));
        journal.processedUrls = parsed.processedUrls;
      }
      if (Array.isArray(parsed.processedIds)) {
        parsed.processedIds.forEach((i: string) => ids.add(i));
        journal.processedIds = parsed.processedIds;
      }
      if (Array.isArray(parsed.entries)) journal.entries = parsed.entries;
    }
  } catch {}

  return { urls, ids, journal };
}

async function fastRewrite(item: RssItem, kind: 'news' | 'article'): Promise<DraftResult> {
  const client = getOpenRouterClient();
  const wordTarget =
    kind === 'news'
      ? '40–70 слов. Короткий news-blurb: hook + что это + зачем интересно. 1–2 абзаца.'
      : '120–200 слов. Полнее: hook, что это, 3–5 benefit-строк с «- », цена/статус если есть, ограничение если есть.';

  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    max_tokens: kind === 'news' ? 350 : 700,
    messages: [
      {
        role: 'system',
        content: [
          'Ты восторженный блогер / TikTok-ревьюер SmartProto ТОЛЬКО про умные полезные гаджеты.',
          'Русский. Голос: «дожили до времени…», «вчера казалось фантастикой — сегодня можно купить».',
          'Хвали РЕАЛЬНЫЕ фичи эмоционально, без выдуманных спеков. JSON без markdown.',
          'Жёсткий reject (title="REJECT", text="off-topic", tags=["#reject"]): природа/wildlife, музеи/архитектура,',
          'celebrities/певцы, writers/книги, кино/музыка/политика/культура без покупаемого продукта.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          `Сделай ${kind === 'news' ? 'короткую новость' : 'статью-карточку'} ТОЛЬКО если есть конкретный покупаемый гаджет/товар.`,
          'Если тема off-topic (писатели, певцы, природа, музеи, кино, политика без продукта) — верни REJECT JSON.',
          'Верни СТРОГО JSON: {"title": string, "text": string, "tags": string[]}',
          'title: до 90 символов, на русском, вау + польза товара.',
          `text: ${wordTarget} Голос блогера, не сухой перевод.`,
          'tags: 5–8 штук, включая #новинка #полезно; по смыслу #гаджет #тикток; бренд как #бренд-X если известен.',
          'В конце text добавь: Источник: <имя источника>.',
          '',
          `Источник: ${item.sourceName}`,
          `URL: ${item.url}`,
          `Title EN: ${item.title}`,
          '',
          'Текст источника:',
          clampText(item.text || item.title, 4500),
        ].join('\n'),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  const rawText = typeof content === 'string' ? content.trim() : '';
  if (!rawText) throw new Error('Empty rewrite response');

  const parsed = parseJsonObject<DraftResult>(rawText);
  if (!parsed.title?.trim() || !parsed.text?.trim() || !Array.isArray(parsed.tags) || parsed.tags.length === 0) {
    throw new Error('Invalid rewrite JSON shape');
  }
  return {
    title: parsed.title.trim(),
    text: parsed.text.trim(),
    tags: parsed.tags.map((t) => String(t).trim()).filter(Boolean),
  };
}

function fallbackRewrite(item: RssItem, kind: 'news' | 'article'): DraftResult {
  const snippet = (item.text || item.title).replace(/\s+/g, ' ').trim().slice(0, kind === 'news' ? 280 : 700);
  const title = item.title.length > 90 ? `${item.title.slice(0, 87)}…` : item.title;
  const text =
    kind === 'news'
      ? `${snippet}\n\nИсточник: ${item.sourceName}.`
      : `${snippet}\n\nКоротко: новая заметка из ${item.sourceName} про гаджеты/технологии. Подробности — в оригинале.\n\nИсточник: ${item.sourceName}.`;
  return {
    title,
    text,
    tags: ['#гаджет', '#новинка', '#полезно', '#тикток', `#источник-${item.sourceName.replace(/\s+/g, '-')}`],
  };
}

async function collectCandidates(existingUrls: Set<string>, existingIds: Set<string>): Promise<RssItem[]> {
  const candidates: RssItem[] = [];
  for (const [name, url] of SOURCES) {
    try {
      const items = await fetchRssFeed(url, { limit: 15, sourceName: name });
      for (const item of items) {
        if (!item.url || !item.title) continue;
        if (existingUrls.has(item.url) || existingIds.has(item.id)) continue;
        if (isTestOrDemo(item)) continue;
        if (!looksGadgetRelevant(item)) continue;
        candidates.push(item);
      }
      console.log(chalk.gray(`  ${name}: ${items.length} items`));
    } catch (err) {
      console.error(chalk.yellow(`  ${name} failed: ${err instanceof Error ? err.message : String(err)}`));
    }
  }
  // Prefer items with images; shuffle lightly by source diversity
  candidates.sort((a, b) => {
    const ai = a.imageUrl ? 0 : 1;
    const bi = b.imageUrl ? 0 : 1;
    if (ai !== bi) return ai - bi;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
  return candidates;
}

async function main(): Promise<void> {
  loadEnvFiles();
  process.env.SMARTPROTO_FACTORY_ENABLED = 'true';

  const root = process.cwd();
  const journalPath = path.resolve(root, 'data', 'factory-journal.json');
  const articlesPath = path.resolve(root, 'src', 'data', 'articles.json');
  const draftsDir = path.resolve(root, 'drafts');
  const progressPath = path.resolve(root, 'data', 'burst-progress.json');

  const { urls: existingUrls, ids: existingIds, journal } = await loadExistingUrlsAndIds(journalPath, articlesPath);
  const articlesContent = await readFile(articlesPath, 'utf8');
  const articles: Article[] = JSON.parse(articlesContent.replace(/^\uFEFF/, ''));

  const startTime = Date.now();
  const maxDurationMs = BURST_HOURS * 3600 * 1000;
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  let newsCount = 0;
  let articleCount = 0;
  let tick = 0;
  let consecutiveErrors = 0;
  let stopReason = 'time/limit complete';
  const lastUrls: string[] = [];
  let queue: RssItem[] = [];

  console.log(chalk.bold.green('=== SMARTPROTO BURST HOUR ==='));
  console.log(`Start: ${new Date().toISOString()}`);
  console.log(`Cadence: news every ${INTERVAL_MS / 1000}s; fuller article every ${ARTICLE_EVERY_N} ticks`);
  console.log(`Stop: ${BURST_HOURS}h OR ${MAX_TOTAL} items`);

  while (true) {
    const elapsed = Date.now() - startTime;
    const total = newsCount + articleCount;
    if (elapsed >= maxDurationMs) {
      stopReason = '60 minute limit';
      break;
    }
    if (total >= MAX_TOTAL) {
      stopReason = `max items (${MAX_TOTAL})`;
      break;
    }
    if (consecutiveErrors >= 5) {
      stopReason = 'too many consecutive errors';
      break;
    }

    tick++;
    const kind: 'news' | 'article' = tick % ARTICLE_EVERY_N === 0 ? 'article' : 'news';
    const tickStart = Date.now();
    console.log(chalk.bold(`\n===== Tick ${tick} (${kind}) | ${newsCount} news / ${articleCount} articles | ${Math.round(elapsed / 1000)}s =====`));

    if (queue.length < 3) {
      console.log('Refreshing RSS queue...');
      const fresh = await collectCandidates(existingUrls, existingIds);
      // Dedupe against queue
      const qUrls = new Set(queue.map((q) => q.url));
      for (const item of fresh) {
        if (!qUrls.has(item.url)) queue.push(item);
      }
      console.log(`Queue size: ${queue.length}`);
    }

    if (queue.length === 0) {
      console.log(chalk.yellow('No candidates — waiting 30s and retrying RSS...'));
      consecutiveErrors++;
      await sleep(30_000);
      continue;
    }

    const item = queue.shift()!;
    console.log(chalk.cyan(`[${item.sourceName}] ${item.title}`));
    console.log(item.url);

    try {
      let draft: DraftResult;
      try {
        draft = await fastRewrite(item, kind);
      } catch (rewriteErr) {
        console.log(chalk.yellow(`Rewrite AI failed, using fallback: ${rewriteErr instanceof Error ? rewriteErr.message : String(rewriteErr)}`));
        draft = fallbackRewrite(item, kind);
      }

      if (
        draft.title.trim().toUpperCase() === 'REJECT' ||
        draft.tags.some((t) => t.toLowerCase() === '#reject') ||
        draft.text.trim().toLowerCase() === 'off-topic'
      ) {
        console.log(chalk.yellow('Rejected by editor hard-gate (culture/nature/non-gadget).'));
        journal.processedUrls.push(item.url);
        journal.processedIds.push(item.id);
        journal.entries.push({
          id: item.id,
          url: item.url,
          title: item.title,
          processedAt: new Date().toISOString(),
          status: 'rejected',
          reason: 'editor hard-reject: non-gadget/culture',
          kind,
        });
        existingUrls.add(item.url);
        existingIds.add(item.id);
        await writeFile(journalPath, JSON.stringify(journal, null, 2) + '\n', 'utf8');
        consecutiveErrors = 0;
        const spent = Date.now() - tickStart;
        await sleep(Math.max(5_000, INTERVAL_MS - spent));
        continue;
      }

      let imageUrl = item.imageUrl;
      if (!imageUrl || kind === 'article') {
        try {
          const extracted = await extractArticleImage(item.url, draft.title);
          if (extracted) imageUrl = extracted;
        } catch {
          // keep feed image
        }
      }

      const slug = generateSlug(draft.title, item.title);
      if (existingIds.has(slug)) {
        existingUrls.add(item.url);
        existingIds.add(item.id);
        journal.processedUrls.push(item.url);
        journal.processedIds.push(item.id);
        journal.entries.push({
          id: item.id,
          url: item.url,
          title: item.title,
          processedAt: new Date().toISOString(),
          status: 'rejected',
          reason: 'slug collision',
        });
        await writeFile(journalPath, JSON.stringify(journal, null, 2) + '\n', 'utf8');
        console.log(chalk.yellow('Slug collision — skip'));
        continue;
      }

      const publishedAt = new Date().toISOString();
      const newArticle: Article = {
        id: slug,
        slug,
        title: draft.title,
        category: tagsToCategory(draft.tags),
        tags: draft.tags,
        summary: generateSummary(draft.text),
        content: draft.text,
        sourceUrl: item.url,
        publishedAt,
        readTime: estimateReadTime(draft.text),
        ...(imageUrl ? { imageUrl } : {}),
      };

      await mkdir(draftsDir, { recursive: true });
      await writeFile(
        path.join(draftsDir, `${Date.now()}-${slug}.json`),
        JSON.stringify({ generatedAt: publishedAt, kind, source: item.sourceName, article: item, draft: { ...draft, imageUrl } }, null, 2),
        'utf8',
      );

      articles.unshift(newArticle);
      await writeFile(articlesPath, JSON.stringify(articles, null, 2) + '\n', 'utf8');

      existingUrls.add(item.url);
      existingIds.add(item.id);
      existingIds.add(slug);
      journal.processedUrls.push(item.url);
      journal.processedIds.push(item.id);
      journal.entries.push({
        id: item.id,
        url: item.url,
        title: draft.title,
        processedAt: publishedAt,
        status: 'published',
        slug,
        kind,
      });
      await writeFile(journalPath, JSON.stringify(journal, null, 2) + '\n', 'utf8');

      if (kind === 'news') newsCount++;
      else articleCount++;

      const liveUrl = `https://www.smartproto.net/articles/${slug}`;
      lastUrls.push(liveUrl);
      console.log(chalk.green.bold(`PUBLISHED ${kind}: ${draft.title}`));
      console.log(chalk.green(liveUrl));

      try {
        execSync('git add src/data/articles.json data/factory-journal.json', { stdio: 'inherit' });
        const msg = kind === 'article'
          ? `feat(burst): article — ${draft.title.slice(0, 60)}`
          : `feat(burst): news — ${draft.title.slice(0, 60)}`;
        execSync(`git commit -m ${JSON.stringify(msg)}`, { stdio: 'inherit' });
        execSync('git push origin main', { stdio: 'inherit' });
        console.log(chalk.green('Pushed to origin/main'));
        execSync('npx vercel --prod --yes', { stdio: 'inherit' });
        console.log(chalk.green('Deployed to Vercel production'));
      } catch (gitErr) {
        console.error(chalk.red(`Git/deploy failed: ${gitErr instanceof Error ? gitErr.message : String(gitErr)}`));
      }

      consecutiveErrors = 0;

      await writeFile(
        progressPath,
        JSON.stringify(
          {
            newsCount,
            articleCount,
            total: newsCount + articleCount,
            lastUrls: lastUrls.slice(-8),
            elapsedSec: Math.round((Date.now() - startTime) / 1000),
            updatedAt: new Date().toISOString(),
          },
          null,
          2,
        ) + '\n',
        'utf8',
      );
    } catch (err) {
      consecutiveErrors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`Tick error: ${msg}`));
      existingUrls.add(item.url);
      existingIds.add(item.id);
      journal.processedUrls.push(item.url);
      journal.processedIds.push(item.id);
      journal.entries.push({
        id: item.id,
        url: item.url,
        title: item.title,
        processedAt: new Date().toISOString(),
        status: 'error',
        reason: msg,
        kind,
      });
      await writeFile(journalPath, JSON.stringify(journal, null, 2) + '\n', 'utf8');
    }

    const spent = Date.now() - tickStart;
    const wait = Math.max(0, INTERVAL_MS - spent);
    const remaining = maxDurationMs - (Date.now() - startTime);
    if (newsCount + articleCount >= MAX_TOTAL || remaining <= 0) continue;
    console.log(chalk.gray(`Sleeping ${Math.round(wait / 1000)}s until next tick...`));
    await sleep(Math.min(wait, remaining));
  }

  console.log('\n' + chalk.bold('=== BURST SUMMARY ==='));
  console.log(`Stop reason: ${stopReason}`);
  console.log(`News: ${newsCount}`);
  console.log(`Articles: ${articleCount}`);
  console.log(`Total: ${newsCount + articleCount}`);
  console.log(`Elapsed: ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
  console.log('Last live URLs:');
  lastUrls.slice(-10).forEach((u) => console.log(`  ${u}`));
  console.log(chalk.yellow('\nREMINDER: Set SMARTPROTO_FACTORY_ENABLED=false when burst ends.'));

  await writeFile(
    progressPath,
    JSON.stringify(
      {
        done: true,
        stopReason,
        newsCount,
        articleCount,
        total: newsCount + articleCount,
        lastUrls: lastUrls.slice(-15),
        elapsedSec: Math.round((Date.now() - startTime) / 1000),
        updatedAt: new Date().toISOString(),
        reminder: 'SMARTPROTO_FACTORY_ENABLED=false',
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
}

main().catch((err) => {
  console.error(chalk.red(`Burst failed: ${err instanceof Error ? err.message : String(err)}`));
  process.exitCode = 1;
});
