/**
 * SP-A-072: rewrite last N published articles — remove hedge/disclaimer closers,
 * focus on interesting pros, target 100–300 words (prefer ~180–280).
 *
 * Dump from Hetzner:
 *   python3 -c '...' > data/spa072-last30.json
 * Rewrite:
 *   npx tsx scripts/spa072-rewrite-recent.ts --in data/spa072-last30.json --out data/spa072-rewritten.json
 * Apply:
 *   python3 scripts/spa072-apply-rewritten.py --db /opt/apps/smartproto/data/smartproto.db --in data/spa072-rewritten.json
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { getOpenRouterClient, parseJsonObject, clampText } from '../src/lib/ai/shared';
import { stripHedgeDisclaimers, containsHedgeDisclaimer } from '../src/lib/ai/editor';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const MODEL = process.env.OPENROUTER_EDITOR_MODEL ?? 'google/gemini-2.5-flash-lite';
const MIN_WORDS = 100;
const MAX_WORDS = 300;
const TARGET_MIN = 180;
const TARGET_MAX = 280;

interface ArticleRow {
  slug: string;
  id?: string;
  title: string;
  category?: string;
  tags: string | string[];
  summary: string;
  content: string;
  sourceUrl?: string;
  publishedAt?: string;
  readTime?: string;
  imageUrl?: string | null;
}

interface RewriteResult {
  title: string;
  content: string;
  summary: string;
  tags: string[];
}

const BANNED_CLICHE_RE =
  /дожил(?:и|а|о)?(?:\s+до\s+времени)?|вчера казалось фантастикой|ребята|друзья|просто\s+вау|\bвау\b|wow[!]?|вы\s+не\s+поверите|это\s+чудо|это\s+бомба|революционн|потрясающ|фантастическ|гениальн|изменит\s+мир|переверн[её]т\s+рынок|маст-?хэв|идеальный\s+выбор/i;

const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;

function parseArgs(argv: string[]) {
  let input = 'data/spa072-last30.json';
  let output = 'data/spa072-rewritten.json';
  let limit = 0;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in' && argv[i + 1]) input = argv[++i];
    else if (a.startsWith('--in=')) input = a.split('=')[1];
    else if (a === '--out' && argv[i + 1]) output = argv[++i];
    else if (a.startsWith('--out=')) output = a.split('=')[1];
    else if (a === '--limit' && argv[i + 1]) limit = Number(argv[++i]) || 0;
  }
  return {
    input: path.resolve(process.cwd(), input),
    output: path.resolve(process.cwd(), output),
    limit,
  };
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function estimateReadTime(text: string): string {
  const minutes = Math.max(1, Math.ceil(wordCount(text) / 150));
  return `${minutes} мин`;
}

function containsCjk(text: string): boolean {
  return CJK_RE.test(text);
}

function stripCjkModelNames(text: string): string {
  return text
    .replace(/REDMI\s*投影仪\s*5\s*Pro/gi, 'Redmi Projector 5 Pro')
    .replace(/Redmi\s*投影仪\s*5\s*Pro/gi, 'Redmi Projector 5 Pro')
    .replace(/投影仪\s*5\s*Pro/gi, 'Projector 5 Pro')
    .replace(/投影仪/g, 'Projector')
    .replace(CJK_RE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function normalizeTags(tags: string | string[] | undefined): string {
  if (Array.isArray(tags)) return tags.join(', ');
  return typeof tags === 'string' ? tags : '';
}

async function rewriteOne(article: ArticleRow, avoidTitles: string[]): Promise<RewriteResult> {
  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.42,
    top_p: 0.9,
    max_tokens: 1600,
    messages: [
      {
        role: 'system',
        content: [
          'Ты спокойный компетентный редактор SmartProto. Перепиши уже опубликованную карточку.',
          'ГОЛОС: мужской / безличный. Не блогер, не продавец.',
          '',
          'ГЛАВНОЕ ЗАДАНИЕ:',
          '1) Убери ВСЕ «охлаждающие» опровержения и оговорки — плевки в чай.',
          'Запрещено: независимые испытания/тесты пока не проводились; характеристики/автономность не уточняются;',
          'не раскрывается; информация отсутствует; остаются неизвестными; затрудняет оценку;',
          'производитель не уточнил; детальные технические характеристики не уточняются;',
          'любые финальные абзацы про то, чего нет.',
          '2) Сделай интересный обзор о ПЛЮСАХ и пользе: что умеет, кому помогает, чем интересно.',
          '3) Длина content: от 100 до 300 русских слов. Цель 180–280. 3–5 абзацев.',
          '',
          'Нет данных в исходнике — просто не пиши про это (не объявляй отсутствие).',
          'Не выдумывай спеки, цены, даты, отзывы.',
          'Без «!», без цен, URL, shop CTA, эмодзи, хайпа (революционный/бомба/вау).',
          'Китайские иероглифы запрещены; имена моделей — латиница (Redmi Projector 5 Pro).',
          'Title без «!»; не шаблон «Бренд: спека»; title ≠ первое предложение текста.',
          'Отвечай СТРОГО JSON без markdown.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          'Перепиши карточку. Верни СТРОГО JSON:',
          '{"title":string,"content":string,"summary":string,"tags":string[]}',
          '',
          'title: до 90 символов; интересный хук по факту; без «!»; без иероглифов.',
          `content: ${MIN_WORDS}–${MAX_WORDS} слов (цель ${TARGET_MIN}–${TARGET_MAX}). Фокус на плюсах и сценариях.`,
          'БЕЗ оговорок про отсутствие тестов/данных. Перед ответом посчитай слова.',
          'summary: 1–2 предложения (~140–220 символов) из нового текста.',
          'tags: 4–8; без Китай/Qwen/Gemini и без иероглифов.',
          'Избегай похожих title:',
          ...(avoidTitles.length ? avoidTitles.map((t, i) => `${i + 1}) ${t}`) : ['(нет)']),
          '',
          'Исходник:',
          clampText(
            JSON.stringify(
              {
                title: article.title,
                summary: article.summary,
                content: article.content,
                tags: normalizeTags(article.tags),
                sourceUrl: article.sourceUrl,
                slug: article.slug,
              },
              null,
              2,
            ),
            9000,
          ),
        ].join('\n'),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error(`Empty rewrite for ${article.slug}`);
  }

  const parsed = parseJsonObject<RewriteResult>(raw);
  if (!parsed.title?.trim() || !parsed.content?.trim() || !parsed.summary?.trim()) {
    throw new Error(`Bad rewrite shape for ${article.slug}`);
  }
  if (!Array.isArray(parsed.tags) || parsed.tags.length === 0) {
    throw new Error(`Missing tags for ${article.slug}`);
  }
  if (/!/.test(parsed.title)) {
    throw new Error(`Exclamation in title for ${article.slug}`);
  }
  if (BANNED_CLICHE_RE.test(`${parsed.title}\n${parsed.content}`)) {
    throw new Error(`Banned cliche in rewrite for ${article.slug}`);
  }

  let title = stripCjkModelNames(parsed.title.trim());
  let content = stripHedgeDisclaimers(stripCjkModelNames(parsed.content.trim()));
  let summary = stripHedgeDisclaimers(stripCjkModelNames(parsed.summary.trim()));
  const tags = parsed.tags.map((t) => stripCjkModelNames(String(t).trim())).filter(Boolean);

  if (!content) {
    throw new Error(`Empty after hedge strip for ${article.slug}`);
  }
  if (containsCjk(`${title}\n${content}\n${summary}\n${tags.join(' ')}`)) {
    throw new Error(`CJK characters remain in rewrite for ${article.slug}`);
  }
  if (containsHedgeDisclaimer(title, content) || containsHedgeDisclaimer('', summary)) {
    // second pass strip already done — fail soft by cutting offending sentences again
    content = stripHedgeDisclaimers(content);
    summary = stripHedgeDisclaimers(summary) || content.split(/(?<=[.!?…])\s+/).slice(0, 2).join(' ');
  }
  if (containsHedgeDisclaimer(title, content)) {
    throw new Error(`Hedge remains for ${article.slug}`);
  }

  let wc = wordCount(content);
  if (wc < MIN_WORDS) {
    content = stripHedgeDisclaimers(stripCjkModelNames(await expandContent(article, title, content)));
    wc = wordCount(content);
  }
  if (wc < MIN_WORDS) {
    throw new Error(`Too short (${wc} words) for ${article.slug}`);
  }
  if (wc > MAX_WORDS + 40) {
    // Soft trim by paragraphs if wildly over
    const paras = content.split(/\n{2,}/).filter(Boolean);
    while (paras.length > 2 && wordCount(paras.join('\n\n')) > MAX_WORDS) {
      paras.pop();
    }
    content = paras.join('\n\n');
    wc = wordCount(content);
  }
  if (!summary.trim()) {
    summary = content.split(/(?<=[.!?…])\s+/).slice(0, 2).join(' ');
  }

  return { title, content, summary, tags };
}

async function expandContent(article: ArticleRow, title: string, content: string): Promise<string> {
  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.4,
    max_tokens: 1400,
    messages: [
      {
        role: 'system',
        content: [
          `Расширь русский текст SmartProto до ${TARGET_MIN}–${TARGET_MAX} слов.`,
          'Добавь сценарии пользы и плюсы по фактам исходника. Без оговорок про отсутствие тестов/данных.',
          'Без цен, URL, хайпа, иероглифов. Верни СТРОГО JSON {"content":string}.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          `title: ${title}`,
          `current words: ${wordCount(content)}`,
          'current content:',
          content,
          '',
          'facts source:',
          clampText(`${article.title}\n${article.summary}\n${article.content}`, 5000),
        ].join('\n'),
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (typeof raw !== 'string' || !raw.trim()) return content;
  try {
    const parsed = parseJsonObject<{ content: string }>(raw);
    return parsed.content?.trim() || content;
  } catch {
    return content;
  }
}

async function main() {
  const { input, output, limit } = parseArgs(process.argv.slice(2));
  const raw = await readFile(input, 'utf8');
  let articles = JSON.parse(raw) as ArticleRow[];
  if (!Array.isArray(articles) || articles.length === 0) {
    throw new Error(`No articles in ${input}`);
  }
  if (limit > 0) articles = articles.slice(0, limit);

  const out: Array<ArticleRow & RewriteResult & { readTime: string; wordCount: number }> = [];
  const avoidTitles: string[] = [];

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    console.log(`[${i + 1}/${articles.length}] ${article.slug} (${wordCount(article.content)} words)…`);
    let lastErr: unknown;
    let result: RewriteResult | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        result = await rewriteOne(article, avoidTitles.slice(-8));
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`  attempt ${attempt} failed:`, err instanceof Error ? err.message : err);
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
    if (!result) {
      throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    }
    const wc = wordCount(result.content);
    console.log(`  → ${wc} words | ${result.title.slice(0, 70)}`);
    avoidTitles.push(result.title);
    out.push({
      ...article,
      title: result.title,
      content: result.content,
      summary: result.summary,
      tags: result.tags,
      readTime: estimateReadTime(result.content),
      wordCount: wc,
    });
  }

  await writeFile(output, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Wrote ${out.length} rewrites → ${output}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
