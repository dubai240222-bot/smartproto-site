import { getOpenRouterClient, clampText } from './shared';
import { hardRejectTopic, type EditorialMode } from './hard-reject';

export interface ToneCheck {
  clickbait: boolean;
  hype: boolean;
  unsupportedClaims: boolean;
  limitationsIncluded: boolean;
}

export interface DraftResult {
  title: string;
  text: string;
  tags: string[];
  toneCheck: ToneCheck;
}

const EDITOR_MODEL = process.env.OPENROUTER_EDITOR_MODEL ?? 'google/gemini-2.5-flash-lite';

/** Stock hype / pathos — reject in code only; never list them in the LLM prompt. */
/** U1 blogger/ad phrases + prior hype bans — reject in code; keep prompt short. */
const BANNED_CLICHE_RE =
  /дожил(?:и|а|о)?(?:\s+до\s+времени)?|вчера казалось фантастикой|вчера фантастика\s*[—–-]|ребята|друзья|вы\s+только\s+посмотрите|посмотрите|guys|look at this|просто\s+вау|\bвау\b|wow[!]?|вы\s+не\s+поверите|это\s+чудо|это\s+бомба|огонь[!]|обалдеть|офигенн|невероятн|революционн|потрясающ|фантастическ|гениальн|убийца\s+iphone|изменит\s+мир|переверн[её]т\s+рынок|вы\s+обязаны|все\s+захотят|мы\s+в\s+восторге|наконец[- ]то\s+свершилось|будущее\s+уже\s+наступил|ваш\s+спаситель|этот\s+малыш|просто\s+находка|это\s+же\s+не\s+просто|забудьте\s+про|вы\s+будете\s+в\s+восторге|берите,?\s+пока\s+есть|маст-?хэв|идеальный\s+выбор|стильный\s+аксессуар/i;

const EDITOR_SYSTEM_PROMPT = [
  'Ты спокойный компетентный редактор SmartProto — не блогер, не продавец, не карточка товара.',
  'ГОЛОС АВТОРА: только мужской. Журналист пишет от мужского лица или безлично.',
  'ЗАПРЕЩЕНО женское самообозначение и формы 1-го лица прош. вр. на -а/-ла/-лась.',
  'Тон SP-A-071: информативная редакционная заметка — читатель должен понять суть, контекст и практический смысл,',
  'а не получить сухой одноабзацный alert. Без обращений «ребята/друзья», без витрины и «купи здесь».',
  'Можно: интересные изобретения, полезные возможности гаджетов/приложений, grounded AI capability news',
  '(реальные демо, research milestones, полезные AI-инструменты, шаги к большей автономии — без кликбейт sci-fi).',
  '',
  'ИНФОРМАТИВНОСТЬ: объясни что это, как работает на понятном уровне, кому полезно, чем отличается от обычного,',
  'какие ограничения/неизвестные данные есть. Пиши конкретно по фактам источника, без воды и без хайпа.',
  '',
  'ЖЁСТКО ЗАПРЕЩЕНО в публичном тексте: цены (¥/$/€/£/₽ и «стоит N»), ссылки URL,',
  'CTA «купить здесь» / JD / Amazon / AliExpress / Temu как призыв. Source URL только во внутреннем пайплайне.',
  'Не пиши «цена не объявлена» — просто не упоминай цену. Фокус: что умеет / зачем это важно.',
  '',
  'ЗАПРЕЩЁННЫЙ ТОН: вау, «это бомба», невероятный/революционный/потрясающий/фантастический/гениальный,',
  '«убийца iPhone», «изменит мир», «перевернёт рынок», «вы обязаны это увидеть», «все захотят купить»,',
  '«мы в восторге», «наконец-то свершилось», «будущее уже наступило»,',
  '«ваш спаситель», «этот малыш», «просто находка», «маст-хэв», «идеальный выбор», «стильный аксессуар»,',
  'восклицательные заголовки, прямые обращения, рекламные обещания.',
  '',
  'РЕКЛАМНЫЕ СУПЕРЛАТИВЫ без проверки запрещены. Если производитель хвастается —',
  '«Производитель утверждает…»; при необходимости «Независимых испытаний пока нет».',
  'ЗАГОЛОВОК: суть + польза/факт; без «!»; без интриги ради интриги.',
  'Не выдумывай спеки, даты, автономность, отзывы. Нет данных — опусти или «не уточнено».',
  'Без эмодзи. Без Docker/DevOps/HN-жаргона. Без публичных меток Китай/Qwen/Gemini.',
  '',
  'Жёсткий reject (title="REJECT", text="off-topic", tags=["#reject"], toneCheck: limitationsIncluded=true, остальные false):',
  'Trump/политика, celebrities, singers, writers/книги, кино/сериалы, природа/wildlife, музеи,',
  'материал в основном про цену+ссылку купить, overplayed mass gadget junk без новизны.',
  'Отвечай СТРОГО JSON без markdown и пояснений.',
].join(' ');

