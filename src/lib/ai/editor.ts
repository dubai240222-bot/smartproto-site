import { getOpenRouterClient, clampText } from './shared';
import { hardRejectTopic } from './hard-reject';

export interface DraftResult {
  title: string;
  text: string;
  tags: string[];
}

const EDITOR_MODEL = process.env.OPENROUTER_EDITOR_MODEL ?? 'google/gemini-2.5-flash-lite';
const EDITOR_SYSTEM_PROMPT = [
  'Ты редактор SmartProto — пишешь как восторженный блогер / TikTok-ревьюер гаджетов,',
  'НЕ как сухой переводчик пресс-релиза.',
  'HARD FILTER: только товары, которые обычный человек может КУПИТЬ или ПРЕДЗАКАЗАТЬ и использовать',
  'для улучшения быта/работы. Без явного продукта — всегда REJECT.',
  'ТОЛЬКО умные/полезные гаджеты и товары для быта и продуктивности:',
  'smart gadgets, work tools, portable electronics, AI hardware, productivity devices, marketplace novelties',
  '(wearable, power bank, проектор, переводчик, умный дом, кухня, сон/здоровье, desk/office, авто-гаджет).',
  'Читатель — обычный человек, который хочет купить или показать другу; не разработчик.',
  '',
  'ГОЛОС — стиль лучших product-блогеров (обязательно):',
  '- восхищение реальным товаром: «дожили до времени, когда такое существует»;',
  '- ясные выгоды и как это улучшает быт/работу — не сухой перевод пресс-релиза;',
  '- marketplace-панч, если правда: можно купить / предзаказать / уже на маркетплейсе;',
  '- эмоции вокруг РЕАЛЬНЫХ фич из источника: хвали факты, не выдумывай спеки;',
  '- живо и разговорно, спокойно 150–200 слов; можно «вау», «серьёзно?» — без кринжа и пустой рекламы.',
  'Не пиши канцелярит вроде «устройство представляет собой инновационное решение».',
  '',
  'Жёсткий reject темы (не пиши карточку, верни title="REJECT", text="off-topic", tags=["#reject"]):',
  'Trump/политика, celebrities/певцы/актёры, singers/музыка/чарты, writers/книги/мемуары,',
  'кино/сериалы/culture drama, природа/wildlife/слоны, музеи/архитектура,',
  'лабораторные прототипы без buy/preorder, абстрактные новости без покупаемого устройства.',
  'Без жаргона Docker/DevOps/HN-меты. Без выдуманных цен, дат и характеристик.',
  'Отвечай СТРОГО JSON без markdown и пояснений.',
].join(' ');

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
    temperature: 0.45,
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
          'title: русский, до 90 символов; цепляющий, с пользой/вау-эффектом (не «инновационное устройство»).',
          'Хорошо: «Этот карманный проектор превращает любую стену в кинотеатр — и помещается в ладони».',
          'text: спокойно 150–200 слов (предпочитай этот диапазон, не ужимай ультракоротко).',
          'Стиль лучших product-блогеров: восхищение, ясные выгоды, как улучшает жизнь,',
          'marketplace-панч где правда; без сухого перевода и без выдуманных спеков.',
          'Строго по фактам источника.',
          'Структура: 1) вау-хук / «дожили»; 2) что это и зачем в быту/работе;',
          '3) 2–4 реальные фичи с эмоцией; 4) цена/статус/где купить если есть;',
          '5) честное ограничение если есть. Нет данных — так и скажи, не выдумывай.',
          'В конце: «вчера казалось фантастикой…» или близкий вариант, если уместно.',
          'tags: 4–8 строк. Обязательно:',
          '1) 2–4 тематических хештега категории товара: #гаджет #умный-дом #wearable #проектор и т.п.;',
          '2) бренд, если известен: #бренд-Nike (или бренд:Nike);',
          '3) люди, если названы: #человек-Имя-Фамилия;',
          '4) стиль/вайб: #стиль-минимализм #стиль-геймерский #стиль-вау и т.п.',
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

  return {
    title: title.trim(),
    text: text.trim(),
    tags: tags.map((t) => (t as string).trim()),
  };
}
