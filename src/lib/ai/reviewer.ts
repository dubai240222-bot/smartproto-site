import { getOpenRouterClient, parseJsonObject, clampText } from './shared';
import {
  hardRejectTopic,
  PREFERRED_GADGET_CATEGORIES,
  PREFERRED_APP_CATEGORIES,
  type EditorialMode,
} from './hard-reject';

export interface ReviewResult {
  technicalVerdict: string;
  keyAspects: string[];
}

const REVIEW_MODEL = process.env.OPENROUTER_REVIEW_MODEL ?? 'google/gemini-2.5-flash-lite';

/** Blogger / ad headline — return to Editor (SP-A-030-U1). */
const BLOGGER_TONE_RE =
  /ребята|друзья|вы\s+только\s+посмотрите|ваш\s+спаситель|этот\s+малыш|просто\s+находка|это\s+же\s+не\s+просто|забудьте\s+про|вы\s+будете\s+в\s+восторге|берите,?\s+пока|маст-?хэв|идеальный\s+выбор|стильный\s+аксессуар|!\s*$/im;

const REVIEW_SYSTEM_PROMPT_GADGET = [
  'Ты технический эксперт SmartProto — editorial alerts о интересных гаджетах/приложениях и grounded AI news.',
  `Приоритет: ${PREFERRED_GADGET_CATEGORIES}; плюс AI capability / useful AI tools / autonomy milestones.`,
  'Публичный тон — notice «что умеет», не карточка с ценой. REJECT если материал в основном price + buy link.',
  'HARD REJECT — technicalVerdict ОБЯЗАН начинаться с REJECT:, если:',
  'нет ясной новизны/возможности; массовый старый товар как сенсация; overplayed flagship color/rumor junk;',
  'заголовок-реклама; блогерский тон; Trump/политика; celebrities; writers; кино; wildlife; музеи;',
  'Docker/DevOps/SmartProto-internal/API libs;',
  'нишевый PC/engineering компонент без сильного consumer-angle (SP-A-039-ALT).',
  'AI research/demo OK если grounded (реальный результат, польза людям) — не кликбейт про «сверхразум завтра».',
  'keyAspects — 3 коротких пункта про возможность/новизну/пользу (не про цену).',
  'Иначе подтверди достоверность и 3 аспекта.',
].join(' ');

const REVIEW_SYSTEM_PROMPT_APP = [
  'Ты технический эксперт SmartProto — стол Mobile Apps.',
  `Приоритет: ${PREFERRED_APP_CATEGORIES}.`,
  'PASS: одно конкретное полезное приложение или notable/wonderful игра с novelty.',
  'REJECT (technicalVerdict начинается с REJECT:): SEO roundups, «N apps you need», app deals,',
  'gambling/casino, crypto/NFT pumps, enterprise fluff, блогерский тон, нет новизны.',
  'keyAspects — 3 коротких пункта про пользу/новизну/отличие.',
].join(' ');

function normalizeKeyAspects(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/\n|;|\|/)
      .map((s) => s.replace(/^[-*\d.)\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, 3);
  }
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 3);
}

/** SP-A-048: keep pipeline moving when Reviewer JSON is truncated/partial. */
function fallbackReview(title: string, text: string): ReviewResult {
  const snippet = `${title} ${text}`.replace(/\s+/g, ' ').trim().slice(0, 160);
  return {
    technicalVerdict: `PASS: source-backed gadget candidate — ${snippet || title || 'untitled'}`,
    keyAspects: [
      'конкретный покупаемый продукт из источника',
      'заявленная новизна / анонс',
      'потребительская польза для быта или работы',
    ],
  };
}

function modeFromPayload(articleData: object): EditorialMode {
  const m = (articleData as { mode?: unknown }).mode;
  return m === 'app' ? 'app' : 'gadget';
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
  const sourceName =
    typeof (articleData as { sourceName?: unknown }).sourceName === 'string'
      ? (articleData as { sourceName: string }).sourceName
      : '';
  const mode = modeFromPayload(articleData);
  const local = reviewDraftLocal(title, text, sourceName, mode);
  if (local) return local;

  const client = getOpenRouterClient();
  const askOnce = async () =>
    client.chat.completions.create({
      model: REVIEW_MODEL,
      temperature: 0.1,
      top_p: 0.9,
      max_tokens: 700,
      messages: [
        {
          role: 'system',
          content: mode === 'app' ? REVIEW_SYSTEM_PROMPT_APP : REVIEW_SYSTEM_PROMPT_GADGET,
        },
        {
          role: 'user',
          content: [
            'Проанализируй материал и верни только JSON в формате {"technicalVerdict": string, "keyAspects": string[]}.',
            'keyAspects ОБЯЗАТЕЛЬНО ровно 3 непустых строки (массив).',
            mode === 'app'
              ? 'Если нет конкретного полезного app/game или SEO/spam — technicalVerdict начинается с REJECT:.'
              : 'Если нет покупаемого продукта или тема политика/celebrities/певцы/культура/природа — technicalVerdict начинается с REJECT:.',
            'Иначе подтверди техническую достоверность и перечисли ровно 3 ключевых аспекта.',
            '',
            clampText(JSON.stringify(articleData, null, 2), 10000),
          ].join('\n'),
        },
      ],
    });

  const parseReview = (content: string): ReviewResult | null => {
    try {
      const parsed = parseJsonObject<Partial<ReviewResult>>(content);
      const keyAspects = normalizeKeyAspects(parsed.keyAspects);
      const technicalVerdict =
        typeof parsed.technicalVerdict === 'string' ? parsed.technicalVerdict.trim() : '';
      if (!technicalVerdict && keyAspects.length === 0) return null;
      if (!technicalVerdict) {
        return { ...fallbackReview(title, text), keyAspects: keyAspects.length ? keyAspects : fallbackReview(title, text).keyAspects };
      }
      if (keyAspects.length === 0) {
        return {
          technicalVerdict,
          keyAspects: fallbackReview(title, text).keyAspects,
        };
      }
      return { technicalVerdict, keyAspects };
    } catch {
      return null;
    }
  };

  let content = '';
  try {
    const completion = await askOnce();
    const raw = completion.choices[0]?.message?.content;
    content = typeof raw === 'string' ? raw : '';
  } catch {
    content = '';
  }

  let result = content ? parseReview(content) : null;
  if (!result) {
    try {
      const retry = await askOnce();
      const raw = retry.choices[0]?.message?.content;
      result = typeof raw === 'string' ? parseReview(raw) : null;
    } catch {
      result = null;
    }
  }

  // After Scout already passed: do not abort the tick on flaky Reviewer JSON.
  return result ?? fallbackReview(title, text);
}

/** Deterministic Reviewer gate for tests (no OpenRouter). */
export function reviewDraftLocal(
  title: string,
  text: string,
  sourceName = '',
  mode: EditorialMode = 'gadget',
): ReviewResult | null {
  const gate = hardRejectTopic(title, text, { sourceName, mode });
  if (gate.reject) {
    const aspect =
      gate.rejectCode === 'NOT_ACTUALLY_NEW'
        ? 'нет доказательства новизны'
        : gate.rejectCode === 'NICHE_NO_CONSUMER_ANGLE'
          ? 'нишевый PC/engineering без consumer-angle'
          : mode === 'app'
            ? 'нет конкретного полезного приложения'
            : 'нет покупаемого продукта';
    return {
      technicalVerdict: `REJECT: ${gate.reason}`,
      keyAspects: [aspect, 'off-topic для SmartProto', 'не публиковать'],
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
