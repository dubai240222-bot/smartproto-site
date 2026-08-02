import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getOpenRouterClient, parseJsonObject, clampText } from '../src/lib/ai/shared';

function loadEnvFiles(): void {
  const root = process.cwd();
  dotenv.config({ path: path.resolve(root, '.env.local'), override: true, quiet: true });
  dotenv.config({ path: path.resolve(root, '.env'), quiet: true });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const articlesPath = path.resolve(__dirname, '..', 'src', 'data', 'articles.json');

const POLISH_MODEL = process.env.OPENROUTER_EDITOR_MODEL ?? 'google/gemini-2.5-flash-lite';

/** Stock openers / endings that must never ship. */
const STALE_PHRASE_RE =
  /дожили(?:\s+до\s+времени)?|вчера казалось фантастикой|вчера фантастика|представлена инновационн|представляем\s+\w/i;

/** Soft monotony / melodrama cues — OK once, boring or too emotional when overused. */
const MONOTONE_OPENER_RE =
  /^(?:вау[,!]?\s+)?(?:ребята[,!]?\s+|подождите[.!]?\s+|смотрите[,:]?\s+|смотри[,:]?\s+|хотите\s+|сложно\s+угадать|представьте[:!]?\s+|это\s+же\s+)/i;

/** Over-the-top emotional gushing — chief editor softens these. */
const MELODRAMA_RE =
  /гениально[!]?|просто\s+вау|вы\s+не\s+поверите|это\s+чудо|огонь[!]|обалдеть|невероятн\w*\s+вау|офигенн/i;

interface Article {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  content: string;
  sourceUrl: string;
  publishedAt: string;
  readTime: string;
  imageUrl?: string;
  tags?: string[];
}

interface PolishResult {
  title?: string;
  content: string;
  summary: string;
  tags?: string[];
}

type FlagReason =
  | 'stale-phrase'
  | 'shared-opener'
  | 'similar-first-sentence'
  | 'monotone-opener'
  | 'melodrama'
  | 'too-short'
  | 'force-all';

interface FlaggedArticle {
  article: Article;
  reasons: FlagReason[];
  score: number;
}

function parseArgs(argv: string[]) {
  let limit = 10;
  let force = false;
  let dryRun = false;
  let all = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') force = true;
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--all') all = true;
    else if (arg.startsWith('--limit=')) limit = parseInt(arg.split('=')[1], 10) || 10;
    else if (arg === '--limit' && argv[i + 1]) limit = parseInt(argv[++i], 10) || 10;
  }

  if (all) limit = Number.POSITIVE_INFINITY;
  else limit = Math.min(Math.max(limit, 1), 50);

  return { limit, force, dryRun, all };
}

function estimateReadTime(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 150));
  return `${minutes} мин`;
}

function firstSentence(text: string): string {
  const trimmed = (text || '').trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^[\s\S]+?[.!?…]+(?:\s|$)/);
  return (match?.[0] ?? trimmed.split(/\n/)[0] ?? trimmed).trim();
}

function normalizeOpener(text: string): string {
  return firstSentence(text)
    .toLowerCase()
    .replace(/[«»"'“”‘’]/g, '')
    .replace(/[^а-яa-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 8)
    .join(' ');
}

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[«»"'“”‘’]/g, '')
      .replace(/[^а-яa-z0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hasStalePhrase(article: Article): boolean {
  return STALE_PHRASE_RE.test(`${article.title}\n${article.summary}\n${article.content}`);
}

function inspectCorpus(articles: Article[]): FlaggedArticle[] {
  const openers = articles.map((a) => normalizeOpener(a.content));
  const openerCounts = new Map<string, number>();
  for (const o of openers) {
    if (!o) continue;
    openerCounts.set(o, (openerCounts.get(o) ?? 0) + 1);
  }

  const firstSets = articles.map((a) => tokenSet(firstSentence(a.content)));
  const similarHits = new Set<number>();

  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      const sim = jaccard(firstSets[i], firstSets[j]);
      if (sim >= 0.55) {
        similarHits.add(i);
        similarHits.add(j);
      }
    }
  }

  const flagged: FlaggedArticle[] = [];

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const reasons: FlagReason[] = [];
    let score = 0;
    const opener = openers[i];
    const wc = wordCount(article.content);

    if (hasStalePhrase(article)) {
      reasons.push('stale-phrase');
      score += 100;
    }

    if (opener && (openerCounts.get(opener) ?? 0) >= 2) {
      reasons.push('shared-opener');
      score += 40;
    }

    if (similarHits.has(i)) {
      reasons.push('similar-first-sentence');
      score += 30;
    }

    if (MONOTONE_OPENER_RE.test(article.content.trim())) {
      reasons.push('monotone-opener');
      score += 15;
    }

    if (MELODRAMA_RE.test(`${article.title}\n${article.summary}\n${article.content}`)) {
      reasons.push('melodrama');
      score += 35;
    }

    if (wc > 0 && wc < 140) {
      reasons.push('too-short');
      score += 10;
    }

    if (reasons.length > 0) {
      flagged.push({ article, reasons, score });
    }
  }

  return flagged.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (
      new Date(b.article.publishedAt).getTime() - new Date(a.article.publishedAt).getTime()
    );
  });
}

function pickTargets(
  articles: Article[],
  flagged: FlaggedArticle[],
  limit: number,
  all: boolean,
): FlaggedArticle[] {
  if (all) {
    // Polish everything; prefer flagged first, then remaining recent.
    const flaggedIds = new Set(flagged.map((f) => f.article.id));
    const rest: FlaggedArticle[] = articles
      .filter((a) => !flaggedIds.has(a.id))
      .sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      )
      .map((article) => ({ article, reasons: ['force-all' as FlagReason], score: 0 }));
    return [...flagged, ...rest];
  }

  // Prefer flagged; if fewer than limit, fill with recent unflagged for variety pass.
  if (flagged.length >= limit) return flagged.slice(0, limit);

  const flaggedIds = new Set(flagged.map((f) => f.article.id));
  const fillers = articles
    .filter((a) => !flaggedIds.has(a.id))
    .sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    )
    .slice(0, limit - flagged.length)
    .map((article) => ({
      article,
      reasons: ['force-all' as FlagReason],
      score: 1,
    }));

  return [...flagged, ...fillers];
}

