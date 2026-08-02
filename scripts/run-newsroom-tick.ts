/**
 * SP-A-031-R2 — One newsroom tick (no multi-hour loops).
 *
 * Order per tick (max 1 publish total — bounds AI spend):
 *   1) China Collector → Qwen → Editor (if a good candidate exists)
 *   2) else RSS → hardReject → Scout → Reviewer → Editor
 *
 * Git commit/push is left to GitHub Actions (or the operator).
 * TEST cadence: GHA cron every 3 minutes.
 */
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { fetchRssFeed, type RssItem } from '../src/lib/collectors/rss';
import { extractArticleImage } from '../src/lib/collectors/image-extractor';
import { scoutArticle, SCOUT_SCORE_THRESHOLD } from '../src/lib/ai/scout';
import { reviewArticle } from '../src/lib/ai/reviewer';
import { writeDraft } from '../src/lib/ai/editor';
import { hardRejectTopic, looksBuyableGadget } from '../src/lib/ai/hard-reject';
import { filterRemovedArticles, isRemovedSlug } from '../src/lib/removed-slugs';
import { stampAuthorForPipeline } from '../src/lib/authors';
import {
  CHINA_CATEGORY,
  CHINA_SOURCE_TAG,
  CHINA_TAG,
  dossierPublishable,
} from '../src/lib/ai/china-publish-gate';

function loadEnvFiles(): void {
  const root = process.cwd();
  dotenv.config({ path: path.resolve(root, '.env.local'), override: true, quiet: true });
  dotenv.config({ path: path.resolve(root, '.env'), quiet: true });
}

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

const CHINA_MAX_QWEN = 3;

interface JournalEntry {
  id: string;
  url: string;
  title: string;
  processedAt: string;
  status: 'published' | 'rejected' | 'error';
  scoutScore?: number;
  reason?: string;
  slug?: string;
  channel?: 'china-qwen' | 'rss';
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
  tags?: string[];
  summary: string;
  content: string;
  sourceUrl: string;
  publishedAt: string;
  readTime: string;
  imageUrl?: string;
  author?: string;
  authorDesk?: string;
  agentId?: string;
}

function parseArgs(argv: string[]) {
  return { force: argv.includes('--force'), dryRun: argv.includes('--dry-run') };
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/, '') || `article-${Date.now()}`
  );
}

function summaryOf(text: string): string {
  const t = text.trim();
  if (t.length <= 200) return t;
  const i = t.indexOf('.', 50);
  if (i > 0 && i <= 200) return t.slice(0, i + 1);
  return `${t.slice(0, 197)}...`;
}

