/**
 * SP-A-050 — One newsroom tick for a single cycle type.
 *
 * Order per tick (max 1 publish total — bounds AI spend):
 *   1) China Collector → Qwen → Editor (if a good candidate exists)
 *   2) else RSS → hardReject → Scout → Reviewer → Editor
 *
 * Cycle types (independent supervisors / GHA jobs):
 *   news    — short format; interval floor ~25m / ~2–3/h (not an obligation to publish junk)
 *   article — fuller + consumer scenario + Wow Score; interval floor 3h
 *
 * Git commit/push is left to the dual supervisor or GitHub Actions.
 */
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { fetchRssFeed, type RssItem } from '../src/lib/collectors/rss';
import { extractArticleImage, passesImageQualityGate } from '../src/lib/collectors/image-extractor';
import {
  discoveryRankFor,
  enabledRssSources,
} from '../src/lib/collectors/source-registry';
import { buildScoutPool } from '../src/lib/ai/candidate-prerank';
import { resolveArticlePhotos } from '../src/lib/collectors/photo-scout';
import {
  inferEditorialFocus,
  pickDiversityWinner,
  roboticsResearchStreak,
  type DiversityPasser,
} from '../src/lib/newsroom/diversity-guard';
import { scoutArticle, SCOUT_SCORE_THRESHOLD } from '../src/lib/ai/scout';
import { reviewArticle } from '../src/lib/ai/reviewer';
import { writeDraft, type DraftFormat } from '../src/lib/ai/editor';
import { hardRejectTopic, looksBuyableGadget, isAiOrInventionAlert } from '../src/lib/ai/hard-reject';
import {
  collectAiRadarCandidates,
  normalizeAiRadarCandidates,
} from '../src/lib/ai/ai-radar';
import type { EditorialMode } from '../src/lib/ai/hard-reject';
import { filterRemovedArticles, isRemovedSlug } from '../src/lib/removed-slugs';
import { stampAuthorForPipeline } from '../src/lib/authors';
import { toPublicCategory, toPublicTags } from '../src/lib/public-labels';
import {
  CHINA_CATEGORY,
  dossierPublishable,
} from '../src/lib/ai/china-publish-gate';
import {
  FinalAutoGateError,
  assertFinalAutoPublishAllowed,
} from '../src/lib/ai/final-auto-commodity-gate';
import {
  loadQueuedReaderScoutForTick,
  patchReaderScoutSubmission,
  READER_SCOUT_AGENT_ID,
  READER_SCOUT_SOURCE_NAME,
} from '../src/lib/editorial/reader-scout';
import {
  checkCycleCadence,
  getNewsIntervalMs,
  getNewsWarmupUntilIso,
  isNewsWarmupActive,
} from '../src/lib/newsroom/cadence';
import {
  buildFreshnessReport,
  formatFreshnessReport,
  type FreshnessReport,
} from '../src/lib/newsroom/freshness';

/**
 * SP-A-056 — on the Hetzner worker (ARTICLES_STORE=sqlite) also persist the
 * freshly published article straight to SQLite so the site sees it without
 * any git/Vercel step. No-op (and no better-sqlite3 import) everywhere else.
 */
async function maybeSyncToSqlite(article: Record<string, unknown>): Promise<void> {
  if (process.env.ARTICLES_STORE !== 'sqlite') return;
  const { upsertArticle } = await import('../src/lib/data-store/articles-repo');
  upsertArticle(article as import('../src/lib/data-store/articles-repo').StoredArticle);
  // Existing live columns (no schema change) — best-effort match labels.
  if (article.imageMatchLevel || article.imageLabel) {
    try {
      const { getDb } = await import('../src/lib/data-store/db');
      getDb()
        .prepare(
          'UPDATE articles SET imageMatchLevel = coalesce(?, imageMatchLevel), imageLabel = coalesce(?, imageLabel) WHERE slug = ?',
        )
        .run(
          (article.imageMatchLevel as string) || null,
          (article.imageLabel as string) || null,
          String(article.slug || ''),
        );
    } catch {
      /* columns may be absent outside Hetzner */
    }
  }
}

export type CycleType = 'news' | 'article';

function loadEnvFiles(): void {
  const root = process.cwd();
  dotenv.config({ path: path.resolve(root, '.env.local'), override: true, quiet: true });
  dotenv.config({ path: path.resolve(root, '.env'), quiet: true });
}

// Live RSS list: src/lib/collectors/source-registry.ts (SP-A-065).
const SOURCES = enabledRssSources();

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
  channel?: 'china-qwen' | 'rss' | 'ai-radar' | 'reader-scout';
  /** SP-A-050 — which independent cycle published this */
  cycle?: CycleType;
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
  let cycle: CycleType = 'news';
  let cycleFromCli = false;
  for (const a of argv) {
    if (a === '--cycle=article' || a === '--article') {
      cycle = 'article';
      cycleFromCli = true;
    }
    if (a === '--cycle=news' || a === '--news') {
      cycle = 'news';
      cycleFromCli = true;
    }
  }
  if (!cycleFromCli) {
    const envCycle = process.env.SMARTPROTO_CYCLE_TYPE?.trim().toLowerCase();
    if (envCycle === 'article' || envCycle === 'news') cycle = envCycle;
  }
  return {
    force: argv.includes('--force'),
    dryRun: argv.includes('--dry-run'),
    cycle,
    format: (cycle === 'news' ? 'news' : 'article') as DraftFormat,
  };
}

const PUBLISH_LOCK = path.resolve(process.cwd(), 'data', 'factory-publish.lock');

function acquirePublishLock(): boolean {
  try {
    if (existsSync(PUBLISH_LOCK)) {
      const raw = readFileSync(PUBLISH_LOCK, 'utf8').trim();
      const [pidStr, tsStr] = raw.split(':');
      const pid = Number(pidStr);
      const ts = Number(tsStr);
      // Stale after 10 minutes
      if (Number.isFinite(ts) && Date.now() - ts < 10 * 60 * 1000) {
        try {
          if (Number.isFinite(pid) && pid > 0) {
            process.kill(pid, 0);
            return false;
          }
        } catch {
          /* stale pid */
        }
      }
    }
    writeFileSync(PUBLISH_LOCK, `${process.pid}:${Date.now()}`, 'utf8');
    return true;
  } catch {
    return false;
  }
}

function releasePublishLock(): void {
  try {
    if (existsSync(PUBLISH_LOCK)) {
      const raw = readFileSync(PUBLISH_LOCK, 'utf8').trim();
      if (raw.startsWith(`${process.pid}:`)) unlinkSync(PUBLISH_LOCK);
    }
  } catch {
    /* ignore */
  }
}

/** SP-A-042 — console-only factory tick summary (GHA + local). */
interface TickMetrics {
  candidatesCollected: number;
  hardRejected: number;
  sentToQwen: number;
  sentToGemini: number;
  draftsCreated: number;
  articlesPublished: number;
  aiStarted: boolean;
  collectorStarted: boolean;
  publisherStarted: boolean;
  reason: string;
  skipReason: string;
}

function emptyTickMetrics(reason = '', skipReason = ''): TickMetrics {
  return {
    candidatesCollected: 0,
    hardRejected: 0,
    sentToQwen: 0,
    sentToGemini: 0,
    draftsCreated: 0,
    articlesPublished: 0,
    aiStarted: false,
    collectorStarted: false,
    publisherStarted: false,
    reason,
    skipReason,
  };
}

