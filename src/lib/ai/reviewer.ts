import { getOpenRouterClient, parseJsonObject, clampText } from './shared';
import { hardRejectTopic } from './hard-reject';

export interface ReviewResult {
  technicalVerdict: string;
  keyAspects: string[];
}

const REVIEW_MODEL = process.env.OPENROUTER_REVIEW_MODEL ?? 'google/gemini-2.5-flash-lite';
const REVIEW_SYSTEM_PROMPT = [
  'Ты технический и стилевой редактор SmartProto — медиа ТОЛЬКО о товарах, которые обычный человек',
  'может КУПИТЬ или ПРЕДЗАКАЗАТЬ для быта/работы.',
  'HARD REJECT — technicalVerdict ОБЯЗАН начинаться с REJECT:, если:',
  'нет конкретного покупаемого продукта; Trump/политика; celebrities/певцы; singers; writers/книги;',
  'кино/сериалы; природа/wildlife; музеи; прототип без buy/preorder; абстрактная новость без товара.',
  '',
  'СТИЛЬ / ТОН — REJECT: или RETURN: (вернуть на доработку), если в тексте или заголовке:',
  '- кликбейт (интрига без факта, «изменит жизнь», «взорвал интернет», «такого вы не видели»);',
  '- рекламный восторг / пафос (вау, бомба, невероятный, революционный, потрясающий, гениальный);',
  '- неподтверждённые суперлативы (лучший, первый в мире, уникальный, самый мощный) без оговорки',
  '  «Производитель утверждает…»;',
  '- обращение к читателю («ребята», «друзья», «посмотрите», «вы обязаны»);',
  '- личные эмоции автора («мы в восторге», «я сейчас упаду»);',
  '- женский голос автора (1-е лицо прош. вр. на -а/-ла/-лась: «я пришла», «я увидела», «я поняла»,',
  '  «я решила», «я готова», «я рада», «я уверена», «включила», «я как женщина») — нужен мужской голос;',
  '- скрыты важные ограничения;',
  '- пресс-релиз пересказан как независимый факт;',
  '- неизвестные данные поданы как установленные.',
  'Если toneCheck.limitationsIncluded=false — реши: нет существенных ограничений (можно) или RETURN: добавить ограничения.',
  '',
  'keyAspects — ровно 3 КОНКРЕТНЫХ замечания/аспекта, например:',
  '«убрать пафос», «заменить оценку фактом», «указать источник утверждения»,',
  '«добавить ограничение», «прямо обозначить неизвестные данные»,',
  'или инженерный аспект продукта, если тон в порядке.',
  'Иначе подтверди достоверность и выдели 3 ключевых продуктовых аспекта.',
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
          'Проанализируй материал (источник или черновик Editor) и верни только JSON',
          '{"technicalVerdict": string, "keyAspects": string[]}.',
          'REJECT: — off-topic / нет товара / кликбейт / пафос / выдуманные факты.',
          'RETURN: — тон или факты поправимы; в keyAspects конкретные правки.',
          'Иначе — краткое OK + 3 продуктовых аспекта.',
          'Ищи: кликбейт, hype, неподтверждённые суперлативы, обращения к читателю,',
          'личные эмоции, скрытые ограничения, пресс-релиз как факт.',
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
