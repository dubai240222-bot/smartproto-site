import { getOpenRouterClient, parseJsonObject, clampText } from './shared';
import { hardRejectTopic } from './hard-reject';

export interface ScoutResult {
  interesting: boolean;
  score: number;
  reason: string;
  productType?: string;
}

/** Consumer-gadgets gate: A+B+C+D+E must reach this to pass. */
export const SCOUT_SCORE_THRESHOLD = 75;

const SCOUT_MODEL = process.env.OPENROUTER_SCOUT_MODEL ?? 'deepseek/deepseek-v4-flash:latest';

const SCOUT_SYSTEM_PROMPT = [
  'Ты разведчик SmartProto — медиа ТОЛЬКО про умные/полезные потребительские гаджеты',
  'и товары для повседневности и продуктивности на работе.',
  'HARD FILTER: публикуем ТОЛЬКО то, что обычный человек может КУПИТЬ или ПРЕДЗАКАЗАТЬ и использовать',
  'чтобы улучшить быт или работу. Без покупаемого продукта — всегда reject.',
  'Мы на шаг впереди маркетплейсов: ищем то, что скоро окажется на Taobao/Temu/Amazon/AliExpress',
  'или уже на Kickstarter/Indiegogo и в gadget-прессе (New Atlas, Yanko Design).',
  'Главный вопрос: есть ли конкретный ТОВАР/УСТРОЙСТВО, и захочет ли обычный человек его купить?',
  'Лёгкий плюс к оценке, если товар вызывает «вау / не могу поверить, что это уже существует».',
  '',
  'Оценка 0–100 строго суммой A–E:',
  'A желание купить 0–30; B новизна / wow-disbelief 0–20; C практическая польза (быт/работа) 0–20;',
  'D визуальная привлекательность 0–15; E коммерческий потенциал 0–15.',
  'Проходной балл концептуально 75/100.',
  '',
  'Приоритет (покупаемые устройства): smart gadgets, work tools, portable electronics,',
  'AI hardware, productivity devices, marketplace novelties;',
  'wearable, power bank, портативный проектор, переводчик, умный дом, кухонный гаджет,',
  'здоровье/сон, авто-гаджет, desk/office tools, наушники/камеры/аксессуары,',
  'viral Temu/Amazon/Taobao-находки, Kickstarter/Indiegogo, CES/IFA/Computex.',
  '',
  'Жёсткий reject ВСЕГДА (score=0, interesting=false, productType="none"), если funnel мёртв:',
  '- нет конкретного имени товара + пути «хочу купить / где взять» (buy, preorder, KS/IG, магазин);',
  '- Trump / politics / выборы / губернаторы / госновости без товара;',
  '- singers / певцы / celebrities / знаменитости / актёры / спортсмены без продукта;',
  '- culture drama / чарты / кино / сериалы / утечки фильмов / чистый entertainment;',
  '- writers / авторы / книги / мемуары / интервью писателей;',
  '- природа / wildlife / животные / слоны / экотуризм без гаджета;',
  '- архитектура / музеи / здания / ландшафт как главная тема;',
  '- абстрактные новости / советы / гайды / shopping guide без одного явного товара;',
  '- лабораторные исследования / прототипы «ещё нельзя купить»;',
  '- OEM-компоненты (вентили, чипы) без готового consumer-девайса на полке;',
  '- conference badge / Defcon / DIY без kit/SKU который можно заказать;',
  '- Docker, HN-мета, DevOps, API, библиотеки, инфраструктура, site-internal digests;',
  '- нет пользы для быта/работы или признака новизны;',
  '- нельзя объяснить суть одним простым предложением;',
  '- SEO-мусор / пресс-релиз без фактов.',
  'Не выдумывай цену, дату и площадку, если их нет в тексте.',
].join('\n');

export async function scoutArticle(title: string, text: string): Promise<ScoutResult> {
  const gate = hardRejectTopic(title, text);
  if (gate.reject) {
    return {
      interesting: false,
      score: 0,
      reason: gate.reason,
      productType: 'none',
    };
  }

  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model: SCOUT_MODEL,
    temperature: 0.1,
    top_p: 0.9,
    max_tokens: 500,
    include_reasoning: false,
    reasoning: { max_tokens: 0 },
    extra_body: {
      include_reasoning: false,
      reasoning: { max_tokens: 0 },
    },
    messages: [
      { role: 'system', content: SCOUT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          `Заголовок: ${title}`,
          '',
          `Текст: ${clampText(text, 8000)}`,
          '',
          'Верни только JSON:',
          '{"interesting": boolean, "score": number, "reason": string, "productType": string,',
          ' "parts": {"a": number, "b": number, "c": number, "d": number, "e": number}}',
          'score = a+b+c+d+e. interesting=true только если score>=75 и есть покупаемый продукт/устройство.',
          'Если политика/celebrities/певцы/непокупаемая тема — score=0, interesting=false, productType="none".',
          'productType: краткий тип товара или "none". reason: 1 короткое предложение на русском.',
        ].join('\n'),
      },
    ],
  } as any);

  const choice = completion.choices[0];
  const content = choice?.message?.content;
  if (!content || typeof content !== 'string' || content.trim() === '') {
    const finishReason = choice?.finish_reason ?? 'unknown';
    const msg = choice?.message as any;
    const choiceObj = choice as any;
    const hasReasoning = Boolean(
      msg?.reasoning ||
        msg?.reasoning_content ||
        msg?.reasoning_details ||
        choiceObj?.reasoning ||
        choiceObj?.reasoning_content
    );
    throw new Error(
      `Scout model (${SCOUT_MODEL}) returned an empty response. finish_reason: ${finishReason}, reasoning present: ${hasReasoning}`
    );
  }

  const parsed = parseJsonObject<
    Partial<ScoutResult> & { parts?: { a?: number; b?: number; c?: number; d?: number; e?: number } }
  >(content);

  const parts = parsed.parts;
  const partsSum =
    parts &&
    [parts.a, parts.b, parts.c, parts.d, parts.e].every((n) => typeof n === 'number')
      ? Number(parts.a) + Number(parts.b) + Number(parts.c) + Number(parts.d) + Number(parts.e)
      : null;

  let score = typeof partsSum === 'number' ? partsSum : typeof parsed.score === 'number' ? parsed.score : 0;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const productType =
    typeof parsed.productType === 'string' ? parsed.productType.trim() : undefined;
  const noProduct =
    !productType ||
    productType.toLowerCase() === 'none' ||
    productType.toLowerCase() === 'n/a';

  // Prefer model hard-reject flag; also reject missing product; otherwise gate on threshold 75.
  const interesting =
    parsed.interesting === false || noProduct ? false : score >= SCOUT_SCORE_THRESHOLD;

  if (interesting === false && noProduct && score > 0) {
    score = 0;
  }

  return {
    interesting,
    score: interesting ? score : Math.min(score, SCOUT_SCORE_THRESHOLD - 1),
    reason:
      typeof parsed.reason === 'string'
        ? parsed.reason
        : noProduct
          ? 'Нет явного покупаемого продукта/устройства.'
          : 'No reason provided by scout model.',
    productType: productType || 'none',
  };
}

export { scoutArticle as scouterArticle };
