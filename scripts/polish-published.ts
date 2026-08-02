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

/** Phrases that signal stock openers / endings to rewrite. */
const STALE_PHRASE_RE =
  /дожили|вчера казалось фантастикой|дожили до времени|вчера фантастика|представлена инновационн|представляем\s+\w|ребята,\s*вы просто не поверите|вы только посмотрите на это чудо/i;

const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;

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

function parseArgs(argv: string[]) {
  let limit = 6;
  let force = false;
  let dryRun = false;
  /** Default: recent cards (stale phrases first if any). Do not require «дожили». Use --cliche-only to filter. */
  let clicheOnly = false;
  const slugs = new Set<string>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') force = true;
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--recent') clicheOnly = false;
    else if (arg === '--cliche-only') clicheOnly = true;
    else if (arg.startsWith('--limit=')) limit = parseInt(arg.split('=')[1], 10) || 6;
    else if (arg === '--limit' && argv[i + 1]) limit = parseInt(argv[++i], 10) || 6;
    else if (arg.startsWith('--slugs=')) {
      for (const s of arg.split('=')[1].split(',')) {
        if (s.trim()) slugs.add(s.trim());
      }
    } else if (arg === '--slugs' && argv[i + 1]) {
      for (const s of argv[++i].split(',')) {
        if (s.trim()) slugs.add(s.trim());
      }
    }
  }

  return { limit: Math.min(Math.max(limit, 1), 8), force, dryRun, clicheOnly, slugs };
}

function stripEmoji(text: string): string {
  return text.replace(EMOJI_RE, '').replace(/[ \t]{2,}/g, ' ').replace(/\s+([!?.,:;])/g, '$1').trim();
}

function estimateReadTime(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 150));
  return `${minutes} мин`;
}

function hasStalePhrase(article: Article): boolean {
  const blob = `${article.title}\n${article.summary}\n${article.content}`;
  return STALE_PHRASE_RE.test(blob);
}

function pickTargets(
  articles: Article[],
  limit: number,
  clicheOnly: boolean,
  slugs: Set<string>,
): Article[] {
  const byDateDesc = [...articles].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  if (slugs.size > 0) {
    return byDateDesc.filter((a) => slugs.has(a.slug) || slugs.has(a.id)).slice(0, limit);
  }

  if (clicheOnly) {
    return byDateDesc.filter(hasStalePhrase).slice(0, limit);
  }

  // Prefer stale first, then fill with recent.
  const stale = byDateDesc.filter(hasStalePhrase);
  const rest = byDateDesc.filter((a) => !hasStalePhrase(a));
  return [...stale, ...rest].slice(0, limit);
}

function collectOpeners(articles: Article[], excludeSlug: string, max = 8): string[] {
  return articles
    .filter((a) => a.slug !== excludeSlug)
    .slice(0, 40)
    .map((a) => a.content.trim().split(/(?<=[.!?…])\s+/)[0] ?? '')
    .filter((s) => s.length > 12)
    .slice(0, max);
}

