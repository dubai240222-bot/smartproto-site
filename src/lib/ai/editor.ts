import { getOpenRouterClient, clampText } from './shared';

export interface DraftResult {
  title: string;
  text: string;
  tags: string[];
}

const EDITOR_MODEL = process.env.OPENROUTER_EDITOR_MODEL ?? 'google/gemini-2.5-flash-lite';
const EDITOR_SYSTEM_PROMPT = [
  'Ты редактор SmartProto о умных/полезных потребительских гаджетах и marketplace-new товарах',
  '(wearable, power bank, проектор, переводчик, умный дом, кухня, сон/здоровье, авто).',
  'Читатель — обычный человек, который хочет купить или показать другу; не разработчик.',
  'Пиши просто и живо, без жаргона, Docker/DevOps/HN-меты и рекламного восторга, без выдумок.',
  'Отвечай СТРОГО JSON без markdown и пояснений.',
].join(' ');

export async function writeDraft(articleData: object, reviewData: object): Promise<DraftResult> {
  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model: EDITOR_MODEL,
    temperature: 0.1,
    top_p: 0.9,
    max_tokens: 600,
    messages: [
      { role: 'system', content: EDITOR_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          'Подготовь заметку о потребительском товаре/гаджете по статье и ревью.',
          'Верни СТРОГО JSON: {"title": string, "text": string, "tags": string[]}',
          '',
          'title: русский, до 90 символов; объясняет товар и пользу (не «инновационное устройство»).',
          'Хорошо: «Этот карманный проектор превращает любую стену в экран и помещается в ладони».',
          'text: 100–180 слов простым языком, строго по фактам. Ответь:',
          'что это; зачем нужно; почему необычное; чем отличается; когда появится;',
          'сколько стоит; где купить; какие ограничения. Нет данных — так и напиши, не выдумывай.',
          'tags: 4–8 строк. Обязательно:',
          '1) 2–4 тематических хештега категории товара: #гаджет #умный-дом #wearable #проектор и т.п.;',
          '2) бренд, если известен: #бренд-Nike (или бренд:Nike);',
          '3) люди/авторы, если названы: #человек-Имя-Фамилия;',
          '4) стиль/ваibe: #стиль-минимализм #стиль-геймерский #стиль-ретро и т.п.',
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
