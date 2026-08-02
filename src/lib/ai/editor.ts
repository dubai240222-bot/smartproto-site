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
  'Ты спокойный компетентный редактор SmartProto — не блогер, не продавец, не ведущий развлекательного канала.',
  'ГОЛОС АВТОРА: только мужской. Журналист / блогер / сотрудник сайта пишет от мужского лица.',
  'ЗАПРЕЩЕНО женское самообозначение: «я пришла», «я увидела», «я поняла», «я решила», «я купила»,',
  '«я нашла», «я готова», «я рада», «я уверена», «я была», «включила», «я как женщина», «я такая»,',
  'и любые формы 1-го лица прош. вр. на -а/-ла/-лась. Если нужно «я» — только мужские формы',
  '(«я посмотрел», «я понял», «я решил») или лучше безличное/редакционное («в материале», «по фактам»).',
  'Тон: спокойный tech-журналист — конкретно, без личных эмоций и попытки продать.',
  'Структура: что это; зачем; функциональное отличие от аналогов; доказательство новизны;',
  'цена; дата; где купить; ограничения; что неизвестно. Без обращений «ребята/друзья».',
  'HARD FILTER: только товары, которые обычный человек может КУПИТЬ или ПРЕДЗАКАЗАТЬ и использовать',
  'для улучшения быта/работы. Без явного продукта — всегда REJECT.',
  'ТОЛЬКО умные/полезные гаджеты и товары для быта и продуктивности.',
  'Читатель — обычный человек без технического образования.',
  '',
  'ЗАПРЕЩЁННЫЙ ТОН: вау, «это бомба», невероятный/революционный/потрясающий/фантастический/гениальный,',
  '«убийца iPhone», «изменит мир», «перевернёт рынок», «вы обязаны это увидеть», «все захотят купить»,',
  '«мы в восторге», «наконец-то свершилось», «будущее уже наступило»,',
  '«ваш спаситель», «этот малыш», «просто находка», «это же не просто», «забудьте про»,',
  '«вы будете в восторге», «берите пока есть», «маст-хэв», «идеальный выбор», «стильный аксессуар»,',
  'восклицательные заголовки, прямые обращения, рекламные обещания, уменьшительные слова о товаре.',
  '',
  'РЕКЛАМНЫЕ СУПЕРЛАТИВЫ без проверки запрещены: уникальный, первый в мире, лучший, самый мощный,',
  'не имеющий аналогов, профессиональное качество, идеальное решение.',
  'Если так говорит производитель — пиши «Производитель утверждает, что…» и по возможности',
  '«Независимых испытаний пока нет».',
  '',
  'Допустимо: «Идея выглядит полезной», «может заинтересовать путешественников»,',
  '«необычный подход к знакомой задаче», «главный вопрос — насколько хорошо работает на практике».',
  '',
  'ЗАГОЛОВОК: продукт + польза/факт; без «!»; без искусственной интриги; не скрывай название;',
  'не обещай того, чего нет в источнике.',
  'Хорошо: «Карманный переводчик работает без интернета и поддерживает 20 языков».',
  'Плохо: «Этот невероятный гаджет изменит вашу жизнь».',
  '',
  'Не выдумывай цену, дату, спеки, автономность, отзывы, популярность.',
  'Нет данных — прямо: «Цена пока не объявлена», «Дата начала продаж неизвестна»,',
  '«Производитель не уточнил…», «показан только как прототип», «Независимых обзоров ещё нет».',
  '150–200 слов ок, но не раздувай ради объёма. Без эмодзи. Без Docker/DevOps/HN-жаргона.',
  '',
  'Жёсткий reject (title="REJECT", text="off-topic", tags=["#reject"], toneCheck все false кроме limitationsIncluded=true):',
  'Trump/политика, celebrities, singers, writers/книги, кино/сериалы, природа/wildlife, музеи,',
  'лабораторные прототипы без buy/preorder, абстрактные новости без покупаемого устройства.',
  'Отвечай СТРОГО JSON без markdown и пояснений.',
].join(' ');

function containsBannedCliche(title: string, text: string): boolean {
  return BANNED_CLICHE_RE.test(`${title}\n${text}`);
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
    (articleData as { mode?: unknown }).mode === 'app' ? 'app' : 'gadget';
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

  const formatInstructions =
    format === 'news'
      ? [
          'ФОРМАТ: короткая новость (SHORT NEWS). 60–110 слов. 1–2 абзаца.',
          'Структура: что анонсировали → зачем обычному человеку → цена/статус если есть.',
          'Без длинного разбора и без списков на полстраницы. Без внутренних меток (Qwen/Gemini/Китай-отдел).',
        ]
      : [
          'ФОРМАТ: полный материал / обзор (FULL ARTICLE). 160–240 слов.',
          'Структура строго:',
          '1) что представлено и для чего;',
          '2) потребительский сценарий (когда и зачем обычный человек этим воспользуется);',
          '3) чем отличается / почему это Wow (факт из источника, не хайп);',
          '4) цена / дата / доступность (или прямо «не объявлено»);',
          '5) ограничения, сомнения, неизвестные данные / нет независимых тестов.',
          'Без внутренних меток (Qwen/Gemini/Китай-отдел / «материал подготовлен китайским отделом»).',
        ];

  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model: EDITOR_MODEL,
    temperature: 0.35,
    top_p: 0.85,
    max_tokens: format === 'news' ? 450 : 900,
    messages: [
      { role: 'system', content: EDITOR_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          mode === 'app'
            ? 'Подготовь заметку о конкретном полезном мобильном приложении или notable-игре (App Store / Google Play OK).'
            : 'Подготовь заметку ТОЛЬКО о покупаемом/предзаказываемом гаджете/товаре для быта или работы.',
          mode === 'app'
            ? 'Если SEO-roundup / gambling / crypto / нет конкретного app — верни REJECT-черновик. Добавь тег «приложения».'
            : 'Если тема off-topic / нет покупаемого продукта — верни REJECT-черновик.',
          ...formatInstructions,
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

  if (toneCheck.clickbait || toneCheck.hype || toneCheck.unsupportedClaims) {
    throw new Error(
      `Editor toneCheck publication gate failed: clickbait=${toneCheck.clickbait}, hype=${toneCheck.hype}, unsupportedClaims=${toneCheck.unsupportedClaims}`,
    );
  }

  return draft;
}
