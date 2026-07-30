import { getOpenRouterClient, parseJsonObject, clampText } from './shared';

export interface ReviewResult {
  technicalVerdict: string;
  keyAspects: string[];
}

const REVIEW_MODEL = process.env.OPENROUTER_REVIEW_MODEL ?? 'qwen/qwen-2.5-32b';
const REVIEW_SYSTEM_PROMPT = 'Ты технический эксперт. Проанализируй присланный материал. Подтверди техническую достоверность и выдели 3 ключевых инженерных аспекта.';

function normalizeKeyAspects(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 3);
}

export async function reviewArticle(articleData: object): Promise<ReviewResult> {
  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model: REVIEW_MODEL,
    temperature: 0.3,
    max_tokens: 350,
    messages: [
      { role: 'system', content: REVIEW_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          'Проанализируй материал и верни только JSON в формате {"technicalVerdict": string, "keyAspects": string[]}.',
          'Нужно подтвердить техническую достоверность и перечислить ровно 3 ключевых инженерных аспекта.',
          '',
          clampText(JSON.stringify(articleData, null, 2), 10000),
        ].join('\n'),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('Review model returned an empty response.');
  }

  const parsed = parseJsonObject<Partial<ReviewResult>>(content);
  const keyAspects = normalizeKeyAspects(parsed.keyAspects);

  if (!parsed.technicalVerdict || keyAspects.length === 0) {
    throw new Error('Review model returned incomplete structured data.');
  }

  return {
    technicalVerdict: parsed.technicalVerdict,
    keyAspects,
  };
}

export { reviewArticle as reviewerArticle };
