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

/** Formula “imagine that” ledes — soft-retry in Editor; do not stamp every piece the same way. */
const STOCK_OPENER_LEAD_RE =
  /^(?:представьте(?:\s*,?\s*что)?|представь(?:те)?(?:\s+себе)?|а\s+что\s+если|что\s+если|забудьте\s+о(?:б)?|вообразите|imagine(?:\s+that)?|what\s+if)\b/i;

/** True when the article body opens with a stock “Представьте / А что если / imagine” hook. */
export function hasStockOpenerLead(text: string): boolean {
  const lead = text.trim().replace(/^[\s"'«»„“”‘’`]+/, '');
  return STOCK_OPENER_LEAD_RE.test(lead);
}

/**
 * SP-A-078 — CHIEF EDITORIAL DNA v1
 * Distilled from live chief-fast-lane articles. Principles only — do not copy phrases.
 */
const CHIEF_EDITORIAL_DNA = [
  'CHIEF EDITORIAL DNA v1 (SP-A-078) — SmartProto пишет не каталог и не пресс-релиз.',
  'Покажи: что стало возможно; какую старую проблему это ломает; почему это интересно обычному человеку;',
  'как может изменить жизнь; почему это уже кусочек будущего.',
  '',
  'ФОРМУЛА ПОДАЧИ (выбирай вход по истории — не штампуй один шаблон):',
  '1) человеческая сцена / проблема / старое представление;',
  '2) сильный ДОКАЗУЕМЫЙ факт из источника;',
  '3) что теперь стало возможно;',
  '4) как это может коснуться жизни человека;',
  '5) лёгкий живой финал: тонкая улыбка / наблюдение / ирония (в большинстве подходящих тем).',
  '',
  'LEAD: цепляй за 1–2 предложения. Не «Компания X сообщила…».',
  'Варьируй открытие под историю: конкретный факт, новая способность, короткая сцена, контраст «было→стало», вопрос — только если звучит естественно.',
  'ЗАПРЕТ штампованных открывалок в первом предложении: «Представьте, что…», «Представь себе…», «А что если…», «Забудьте о…» и похожие formula «imagine that» hooks.',
  'Каждая статья — свой вход. Одна и та же открывалка на ленте = провал. Метафоры и лёгкая ирония ок внутри текста, не как заводской шаблон лида.',
  'TITLE: сильный факт ИЛИ новая человеческая возможность. Не «Компания X представила Y».',
  'ФИНАЛЬНЫЙ ЮМОР: тонкий умный финал где уместно. Серьёзные темы (тяжёлая болезнь / трагедия) — без юмора.',
  'Не заканчивай длинным охлаждающим опровержением и не ставь штамп «независимые испытания пока не проводились».',
  'FACT INTEGRITY: никаких выдуманных цифр. Пиши ТОЛЬКО о продукте/событии из входного источника.',
  'Пайплайн: SOURCE → STRONGEST INTERESTING FACT → HUMAN MEANING → ARTICLE',
].join(' ');

/** SP-A-085 — finish raised claims with concrete answer when source has the fact. */
const FINISH_THE_THOUGHT = [
  'SP-A-085 FINISH THE THOUGHT: если сам поднимаешь важный вопрос — обязан дать конкретный ответ.',
  'Запрещены полуфразы без цифры/контекста, когда данные есть в источнике:',
  '«довольно тяжёлый», «большой аккумулятор», «очень быстрый», «долго работает», «компактный»,',
  '«огромный запас хода», «мириться с габаритами», «дешевле конкурентов» — без веса/мм/мА·ч/часов/сравнения.',
  'Если речь о габаритах/весе/батарее/дальности/скорости/автономности — дай ключевые цифры из источника',
  '(вес, размеры, толщина, ёмкость, время работы, скорость, payload, benchmark). Не весь spec sheet — только то,',
  'что закрывает смысл истории. Цифры НЕ выдумывать. Нет в источнике — не намекай и не фантазируй.',
  'Голую цифру поясни понятным сравнением, если это реально помогает (в 2 раза тяжелее обычного смартфона ~170–200 г;',
  '8 часов ≈ рабочая смена; было 2 часа → стало 10 минут). Сравнение проверяемое, без эффектности ради красоты.',
  'Критерий: ИНТЕРЕСНО + ПОНЯТНО + ЗАКОНЧЕННАЯ МЫСЛЬ.',
  'Финал: лёгкое наблюдение / тонкая ирония / человеческий образ, когда уместно. Без шуток про болезни, трагедии, смерть.',
  'Не заканчивай длинным охлаждающим штампом и не копируй одну и ту же шутку в каждой статье.',
].join(' ');

/**
 * SP-A-087 — Editorial depth: not a translation / press-release cut —
 * find the brightest honest angle and build a self-contained review around it.
 */
const EDITORIAL_DEPTH = [
  'SP-A-087 EDITORIAL DEPTH: SmartProto НЕ переводит источник и НЕ сокращает пресс-релиз.',
  'Найди САМУЮ ЯРКУЮ И ВАЖНУЮ часть события и построй вокруг неё самостоятельный интересный обзор.',
  'Не спрашивай «как пересказать источник?». Спрашивай: «какую самую интересную историю можно честно рассказать на его основе?»',
  'Перед текстом ответь себе: 1) самый сильный факт; 2) почему удивляет; 3) что изменилось vs вчера;',
  '4) что даёт человеку; 5) с чем сравнить; 6) как влияет на ближайшее будущее.',
  'SOURCE может быть скучным — ARTICLE не должен. Small story → big angle: вытащи большой смысл,',
  'если он реально есть (70% меньше токенов → дешевле AI-агенты; one-shot demo → новый способ учить роботов;',
  'батарея работает там, где обычные замерзают). Сильный факт — ЦЕНТР статьи, не второй/третий абзац.',
  'Не выдумывай факты. Не раздувай пустую новость. Но не прячь сильный факт и не режь цифры/сравнение/смысл ради краткости.',
  'ОБЪЁМ: нормальный материал ~180–300 слов, если тема заслуживает раскрытия (100–150 не целевой объём).',
  'Коротко — только если сырья реально мало и история всё равно закрыта без потери цифр/сравнения/смысла.',
  'Запрещено искусственно сжимать до 100–150, если из-за этого теряются цифры, сравнение, human meaning, возможность, контекст или вывод.',
  'Логика: hook с сильным фактом → что изменилось → цифры/сравнение → что даёт человеку → ближайшее будущее → лёгкий финал.',
].join(' ');

const EDITOR_SYSTEM_PROMPT = [
  'Ты технически грамотный живой журналист SmartProto — не блогер, не продавец, не карточка товара, не переводчик пресс-релиза.',
  'ГОЛОС АВТОРА: только мужской. Журналист пишет от мужского лица или безлично.',
  'ЗАПРЕЩЕНО женское самообозначение и формы 1-го лица прош. вр. на -а/-ла/-лась.',
  '',
  CHIEF_EDITORIAL_DNA,
  '',
  'Тон: умный, живой, понятный, чуть ироничный; EDITORIAL REVIEW вокруг самого яркого честного факта;',
  'не витрина, не «купи здесь», не обзор-каталог, не сжатый перевод. Без обращений «ребята/друзья».',
  'Можно: интересные изобретения, полезные возможности гаджетов/приложений, grounded AI capability news',
  '(реальные демо, research milestones, полезные AI-инструменты, шаги к большей автономии — без кликбейт sci-fi).',
  '',
  EDITORIAL_DEPTH,
  '',
  FINISH_THE_THOUGHT,
  '',
  'ЖЁСТКО ЗАПРЕЩЕНО в публичном тексте: цены (¥/$/€/£/₽ и «стоит N»), ссылки URL,',
  'CTA «купить здесь» / JD / Amazon / AliExpress / Temu как призыв. Source URL только во внутреннем пайплайне.',
  'Не пиши «цена не объявлена» и не ставь денежные суммы. Слова «дешевле в эксплуатации» / «меньше расход токенов» — ок без ¥/$/€.',
  'Фокус: что умеет / зачем важно / законченные цифры смысла.',
  '',
  'ЗАПРЕЩЁННЫЙ ТОН: вау, «это бомба», невероятный/революционный/потрясающий/фантастический/гениальный,',
  '«убийца iPhone», «изменит мир», «перевернёт рынок», «вы обязаны это увидеть», «все захотят купить»,',
  '«мы в восторге», «наконец-то свершилось», «будущее уже наступило»,',
  '«ваш спаситель», «этот малыш», «просто находка», «маст-хэв», «идеальный выбор», «стильный аксессуар»,',
  'восклицательные заголовки, прямые обращения, рекламные обещания.',
  '',
  'РЕКЛАМНЫЕ СУПЕРЛАТИВЫ без проверки запрещены. Если производитель хвастается — «Производитель утверждает…».',
  'ЗАГОЛОВОК: самый сильный факт + человеческий смысл; без «!»; без интриги ради интриги.',
  'Не выдумывай спеки, даты, автономность, отзывы. Нет данных — опусти (не оставляй намёк без ответа).',
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

/** SP-A-054 — public body must not be a price card or shop CTA.
 * Bare «стоимость/цена» without a money amount is allowed for operational-cheapness angles (SP-A-087).
 */
const PUBLIC_PRICE_OR_LINK_RE =
  /(?:¥|￥|\$|€|£|₽)\s*\d|\b\d[\d\s.,]{0,12}\s*(?:USD|EUR|RUB|yuan|йен|руб)|(?:цена|стоимость)\s*[:\-]?\s*\d|priced?\s+at|https?:\/\/|www\.\w+\.\w+|купить\s+(здесь|на|по)|jd\.com|amazon\.|aliexpress|temu\.com/i;

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
  const chiefLane =
    (articleData as { chiefFastLane?: unknown }).chiefFastLane === true ||
    (articleData as { chiefLane?: unknown }).chiefLane === true;
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
  // SP-A-088 — Chief Fast Lane keeps human override access; AUTO still gated.
  if (!chiefLane && (gate.reject || /^REJECT\b/i.test(reviewVerdict))) {
    return REJECT_DRAFT;
  }

  const formatInstructions =
    format === 'news'
      ? [
          'ФОРМАТ: новость-обзор (SHORT REVIEW). Норма ~180–300 слов; короче — только если история совсем простая и всё равно закрыта.',
          'Не пересказ источника: центр = самый яркий факт + почему это важно человеку.',
          'Структура: сильный факт сразу → что изменилось → цифра/сравнение → смысл для человека → короткий финал.',
          'LEAD: не начинай с «Представьте…» / «А что если…» / «Забудьте о…» — варьируй вход (факт / сцена / контраст).',
          'FINISH THE THOUGHT: не оставляй «тяжёлый/компактный/долго» без цифры, если она есть во входных данных.',
          'БЕЗ цен, БЕЗ ссылок, БЕЗ «где купить». Без внутренних меток (Qwen/Gemini/Китай-отдел).',
        ]
      : [
          'ФОРМАТ: полный редакционный обзор (FULL REVIEW). Норма ~180–300 слов.',
          'Цель: читатель за ~180–300 слов понимает, что произошло, почему это важно и что изменилось.',
          'Ниже ~180 слов — только если история совсем простая; иначе ориентир ~180–300.',
          'Не перевод и не сжатый пресс-релиз. Small story → big angle, если угол честно следует из фактов.',
          'Структура:',
          '1) hook = самый сильный факт или живой вход без штампа «Представьте…» (не прятать во 2–3 абзаце);',
          '2) почему удивляет / что изменилось vs вчера;',
          '3) ключевые цифры смысла из источника + сравнение;',
          '4) что даёт человеку;',
          '5) ближайшее будущее / практический горизонт;',
          '6) лёгкий живой финал (без штампа «независимых испытаний» и без shop CTA).',
          'БЕЗ цен, БЕЗ outbound-ссылок. Без внутренних меток (Qwen/Gemini/Китай-отдел).',
        ];

  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model: EDITOR_MODEL,
    temperature: 0.4,
    top_p: 0.85,
    max_tokens: format === 'news' ? 1100 : 1500,
    messages: [
      { role: 'system', content: EDITOR_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          mode === 'app'
            ? 'Подготовь самостоятельный обзор о конкретном полезном мобильном приложении или notable-игре (App Store / Google Play OK).'
            : mode === 'ai_radar'
              ? 'Подготовь самостоятельный обзор о grounded AI / robotics / research capability (EVENT) — не перевод пресс-релиза и не витрину SKU.'
              : chiefLane
                ? 'Chief Fast Lane: самостоятельный редакционный обзор по источнику — живой SmartProto-голос, не перевод и не пресс-релиз.'
                : 'Подготовь самостоятельный редакционный обзор о технологии / устройстве / событии — не перевод анонса и не карточка товара.',
          mode === 'app'
            ? 'Если SEO-roundup / gambling / crypto / нет конкретного app — верни REJECT-черновик. Добавь тег «приложения».'
            : mode === 'ai_radar'
              ? 'Если нет явного capability/event — верни REJECT. Не раздувай commodity без новой способности.'
              : chiefLane
                ? 'Chief override: Scout не применяется. Пиши по фактам источника; REJECT только при полной невозможности понять тему.'
                : 'Если тема off-topic / пустой commodity без новой способности — верни REJECT-черновик.',
          ...formatInstructions,
          'SP-A-088 ONE VOICE: тот же Editorial DNA для Chief и AUTO. Parser только шахтёр — автор = Editor.',
          'SP-A-087: найди самый яркий честный факт и сделай его центром. Не пересказ. Норма ~180–300 слов.',
          'SP-A-085: закрой мысль цифрами/сравнением из входных данных; не поднимай габариты/вес/батарею без ответа.',
          'Верни СТРОГО JSON:',
          '{"title":string,"text":string,"tags":string[],"toneCheck":{"clickbait":bool,"hype":bool,"unsupportedClaims":bool,"limitationsIncluded":bool}}',
          '',
          'title: русский, до 90 символов; продукт + польза/факт; без восклицательных знаков.',
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

  async function parseEditorJson(rawText: string): Promise<DraftResult> {
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

    return {
      title: title.trim(),
      text: text.trim(),
      tags: tags.map((t) => (t as string).trim()),
      toneCheck,
    };
  }

  /** Vague size/weight/runtime claims without any measure → unfinished thought. */
  function looksUnfinishedThought(text: string): boolean {
    const vague =
      /мириться с (его |её |их )?габарит|довольно тяж|тяжёл\w* аппарат|больш(ой|ая|ие)\s+(аккумулятор|запас)|огромн\w*\s+(аккумулятор|запас|габарит)|очень быстр|долго работ|компактн\w*(?![\s\S]{0,40}\d)|дешевле конкурент|значительн\w*\s+снижен/i.test(
        text,
      );
    if (!vague) return false;
    return !/\d[\d\s.,]*\s*(г|кг|мм|см|мА·?ч|mAh|Вт|час|ч\.|мин|км|%)/i.test(text);
  }

  const content = completion.choices[0]?.message?.content;
  let draft = await parseEditorJson(typeof content === 'string' ? content.trim() : '');

  // SP-A-085 — one retry only if the draft raises size/weight/runtime without answering.
  if (draft.title.trim().toUpperCase() !== 'REJECT' && looksUnfinishedThought(draft.text)) {
    const retry = await client.chat.completions.create({
      model: EDITOR_MODEL,
      temperature: 0.25,
      top_p: 0.8,
      max_tokens: format === 'news' ? 1100 : 1500,
      messages: [
        { role: 'system', content: EDITOR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            'Черновик поднял характеристику, но не закрыл мысль цифрой/сравнением.',
            'Перепиши FINISH THE THOUGHT: добавь вес/размеры/ёмкость/время/benchmark ТОЛЬКО из входных данных.',
            'Не выдумывай. Без цен и URL. Верни тот же JSON-формат.',
            '',
            'Входные данные:',
            clampText(JSON.stringify(articleData, null, 2), 10000),
            '',
            'Слабый черновик:',
            clampText(draft.text, 4000),
          ].join('\n'),
        },
      ],
    });
    const retryRaw = retry.choices[0]?.message?.content;
    draft = await parseEditorJson(typeof retryRaw === 'string' ? retryRaw.trim() : '');
  }

  // Soft guidance: one rewrite if lead uses formula stock opener.
  if (draft.title.trim().toUpperCase() !== 'REJECT' && hasStockOpenerLead(draft.text)) {
    const retry = await client.chat.completions.create({
      model: EDITOR_MODEL,
      temperature: 0.35,
      top_p: 0.85,
      max_tokens: format === 'news' ? 1100 : 1500,
      messages: [
        { role: 'system', content: EDITOR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            'Черновик начинается штампованной открывалкой («Представьте…» / «А что если…» / «imagine…»).',
            'Перепиши ЛИД: начни с конкретного факта, способности, сцены или контраста — без formula hook.',
            'Остальной смысл и факты сохрани. Без цен и URL. Верни тот же JSON-формат.',
            '',
            'Входные данные:',
            clampText(JSON.stringify(articleData, null, 2), 10000),
            '',
            'Слабый черновик:',
            clampText(draft.text, 4000),
          ].join('\n'),
        },
      ],
    });
    const retryRaw = retry.choices[0]?.message?.content;
    draft = await parseEditorJson(typeof retryRaw === 'string' ? retryRaw.trim() : '');
  }

  // SP-A-093: short-length expand (150–179) is handled by callers via expandShortDraft
  // so newsroom can log FIRST/RETRY/AFTER and enforce max 1 retry outside writeDraft.

  if (draft.title.trim().toUpperCase() === 'REJECT') {
    return { ...REJECT_DRAFT, tags: draft.tags.length ? draft.tags : REJECT_DRAFT.tags };
  }

  if (hasStockOpenerLead(draft.text)) {
    throw new Error('Editor draft fails tone gate (stock opener lead after soft retry).');
  }

  if (containsBannedCliche(draft.title, draft.text) || /!/.test(draft.title)) {
    throw new Error('Editor draft fails tone gate (banned hype or exclamation in title).');
  }

  if (containsPublicPriceOrLink(draft.title, draft.text)) {
    throw new Error('Editor draft fails policy gate (public price or outbound/shop link).');
  }

  if (draft.toneCheck.clickbait || draft.toneCheck.hype || draft.toneCheck.unsupportedClaims) {
    throw new Error(
      `Editor toneCheck publication gate failed: clickbait=${draft.toneCheck.clickbait}, hype=${draft.toneCheck.hype}, unsupportedClaims=${draft.toneCheck.unsupportedClaims}`,
    );
  }

  return draft;
}

/**
 * SP-A-093 — exactly one expand retry for near-miss drafts (150–179 words).
 * Does not invent facts. Returns the expanded draft (or original on parse failure).
 */
export async function expandShortDraft(
  articleData: object,
  reviewData: object,
  draft: DraftResult,
): Promise<DraftResult> {
  if (draft.title.trim().toUpperCase() === 'REJECT') return draft;
  const client = getOpenRouterClient();
  const format: DraftFormat =
    (articleData as { format?: unknown }).format === 'news' ? 'news' : 'article';
  try {
    const completion = await client.chat.completions.create({
      model: EDITOR_MODEL,
      temperature: 0.35,
      top_p: 0.85,
      max_tokens: format === 'news' ? 1200 : 1600,
      messages: [
        { role: 'system', content: EDITOR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            'SP-A-093 BOUNDED EXPAND RETRY:',
            'Материал почти готов, но слишком короткий.',
            'Доведи его до полноценного обзора 180–300 слов.',
            'Не добавляй неподтверждённых фактов.',
            'Используй только source pack / входные данные.',
            'Раскрой:',
            '- strongest fact;',
            '- useful context/comparison;',
            '- human meaning;',
            '- FINISH THE THOUGHT;',
            '- живой финал, если уместно.',
            'Не раздувай текст пустыми словами.',
            'Без цен и URL. Верни СТРОГО JSON:',
            '{"title":string,"text":string,"tags":string[],"toneCheck":{"clickbait":bool,"hype":bool,"unsupportedClaims":bool,"limitationsIncluded":bool}}',
            '',
            'Входные данные (source pack):',
            clampText(JSON.stringify(articleData, null, 2), 10000),
            '',
            'Ревью:',
            clampText(JSON.stringify(reviewData, null, 2), 4000),
            '',
            'Текущий короткий черновик:',
            clampText(
              JSON.stringify(
                { title: draft.title, text: draft.text, tags: draft.tags, toneCheck: draft.toneCheck },
                null,
                2,
              ),
              5000,
            ),
          ].join('\n'),
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw || typeof raw !== 'string') return draft;
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const parsed = JSON.parse(cleaned) as DraftResult;
    if (!parsed?.text || typeof parsed.text !== 'string') return draft;
    if (String(parsed.title || '').trim().toUpperCase() === 'REJECT') return draft;
    const next: DraftResult = {
      title: String(parsed.title || draft.title).trim(),
      text: parsed.text.trim(),
      tags: Array.isArray(parsed.tags) && parsed.tags.length
        ? parsed.tags.map((t) => String(t).trim())
        : draft.tags,
      toneCheck: parsed.toneCheck || draft.toneCheck,
    };
    if (containsBannedCliche(next.title, next.text) || /!/.test(next.title)) return draft;
    if (containsPublicPriceOrLink(next.title, next.text)) return draft;
    if (next.toneCheck.clickbait || next.toneCheck.hype || next.toneCheck.unsupportedClaims) {
      return draft;
    }
    return next;
  } catch {
    return draft;
  }
}