async function polishArticle(
  article: Article,
  reasons: FlagReason[],
  corpusOpeners: string[],
): Promise<PolishResult> {
  const client = getOpenRouterClient();
  const avoidOpeners = corpusOpeners
    .filter(Boolean)
    .slice(0, 12)
    .map((o, i) => `${i + 1}. ${o}`)
    .join('\n');

  const completion = await client.chat.completions.create({
    model: POLISH_MODEL,
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: 1400,
    messages: [
      {
        role: 'system',
        content: [
          'Ты editor-in-chief SmartProto — финальный редактор корпуса опубликованных карточек.',
          'Задача: убрать мелодраму и монотонность; усилить желание узнать больше и купить ASAP.',
          'Стиль: уверенный product-блогер — спокойная уверенность, польза, buy/learn-more urgency.',
          'НЕ мелодрама, НЕ истеричный восторг, НЕ эмодзи, НЕ пустое «вау».',
          'ЖЁСТКО: content ровно 150–200 слов (считай слова; короче 150 — провал).',
          'СОХРАНЯЙ факты: цены, спеки, бренды, buy/preorder — только из исходника. НЕ выдумывай.',
          'ЗАПРЕЩЕНО: клише «будущее уже здесь» / «вчера это была фантастика» и клоны;',
          'также «представлена инновационная…». Бан stock-фраз проверяется кодом.',
          'Хук уникальный под ЭТОТ продукт: польза / сценарий / сравнение / факт / лёгкий скепсис.',
          'Не начинай с «Ребята…», «Вау…», «Подождите…», «Смотри…», «Представьте…» — варьируй форму.',
          'Структура: продукт → зачем полезен → почему действовать сейчас → где/когда купить если известно.',
          'Title можно слегка улучшить; tags — подчистить без выдуманных брендов/людей.',
          'Отвечай СТРОГО JSON без markdown. Экранируй кавычки внутри строк.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          'Перепиши карточку как editor-in-chief. Верни СТРОГО JSON:',
          '{"title": string, "content": string, "summary": string, "tags": string[]}',
          '',
          `Причины флага инспектора: ${reasons.join(', ')}`,
          'content: ОБЯЗАТЕЛЬНО 150–200 слов, русский, уверенный product-блогер, уникальный opener.',
          'Смягчи хайп; сохрани buy intent. Разверни: хук → что это → 3–5 выгод → цена/статус → финал CTA.',
          'summary: 1–2 предложения из нового текста (до ~200 символов), без штампов и мелодрамы.',
          'title: можно оставить или слегка улучшить (до 90 символов).',
          'tags: 4–8 штук; можно улучшить существующие, не выдумывай бренд/людей.',
          '',
          'НЕ копируй эти чужие зачины корпуса (сделай другой угол):',
          avoidOpeners || '(нет)',
          '',
          'Исходная карточка:',
          clampText(
            JSON.stringify(
              {
                title: article.title,
                content: article.content,
                summary: article.summary,
                tags: article.tags ?? [],
                category: article.category,
                sourceUrl: article.sourceUrl,
              },
              null,
              2,
            ),
            8000,
          ),
        ].join('\n'),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error(`Empty inspect-polish response for ${article.slug}`);
  }

  const parsed = parseJsonObject<PolishResult>(raw);
  if (typeof parsed.content !== 'string' || !parsed.content.trim()) {
    throw new Error(`Inspect-polish missing content for ${article.slug}`);
  }
  if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
    throw new Error(`Inspect-polish missing summary for ${article.slug}`);
  }

  const result: PolishResult = {
    content: parsed.content.trim(),
    summary: parsed.summary.trim(),
  };

  if (typeof parsed.title === 'string' && parsed.title.trim()) {
    result.title = parsed.title.trim();
  }

  if (
    Array.isArray(parsed.tags) &&
    parsed.tags.length > 0 &&
    parsed.tags.every((t) => typeof t === 'string' && t.trim().length > 0)
  ) {
    result.tags = parsed.tags.map((t) => t.trim());
  }

  if (STALE_PHRASE_RE.test(`${result.title ?? ''}\n${result.content}\n${result.summary}`)) {
    throw new Error(`Inspect-polish still contains stale phrases for ${article.slug}`);
  }

  return result;
}

async function main(): Promise<void> {
  loadEnvFiles();
  const { limit, force, dryRun, all } = parseArgs(process.argv.slice(2));
  const factoryEnabled = process.env.SMARTPROTO_FACTORY_ENABLED === 'true';

  if (!factoryEnabled && !force) {
    console.log('Factory is OFF. Editor-inspector was not started.');
    console.log('Factory switch: OFF');
    console.log('Force run: no');
    console.log('Inspect started: no');
    process.exitCode = 0;
    return;
  }

  const raw = await readFile(articlesPath, 'utf8');
  const articles: Article[] = JSON.parse(raw.replace(/^\uFEFF/, ''));
  if (!Array.isArray(articles)) {
    throw new Error('articles.json must contain an array.');
  }

  const flagged = inspectCorpus(articles);
  const targets = pickTargets(articles, flagged, limit, all);

  console.log('Editor-inspector / polish');
  console.log(`Factory switch: ${factoryEnabled ? 'ON' : 'OFF'}`);
  console.log(`Force run: ${force ? 'yes' : 'no'}`);
  console.log(`Mode: ${all ? 'all' : 'flagged-then-recent'}`);
  console.log(`Articles: ${articles.length}`);
  console.log(`Flagged: ${flagged.length}`);
  console.log(`Targets: ${targets.length}${all ? '' : ` (limit ${limit})`}`);
  console.log(
    'Checks: stale-phrase, melodrama, shared openers, similar first sentences, monotone openers, too-short',
  );

  if (targets.length === 0) {
    console.log('Nothing to polish.');
    return;
  }

  for (const t of targets.slice(0, 20)) {
    console.log(`  · ${t.article.slug} [${t.reasons.join('+')}] score=${t.score}`);
  }

  let polished = 0;
  let failed = 0;
  const usedOpeners: string[] = articles.map((a) => firstSentence(a.content)).filter(Boolean);

  for (const target of targets) {
    const index = articles.findIndex(
      (a) => a.id === target.article.id || a.slug === target.article.slug,
    );
    if (index < 0) continue;

    console.log(`\n→ Inspect-polish: ${target.article.slug}`);
    console.log(`  reasons: ${target.reasons.join(', ')}`);

    try {
      if (dryRun) {
        console.log('  (dry-run) skipped AI call');
        continue;
      }

      const others = usedOpeners.filter(
        (o) => normalizeOpener(o) !== normalizeOpener(target.article.content),
      );
      const result = await polishArticle(target.article, target.reasons, others);
      const next: Article = {
        ...articles[index],
        content: result.content,
        summary: result.summary,
        readTime: estimateReadTime(result.content),
      };
      if (result.title) next.title = result.title;
      if (result.tags) next.tags = result.tags;

      articles[index] = next;
      usedOpeners[index] = firstSentence(result.content);
      polished += 1;
      console.log(`  OK — ${wordCount(result.content)} words`);
    } catch (err) {
      failed += 1;
      console.error(`  FAIL: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!dryRun && polished > 0) {
    // Final sweep: hard-strip residual banned phrases if any slipped through elsewhere.
    let residual = 0;
    for (const a of articles) {
      if (hasStalePhrase(a)) residual += 1;
    }
    await writeFile(articlesPath, `${JSON.stringify(articles, null, 2)}\n`, 'utf8');
    console.log(`\nWrote ${polished} polished article(s) → ${articlesPath}`);
    console.log(`Residual stale-phrase articles remaining: ${residual}`);
  }

  console.log(`\nDone. polished=${polished} failed=${failed} flagged=${flagged.length}`);
}

main().catch((err) => {
  console.error('Editor-inspector failed:', err);
  process.exit(1);
});