function containsBannedCliche(title: string, text: string): boolean {
  return BANNED_CLICHE_RE.test(`${title}\n${text}`);
}

/** SP-A-054 — public body must not be a price card or shop CTA. */
const PUBLIC_PRICE_OR_LINK_RE =
  /(?:¥|￥|\$|€|£|₽)\s*\d|\b\d[\d\s.,]{0,12}\s*(?:USD|EUR|RUB|yuan|йен|руб)|цена[:\s]|стоимость[:\s]|priced?\s+at|https?:\/\/|www\.\w+\.\w+|купить\s+(здесь|на|по)|jd\.com|amazon\.|aliexpress|temu\.com/i;

function containsPublicPriceOrLink(title: string, text: string): boolean {
  return PUBLIC_PRICE_OR_LINK_RE.test(`${title}\n${text}`);
}

function parseToneCheck(value: unknown): ToneCheck | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  for (const key of ['clickbait', 'hype', 'unsupportedClaims', 'limitationsIncluded'] as const) {
    if (typeof o[key] !== 'boolean') return null;
  }
  return {
    clickbait: o.clickbait as boolean,
    hype: o.hype as boolean,
    unsupportedClaims: o.unsupportedClaims as boolean,
    limitationsIncluded: o.limitationsIncluded as boolean,
  };
}

const REJECT_DRAFT: DraftResult = {
  title: 'REJECT',
  text: 'off-topic',
  tags: ['#reject'],
  toneCheck: {
    clickbait: false,
    hype: false,
    unsupportedClaims: false,
    limitationsIncluded: true,
  },
};

export type DraftFormat = 'news' | 'article';

