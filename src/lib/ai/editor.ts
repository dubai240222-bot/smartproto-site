import { getOpenRouterClient, clampText } from './shared';
import { hardRejectTopic } from './hard-reject';

export interface DraftResult {
  title: string;
  text: string;
  tags: string[];
}

const EDITOR_MODEL = process.env.OPENROUTER_EDITOR_MODEL ?? 'google/gemini-2.5-flash-lite';

/** Stock Russian “future arrived” clichés — strip/reject in code; do not teach them in the LLM prompt. */
const BANNED_CLICHE_RE =
  /дожил(?:и|а|о)?(?:\s+до\s+времени)?|вчера казалось фантастикой|вчера фантастика\s*[—–-]/i;

const EDITOR_SYSTEM_PROMPT = [
  'Ты редактор SmartProto — пишешь как уверенный product-блогер о гаджетах,',
  'спокойно и по делу: хочется узнать больше и купить, без мелодрамы и истерики.',
  'HARD FILTER: только товары, которые обычный человек может КУПИТЬ или ПРЕДЗАКАЗАТЬ и использовать',
  'для улучшения быта/работы. Без явного продукта — всегда REJECT.',
  'ТОЛЬКО умные/полезные гаджеты и товары для быта и продуктивности:',
  'smart gadgets, work tools, portable electronics, AI hardware, productivity devices, marketplace novelties',
  '(wearable, power bank, проектор, переводчик, умный дом, кухня, сон/здоровье, desk/office, авто-гаджет).',
  'Читатель — обычный человек, который хочет купить или показать другу; не разработчик.',
  '',
  'ГОЛОС — лучший product-блогер (обязательно):',
  '- уверенный, спокойный тон; интерес и желание купить / узнать больше;',
  '- хук под КОНКРЕТНЫЙ продукт: польза / сценарий / сравнение / неожиданный факт из спеки;',
  '- ясные выгоды и как это улучшает быт/работу — не сухой перевод пресс-релиза;',
  '- marketplace-панч, если правда: можно купить / предзаказать / уже на маркетплейсе;',
  '- хвали РЕАЛЬНЫЕ фичи из источника; не выдумывай спеки;',
  '- 150–200 слов; без эмодзи; без «вау»-истерики и пустой рекламы;',
  '- срочность покупки только через реальную пользу («почему взять сейчас»), не через драму.',
  'Не пиши канцелярит вроде «устройство представляет собой инновационное решение».',
  '',
  'ЗАПРЕТ ШТАМПОВ (критично):',
  '- НЕ начинай статьи одним и тем же зачином от текста к тексту;',
  '- запрещены клише «будущее уже здесь» и «вчера это была фантастика» — не используй и не перефразируй;',
  '- каждый текст — свой хук и акцент под ЭТОТ товар.',
  'Синонимы и углы хука (выбирай разное каждый раз): любопытство, выгода («это экономит X»),',
  'лёгкий скепсис («звучит как реклама, но…»), практичный вин («наконец можно не…»),',
  'share-energy («скинь другу, которому нужен X»), сравнение, сценарий дня, факт из спеки.',
  '',
  'Жёсткий reject темы (не пиши карточку, верни title="REJECT", text="off-topic", tags=["#reject"]):',
  'Trump/политика, celebrities/певцы/актёры, singers/музыка/чарты, writers/книги/мемуары,',
  'кино/сериалы/culture drama, природа/wildlife/слоны, музеи/архитектура,',
  'лабораторные прототипы без buy/preorder, абстрактные новости без покупаемого устройства.',
  'Без жаргона Docker/DevOps/HN-меты. Без выдуманных цен, дат и характеристик.',
  'Отвечай СТРОГО JSON без markdown и пояснений.',
].join(' ');

function containsBannedCliche(title: string, text: string): boolean {
  return BANNED_CLICHE_RE.test(`${title}\n${text}`);
}

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
  const gate = hardRejectTopic(sourceTitle, sourceText);
  const reviewVerdict =
    typeof (reviewData as { technicalVerdict?: unknown }).technicalVerdict === 'string'
      ? (reviewData as { technicalVerdict: string }).technicalVerdict
      : '';
  if (gate.reject || /^REJECT\b/i.test(reviewVerdict)) {
    return { title: 'REJECT', text: 'off-topic', tags: ['#reject'] };
  }

  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model: EDITOR_MODEL,
    temperature: 0.55,
    top_p: 0.9,
    max_tokens: 700,
    messages: [
      { role: 'system', content: EDITOR_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          'Подготовь заметку ТОЛЬКО о покупаемом/предзаказываемом гаджете/товаре для быта или работы.',
          'Если тема — Trump/политика, celebrities/певцы, singers, writers/книги, природа/wildlife/слоны,',
          'музеи/архитектура, кино/сериалы/культура, или нет товара который можно купить/предзаказать —',
          'верни {"title":"REJECT","text":"off-topic","tags":["#reject"]}.',
          'Верни СТРОГО JSON: {"title": string, "text": string, "tags": string[]}',
          '',
          'title: русский, до 90 символов; цепляющий через пользу/желание купить (не «инновационное устройство»).',
          'Хорошо: «Этот карманный проектор превращает любую стену в кинотеатр — и помещается в ладони».',
          'text: спокойно 150–200 слов (предпочитай этот диапазон, не ужимай ультракоротко).',
          'Стиль: уверенный product-блогер — ясная польза, желание узнать больше и купить ASAP,',
          'без мелодрамы, без эмодзи, без истеричного восторга; marketplace-панч где правда.',
          'Строго по фактам источника.',
          'Структура: 1) УНИКАЛЬНЫЙ хук под этот продукт (польза / сценарий / сравнение / факт);',
          '2) что это и зачем в быту/работе; 3) 2–4 реальные фичи с конкретной выгодой;',
          '4) цена/статус/где купить если есть; 5) честное ограничение если есть.',
          'Нет данных — так и скажи, не выдумывай.',
          'Финал — разный: практичный вывод, мягкий CTA купить/узнать, вопрос другу — не одна формула.',
          'tags: 4–8 строк. Обязательно:',
          '1) 2–4 тематических хештега категории товара: #гаджет #умный-дом #wearable #проектор и т.п.;',
          '2) бренд, если известен: #бренд-Nike (или бренд:Nike);',
          '3) люди, если названы: #человек-Имя-Фамилия;',
          '4) стиль/вайб: #стиль-минимализм #стиль-геймерский и т.п. (без пустого #стиль-вау).',
          'Не выдумывай бренд и людей, если их нет в источнике. Без Docker/DevOps/HN-тегов.',
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

  const { title, text, tags } = parsed as Record<string, unknown>;

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

  const draft: DraftResult = {
    title: title.trim(),
    text: text.trim(),
    tags: tags.map((t) => (t as string).trim()),
  };

  if (containsBannedCliche(draft.title, draft.text)) {
    throw new Error('Editor draft contains banned stock cliché; reject and retry upstream.');
  }

  return draft;
}