function estimateReadTime(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 150))} мин`;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function loadState(journalPath: string, articlesPath: string) {
  const urls = new Set<string>();
  const ids = new Set<string>();
  let journal: JournalData = { processedUrls: [], processedIds: [], entries: [] };
  let articles: Article[] = [];

  try {
    const raw = await readFile(articlesPath, 'utf8');
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
    if (Array.isArray(parsed)) {
      articles = parsed as Article[];
      for (const a of articles) {
        if (a.sourceUrl) urls.add(a.sourceUrl);
        if (a.id) ids.add(String(a.id));
        if (a.slug) ids.add(String(a.slug));
      }
    }
  } catch {
    /* empty */
  }

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
  } catch {
    /* empty */
  }

  return { urls, ids, journal, articles };
}

async function markRejected(
  journal: JournalData,
  journalPath: string,
  item: RssItem,
  reason: string,
  scoutScore?: number,
): Promise<void> {
  if (!journal.processedUrls.includes(item.url)) journal.processedUrls.push(item.url);
  if (!journal.processedIds.includes(item.id)) journal.processedIds.push(item.id);
  journal.entries.push({
    id: item.id,
    url: item.url,
    title: item.title,
    processedAt: new Date().toISOString(),
    status: 'rejected',
    scoutScore,
    reason,
    channel: 'rss',
  });
  await writeFile(journalPath, JSON.stringify(journal, null, 2) + '\n', 'utf8');
}

async function tryChinaPublishOnce(opts: {
  dryRun: boolean;
  articlesPath: string;
  draftsDir: string;
  journalPath: string;
  urls: Set<string>;
  ids: Set<string>;
  journal: JournalData;
  articles: Article[];
}): Promise<boolean> {
  process.env.CHINA_DEPARTMENT_ENABLED = 'true';
  process.env.CHINA_ALLOW_RECOMMEND = 'true';

  console.log(chalk.bold('— Channel A: China → Qwen —'));

  const { collectAndFilterChina } = await import('../src/lib/collectors/china-collector');
  const { analyzeChinaCandidate, looksChinaConsumerGadget } = await import(
    '../src/lib/ai/china-analyst'
  );
  const { extractArticlePlainText } = await import('../src/lib/collectors/article-text');

  let filtered;
  try {
    filtered = await collectAndFilterChina({ limitPerSource: 20 });
  } catch (err) {
    console.log(
      chalk.yellow(
        `China collect failed: ${err instanceof Error ? err.message : String(err)} — fall through to RSS.`,
      ),
    );
    return false;
  }

  const consider = filtered
    .filter((x) => x.decision === 'CONSIDER')
    .filter((x) => looksChinaConsumerGadget(x.candidate.title, x.candidate.summary))
    .filter((x) => !opts.urls.has(x.candidate.sourceUrl))
    .sort((a, b) => b.candidate.rawSignals.length - a.candidate.rawSignals.length)
    .slice(0, CHINA_MAX_QWEN)
    .map((x) => x.candidate);

  console.log(`China CONSIDER gadget candidates: ${consider.length} (max Qwen ${CHINA_MAX_QWEN})`);
  if (!consider.length) {
    console.log(chalk.gray('No China/Qwen candidate — fall through to RSS.'));
    return false;
  }

  if (opts.dryRun) {
    console.log(chalk.cyan(`Dry-run China pick: ${consider[0].title.slice(0, 80)}`));
    return true;
  }

  for (const c of consider) {
    console.log(chalk.cyan(`China pick: [${c.sourceName}] ${c.title.slice(0, 90)}`));
    console.log(chalk.gray(c.sourceUrl));

    let sourceBody = c.summary || '';
    let pageImage = c.imageUrl || '';
    try {
      const page = await extractArticlePlainText(c.sourceUrl, { maxChars: 3200 });
      if (page.text.length > sourceBody.length) sourceBody = page.text;
      if (page.imageUrl) pageImage = page.imageUrl;
    } catch {
      /* RSS summary only */
    }

    const enriched = {
      ...c,
      summary: sourceBody.slice(0, 4000),
      imageUrl: pageImage || c.imageUrl,
    };

    let dossier;
    try {
      dossier = await analyzeChinaCandidate(enriched);
    } catch (err) {
      console.log(chalk.yellow(`Qwen fail: ${err instanceof Error ? err.message : String(err)}`));
      continue;
    }

    const gate = dossierPublishable(dossier, sourceBody);
    if (!gate.ok) {
      console.log(chalk.yellow(`China skip: ${gate.reason}`));
      continue;
    }
    console.log(chalk.green(`China pass: ${gate.reason}`));

    const articleData = {
      title: dossier.translatedTitle || dossier.productName || c.title,
      text: [
        dossier.whatItDoes,
        dossier.whyItIsNew,
        dossier.consumerUse,
        dossier.priceOriginal != null
          ? `Цена (источник): ${dossier.priceOriginal} ${dossier.currency || ''}`.trim()
          : '',
        dossier.availability ? `Доступность: ${dossier.availability}` : '',
        dossier.launchDate ? `Дата: ${dossier.launchDate}` : '',
        dossier.prototypeOrSale ? `Статус: ${dossier.prototypeOrSale}` : '',
        dossier.unknownFacts.length ? `Неизвестно: ${dossier.unknownFacts.join('; ')}` : '',
        dossier.warningFlags.length ? `Оговорки: ${dossier.warningFlags.join('; ')}` : '',
        sourceBody.slice(0, 2800),
      ]
        .filter(Boolean)
        .join('\n\n'),
      sourceUrl: dossier.sourceUrl || c.sourceUrl,
      sourceName: c.sourceName,
      imageUrl: dossier.imageUrl || pageImage || c.imageUrl,
    };

    const reviewData = {
      technicalVerdict: 'PASS: China Qwen dossier — buyable consumer gadget candidate',
      productName: dossier.productName,
      manufacturer: dossier.manufacturer,
      evidence: dossier.evidence,
    };

    const framed = {
      ...articleData,
      title: dossier.productName || articleData.title,
      text: [
        `Новый гаджет / устройство (источник: ${c.sourceName}).`,
        `Анонс / новая модель. По данным источника можно купить или оформить предзаказ, если указано в тексте.`,
        articleData.text,
      ].join('\n\n'),
    };

    let draft;
    try {
      draft = await writeDraft(framed, reviewData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/unsupportedClaims/.test(msg)) {
        try {
          draft = await writeDraft(
            {
              ...framed,
              text: `${framed.text}\n\nНе выдумывай характеристики. Нет данных — пиши «не указано в источнике». Независимых тестов нет.`,
            },
            {
              ...reviewData,
              technicalVerdict:
                'PASS with limits: sparse China source — mark unknowns, no unsupported claims',
            },
          );
        } catch (err2) {
          console.log(
            chalk.yellow(`Editor fail: ${err2 instanceof Error ? err2.message : String(err2)}`),
          );
          continue;
        }
      } else {
        console.log(chalk.yellow(`Editor fail: ${msg}`));
        continue;
      }
    }

    if (
      draft.title.trim().toUpperCase() === 'REJECT' ||
      draft.tags.some((t) => t.toLowerCase() === '#reject' || t.toLowerCase() === 'reject')
    ) {
      console.log(chalk.yellow('Editor hard-reject (China)'));
      continue;
    }

    const wc = wordCount(draft.text);
    if (wc < 100) {
      console.log(chalk.yellow(`China draft too short (${wc})`));
      continue;
    }

    const imageUrl = (dossier.imageUrl || pageImage || c.imageUrl || '').trim();
    if (!imageUrl || /unsplash\.com/i.test(imageUrl)) {
      console.log(chalk.yellow('No authentic imageUrl — skip China candidate'));
      continue;
    }

    const baseSlug = slugify(
      dossier.productName
        ? `${dossier.manufacturer || 'china'} ${dossier.productName}`
        : draft.title,
    );
    let slug = baseSlug;
    let n = 2;
    while (opts.ids.has(slug) || opts.articles.some((a) => a.slug === slug)) {
      slug = `${baseSlug}-${n++}`;
    }
    if (isRemovedSlug(slug) || opts.urls.has(c.sourceUrl)) {
      console.log(chalk.yellow(`China slug/source blocked: ${slug}`));
      continue;
    }

    const publishedAt = new Date().toISOString();
    const article: Article = {
      id: slug,
      slug,
      title: draft.title,
      category: CHINA_CATEGORY,
      tags: Array.from(
        new Set(
          [
            ...draft.tags.map((t) => t.replace(/^#/, '')),
            CHINA_TAG,
            CHINA_SOURCE_TAG,
            'новинка',
            dossier.manufacturer,
          ].filter(Boolean),
        ),
      ).slice(0, 10),
      summary: summaryOf(draft.text),
      content: draft.text,
      sourceUrl: c.sourceUrl,
      publishedAt,
      readTime: `${Math.max(1, Math.ceil(wc / 150))} мин`,
      imageUrl,
    };

    const deduped = filterRemovedArticles(
      opts.articles.filter(
        (a) => a.id !== article.id && a.slug !== article.slug && a.sourceUrl !== article.sourceUrl,
      ),
    );
    deduped.unshift(article);
    await writeFile(opts.articlesPath, JSON.stringify(deduped, null, 2) + '\n', 'utf8');

    await mkdir(opts.draftsDir, { recursive: true });
    await writeFile(
      path.join(opts.draftsDir, `${Date.now()}-${slug}.json`),
      JSON.stringify(
        { generatedAt: publishedAt, channel: 'china-qwen', source: c, dossier, draft: article },
        null,
        2,
      ),
      'utf8',
    );

    if (!opts.journal.processedUrls.includes(c.sourceUrl)) {
      opts.journal.processedUrls.push(c.sourceUrl);
    }
    opts.journal.processedIds.push(slug);
    opts.journal.entries.push({
      id: slug,
      url: c.sourceUrl,
      title: draft.title,
      processedAt: publishedAt,
      status: 'published',
      reason: gate.reason,
      slug,
      channel: 'china-qwen',
    });
    await writeFile(opts.journalPath, JSON.stringify(opts.journal, null, 2) + '\n', 'utf8');

    console.log(chalk.green.bold(`Published (China/Qwen): "${draft.title}" (slug: ${slug})`));
    console.log(`Live path: /articles/${slug}`);
    return true;
  }

  console.log(chalk.gray('China candidates exhausted without publish — fall through to RSS.'));
  return false;
}

async function publishRssOnce(opts: {
  dryRun: boolean;
  articlesPath: string;
  draftsDir: string;
  journalPath: string;
  urls: Set<string>;
  ids: Set<string>;
  journal: JournalData;
  articles: Article[];
}): Promise<boolean> {
  console.log(chalk.bold('— Channel B: RSS / editorial office —'));

  const candidates: RssItem[] = [];
  for (const [name, feedUrl] of SOURCES) {
    try {
      // TEST: dig deeper into feeds (backlog weeks) — 30 items/source
      const items = await fetchRssFeed(feedUrl, { limit: 30, sourceName: name });
      for (const item of items) {
        if (!item.url || !item.title) continue;
        if (opts.urls.has(item.url) || opts.ids.has(item.id)) continue;
        const slug = slugify(item.title);
        if (opts.ids.has(slug) || isRemovedSlug(slug)) continue;
        if (!looksBuyableGadget(item.title, item.text || '', name)) continue;
        const gate = hardRejectTopic(item.title, item.text || '');
        if (gate.reject) continue;
        candidates.push(item);
      }
      console.log(chalk.gray(`  ${name}: ok`));
    } catch (err) {
      console.log(
        chalk.yellow(`  ${name}: ${err instanceof Error ? err.message : String(err)}`),
      );
    }
  }

  candidates.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  console.log(`New gadget candidates after filters: ${candidates.length}`);
  console.log(`Scout threshold: ${SCOUT_SCORE_THRESHOLD}`);

  const item = candidates[0];
  if (!item) {
    console.log('No RSS candidate — tick idle exit 0.');
    return false;
  }

  console.log(chalk.cyan(`Pick: [${item.sourceName}] ${item.title}`));
  console.log(chalk.gray(item.url));

  if (opts.dryRun) {
    console.log(chalk.cyan('Dry-run: would process this RSS candidate. Stop.'));
    return true;
  }

  try {
    console.log(chalk.gray('Scout...'));
    const scout = await scoutArticle(item.title, item.text || item.title);
    console.log(`Scout: score=${scout.score} interesting=${scout.interesting} — ${scout.reason}`);

    if (!scout.interesting || scout.score < SCOUT_SCORE_THRESHOLD) {
      console.log(chalk.yellow(`Scout reject (score ${scout.score} < ${SCOUT_SCORE_THRESHOLD}).`));
      await markRejected(opts.journal, opts.journalPath, item, scout.reason, scout.score);
      return false;
    }

    const sourcePayload = {
      title: item.title,
      text: item.text || item.title,
      url: item.url,
      sourceName: item.sourceName,
    };

    console.log(chalk.gray('Reviewer...'));
    const review = await reviewArticle(sourcePayload);
    if (/^REJECT\b/i.test(review.technicalVerdict)) {
      console.log(chalk.yellow(`Reviewer reject: ${review.technicalVerdict}`));
      await markRejected(
        opts.journal,
        opts.journalPath,
        item,
        review.technicalVerdict,
        scout.score,
      );
      return false;
    }

    console.log(chalk.gray('Editor...'));
    const draft = await writeDraft(sourcePayload, review);
    if (
      draft.title.trim().toUpperCase() === 'REJECT' ||
      draft.tags.some((t) => t.toLowerCase() === '#reject') ||
      draft.text.trim().toLowerCase() === 'off-topic'
    ) {
      console.log(chalk.yellow('Editor hard-reject'));
      await markRejected(opts.journal, opts.journalPath, item, 'editor hard-reject', scout.score);
      return false;
    }

    let imageUrl = item.imageUrl;
    try {
      if (!imageUrl) imageUrl = (await extractArticleImage(item.url, draft.title)) || undefined;
    } catch {
      /* optional */
    }

    const slug = slugify(item.title);
    if (isRemovedSlug(slug) || opts.ids.has(slug)) {
      console.log(chalk.yellow(`Skipped denylisted/seen slug: ${slug}`));
      await markRejected(opts.journal, opts.journalPath, item, `slug blocked: ${slug}`, scout.score);
      return false;
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
      readTime: estimateReadTime(draft.text),
      ...(imageUrl ? { imageUrl } : {}),
        ...stampAuthorForPipeline('newsroom-scout', { sourceUrl: item.url, slug: slug }),
    };

    const deduped = filterRemovedArticles(
      opts.articles.filter(
        (a) => a.id !== article.id && a.slug !== article.slug && a.sourceUrl !== article.sourceUrl,
      ),
    );
    deduped.unshift(article);
    await writeFile(opts.articlesPath, JSON.stringify(deduped, null, 2) + '\n', 'utf8');

    await mkdir(opts.draftsDir, { recursive: true });
    await writeFile(
      path.join(opts.draftsDir, `${Date.now()}-${slug}.json`),
      JSON.stringify(
        {
          generatedAt: publishedAt,
          channel: 'rss',
          source: item.sourceName,
          article: item,
          scout,
          review,
          draft: { ...draft, imageUrl },
        },
        null,
        2,
      ),
      'utf8',
    );

    if (!opts.journal.processedUrls.includes(item.url)) {
      opts.journal.processedUrls.push(item.url);
    }
    if (!opts.journal.processedIds.includes(item.id)) {
      opts.journal.processedIds.push(item.id);
    }
    opts.journal.entries.push({
      id: item.id,
      url: item.url,
      title: draft.title,
      processedAt: publishedAt,
      status: 'published',
      scoutScore: scout.score,
      reason: scout.reason,
      slug,
      channel: 'rss',
    });
    await writeFile(opts.journalPath, JSON.stringify(opts.journal, null, 2) + '\n', 'utf8');

    console.log(chalk.green.bold(`Published (RSS): "${draft.title}" (slug: ${slug})`));
    console.log(`Live path: /articles/${slug}`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`RSS tick error: ${msg}`));
    opts.journal.entries.push({
      id: item.id,
      url: item.url,
      title: item.title,
      processedAt: new Date().toISOString(),
      status: 'error',
      reason: msg,
      channel: 'rss',
    });
    await writeFile(opts.journalPath, JSON.stringify(opts.journal, null, 2) + '\n', 'utf8');
    process.exitCode = 1;
    return false;
  }
}

async function main(): Promise<void> {
  loadEnvFiles();
  const options = parseArgs(process.argv.slice(2));

  const factoryEnabled = process.env.SMARTPROTO_FACTORY_ENABLED === 'true';
  if (!factoryEnabled && !options.force) {
    console.log('Factory switch: OFF. SMARTPROTO_FACTORY_ENABLED is not set to true. Quiet stop.');
    return;
  }

  if (!process.env.OPENROUTER_API_KEY?.trim() && !options.dryRun) {
    console.error('OPENROUTER_API_KEY is missing. Abort.');
    process.exitCode = 1;
    return;
  }

  const root = process.cwd();
  const journalPath = path.resolve(root, 'data', 'factory-journal.json');
  const articlesPath = path.resolve(root, 'src', 'data', 'articles.json');
  const draftsDir = path.resolve(root, 'drafts');

  const { urls, ids, journal, articles } = await loadState(journalPath, articlesPath);

  console.log(chalk.bold('=== Newsroom Tick (SP-A-031-R2) ==='));
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Factory: ${factoryEnabled ? 'ON' : 'OFF (forced)'}`);
  console.log(
    `Mode: dryRun=${options.dryRun ? 'YES' : 'NO'} | max 1 publish / tick | scout≥${SCOUT_SCORE_THRESHOLD}`,
  );

  const shared = {
    dryRun: options.dryRun,
    articlesPath,
    draftsDir,
    journalPath,
    urls,
    ids,
    journal,
    articles,
  };

  const chinaDone = await tryChinaPublishOnce(shared);
  if (chinaDone) {
    console.log(chalk.bold('Tick complete (China/Qwen).'));
    return;
  }

  const refreshed = await loadState(journalPath, articlesPath);
  await publishRssOnce({
    ...shared,
    urls: refreshed.urls,
    ids: refreshed.ids,
    journal: refreshed.journal,
    articles: refreshed.articles,
  });

  console.log(chalk.bold('Tick complete.'));
}

main().catch((err) => {
  console.error(
    chalk.red(`Newsroom tick failed: ${err instanceof Error ? err.message : String(err)}`),
  );
  process.exitCode = 1;
});
