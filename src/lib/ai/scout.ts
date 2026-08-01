import { getOpenRouterClient, parseJsonObject, clampText } from './shared';

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
  'Ты разведчик SmartProto — медиа о умных/«чудо»/полезных потребительских товарах,',
  'изобретениях, лайфхаках и самых горячих новых гаджетах.',
  'Мы на шаг впереди маркетплейсов: ищем то, что скоро окажется на Taobao/Temu/Amazon/AliExpress',
  'или уже на Kickstarter/Indiegogo и в английской gadget-прессе (New Atlas, Yanko Design).',
  'Главный вопрос: захочет ли обычный человек узнать о товаре, показать другу или купить?',
  '',
  'Оценка 0–100 строго суммой A–E:',
  'A желание купить 0–30; B новизна 0–20; C практическая польза 0–20;',
  'D визуальная привлекательность 0–15; E коммерческий потенциал 0–15.',
  'Проходной балл концептуально 75/100.',
  '',
  'Приоритет (покупаемые устройства): wearable, power bank, портативный проектор, переводчик,',
  'умный дом, кухонный гаджет, здоровье/сон, авто-гаджет, viral Temu/Amazon/Taobao-находки,',
  'наушники/камеры/аксессуары, Kickstarter/Indiegogo, CES/IFA/Computex, фабричные анонсы.',
  '',
  'Жёсткий reject (score=0, interesting=false), если:',
  '- нет конкретного покупаемого продукта/устройства;',
  '- Docker, HN-мета, DevOps, API, библиотеки, инфраструктура;',
  '- абстрактное AI/научное исследование без готового consumer-устройства;',
  '- site-internal notes / внутренняя заметка без нового товара;',
  '- нет пользы для обычного человека или признака новизны;',
  '- нельзя объяснить суть одним простым предложением;',
  '- SEO-мусор / пресс-релиз без фактов.',
  'Не выдумывай цену, дату и площадку, если их нет в тексте.',
].join('\n');

export async function scoutArticle(title: string, text: string): Promise<ScoutResult> {
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
          'score = a+b+c+d+e. interesting=true только если score>=75 и нет жёсткого reject.',
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
  // Prefer model hard-reject flag; otherwise gate on threshold 75.
  const interesting =
    parsed.interesting === false ? false : score >= SCOUT_SCORE_THRESHOLD;

  return {
    interesting,
    score,
    reason: typeof parsed.reason === 'string' ? parsed.reason : 'No reason provided by scout model.',
    productType: typeof parsed.productType === 'string' ? parsed.productType : undefined,
  };
}

export { scoutArticle as scouterArticle };
