import { getOpenRouterClient, clampText } from './shared';

export interface DraftResult {
  title: string;
  text: string;
  tags: string[];
}

const EDITOR_MODEL = process.env.OPENROUTER_EDITOR_MODEL ?? 'google/gemini-2.5-flash-lite';
const EDITOR_SYSTEM_PROMPT =
  'Ты технический редактор. Отвечай СТРОГО в формате JSON без каких-либо дополнительных пояснений и markdown-обёрток.';

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
          'Подготовь финальный материал по следующей статье и техническому ревью.',
          'Верни СТРОГО валидный JSON-объект со следующими полями:',
          '{',
          '  "title": "русский заголовок",',
          '  "text": "основной русский текст",',
          '  "tags": ["тег1", "тег2"]',
          '}',
          '',
          'Требования к полям:',
          '- title: на русском языке, информативный, без кликбейта, максимум 90 символов, без неподтверждённых фактов.',
          '- text: 100-180 слов, строго по фактам из статьи и ревью, без домыслов про лицензии/бенчмарки/архитектуру, живой технический русский язык.',
          '- tags: от 2 до 5 русских тегов по темам, напрямую присутствующим в источнике.',
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
