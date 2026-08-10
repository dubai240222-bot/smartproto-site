/**
 * SP-A-071 one-shot: rewrite recent published cards into longer informative copy
 * with soft curiosity titles and precise model names. Updates a JSON dump; apply
 * to Hetzner SQLite separately.
 *
 *   npx tsx scripts/spa071-rewrite-recent.ts --in data/spa071-last6.json --out data/spa071-rewritten.json
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { getOpenRouterClient, parseJsonObject, clampText } from '../src/lib/ai/shared';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true, quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const MODEL = process.env.OPENROUTER_EDITOR_MODEL ?? 'google/gemini-2.5-flash-lite';

interface ArticleRow {
  slug: string;
  id: string;
  title: string;
  category: string;
  tags: string;
  summary: string;
  content: string;
  sourceUrl: string;
  publishedAt: string;
  readTime: string;
  imageUrl?: string | null;
  author?: string | null;
  authorDesk?: string | null;
  agentId?: string | null;
}

interface RewriteResult {
  title: string;
  content: string;
  summary: string;
  tags: string[];
}

const BANNED_CLICHE_RE =
  /дожил(?:и|а|о)?(?:\s+до\s+времени)?|вчера казалось фантастикой|ребята|друзья|просто\s+вау|\bвау\b|wow[!]?|вы\s+не\s+поверите|это\s+чудо|это\s+бомба|революционн|потрясающ|фантастическ|гениальн|изменит\s+мир|переверн[её]т\s+рынок|маст-?хэв|идеальный\s+выбор/i;

function parseArgs(argv: string[]) {
  let input = 'data/spa071-last6.json';
  let output = 'data/spa071-rewritten.json';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in' && argv[i + 1]) input = argv[++i];
    else if (a.startsWith('--in=')) input = a.split('=')[1];
    else if (a === '--out' && argv[i + 1]) output = argv[++i];
    else if (a.startsWith('--out=')) output = a.split('=')[1];
  }
  return {
    input: path.resolve(process.cwd(), input),
    output: path.resolve(process.cwd(), output),
  };
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function estimateReadTime(text: string): string {
  const minutes = Math.max(1, Math.ceil(wordCount(text) / 150));
  return `${minutes} мин`;
}

function modelPrecisionHint(article: ArticleRow): string {
  const blob = `${article.slug}\n${article.title}\n${article.content}`.toLowerCase();
  if (/redmi.?17|china-redmi-17/.test(blob)) {
    return [
      'ТОЧНОСТЬ МОДЕЛИ: всегда пиши полное имя «Redmi 17 5G» (и отдельно «Redmi 17 4G», если речь о 4G-версии).',
      'Нельзя сокращать до просто «Redmi» / «редми» без номера модели, когда речь о смартфоне.',
      'В title можно вопрос про автономность, но в первом абзаце текста обязательно «Xiaomi / Redmi 17 5G» с фактом батареи.',
    ].join(' ');
  }
  if (/投影仪|projector|china-redmi(?!-17)/.test(blob) || article.slug === 'china-redmi') {
    return [
      'ТОЧНОСТЬ МОДЕЛИ: это проектор — ТОЛЬКО «Redmi Projector 5 Pro» (латиница + номер).',
      'ЗАПРЕЩЕНО писать китайские иероглифы (投影仪 и любые другие). Имя модели всегда переводить.',
      'Не путай со смартфоном Redmi 17 5G. Не пиши просто «Redmi» без «Projector 5 Pro».',
    ].join(' ');
  }
  if (/ms-03|minisforum/.test(blob)) {
    return 'ТОЧНОСТЬ МОДЕЛИ: всегда «Minisforum MS-03» + конкретный CPU (Intel Core Ultra 5 336H), не просто «мини-ПК».';
  }
  if (/xboom|lg/.test(blob) && /blast/.test(blob)) {
    return 'ТОЧНОСТЬ МОДЕЛИ: всегда «LG Xboom Blast», не просто «LG» или «Xboom».';
  }
  if (/hoverair|versa/.test(blob)) {
    return 'ТОЧНОСТЬ МОДЕЛИ: всегда «HoverAir Versa», не просто «HoverAir» или «дрон».';
  }
  if (/guitar|robot|3d/.test(blob)) {
    return 'ТОЧНОСТЬ МОДЕЛИ: если в исходнике есть имя проекта/автора — сохрани; иначе «3D-печатный робот-гитарист» без выдуманного бренда.';
  }
  return 'ТОЧНОСТЬ МОДЕЛИ: используй полное точное имя продукта из исходника, не сокращай до бренда.';
}

async function rewriteOne(article: ArticleRow, avoidTitles: string[]): Promise<RewriteResult> {
  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.45,
    top_p: 0.9,
    max_tokens: 1800,
    messages: [
      {
        role: 'system',
        content: [
          'Ты спокойный компетентный редактор SmartProto. Перепиши уже опубликованную карточку.',
          'ГОЛОС: только мужской / безличный. Без «ребята/друзья», без витрины и «купи здесь».',
          'Длина content: РОВНО 250–300 русских слов (считай!). Минимум 250. 4–5 абзацев.',
          'Если текста мало — расширь конкретикой по фактам исходника (сценарии, отличия, ограничения), без воды и повторов.',
          'ЗАГОЛОВОК: мягкий curiosity-hook по РЕАЛЬНОМУ факту (часто вопрос). Без «!».',
          'Плохо: «Redmi 17 5G: смартфон с батареей 7500 мАч».',
          'Хорошо: «А хватит ли заряда на неделю?» — факт модели в первом абзаце.',
          'Title ≠ первое предложение текста. Не начинай content с дословного title.',
          'Первый абзац: кто/что представил + ТОЧНОЕ имя модели + ключевая особенность.',
          'Дальше: как устроено, кому полезно, чем отличается, ограничения/неизвестное.',
          'Не выдумывай спеки/цены/даты. Нет данных — опусти или «не уточнено».',
          'Без цен, URL, shop CTA, эмодзи, хайпа (революционный/бомба/вау).',
          'КИТАЙСКИЕ ИЕРОГЛИФЫ ЗАПРЕЩЕНЫ в title/content/summary/tags. Имя модели всегда переводи на латиницу',
          '(пример: 投影仪 → Projector; пиши «Redmi Projector 5 Pro», никогда «REDMI 投影仪 5 Pro»).',
          'Отвечай СТРОГО JSON без markdown.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          'Перепиши карточку. Верни СТРОГО JSON:',
          '{"title":string,"content":string,"summary":string,"tags":string[]}',
          '',
          modelPrecisionHint(article),
          '',
          'title: до 90 символов, curiosity-hook, без «!», без шаблона «Модель: спека», без иероглифов.',
          'content: ОБЯЗАТЕЛЬНО 250–300 слов (не меньше 250). Информативно, без воды. Без китайских иероглифов.',
          'Перед ответом мысленно посчитай слова в content — если <250, допиши ещё абзац про сценарий пользы и ограничения.',
          'summary: 1–2 предложения из нового текста (~160–220 символов), с точным переведённым именем модели.',
          'tags: 4–8; латиница/русский; модель полностью; без иероглифов и без Китай/Qwen/Gemini.',
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
                tags: article.tags,
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
  let content = stripCjkModelNames(parsed.content.trim());
  let summary = stripCjkModelNames(parsed.summary.trim());
  let tags = parsed.tags.map((t) => stripCjkModelNames(String(t).trim())).filter(Boolean);

  if (containsCjk(`${title}\n${content}\n${summary}\n${tags.join(' ')}`)) {
    throw new Error(`CJK characters remain in rewrite for ${article.slug}`);
  }

  let wc = wordCount(content);
  if (wc < 220) {
    content = stripCjkModelNames(await expandContent(article, title, content));
    wc = wordCount(content);
  }
  if (wc < 200) {
    throw new Error(`Too short (${wc} words) for ${article.slug}`);
  }
  if (containsCjk(content)) {
    throw new Error(`CJK characters remain after expand for ${article.slug}`);
  }

  return { title, content, summary, tags };
}

const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;

function containsCjk(text: string): boolean {
  return CJK_RE.test(text);
}

/** Map known Chinese product fragments to Latin; drop leftover CJK. */
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