function printFactoryTickSummary(opts: {
  factoryEnabled: boolean;
  event: string;
  metrics: TickMetrics;
  commitCreated?: boolean;
  pushDone?: boolean;
  title?: string;
  slug?: string;
  wowScore?: number;
}): void {
  const { factoryEnabled, event, metrics } = opts;
  console.log('');
  console.log('SMARTPROTO FACTORY TICK SUMMARY');
  console.log(`factoryEnabled: ${factoryEnabled}`);
  console.log(`event: ${event}`);
  console.log(`time: ${new Date().toISOString()}`);
  console.log(`aiStarted: ${metrics.aiStarted}`);
  console.log(`collectorStarted: ${metrics.collectorStarted}`);
  console.log(`publisherStarted: ${metrics.publisherStarted}`);
  console.log(`candidatesCollected: ${metrics.candidatesCollected}`);
  console.log(`hardRejected: ${metrics.hardRejected}`);
  console.log(`sentToQwen: ${metrics.sentToQwen}`);
  console.log(`sentToGemini: ${metrics.sentToGemini}`);
  console.log(`draftsCreated: ${metrics.draftsCreated}`);
  console.log(`articlesPublished: ${metrics.articlesPublished}`);
  console.log(`title: ${opts.title || '-'}`);
  console.log(`slug: ${opts.slug || '-'}`);
  console.log(`wowScore: ${opts.wowScore ?? '-'}`);
  console.log(`commitCreated: ${opts.commitCreated === true}`);
  console.log(`pushDone: ${opts.pushDone === true}`);
  console.log(`reason: ${metrics.reason || 'n/a'}`);
  console.log(`skipReason: ${metrics.skipReason || 'none'}`);
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

/** Normalize product identity for cross-title/slug dedupe (SP-A-048). */
function normalizeProductIdentity(text: string): string {
  return text
    .toLowerCase()
    .replace(/["'`]/g, '')
    .replace(/[^a-z0-9а-яё]+/gi, ' ')
    .replace(
      /\b(the|a|an|new|review|hands.?on|vs|versus|launch|announces?|unveils?|новинка|обзор)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
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
  const productIds = new Set<string>();
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
        const nameId = normalizeProductIdentity(a.title || '');
        const slugId = normalizeProductIdentity((a.slug || '').replace(/-/g, ' '));
        if (nameId) productIds.add(nameId);
        if (slugId) productIds.add(slugId);
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

  for (const e of journal.entries) {
    if (e.status !== 'published') continue;
    if (e.slug) {
      ids.add(e.slug);
      const slugId = normalizeProductIdentity(e.slug.replace(/-/g, ' '));
      if (slugId) productIds.add(slugId);
    }
    const nameId = normalizeProductIdentity(e.title || '');
    if (nameId) productIds.add(nameId);
  }

  return { urls, ids, productIds, journal, articles };
}

async function markRejected(
  journal: JournalData,
  journalPath: string,
  item: RssItem & { submissionId?: string; channelHint?: string },
  reason: string,
  scoutScore?: number,
  opts?: { permanent?: boolean },
): Promise<void> {
  // SP-A-050: soft scout/worthiness skips must NOT permanently burn the URL —
  // interval ticks need another chance when a better angle or higher Wow appears.
  const permanent =
    opts?.permanent !== false &&
    !/scout reject|not worthy|draft too short|score \d+/i.test(reason || '');
  if (permanent) {
    if (!journal.processedUrls.includes(item.url)) journal.processedUrls.push(item.url);
    if (!journal.processedIds.includes(item.id)) journal.processedIds.push(item.id);
  }
  journal.entries.push({
    id: item.id,
    url: item.url,
    title: item.title,
    processedAt: new Date().toISOString(),
    status: 'rejected',
    scoutScore,
    reason,
    channel: item.channelHint === 'reader-scout' ? 'reader-scout' : 'rss',
  });
  // SP-A-090 — close Reader Scout queue item (no silent infinite retries).
  const scoutSubId =
    item.submissionId ||
    (item.id.startsWith('reader-scout:') ? item.id.slice('reader-scout:'.length) : '');
  if (scoutSubId) {
    void patchReaderScoutSubmission(scoutSubId, {
      status: permanent ? 'rejected' : 'queued',
      rejectReason: reason.slice(0, 400),
    });
  }
  await writeFile(journalPath, JSON.stringify(journal, null, 2) + '\n', 'utf8');
}

async function tryChinaPublishOnce(opts: {
  dryRun: boolean;
  cycle: CycleType;
  format: DraftFormat;
  articlesPath: string;
  draftsDir: string;
  journalPath: string;
  urls: Set<string>;
  ids: Set<string>;
  productIds: Set<string>;
  journal: JournalData;
  articles: Article[];
  metrics: TickMetrics;
  lastPublish?: { title?: string; slug?: string; wowScore?: number };
}): Promise<boolean> {
  process.env.CHINA_DEPARTMENT_ENABLED = 'true';
  process.env.CHINA_ALLOW_RECOMMEND = 'true';

  console.log(chalk.bold('— Channel A: China → Qwen —'));
  opts.metrics.collectorStarted = true;

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
    opts.metrics.skipReason = 'china collect failed';
    return false;
  }

  const consider = filtered
    .filter((x) => x.decision === 'CONSIDER')
    .filter((x) => looksChinaConsumerGadget(x.candidate.title, x.candidate.summary))
    .filter((x) => !opts.urls.has(x.candidate.sourceUrl))
    .sort((a, b) => b.candidate.rawSignals.length - a.candidate.rawSignals.length)
    .slice(0, CHINA_MAX_QWEN)
    .map((x) => x.candidate);

  opts.metrics.candidatesCollected += consider.length;
  console.log(`China CONSIDER gadget candidates: ${consider.length} (max Qwen ${CHINA_MAX_QWEN})`);
  if (!consider.length) {
    console.log(chalk.gray('No China/Qwen candidate — fall through to RSS.'));
    opts.metrics.skipReason = 'no china candidate';
    return false;
  }

  if (opts.dryRun) {
    console.log(chalk.cyan(`Dry-run China pick: ${consider[0].title.slice(0, 80)}`));
    opts.metrics.reason = 'dry-run china pick';
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
      opts.metrics.aiStarted = true;
      opts.metrics.sentToQwen += 1;
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
        // SP-A-054: do not feed prices into Editor (public text must stay price-free).
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
      technicalVerdict: 'PASS: buyable consumer gadget candidate (dossier)',
      productName: dossier.productName,
      manufacturer: dossier.manufacturer,
      evidence: dossier.evidence,
    };

    const framed = {
      ...articleData,
      // SP-A-088: prefer full editorial review length for China AUTO (one voice with Chief)
      format: 'article' as const,
      mode:
        /robot|ai|ии|llm|gpt|электромобил|автопилот|исследован/i.test(
          `${dossier.productName || ''} ${articleData.text || ''}`,
        )
          ? ('ai_radar' as const)
          : ('gadget' as const),
      title: dossier.productName || articleData.title,
      // Parser = miner: pass facts only. Do NOT pre-frame as «новый гаджет» press card.
      text: [
        'SOURCE PACK (parser/dossier facts — Editor пишет самостоятельный обзор, не перевод):',
        articleData.text,
      ].join('\n\n'),
    };

    let draft;
    try {
      opts.metrics.sentToGemini += 1;
      draft = await writeDraft(framed, reviewData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/unsupportedClaims/.test(msg)) {
        try {
          opts.metrics.sentToGemini += 1;
          draft = await writeDraft(
            {
              ...framed,
              text: `${framed.text}\n\nНе выдумывай характеристики. Нет данных — пиши «не указано в источнике». Независимых тестов нет.`,
            },
            {
              ...reviewData,
              technicalVerdict:
                'PASS with limits: sparse source — mark unknowns, no unsupported claims',
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
    opts.metrics.draftsCreated += 1;

    if (
      draft.title.trim().toUpperCase() === 'REJECT' ||
      draft.tags.some((t) => t.toLowerCase() === '#reject' || t.toLowerCase() === 'reject')
    ) {
      console.log(chalk.yellow('Editor hard-reject (China)'));
      continue;
    }

    const wc = wordCount(draft.text);
    // SP-A-088: thin Editor output must not publish — same seriousness bar as Chief DNA
    const minWords = 180;
    if (wc < minWords) {
      console.log(chalk.yellow(`China draft too short (${wc} < ${minWords})`));
      continue;
    }

    let imageUrl = (dossier.imageUrl || pageImage || c.imageUrl || '').trim();
    if (!imageUrl || /unsplash\.com/i.test(imageUrl)) {
      console.log(chalk.yellow('No authentic imageUrl — skip China candidate'));
      continue;
    }
    // SP-A-060: reject reposted-screenshot-shaped images (Weibo/forum banners),
    // publish without an image rather than with a bad one.
    if (!(await passesImageQualityGate(imageUrl))) {
      console.log(chalk.yellow('Image failed quality gate (screenshot/banner shape) — publishing without image'));
      imageUrl = '';
    }

    const productKey = normalizeProductIdentity(
      `${dossier.manufacturer || ''} ${dossier.productName || draft.title}`,
    );
    if (productKey && opts.productIds.has(productKey)) {
      console.log(chalk.yellow(`China product-identity duplicate: ${productKey}`));
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

    if (!acquirePublishLock()) {
      console.log(chalk.yellow('Publish lock held — another cycle writing; skip to avoid double publish'));
      opts.metrics.skipReason = 'cross-cycle publish lock';
      return false;
    }
    try {
      // Re-check product identity after lock (other cycle may have just published)
      const fresh = await loadState(opts.journalPath, opts.articlesPath);
      if (productKey && fresh.productIds.has(productKey)) {
        console.log(chalk.yellow(`Cross-cycle product duplicate after lock: ${productKey}`));
        opts.metrics.skipReason = 'cross-cycle product-identity';
        continue;
      }

      const publishedAt = new Date().toISOString();
      const publicTags = toPublicTags([
        ...draft.tags.map((t) => t.replace(/^#/, '')),
        'новинка',
        'гаджет',
        dossier.manufacturer || '',
        opts.cycle === 'news' ? 'новость' : 'обзор',
      ]);

      // SP-A-064 Photo Intelligence V2: entity → multi-source mine → AI editor → local files.
      // Wrong-product photo is worse than no photo.
      let images: import('../src/lib/collectors/photo-scout').ScoutImage[] = [];
      try {
        const report = await resolveArticlePhotos({
          slug,
          title: draft.title,
          text: draft.text,
          sourceUrl: c.sourceUrl,
          fallbackUrl: imageUrl || undefined,
        });
        console.log(
          chalk.gray(
            `[photo-v2] entity=${report.entity.brand || report.entity.company || '?'} ` +
              `object=${report.entity.object || '?'} candidates=${report.candidatesFound} ` +
              `selected=${report.selected.length} match=${report.imageMatchLevel || 'n/a'} ` +
              `notes=${report.notes.join('; ')}`,
          ),
        );
        images = report.selected;
        if (report.imageMatchLevel) {
          (opts as any)._lastPhotoMeta = {
            imageMatchLevel: report.imageMatchLevel,
            imageLabel: report.imageLabel,
          };
        }
      } catch (err) {
        console.log(
          chalk.yellow(
            `[photo-v2] failed: ${err instanceof Error ? err.message : String(err)} — publishing NO IMAGE`,
          ),
        );
      }
      if (!images.length) imageUrl = ''; // never fall back to an unconfirmed hotlink

      const article: Article = {
        id: slug,
        slug,
        title: draft.title,
        category: toPublicCategory(CHINA_CATEGORY),
        tags: Array.from(new Set(publicTags)).slice(0, 10),
        summary: summaryOf(draft.text),
        content: draft.text,
        sourceUrl: c.sourceUrl,
        publishedAt,
        readTime: `${Math.max(1, Math.ceil(wc / 150))} мин`,
        ...(images.length ? { imageUrl: images[0].url, images } : {}),
        ...stampAuthorForPipeline('china-qwen', { sourceUrl: c.sourceUrl, slug }),
      };

      // SP-A-082 — final AUTO gate before articles.json + SQLite (covers china soft gadget bar).
      try {
        assertFinalAutoPublishAllowed({
          title: article.title,
          summary: article.summary,
          content: article.content,
          tags: article.tags,
          category: article.category,
          agentId: article.agentId || 'china-qwen',
        });
      } catch (err) {
        if (err instanceof FinalAutoGateError) {
          console.log(chalk.yellow(`China blocked by final gate: ${err.message}`));
          fresh.journal.entries.push({
            id: slug,
            url: c.sourceUrl,
            title: draft.title,
            processedAt: publishedAt,
            status: 'rejected',
            reason: err.message,
            slug,
            channel: 'china-qwen',
            cycle: opts.cycle,
          });
          await writeFile(opts.journalPath, JSON.stringify(fresh.journal, null, 2) + '\n', 'utf8');
          opts.urls.add(c.sourceUrl);
          continue;
        }
        throw err;
      }

      const deduped = filterRemovedArticles(
        fresh.articles.filter(
          (a) => a.id !== article.id && a.slug !== article.slug && a.sourceUrl !== article.sourceUrl,
        ),
      );
      deduped.unshift(article);
      await writeFile(opts.articlesPath, JSON.stringify(deduped, null, 2) + '\n', 'utf8');
      await maybeSyncToSqlite(article);

      await mkdir(opts.draftsDir, { recursive: true });
      await writeFile(
        path.join(opts.draftsDir, `${Date.now()}-${slug}.json`),
        JSON.stringify(
          {
            generatedAt: publishedAt,
            channel: 'china-qwen',
            cycle: opts.cycle,
            format: opts.format,
            source: c,
            dossier,
            draft: article,
          },
          null,
          2,
        ),
        'utf8',
      );

      if (!fresh.journal.processedUrls.includes(c.sourceUrl)) {
        fresh.journal.processedUrls.push(c.sourceUrl);
      }
      fresh.journal.processedIds.push(slug);
      fresh.journal.entries.push({
        id: slug,
        url: c.sourceUrl,
        title: draft.title,
        processedAt: publishedAt,
        status: 'published',
        reason: gate.reason,
        slug,
        channel: 'china-qwen',
        cycle: opts.cycle,
      });
      await writeFile(opts.journalPath, JSON.stringify(fresh.journal, null, 2) + '\n', 'utf8');

      opts.ids.add(slug);
      opts.urls.add(c.sourceUrl);
      if (productKey) opts.productIds.add(productKey);
      const draftKey = normalizeProductIdentity(draft.title);
      if (draftKey) opts.productIds.add(draftKey);
      if (opts.lastPublish) {
        opts.lastPublish.title = draft.title;
        opts.lastPublish.slug = slug;
      }

      opts.metrics.publisherStarted = true;
      opts.metrics.articlesPublished += 1;
      opts.metrics.reason = `published china/${opts.cycle}`;
      opts.metrics.skipReason = 'none';
      console.log(
        chalk.green.bold(`Published (${opts.cycle}/internal-desk): "${draft.title}" (slug: ${slug})`),
      );
      console.log(`Live path: /articles/${slug}`);
      return true;
    } finally {
      releasePublishLock();
    }
  }

  console.log(chalk.gray('China candidates exhausted without publish — fall through to RSS.'));
  opts.metrics.skipReason = 'china candidates exhausted';
  return false;
}

async function publishRssOnce(opts: {
  dryRun: boolean;
  cycle: CycleType;
  format: DraftFormat;
  articlesPath: string;
  draftsDir: string;
  journalPath: string;
  urls: Set<string>;
  ids: Set<string>;
  productIds: Set<string>;
  journal: JournalData;
  articles: Article[];
  metrics: TickMetrics;
  lastPublish?: { title?: string; slug?: string; wowScore?: number };
}): Promise<boolean> {
  console.log(chalk.bold(`— Channel B: RSS / editorial office (${opts.cycle}) —`));
  opts.metrics.collectorStarted = true;
  // Production floors stay 70/75 when env unset. Explicit SCOUT_SCORE_THRESHOLD
  // (test-auto=40, forced probe <40) must win — Math.max(...) was ignoring it.
  const explicitScout = Boolean(process.env.SCOUT_SCORE_THRESHOLD?.trim());
  const scoutFloor = explicitScout
    ? SCOUT_SCORE_THRESHOLD
    : opts.cycle === 'article'
      ? 75
      : 70;
  // SP-A-063 forced/live probe: dig past deal/opinion tops that score 0 forever.
  const probeMode = explicitScout && SCOUT_SCORE_THRESHOLD < 70;

  const candidates: RssItem[] = [];
  const perSource: Record<string, number> = {};
  for (const src of SOURCES) {
    const name = src.name;
    const feedUrl = src.feedUrl;
    try {
      const items = await fetchRssFeed(feedUrl, {
        limit: src.limit ?? 50,
        sourceName: name,
        maxRawBytes: src.maxRawBytes,
        // Discovery feeds: skip page image crawl to keep tick economical.
        skipPageImageFetch: src.tier === 'A_DISCOVERY' || src.tier === 'B' || src.tier === 'C',
      });
      let kept = 0;
      for (const item of items) {
        if (!item.url || !item.title) continue;
        if (opts.urls.has(item.url) || opts.ids.has(item.id)) continue;
        const slug = slugify(item.title);
        if (opts.ids.has(slug) || isRemovedSlug(slug)) continue;
        const productKey = normalizeProductIdentity(item.title);
        if (productKey && opts.productIds.has(productKey)) continue;
        // looksBuyableGadget already applies hardReject + SP-A-049 commodity + feed soften.
        // Do not re-hardReject here — that undoes Yanko/New Atlas soften and empties the pool.
        if (!looksBuyableGadget(item.title, item.text || '', name)) {
          opts.metrics.hardRejected += 1;
          continue;
        }
        candidates.push(item);
        kept += 1;
      }
      perSource[name] = kept;
      console.log(chalk.gray(`  ${name}: ok (${items.length} raw → ${kept} candidates) [tier=${src.tier}]`));
    } catch (err) {
      console.log(
        chalk.yellow(`  ${name}: ${err instanceof Error ? err.message : String(err)}`),
      );
    }
  }
  console.log(chalk.gray(`Per-source candidates: ${JSON.stringify(perSource)}`));

  const sourceRank = (name: string) => discoveryRankFor(name);
  const looksAiCapability = (title: string, text: string) =>
    /\b(ai|a\.i\.|artificial intelligence|chatgpt|gemini|claude|llm|gpt|agentic|autonom(?:y|ous)|superintelligence|agi|copilot|reasoning model|foundation model)\b|искусственн\w*\s+интеллект|\bии\b|нейросет/i.test(
      `${title}\n${text}`,
    );
  const looksExplainer = (title: string) =>
    /^(what is|how to|common problems|can using|why you|forget lithium|the seven)\b/i.test(
      title.trim(),
    ) ||
    /\b(how to fix|explained|problems with|partnership|marks breakthrough)\b/i.test(title);
  const looksDealOrOpinion = (title: string) =>
    /\b(on sale|deal|discount|% off|just \$\d+|here.?s why|might sound|i.?ve used|acquires?|acquisition)\b/i.test(
      title,
    );
  candidates.sort((a, b) => {
    // Forced/test probe: prefer concrete gadget sources over AI-keyword clickbait tops.
    if (probeMode) {
      const ad = looksDealOrOpinion(a.title) ? 1 : 0;
      const bd = looksDealOrOpinion(b.title) ? 1 : 0;
      if (ad !== bd) return ad - bd;
      const sr = sourceRank(a.sourceName) - sourceRank(b.sourceName);
      if (sr !== 0) return sr;
      const ae = looksExplainer(a.title) ? 1 : 0;
      const be = looksExplainer(b.title) ? 1 : 0;
      if (ae !== be) return ae - be;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    }
    // SP-A-054: boost grounded AI capability / useful AI tool stories.
    const aAi = looksAiCapability(a.title, a.text || '') ? 0 : 1;
    const bAi = looksAiCapability(b.title, b.text || '') ? 0 : 1;
    if (aAi !== bAi) return aAi - bAi;
    const ae = looksExplainer(a.title) ? 1 : 0;
    const be = looksExplainer(b.title) ? 1 : 0;
    if (ae !== be) return ae - be;
    const sr = sourceRank(a.sourceName) - sourceRank(b.sourceName);
    if (sr !== 0) return sr;
    const ai = a.imageUrl ? 0 : 1;
    const bi = b.imageUrl ? 0 : 1;
    if (ai !== bi) return ai - bi;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  opts.metrics.candidatesCollected += candidates.length;
  console.log(`New gadget candidates after filters: ${candidates.length}`);
  console.log(
    `Scout threshold: ${scoutFloor} (cycle=${opts.cycle}${probeMode ? ', probe dig-deep' : ''})`,
  );

  if (candidates.length === 0) {
    console.log('No RSS candidate — tick idle exit 0.');
    opts.metrics.skipReason = 'no rss candidate';
    return false;
  }

  if (opts.dryRun) {
    const item = candidates[0];
    console.log(chalk.cyan(`Dry-run pick: [${item.sourceName}] ${item.title}`));
    opts.metrics.reason = 'dry-run rss pick';
    return true;
  }

  // SP-A-065B: cheap pre-rank + topic dedupe → Scout TOP 12–16 (not only first 4).
  // Probe/forced already digs deep; production now uses the same wider Scout window.
  // SP-A-091 — freshness CRITICAL slightly widens Scout window (still bounded; no gate weaken).
  const freshness: FreshnessReport = buildFreshnessReport({
    articles: opts.articles.map((a) => ({ publishedAt: a.publishedAt, agentId: a.agentId })),
    journalEntries: opts.journal.entries,
  });
  console.log(chalk.bold(formatFreshnessReport(freshness)));
  if (freshness.freshnessStatus === 'WARNING') {
    console.log(
      chalk.yellow(
        'FRESHNESS WARNING — expanding bounded candidate pipeline (quality floors unchanged).',
      ),
    );
  } else if (freshness.freshnessStatus === 'CRITICAL') {
    console.log(
      chalk.red(
        'FRESHNESS CRITICAL — editorial starvation; trying more Scout-passed candidates (not junk).',
      ),
    );
  }
  const pipelineBudget = freshness.pipelineCandidateBudget;
  const scoutLimit = probeMode ? 16 : freshness.freshnessStatus === 'CRITICAL' ? 16 : 14;
  const scoutPool = buildScoutPool(candidates, { limit: scoutLimit, maxPerSource: 3 });
  console.log(
    chalk.gray(
      `Scout pool: raw=${scoutPool.rawCount} afterDedupe=${scoutPool.afterDedupe} scout=${scoutPool.pool.length} (limit=${scoutLimit})`,
    ),
  );
  for (const row of scoutPool.rankedPreview.slice(0, 8)) {
    console.log(chalk.gray(`  pre-rank ${row.cheap}: [${row.sourceName}] ${row.title.slice(0, 70)}`));
  }

  // SP-A-065C/065D — separate AI radar intake → shared Scout (normalized EVENT RECORD).
  type PoolItem = RssItem & {
    scoutMode?: EditorialMode;
    primaryStatus?: string;
    channelHint?: 'rss' | 'ai-radar' | 'reader-scout';
    submissionId?: string;
  };
  let mergedPool: PoolItem[] = scoutPool.pool.map((p) => ({
    ...p,
    scoutMode: 'gadget' as EditorialMode,
    channelHint: 'rss' as const,
  }));
  let aiRadarBest: string = '(none)';

  // SP-A-090 — Reader Scout finds seated ahead of AUTO parser / AI radar intake.
  let readerItems: PoolItem[] = [];
  try {
    const queued = await loadQueuedReaderScoutForTick(4);
    readerItems = queued
      .filter((q) => q.url && !opts.urls.has(q.url))
      .map((q) => ({
        id: q.id,
        title: q.title,
        url: q.url,
        text: q.text,
        publishedAt: q.publishedAt,
        sourceName: q.sourceName,
        scoutMode: 'gadget' as EditorialMode,
        channelHint: 'reader-scout' as const,
        submissionId: q.submissionId,
      }));
    if (readerItems.length) {
      console.log(
        chalk.cyan(
          `— Channel R: Reader Scout queue (${readerItems.length}) — priority > AUTO parsers —`,
        ),
      );
      for (const r of readerItems) {
        console.log(chalk.gray(`  [Reader Scout] ${r.title.slice(0, 80)}`));
        void patchReaderScoutSubmission(r.submissionId!, {
          status: 'processing',
          attempts: 1,
        });
      }
    }
  } catch (err) {
    console.log(
      chalk.yellow(
        `Reader Scout queue skipped: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  const aiRadarEnabled = process.env.SMARTPROTO_AI_RADAR_ENABLED !== 'false';
  if (aiRadarEnabled) {
    try {
      console.log(chalk.bold('— Channel C: AI Early Warning radar (separate intake) —'));
      const {
        candidates: aiCands,
        primaryPool,
        resolveStats,
        perSource: aiPerSource,
      } = await collectAiRadarCandidates({ limitPerSource: 12 });
      const normalized = normalizeAiRadarCandidates(aiCands, primaryPool);
      const strong = normalized
        .filter((n) => n.priority === 'high' || n.priority === 'medium')
        .slice(0, 4);
      console.log(
        chalk.gray(
          `AI_RADAR raw=${aiCands.length} normalized=${normalized.length} strong=${strong.length} ` +
            `PRIMARY_ORIGIN=${resolveStats.primaryOrigin} DISCOVERY_WITH_PRIMARY=${resolveStats.discoveryWithPrimary} DISCOVERY_UNRESOLVED=${resolveStats.discoveryUnresolved}`,
        ),
      );
      console.log(chalk.gray(`AI_RADAR perSource: ${JSON.stringify(aiPerSource)}`));
      if (strong[0]) {
        aiRadarBest = `[${strong[0].primaryStatus}] ${strong[0].title.slice(0, 90)} (${strong[0].priority})`;
        console.log(chalk.cyan(`AI_RADAR best: ${aiRadarBest}`));
      } else {
        console.log(chalk.gray('AI_RADAR best: (none this tick)'));
      }
      const gadgetUrls = new Set(mergedPool.map((p) => p.url));
      const aiItems: PoolItem[] = strong
        .filter((n) => n.url && !gadgetUrls.has(n.url) && !opts.urls.has(n.url) && !opts.ids.has(`ai-radar:${n.url}`))
        .map((n) => ({
          id: `ai-radar:${n.url}`,
          title: n.title,
          url: n.url,
          text: n.event.summaryForScout,
          publishedAt: new Date().toISOString(),
          sourceName: n.sourceName.startsWith('AI_RADAR:')
            ? n.sourceName
            : `AI_RADAR:${n.sourceName}`,
          scoutMode: 'ai_radar' as EditorialMode,
          primaryStatus: n.primaryStatus,
          channelHint: 'ai-radar' as const,
        }));
      // Reader Scout > AI radar > RSS parser seats (still max 1 publish; full gates apply).
      mergedPool = [...readerItems, ...aiItems, ...mergedPool].slice(
        0,
        scoutLimit + Math.min(aiItems.length, 3) + readerItems.length,
      );
      opts.metrics.candidatesCollected += aiCands.length + readerItems.length;
      console.log(
        chalk.gray(
          `Shared Scout pool after AI radar merge: ${mergedPool.length} (reader=${readerItems.length} ai seats=${aiItems.length})`,
        ),
      );
    } catch (err) {
      console.log(
        chalk.yellow(
          `AI_RADAR collect skipped: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
      if (readerItems.length) {
        mergedPool = [...readerItems, ...mergedPool];
        opts.metrics.candidatesCollected += readerItems.length;
      }
    }
  } else {
    console.log(chalk.gray('AI_RADAR disabled (SMARTPROTO_AI_RADAR_ENABLED=false)'));
    if (readerItems.length) {
      mergedPool = [...readerItems, ...mergedPool];
      opts.metrics.candidatesCollected += readerItems.length;
    }
  }

  console.log(chalk.bold('TICK_TOP5:'));
  for (const [idx, row] of mergedPool.slice(0, 5).entries()) {
    console.log(
      chalk.gray(
        `  ${idx + 1}. [${row.channelHint || 'rss'}][${row.sourceName}] ${row.title.slice(0, 80)}`,
      ),
    );
  }

  const recentArts = (await loadState(opts.journalPath, opts.articlesPath)).articles.slice(0, 10);
  const roboticsStreak = roboticsResearchStreak(recentArts, 2);
  if (roboticsStreak) {
    console.log(
      chalk.yellow(
        'SP-A-065F diversity: last 2 publishes are robotics/research — prefer other focus unless robotics leads by ≥10',
      ),
    );
  }
  const diversityPassers: (DiversityPasser<PoolItem> & {
    scout: Awaited<ReturnType<typeof scoutArticle>>;
  })[] = [];
  let selectedScouted:
    | {
        item: PoolItem;
        scout: Awaited<ReturnType<typeof scoutArticle>>;
        diversityNote?: string;
      }
    | null = null;
  /** SP-A-091 — Scout-passed queue for bounded Reviewer→Editor attempts (not first-fail stop). */
  const pipelinePassers: {
    item: PoolItem;
    scout: Awaited<ReturnType<typeof scoutArticle>>;
    diversityNote?: string;
  }[] = [];

  const maxAttempts = mergedPool.length;
  let lastSkip = 'no rss candidate';
  let diversityDecisionLog = roboticsStreak ? 'pending' : 'n/a (no robotics streak)';

  for (let i = 0; i < maxAttempts; i++) {
    const item = mergedPool[i];
    const mode: EditorialMode = item.scoutMode === 'ai_radar' ? 'ai_radar' : 'gadget';
    console.log(
      chalk.cyan(
        `Pick (${i + 1}/${maxAttempts}): [${item.channelHint || 'rss'}/${mode}][${item.sourceName}] ${item.title}`,
      ),
    );
    console.log(chalk.gray(item.url));

    try {
      console.log(chalk.gray('Scout...'));
      opts.metrics.aiStarted = true;
      opts.metrics.sentToGemini += 1;
      const scout = await scoutArticle(item.title, item.text || item.title, mode);
      console.log(`Scout: score=${scout.score} interesting=${scout.interesting} — ${scout.reason}`);

      if (!scout.interesting || scout.score < scoutFloor) {
        console.log(chalk.yellow(`Scout reject (score ${scout.score} < ${scoutFloor}).`));
        await markRejected(opts.journal, opts.journalPath, item, scout.reason, scout.score, {
          permanent: false,
        });
        // Do not burn URL in opts.urls — news/article ticks may retry later.
        lastSkip = 'scout reject';
        continue;
      }

      // SP-A-065F: on robotics streak, collect Scout passers first; publish after selection.
      if (roboticsStreak) {
        const focus = inferEditorialFocus({
          title: item.title,
          text: item.text || item.title,
          sourceName: item.sourceName,
          sourceUrl: item.url,
        });
        diversityPassers.push({ item, score: scout.score, focus, scout });
        console.log(chalk.gray(`diversity passer: focus=${focus} score=${scout.score}`));
        const hasOther = diversityPassers.some((p) => p.focus !== 'robotics_research');
        const hasRobot = diversityPassers.some((p) => p.focus === 'robotics_research');
        if (hasOther && hasRobot) {
          console.log(chalk.gray('diversity: robotics + other focus passers ready'));
          break;
        }
        continue;
      }

      // SP-A-091 — keep collecting Scout PASS until pipeline budget (3–5), then Editor path.
      pipelinePassers.push({ item, scout });
      console.log(
        chalk.gray(
          `Scout PASS → pipeline queue ${pipelinePassers.length}/${pipelineBudget} (freshness=${freshness.freshnessStatus})`,
        ),
      );
      if (pipelinePassers.length >= pipelineBudget) break;
      continue;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`RSS candidate error: ${msg}`));
      if (!opts.journal.processedUrls.includes(item.url)) {
        opts.journal.processedUrls.push(item.url);
      }
      if (!opts.journal.processedIds.includes(item.id)) {
        opts.journal.processedIds.push(item.id);
      }
      opts.urls.add(item.url);
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
      lastSkip = `rss error: ${msg}`;
      // Try next candidate in this tick (still max 1 publish).
      continue;
    }
  }

  // SP-A-065F: diversity only selects the winner; publish uses one shared path.
  if (!pipelinePassers.length && roboticsStreak && diversityPassers.length) {
    const decision = pickDiversityWinner({
      passers: diversityPassers.map((p) => ({ item: p.item, score: p.score, focus: p.focus })),
      recent: recentArts,
    });
    console.log(chalk.cyan(`SP-A-065F diversity decision: ${decision.reason}`));
    diversityDecisionLog = decision.reason;
    const full = decision.winner
      ? diversityPassers.find((p) => p.item.url === decision.winner!.item.url)
      : undefined;
    if (full) {
      pipelinePassers.push({
        item: full.item,
        scout: full.scout,
        diversityNote: decision.reason,
      });
    }
  } else if (!roboticsStreak) {
    diversityDecisionLog = 'n/a (no robotics streak)';
  } else if (!diversityPassers.length) {
    diversityDecisionLog = 'robotics streak but no Scout passers';
  }

  console.log(
    chalk.gray(
      `SP-A-091 pipeline attempts queued: ${pipelinePassers.length} (budget=${pipelineBudget})`,
    ),
  );

  for (let pIdx = 0; pIdx < pipelinePassers.length; pIdx++) {
    selectedScouted = pipelinePassers[pIdx];
    const item = selectedScouted.item;
    const scout = selectedScouted.scout;
    const itemMode: EditorialMode = item.scoutMode === 'ai_radar' ? 'ai_radar' : 'gadget';
    const itemChannel =
      item.channelHint === 'reader-scout'
        ? 'reader-scout'
        : item.channelHint === 'ai-radar'
          ? 'ai-radar'
          : 'rss';
    const chosenFocus = inferEditorialFocus({
      title: item.title,
      text: item.text || item.title,
      sourceName: item.sourceName,
      sourceUrl: item.url,
    });
    console.log(
      chalk.cyan(
        `CHOSEN (${pIdx + 1}/${pipelinePassers.length}): focus=${chosenFocus} channel=${itemChannel} mode=${itemMode} score=${scout.score}`,
      ),
    );
    try {
      // Article cycle: require stronger wow (score) — interval is min pause, not obligation.
      if (opts.cycle === 'article' && scout.score < 75) {
        console.log(chalk.yellow(`Article cycle: not worthy enough (wow ${scout.score} < 75)`));
        lastSkip = 'not worthy for article cycle';
        continue;
      }

      const sourcePayload = {
        title: item.title,
        text: [
          'SOURCE PACK (RSS/parser extract — Editor пишет самостоятельный обзор, не перевод):',
          item.text || item.title,
        ].join('\n\n'),
        url: item.url,
        sourceName: item.sourceName,
        // SP-A-088: one editorial depth bar for AUTO (same DNA as Chief) — not a 40-word news cut
        format: 'article' as const,
        mode: itemMode,
      };

      console.log(chalk.gray('Reviewer...'));
      opts.metrics.sentToGemini += 1;
      const review = await reviewArticle(sourcePayload);
      if (/^REJECT\b/i.test(review.technicalVerdict)) {
        // Soft override: Scout already scored high on AI/invention alert — don't idle the tick.
        // SP-A-065CD: ai_radar — soft-pass only for strong EVENT already Scout-passed (≥floor) with normalized record / primary evidence.
        // Not a blanket «if AI → PASS»; commodity without EVENT markers still rejected.
        const aiRadarEventOk =
          itemMode === 'ai_radar' &&
          scout.score >= scoutFloor &&
          (/NORMALIZED AI EVENT RECORD|capabilityChange:|primaryEvidence:/i.test(item.text || '') ||
            /critical cyber|whole body|embodied|autonom|boundary|safeguard|preparedness/i.test(
              `${item.title}\n${item.text || ''}`,
            ));
        if (
          aiRadarEventOk ||
          (scout.score >= 80 && isAiOrInventionAlert(item.title, item.text || item.title))
        ) {
          console.log(
            chalk.yellow(
              `Reviewer reject soft-pass (${itemMode}, scout=${scout.score}): ${review.technicalVerdict}`,
            ),
          );
          review.technicalVerdict =
            itemMode === 'ai_radar'
              ? `PASS: AI radar EVENT (scout ${scout.score})`
              : `PASS: AI/invention alert (scout ${scout.score})`;
        } else {
          console.log(chalk.yellow(`Reviewer reject: ${review.technicalVerdict}`));
          await markRejected(
            opts.journal,
            opts.journalPath,
            item,
            review.technicalVerdict,
            scout.score,
          );
          opts.urls.add(item.url);
          lastSkip = 'reviewer reject';
          continue;
        }
      }

      console.log(chalk.gray(`Editor (${opts.format})...`));
      opts.metrics.sentToGemini += 1;
      const draft = await writeDraft(sourcePayload, review);
      opts.metrics.draftsCreated += 1;
      if (
        draft.title.trim().toUpperCase() === 'REJECT' ||
        draft.tags.some((t) => t.toLowerCase() === '#reject') ||
        draft.text.trim().toLowerCase() === 'off-topic'
      ) {
        console.log(chalk.yellow('Editor hard-reject'));
        await markRejected(opts.journal, opts.journalPath, item, 'editor hard-reject', scout.score);
        opts.urls.add(item.url);
        lastSkip = 'editor hard-reject';
        continue;
      }

      const wc = wordCount(draft.text);
      // SP-A-088: one seriousness bar — thin Editor drafts do not publish
      const minWords = 180;
      if (wc < minWords) {
        console.log(chalk.yellow(`Draft too short (${wc} < ${minWords})`));
        lastSkip = 'draft too short';
        continue;
      }

      let imageUrl = item.imageUrl;
      try {
        if (!imageUrl) imageUrl = (await extractArticleImage(item.url, draft.title)) || undefined;
      } catch {
        /* optional */
      }
      // SP-A-060: never ship a screenshot-shaped image — no image beats a bad one.
      if (imageUrl && !(await passesImageQualityGate(imageUrl))) {
        console.log(chalk.yellow('Image failed quality gate (screenshot/banner shape) — publishing without image'));
        imageUrl = undefined;
      }

      const slug = slugify(item.title);
      if (isRemovedSlug(slug) || opts.ids.has(slug)) {
        console.log(chalk.yellow(`Skipped denylisted/seen slug: ${slug}`));
        await markRejected(opts.journal, opts.journalPath, item, `slug blocked: ${slug}`, scout.score);
        opts.urls.add(item.url);
        lastSkip = `slug blocked: ${slug}`;
        continue;
      }
      const draftProductKey = normalizeProductIdentity(draft.title);
      const sourceProductKey = normalizeProductIdentity(item.title);
      if (
        (draftProductKey && opts.productIds.has(draftProductKey)) ||
        (sourceProductKey && opts.productIds.has(sourceProductKey))
      ) {
        console.log(
          chalk.yellow(
            `Skipped product-identity duplicate: ${draftProductKey || sourceProductKey}`,
          ),
        );
        await markRejected(
          opts.journal,
          opts.journalPath,
          item,
          `product-identity duplicate: ${draftProductKey || sourceProductKey}`,
          scout.score,
        );
        opts.urls.add(item.url);
        lastSkip = 'product-identity duplicate';
        continue;
      }

      if (!acquirePublishLock()) {
        console.log(chalk.yellow('Publish lock held — skip to avoid double product publish'));
        lastSkip = 'cross-cycle publish lock';
        opts.metrics.skipReason = lastSkip;
        return false;
      }
      try {
        const fresh = await loadState(opts.journalPath, opts.articlesPath);
        if (
          (draftProductKey && fresh.productIds.has(draftProductKey)) ||
          (sourceProductKey && fresh.productIds.has(sourceProductKey)) ||
          fresh.urls.has(item.url) ||
          fresh.ids.has(slug)
        ) {
          console.log(chalk.yellow('Cross-cycle race: product/url already published'));
          await markRejected(
            fresh.journal,
            opts.journalPath,
            item,
            'cross-cycle product-identity',
            scout.score,
          );
          opts.urls.add(item.url);
          lastSkip = 'cross-cycle product-identity';
          continue;
        }

        const publishedAt = new Date().toISOString();

        // SP-A-064 Photo Intelligence V2: entity → multi-source mine → AI editor → local files.
        let images: import('../src/lib/collectors/photo-scout').ScoutImage[] = [];
        try {
          const report = await resolveArticlePhotos({
            slug,
            title: draft.title,
            text: draft.text,
            sourceUrl: item.url,
            fallbackUrl: imageUrl,
          });
          console.log(
            chalk.gray(
              `[photo-v2] entity=${report.entity.brand || report.entity.company || '?'} ` +
                `object=${report.entity.object || '?'} candidates=${report.candidatesFound} ` +
                `selected=${report.selected.length} match=${report.imageMatchLevel || 'n/a'} ` +
                `notes=${report.notes.join('; ')}`,
            ),
          );
          images = report.selected;
          if (report.imageMatchLevel) {
            (opts as any)._lastPhotoMeta = {
              imageMatchLevel: report.imageMatchLevel,
              imageLabel: report.imageLabel,
            };
          }
        } catch (err) {
          console.log(
            chalk.yellow(
              `[photo-v2] failed: ${err instanceof Error ? err.message : String(err)} — publishing NO IMAGE`,
            ),
          );
        }

        const photoMeta = (opts as any)._lastPhotoMeta as
          | { imageMatchLevel?: string; imageLabel?: string }
          | undefined;
        const article: Article = {
          id: slug,
          slug,
          title: draft.title,
          category: toPublicCategory('Гаджеты'),
          tags: toPublicTags([
            ...draft.tags.map((t) => t.replace(/^#/, '')),
            opts.cycle === 'news' ? 'новость' : 'обзор',
          ]),
          summary: summaryOf(draft.text),
          content: draft.text,
          sourceUrl: item.url,
          publishedAt,
          readTime: estimateReadTime(draft.text),
          ...(images.length ? { imageUrl: images[0].url, images } : {}),
          ...(photoMeta?.imageMatchLevel
            ? {
                imageMatchLevel: photoMeta.imageMatchLevel,
                imageLabel: photoMeta.imageLabel,
              }
            : {}),
          ...stampAuthorForPipeline(
            item.sourceName === READER_SCOUT_SOURCE_NAME ||
              item.channelHint === 'reader-scout' ||
              item.id.startsWith('reader-scout:')
              ? READER_SCOUT_AGENT_ID
              : 'newsroom-scout',
            { sourceUrl: item.url, slug },
          ),
        } as Article;

        // SP-A-082 — final AUTO gate before articles.json + SQLite (RSS / AI radar / Reader Scout).
        try {
          assertFinalAutoPublishAllowed({
            title: article.title,
            summary: article.summary,
            content: article.content,
            tags: article.tags,
            category: article.category,
            agentId:
              article.agentId ||
              (item.channelHint === 'reader-scout' ? READER_SCOUT_AGENT_ID : 'newsroom-scout'),
          });
        } catch (err) {
          if (err instanceof FinalAutoGateError) {
            console.log(chalk.yellow(`RSS blocked by final gate: ${err.message}`));
            await markRejected(fresh.journal, opts.journalPath, item, err.message, scout.score);
            opts.urls.add(item.url);
            lastSkip = err.message;
            continue;
          }
          throw err;
        }

        const deduped = filterRemovedArticles(
          fresh.articles.filter(
            (a) =>
              a.id !== article.id && a.slug !== article.slug && a.sourceUrl !== article.sourceUrl,
          ),
        );
        deduped.unshift(article);
        await writeFile(opts.articlesPath, JSON.stringify(deduped, null, 2) + '\n', 'utf8');
        await maybeSyncToSqlite(article);

        await mkdir(opts.draftsDir, { recursive: true });
        await writeFile(
          path.join(opts.draftsDir, `${Date.now()}-${slug}.json`),
          JSON.stringify(
            {
              generatedAt: publishedAt,
              channel: 'rss',
              cycle: opts.cycle,
              format: opts.format,
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

        if (!fresh.journal.processedUrls.includes(item.url)) {
          fresh.journal.processedUrls.push(item.url);
        }
        if (!fresh.journal.processedIds.includes(item.id)) {
          fresh.journal.processedIds.push(item.id);
        }
        fresh.journal.entries.push({
          id: item.id,
          url: item.url,
          title: draft.title,
          processedAt: publishedAt,
          status: 'published',
          scoutScore: scout.score,
          reason: selectedScouted.diversityNote
            ? `${scout.reason} [diversity: ${selectedScouted.diversityNote}]`
            : scout.reason,
          slug,
          channel: item.channelHint === 'reader-scout' ? 'reader-scout' : 'rss',
          cycle: opts.cycle,
        });
        await writeFile(opts.journalPath, JSON.stringify(fresh.journal, null, 2) + '\n', 'utf8');

        const publishedScoutId =
          item.submissionId ||
          (item.id.startsWith('reader-scout:') ? item.id.slice('reader-scout:'.length) : '');
        if (publishedScoutId) {
          await patchReaderScoutSubmission(publishedScoutId, {
            status: 'published',
            articleSlug: slug,
            rejectReason: undefined,
          });
        }

        opts.ids.add(slug);
        opts.urls.add(item.url);
        if (draftProductKey) opts.productIds.add(draftProductKey);
        if (sourceProductKey) opts.productIds.add(sourceProductKey);
        if (opts.lastPublish) {
          opts.lastPublish.title = draft.title;
          opts.lastPublish.slug = slug;
          opts.lastPublish.wowScore = scout.score;
        }

        opts.metrics.publisherStarted = true;
        opts.metrics.articlesPublished += 1;
        opts.metrics.reason = `published ${itemChannel}/${opts.cycle}`;
        opts.metrics.skipReason = 'none';
        console.log(
          chalk.green.bold(
            `Published (${itemChannel}/${opts.cycle}): "${draft.title}" (slug: ${slug})`,
          ),
        );
        console.log(`Live path: /articles/${slug}`);
        console.log(
          chalk.bold(
            `TICK_REPORT published=1 focus=${chosenFocus} channel=${itemChannel} diversity=${diversityDecisionLog} aiRadar=${aiRadarBest}`,
          ),
        );
        return true;
      } finally {
        releasePublishLock();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`RSS candidate error: ${msg}`));
      if (!opts.journal.processedUrls.includes(item.url)) {
        opts.journal.processedUrls.push(item.url);
      }
      if (!opts.journal.processedIds.includes(item.id)) {
        opts.journal.processedIds.push(item.id);
      }
      opts.urls.add(item.url);
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
      lastSkip = `rss error: ${msg}`;
    }
  }

  opts.metrics.skipReason = lastSkip;
  console.log(
    chalk.bold(
      `TICK_REPORT published=0 skip=${lastSkip} diversity=${diversityDecisionLog} aiRadar=${aiRadarBest}`,
    ),
  );
  // Soft AI/candidate exhaustion should not hard-fail the process for the supervisor.
  return false;
}

async function main(): Promise<void> {
  loadEnvFiles();
  // Dual supervisor / GHA set factory ON; re-assert China desk for internal pipeline.
  if (
    process.env.SMARTPROTO_ACCELERATED_CYCLE === 'true' ||
    process.env.SMARTPROTO_CYCLE_TYPE === 'news' ||
    process.env.SMARTPROTO_CYCLE_TYPE === 'article'
  ) {
    process.env.SMARTPROTO_FACTORY_ENABLED = 'true';
    process.env.CHINA_DEPARTMENT_ENABLED = 'true';
    process.env.CHINA_ALLOW_RECOMMEND = 'true';
  }
  const options = parseArgs(process.argv.slice(2));
  const event =
    process.env.GITHUB_EVENT_NAME?.trim() ||
    process.env.SMARTPROTO_TICK_EVENT?.trim() ||
    'local';

  const factoryEnabled = process.env.SMARTPROTO_FACTORY_ENABLED === 'true';
  if (!factoryEnabled && !options.force) {
    console.log('Factory switch: OFF. SMARTPROTO_FACTORY_ENABLED is not set to true. Quiet stop.');
    printFactoryTickSummary({
      factoryEnabled: false,
      event,
      metrics: emptyTickMetrics(
        'SMARTPROTO_FACTORY_ENABLED is not true',
        'SMARTPROTO_FACTORY_ENABLED is not true',
      ),
      commitCreated: false,
      pushDone: false,
    });
    return;
  }

  if (!process.env.OPENROUTER_API_KEY?.trim() && !options.dryRun) {
    console.error('OPENROUTER_API_KEY is missing. Abort.');
    printFactoryTickSummary({
      factoryEnabled,
      event,
      metrics: emptyTickMetrics('OPENROUTER_API_KEY missing', 'OPENROUTER_API_KEY missing'),
      commitCreated: false,
      pushDone: false,
    });
    process.exitCode = 1;
    return;
  }

  const root = process.cwd();
  const journalPath = path.resolve(root, 'data', 'factory-journal.json');
  const articlesPath = path.resolve(root, 'src', 'data', 'articles.json');
  const draftsDir = path.resolve(root, 'drafts');

  const { urls, ids, productIds, journal, articles } = await loadState(journalPath, articlesPath);
  const metrics = emptyTickMetrics(
    factoryEnabled ? 'factory on' : 'factory off (forced)',
    'in progress',
  );
  const lastPublish: { title?: string; slug?: string; wowScore?: number } = {};

  console.log(chalk.bold('=== Newsroom Tick (SP-A-054 dual factory) ==='));
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Factory: ${factoryEnabled ? 'ON' : 'OFF (forced)'}`);
  console.log(
    `Cycle: ${options.cycle} | format=${options.format} | dryRun=${options.dryRun ? 'YES' : 'NO'} | max 1 publish | scout≥${SCOUT_SCORE_THRESHOLD}`,
  );
  if (options.cycle === 'news') {
    console.log(
      `News cadence: ${Math.round(getNewsIntervalMs() / 60_000)}m` +
        (isNewsWarmupActive() ? ` WARMUP until ${getNewsWarmupUntilIso()}` : ' normal') +
        (options.force ? ' | BURST --force (cadence bypass)' : ''),
    );
  }

  // Warmup / normal floor — --force (owner burst) bypasses so control publishes can land.
  const cadence = checkCycleCadence({
    cycle: options.cycle,
    journal,
    force: options.force,
  });
  console.log(`Cadence: ${cadence.reason}`);
  if (!cadence.allow) {
    metrics.skipReason = cadence.reason;
    metrics.reason = 'cadence floor skip';
    printFactoryTickSummary({
      factoryEnabled: true,
      event,
      metrics,
      commitCreated: false,
      pushDone: false,
    });
    return;
  }

  const shared = {
    dryRun: options.dryRun,
    cycle: options.cycle,
    format: options.format,
    articlesPath,
    draftsDir,
    journalPath,
    urls,
    ids,
    productIds,
    journal,
    articles,
    metrics,
    lastPublish,
  };

  const chinaDone = await tryChinaPublishOnce(shared);
  if (chinaDone) {
    console.log(chalk.bold(`Tick complete (internal desk / ${options.cycle}).`));
    if (metrics.skipReason === 'in progress') metrics.skipReason = 'none';
    printFactoryTickSummary({
      factoryEnabled: true,
      event,
      metrics,
      commitCreated: false,
      pushDone: false,
      title: lastPublish.title,
      slug: lastPublish.slug,
      wowScore: lastPublish.wowScore,
    });
    return;
  }

  const refreshed = await loadState(journalPath, articlesPath);
  await publishRssOnce({
    ...shared,
    urls: refreshed.urls,
    ids: refreshed.ids,
    productIds: refreshed.productIds,
    journal: refreshed.journal,
    articles: refreshed.articles,
  });

  console.log(chalk.bold('Tick complete.'));
  if (metrics.skipReason === 'in progress') {
    metrics.skipReason = metrics.articlesPublished > 0 ? 'none' : 'tick idle';
  }
  if (!metrics.reason || metrics.reason === 'factory on' || metrics.reason === 'factory off (forced)') {
    metrics.reason =
      metrics.articlesPublished > 0 ? metrics.reason || 'published' : 'no publish this tick';
  }
  printFactoryTickSummary({
    factoryEnabled: true,
    event,
    metrics,
    commitCreated: false,
    pushDone: false,
    title: lastPublish.title,
    slug: lastPublish.slug,
    wowScore: lastPublish.wowScore,
  });
}

main()
  .catch((err) => {
    console.error(
      chalk.red(`Newsroom tick failed: ${err instanceof Error ? err.message : String(err)}`),
    );
    process.exitCode = 1;
  })
  .finally(() => {
    // OpenRouter keep-alive can hold the event loop; accelerated cycle needs a hard exit.
    process.exit(process.exitCode ?? 0);
  });
