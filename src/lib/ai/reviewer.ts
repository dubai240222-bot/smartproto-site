import { getOpenRouterClient, parseJsonObject, clampText } from './shared';
import { hardRejectTopic } from './hard-reject';

export interface ReviewResult {
  technicalVerdict: string;
  keyAspects: string[];
}

const REVIEW_MODEL = process.env.OPENROUTER_REVIEW_MODEL ?? 'google/gemini-2.5-flash-lite';

/** Blogger / ad headline — return to Editor (SP-A-030-U1). */
const BLOGGER_TONE_RE =
  /ребята|друзья|вы\s+только\s+посмотрите|ваш\s+спаситель|этот\s+малыш|просто\s+находка|это\s+же\s+не\s+просто|забудьте\s+про|вы\s+будете\s+в\s+восторге|берите,?\s+пока|маст-?хэв|идеальный\s+выбор|стильный\s+аксессуар|!\s*$/im;

const REVIEW_SYSTEM_PROMPT = [
  'Ты технический эксперт SmartProto — медиа ТОЛЬКО о НОВЫХ товарах, которые обычный человек может КУПИТЬ или ПРЕДЗАКАЗАТЬ',
  'и использовать для быта/работы: smart gadgets / work tools / portable electronics / AI hardware / productivity devices.',
  'HARD REJECT / вернуть Editor — technicalVerdict ОБЯЗАН начинаться с REJECT:, если:',
  'нет покупаемого продукта; нет доказательства новизны; массовый старый товар как сенсация;',
  'заголовок-реклама; обращение к читателю; блогерский тон; нет сравнения с аналогами;',
  'не ясно почему писать сейчас; Trump/политика; celebrities; writers; кино; wildlife; музеи;',
  'лабораторный прототип без buy/preorder; Docker/DevOps/SmartProto-internal/API libs.',
  'keyAspects всё равно 3 коротких пункта.',
  'Иначе подтверди достоверность и 3 аспекта, включая отличие от аналогов.',
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
  const local = reviewDraftLocal(title, text);
  if (local) return local;

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

/** Deterministic Reviewer gate for tests (no OpenRouter). */
export function reviewDraftLocal(title: string, text: string): ReviewResult | null {
  const gate = hardRejectTopic(title, text);
  if (gate.reject) {
    return {
      technicalVerdict: `REJECT: ${gate.reason}`,
      keyAspects: [
        gate.rejectCode === 'NOT_ACTUALLY_NEW' ? 'нет доказательства новизны' : 'нет покупаемого продукта',
        'off-topic для SmartProto',
        'не публиковать',
      ],
    };
  }
  if (BLOGGER_TONE_RE.test(`${title}\n${text}`)) {
    return {
      technicalVerdict: 'REJECT: блогерский/рекламный тон — вернуть Editor (спокойный tech-журналист).',
      keyAspects: [
        'убрать обращения к читателю',
        'убрать рекламные формулировки',
        'добавить новизну и сравнение с аналогами',
      ],
    };
  }
  return null;
}

export { reviewArticle as reviewerArticle };
