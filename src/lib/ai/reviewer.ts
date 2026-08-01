import { getOpenRouterClient, parseJsonObject, clampText } from './shared';
import { hardRejectTopic } from './hard-reject';

export interface ReviewResult {
  technicalVerdict: string;
  keyAspects: string[];
}

const REVIEW_MODEL = process.env.OPENROUTER_REVIEW_MODEL ?? 'google/gemini-2.5-flash-lite';
const REVIEW_SYSTEM_PROMPT = [
  'Ты технический эксперт SmartProto — медиа ТОЛЬКО о товарах, которые обычный человек может КУПИТЬ или ПРЕДЗАКАЗАТЬ',
  'и использовать для быта/работы: smart gadgets / work tools / portable electronics / AI hardware / productivity devices.',
  'HARD REJECT — technicalVerdict ОБЯЗАН начинаться с REJECT:, если:',
  'нет конкретного покупаемого продукта/устройства; Trump/политика/госновости;',
  'celebrities/певцы/знаменитости/актёры; singers/музыка/чарты; writers/книги/мемуары;',
  'кино/сериалы/culture drama; природа/wildlife/слоны; музеи/архитектура;',
  'лабораторный прототип без buy/preorder; абстрактные новости без товара.',
  'keyAspects всё равно 3 коротких пункта.',
  'Иначе подтверди техническую достоверность и выдели 3 ключевых инженерных/продуктовых аспекта.',
].join(' ');

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
  const title =
    typeof (articleData as { title?: unknown }).title === 'string'
      ? (articleData as { title: string }).title
      : '';
  const text =
    typeof (articleData as { text?: unknown }).text === 'string'
      ? (articleData as { text: string }).text
      : typeof (articleData as { content?: unknown }).content === 'string'
        ? (articleData as { content: string }).content
        : '';
  const gate = hardRejectTopic(title, text);
  if (gate.reject) {
    return {
      technicalVerdict: `REJECT: ${gate.reason}`,
      keyAspects: ['нет покупаемого продукта', 'off-topic для SmartProto', 'не публиковать'],
    };
  }

  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model: REVIEW_MODEL,
    temperature: 0.1,
    top_p: 0.9,
    max_tokens: 500,
    messages: [
      { role: 'system', content: REVIEW_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          'Проанализируй материал и верни только JSON в формате {"technicalVerdict": string, "keyAspects": string[]}.',
          'Если нет покупаемого продукта или тема политика/celebrities/певцы/культура/природа — technicalVerdict начинается с REJECT:.',
          'Иначе подтверди техническую достоверность и перечисли ровно 3 ключевых инженерных аспекта.',
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