export async function writeDraft(articleData: object, reviewData: object): Promise<DraftResult> {
  const sourceTitle =
    typeof (articleData as { title?: unknown }).title === 'string'
      ? (articleData as { title: string }).title
      : '';
  const sourceText =
    typeof (articleData as { text?: unknown }).text === 'string'
      ? (articleData as { text: string }).text
      : typeof (articleData as { content?: unknown }).content === 'string'
        ? (articleData as { content: string }).content
        : '';
  const sourceName =
    typeof (articleData as { sourceName?: unknown }).sourceName === 'string'
      ? (articleData as { sourceName: string }).sourceName
      : '';
  const mode: EditorialMode =
    (articleData as { mode?: unknown }).mode === 'app'
      ? 'app'
      : (articleData as { mode?: unknown }).mode === 'ai_radar'
        ? 'ai_radar'
        : 'gadget';
  const format: DraftFormat =
    (articleData as { format?: unknown }).format === 'news' ? 'news' : 'article';
  const gate = hardRejectTopic(sourceTitle, sourceText, { sourceName, mode });
  const reviewVerdict =
    typeof (reviewData as { technicalVerdict?: unknown }).technicalVerdict === 'string'
      ? (reviewData as { technicalVerdict: string }).technicalVerdict
      : '';
  if (gate.reject || /^REJECT\b/i.test(reviewVerdict)) {
    return REJECT_DRAFT;
  }

  // SP-A-071: both formats target ~250–300 informative words
  const formatInstructions =
    format === 'news'
      ? [
          'ФОРМАТ: информативная редакционная заметка (NEWS). 250–300 слов (строго в диапазоне). 3–5 абзацев.',
          'Структура:',
          '1) что произошло / что представлено;',
          '2) как это устроено на понятном уровне;',
          '3) кому и в каком сценарии полезно;',
          '4) чем отличается от привычного (факт из источника, не хайп);',
          '5) ограничения / неизвестные данные / нет независимых тестов если уместно.',
          'Не укорачивай до тизера и не раздувай повторами. БЕЗ цен, БЕЗ ссылок, БЕЗ «где купить».',
          'Без внутренних меток (Qwen/Gemini/Китай-отдел).',
        ]
      : [
          'ФОРМАТ: информативный разбор (ARTICLE). 250–300 слов (строго в диапазоне). 3–5 абзацев.',
          'Структура строго:',
          '1) что представлено и какую возможность даёт;',
          '2) как это работает на понятном уровне;',
          '3) сценарий пользы для обычного человека;',
          '4) чем отличается / почему это интересно (факт из источника, не хайп);',
          '5) ограничения / неизвестные данные / нет независимых тестов;',
          'Не укорачивай до тизера и не раздувай повторами. БЕЗ цен, БЕЗ outbound-ссылок и shop CTA.',
          'Без внутренних меток (Qwen/Gemini/Китай-отдел).',
        ];

  const modeLead =
    mode === 'app'
      ? 'Подготовь заметку о конкретном полезном мобильном приложении или notable-игре (App Store / Google Play OK).'
      : mode === 'ai_radar'
        ? 'Подготовь заметку о grounded AI capability / research / tool news (реальные демо, milestones, полезные AI-инструменты).'
        : 'Подготовь заметку ТОЛЬКО о покупаемом/предзаказываемом гаджете/товаре для быта или работы.';
  const modeReject =
    mode === 'app'
      ? 'Если SEO-roundup / gambling / crypto / нет конкретного app — верни REJECT-черновик. Добавь тег «приложения».'
      : mode === 'ai_radar'
        ? 'Если кликбейт sci-fi / нет реальной capability или источника — верни REJECT-черновик.'
        : 'Если тема off-topic / нет покупаемого продукта — верни REJECT-черновик.';

  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model: EDITOR_MODEL,
    temperature: 0.35,
    top_p: 0.85,
    // SP-A-071: room for ~250–300 RU words + JSON wrapper
    max_tokens: 1600,
    messages: [
      { role: 'system', content: EDITOR_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          modeLead,
          modeReject,
          ...formatInstructions,
          'Верни СТРОГО JSON:',
          '{"title":string,"text":string,"tags":string[],"toneCheck":{"clickbait":bool,"hype":bool,"unsupportedClaims":bool,"limitationsIncluded":bool}}',
          '',
          'title: русский, до 90 символов; продукт + польза/факт; без восклицательных знаков.',
          'text: полноценный информативный текст 250–300 слов — не короткий alert и не вода.',
          'Строго по фактам источника. Суперлативы производителя — только через «Производитель утверждает…».',
          'tags: 4–8; тематика + бренд если есть; БЕЗ тегов Китай/Qwen/Gemini/China Department.',
          'toneCheck: честно оцени свой текст (clickbait/hype/unsupportedClaims должны быть false;',
          'limitationsIncluded=true если есть явные оговорки).',
          '',
          'Статья:',
          clampText(JSON.stringify(articleData, null, 2), 10000),
          '',
          'Ревью:',
          clampText(JSON.stringify(reviewData, null, 2), 10000),
        ].join('\n'),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  const rawText = typeof content === 'string' ? content.trim() : '';

  if (!rawText) {
    throw new Error('Editor model returned an empty response.');
  }

  const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Editor model output is not valid JSON: ${rawText}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Editor model JSON output must be an object.');
  }

  const { title, text, tags, toneCheck: rawTone } = parsed as Record<string, unknown>;

  if (typeof title !== 'string' || !title.trim()) {
    throw new Error('Editor model output missing or empty "title" string.');
  }

  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Editor model output missing or empty "text" string.');
  }

  if (
    !Array.isArray(tags) ||
    tags.length === 0 ||
    !tags.every((t) => typeof t === 'string' && t.trim().length > 0)
  ) {
    throw new Error('Editor model output "tags" must be a non-empty array of non-empty strings.');
  }

  const toneCheck = parseToneCheck(rawTone);
  if (!toneCheck) {
    throw new Error('Editor model output missing valid "toneCheck" object.');
  }

  const draft: DraftResult = {
    title: title.trim(),
    text: text.trim(),
    tags: tags.map((t) => (t as string).trim()),
    toneCheck,
  };

  if (draft.title.trim().toUpperCase() === 'REJECT') {
    return { ...REJECT_DRAFT, tags: draft.tags.length ? draft.tags : REJECT_DRAFT.tags };
  }

  if (containsBannedCliche(draft.title, draft.text) || /!/.test(draft.title)) {
    throw new Error('Editor draft fails tone gate (banned hype or exclamation in title).');
  }

  if (containsPublicPriceOrLink(draft.title, draft.text)) {
    throw new Error('Editor draft fails policy gate (public price or outbound/shop link).');
  }

  if (toneCheck.clickbait || toneCheck.hype || toneCheck.unsupportedClaims) {
    throw new Error(
      `Editor toneCheck publication gate failed: clickbait=${toneCheck.clickbait}, hype=${toneCheck.hype}, unsupportedClaims=${toneCheck.unsupportedClaims}`,
    );
  }

  return draft;
}