async function polishArticle(article: Article, avoidOpeners: string[]): Promise<PolishResult> {
  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model: POLISH_MODEL,
    temperature: 0.7,
    top_p: 0.92,
    max_tokens: 1100,
    messages: [
      {
        role: 'system',
        content: [
          'Ты editorial polish agent SmartProto — отдельный от Scout/Reviewer/Editor publish-flow.',
          'Твоя задача: переписать уже опубликованную карточку гаджета живее и разнообразнее.',
          'Стиль: восторженный product-блогер / TikTok-ревьюер, строго 150–200 слов.',
          'СОХРАНЯЙ факты: цены, спеки, бренды, статусы buy/preorder — только из исходного текста.',
          'НЕ выдумывай характеристики, даты, цены, бренды.',
          'ЗАПРЕЩЕНО штампы: «дожили», «дожили до времени», «вчера казалось фантастикой»,',
          '«ребята, вы просто не поверите», «вы только посмотрите на это чудо», «представлена инновационная».',
          'Без эмодзи. Без канцелярита пресс-релиза.',
          'Хук обязан быть УНИКАЛЬНЫМ и под этот продукт: curiosity / benefit / disbelief / practical win / TikTok-share.',
          'Title можно слегка улучшить; tags можно слегка подчистить — без выдуманных брендов/людей.',
          'Отвечай СТРОГО JSON без markdown.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          'Перепиши карточку. Верни СТРОГО JSON:',
          '{"title": string, "content": string, "summary": string, "tags": string[]}',
          '',
          'content: 150–200 слов, русский, живой блогерский стиль, уникальный opener под ЭТОТ товар.',
          'НЕ копируй зачины соседних статей. Избегай этих уже использованных openers:',
          ...(avoidOpeners.length
            ? avoidOpeners.map((o, i) => `${i + 1}) ${clampText(o, 120)}`)
            : ['(нет списка)']),
          'summary: 1–2 предложения из нового текста (до ~200 символов), без штампов.',
          'title: можно оставить или слегка улучшить (до 90 символов), без эмодзи.',
          'tags: 4–8 штук; можно слегка улучшить существующие, не выдумывай бренд/людей.',
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
    throw new Error(`Empty polish response for ${article.slug}`);
  }

  const parsed = parseJsonObject<PolishResult>(raw);
  if (typeof parsed.content !== 'string' || !parsed.content.trim()) {
    throw new Error(`Polish output missing content for ${article.slug}`);
  }
  if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
    throw new Error(`Polish output missing summary for ${article.slug}`);
  }

  const result: PolishResult = {
    content: stripEmoji(parsed.content),
    summary: stripEmoji(parsed.summary),
  };

  if (typeof parsed.title === 'string' && parsed.title.trim()) {
    result.title = stripEmoji(parsed.title);
  }

  if (
    Array.isArray(parsed.tags) &&
    parsed.tags.length > 0 &&
    parsed.tags.every((t) => typeof t === 'string' && t.trim().length > 0)
  ) {
    result.tags = parsed.tags.map((t) => stripEmoji(t.trim()));
  }

  // Soft reject if model still spat banned openers — keep old content via throw so caller can skip.
  if (STALE_PHRASE_RE.test(`${result.title ?? ''}\n${result.content}\n${result.summary}`)) {
    throw new Error(`Polish still contains stale phrases for ${article.slug}`);
  }

  return result;
}

async function main(): Promise<void> {
  loadEnvFiles();
  const { limit, force, dryRun, clicheOnly, slugs } = parseArgs(process.argv.slice(2));
  const factoryEnabled = process.env.SMARTPROTO_FACTORY_ENABLED === 'true';

  if (!factoryEnabled && !force) {
    console.log('Factory is OFF. Editorial polish agent was not started.');
    console.log('Factory switch: OFF');
    console.log('Force run: no');
    console.log('Polish started: no');
    process.exitCode = 0;
    return;
  }

  const raw = await readFile(articlesPath, 'utf8');
  const articles: Article[] = JSON.parse(raw.replace(/^\uFEFF/, ''));
  if (!Array.isArray(articles)) {
    throw new Error('articles.json must contain an array.');
  }

  const targets = pickTargets(articles, limit, clicheOnly, slugs);
  console.log(`Editorial polish agent`);
  console.log(`Factory switch: ${factoryEnabled ? 'ON' : 'OFF'}`);
  console.log(`Force run: ${force ? 'yes' : 'no'}`);
  console.log(`Mode: ${slugs.size ? 'explicit-slugs' : clicheOnly ? 'stale-phrases' : 'stale-then-recent'}`);
  console.log(`Limit: ${limit}`);
  console.log(`Targets: ${targets.length}`);

  if (targets.length === 0) {
    console.log('Nothing to polish.');
    return;
  }

  let polished = 0;
  let failed = 0;

  for (const target of targets) {
    const index = articles.findIndex((a) => a.id === target.id || a.slug === target.slug);
    if (index < 0) continue;

    console.log(`\n→ Polishing: ${target.slug}`);
    try {
      if (dryRun) {
        console.log('  (dry-run) skipped AI call');
        continue;
      }

      const avoidOpeners = collectOpeners(articles, target.slug);
      const result = await polishArticle(target, avoidOpeners);
      const next: Article = {
        ...articles[index],
        content: result.content,
        summary: result.summary,
        readTime: estimateReadTime(result.content),
      };
      if (result.title) next.title = result.title;
      if (result.tags) next.tags = result.tags;

      articles[index] = next;
      polished += 1;
      console.log(`  OK — ${result.content.split(/\s+/).length} words`);
    } catch (err) {
      failed += 1;
      console.error(`  FAIL: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!dryRun && polished > 0) {
    await writeFile(articlesPath, `${JSON.stringify(articles, null, 2)}\n`, 'utf8');
    console.log(`\nWrote ${polished} polished article(s) → ${articlesPath}`);
  }

  console.log(`\nDone. polished=${polished} failed=${failed}`);
}

main().catch((err) => {
  console.error('Editorial polish failed:', err);
  process.exit(1);
});