async function expandContent(article: ArticleRow, title: string, content: string): Promise<string> {
  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.4,
    max_tokens: 1600,
    messages: [
      {
        role: 'system',
        content: [
          'Расширь русский текст заметки SmartProto до 250–300 слов. Сохрани факты и точные имена моделей на латинице.',
          'Без китайских иероглифов, хайпа, цен, URL, эмодзи. Верни СТРОГО JSON {"content":string}.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          modelPrecisionHint(article),
          `title: ${title}`,
          'Ниже черновик — расширь до 250–300 слов: добавь сценарий пользы, отличие от привычного, ограничения. Не меняй смысл.',
          'Черновик:',
          content,
          '',
          'Факты исходника (не выдумывай сверх них):',
          clampText(article.content, 4000),
        ].join('\n'),
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (typeof raw !== 'string' || !raw.trim()) return content;
  try {
    const parsed = parseJsonObject<{ content: string }>(raw);
    if (typeof parsed.content === 'string' && wordCount(parsed.content) > wordCount(content)) {
      return parsed.content.trim();
    }
  } catch {
    /* keep original */
  }
  return content;
}

async function main(): Promise<void> {
  const { input, output } = parseArgs(process.argv.slice(2));
  const rows = JSON.parse(await readFile(input, 'utf8')) as ArticleRow[];
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Input must be a non-empty article array');
  }

  console.log(`SP-A-071 rewrite recent: ${rows.length} cards`);
  const out: ArticleRow[] = [];
  const usedTitles: string[] = [];

  for (const row of rows) {
    console.log(`\n→ ${row.slug}`);
    console.log(`  old: ${row.title}`);
    let lastErr: unknown;
    let result: RewriteResult | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        result = await rewriteOne(row, usedTitles);
        break;
      } catch (err) {
        lastErr = err;
        console.log(`  attempt ${attempt} fail: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (!result) {
      throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    }

    usedTitles.push(result.title);
    const next: ArticleRow = {
      ...row,
      title: result.title,
      content: result.content,
      summary: result.summary,
      tags: JSON.stringify(result.tags),
      readTime: estimateReadTime(result.content),
    };
    out.push(next);
    console.log(`  new: ${result.title}`);
    console.log(`  words: ${wordCount(result.content)} | readTime: ${next.readTime}`);
  }

  await writeFile(output, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`\nWrote ${out.length} → ${output}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
