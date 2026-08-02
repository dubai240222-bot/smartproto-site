import { getOpenRouterClient, parseJsonObject, clampText } from './shared';
import {
  hardRejectTopic,
  evaluateTopicLocal,
  PREFERRED_GADGET_CATEGORIES,
  PREFERRED_APP_CATEGORIES,
  type EditorialMode,
  type NoveltyAssessment,
} from './hard-reject';

export interface ScoutResult extends Partial<NoveltyAssessment> {
  interesting: boolean;
  score: number;
  reason: string;
  productType?: string;
}

/** Consumer-gadgets gate: A+B+C+D+E must reach this to pass.
 * TEST: Actions sets SCOUT_SCORE_THRESHOLD=65 so the pipeline is not empty.
 * Prod default remains 75 when env unset. */
export const SCOUT_SCORE_THRESHOLD = (() => {
  const raw = process.env.SCOUT_SCORE_THRESHOLD?.trim();
  const n = raw ? Number(raw) : 75;
  return Number.isFinite(n) && n > 0 ? n : 75;
})();

const SCOUT_MODEL = process.env.OPENROUTER_SCOUT_MODEL ?? 'deepseek/deepseek-v4-flash:latest';

const SCOUT_SYSTEM_PROMPT_GADGET = [
  'Ты разведчик SmartProto — медиа ТОЛЬКО про умные/полезные потребительские гаджеты',
  'и товары для повседневности и продуктивности на работе.',
  'HARD FILTER: публикуем ТОЛЬКО то, что обычный человек может КУПИТЬ или ПРЕДЗАКАЗАТЬ и использовать',
  'чтобы улучшить быт или работу. Без покупаемого продукта — всегда reject.',
  'Мы на шаг впереди маркетплейсов: ищем то, что скоро окажется на Taobao/Temu/Amazon/AliExpress',
  'или уже на Kickstarter/Indiegogo и в gadget-прессе (New Atlas, Yanko Design).',
  'Главный вопрос: это конкретный НОВЫЙ товар/устройство, о котором обычный человек захочет узнать, показать другу или подумать о покупке?',
  'Поля: isActuallyNew, noveltyEvidence[], functionalDifference, marketSaturation, rejectCode. Пустая новизна / только цвет-упаковка → rejectCode=NOT_ACTUALLY_NEW.',
  '',
  'Оценка 0–100 строго суммой A–E:',
  'A желание купить 0–30; B новизна / wow-disbelief 0–20; C практическая польза (быт/работа) 0–20;',
  'D визуальная привлекательность 0–15; E коммерческий потенциал 0–15.',
  'Проходной балл концептуально 75/100.',
  '',
  'Приоритет (покупаемые устройства):',
  PREFERRED_GADGET_CATEGORIES + ';',
  'также smart gadgets, work tools, portable electronics, productivity devices,',
  'viral Temu/Amazon/Taobao-находки, Kickstarter/Indiegogo, CES/IFA/Computex.',
  '',
  'НИЗКИЙ ПРИОРИТЕТ / REJECT (SP-A-039-ALT) — нишевые PC/engineering товары:',
  'CPU cooler, motherboard, PC case, PSU, RAM, thermal paste, internal SSD, internal computer component,',
  'server component, developer board, bare PCB, NAS parts, enterprise hardware.',
  'Не полный бан: допускай ТОЛЬКО при сильном consumer-angle — хотя бы одно из:',
  'обычный человек без техзнаний; готовое устройство (не компонент); необычный дизайн;',
  'явная польза home/travel/car/health/sleep/study/comms/safety; заметно дешевле/меньше/удобнее;',
  'реальный wow-factor. Если интересно ТОЛЬКО сборщикам ПК / инженерам / разработчикам /',
  'hardware-энтузиастам → REJECT или score далеко ниже 75.',
  '',
  'DOWNRANK / REJECT (SP-A-049): обычные мониторы, power bank без новой функции, merch/collab gift boxes,',
  'нишевые maker-tools (паяльники, осциллографы, filament) без сильного wow/consumer-angle.',
  'KEEP reference: Casio CRW-H001 / unusual smart rings / foldables / translators — НЕ резать.',
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
  '- нишевый PC/engineering компонент без сильного consumer-angle (SP-A-039-ALT);',
  '- conference badge / Defcon / DIY без kit/SKU который можно заказать;',
  '- Docker, HN-мета, DevOps, API, библиотеки, инфраструктура, site-internal digests;',
  '- нет пользы для быта/работы или признака новизны;',
  '- нельзя объяснить суть одним простым предложением;',
  '- SEO-мусор / пресс-релиз без фактов.',
  'Не выдумывай цену, дату и площадку, если их нет в тексте.',
].join('\n');

const SCOUT_SYSTEM_PROMPT_APP = [
  'Ты разведчик SmartProto — стол Mobile Apps: полезные мобильные приложения и редкие/замечательные игры.',
  'HARD FILTER: одно конкретное приложение или игра, которое реально помогает жить/учиться/работать',
  'или это яркая novelty-игра. digital product OK (App Store / Google Play / TestFlight).',
  `Приоритет: ${PREFERRED_APP_CATEGORIES}.`,
  'Оценка 0–100 суммой A–E (желание попробовать / новизна / польза / визуал / потенциал).',
  'REJECT всегда: SEO roundups («50 apps you need»), app deals, gambling, casino, crypto/NFT pumps,',
  'generic listicles, enterprise fluff без consumer value, политика, celebrities.',
  'Games OK только если wonderful/notable — не ежедневный free-to-play спам.',
  'productType = "app" | "game" | "none". Не выдумывай цену/рейтинг если нет в тексте.',
].join('\n');

export async function scoutArticle(
  title: string,
  text: string,
  mode: EditorialMode = 'gadget',
): Promise<ScoutResult> {
  const gate = hardRejectTopic(title, text, { mode });
  // Hard short-circuit definitive bans. NOT_ACTUALLY_NEW may still reach the model —
  // RSS summaries are thin; body text can reveal a real launch/SKU (SP-A-050).
  if (gate.reject && gate.rejectCode !== 'NOT_ACTUALLY_NEW') {
    return {
      ...evaluateTopicLocal(title, text),
      interesting: false,
      score: 0,
      productType: 'none',
    };
  }

  const systemPrompt = mode === 'app' ? SCOUT_SYSTEM_PROMPT_APP : SCOUT_SYSTEM_PROMPT_GADGET;
  const passHint =
    mode === 'app'
      ? 'interesting=true только если score>=75, конкретное НОВОЕ полезное app/game, isActuallyNew, noveltyEvidence не пуст.'
      : 'interesting=true только если score>=75, покупаемый НОВЫЙ продукт, isActuallyNew, noveltyEvidence не пуст.';

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
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          `Заголовок: ${title}`,
          '',
          `Текст: ${clampText(text, 8000)}`,
          '',
          'Верни только JSON:',
          '{"interesting":boolean,"score":number,"reason":string,"productType":string,"isActuallyNew":boolean,',
          '"noveltyEvidence":string[],"existingAlternatives":string,"functionalDifference":string,',
          '"marketSaturation":"low"|"medium"|"high","rejectCode":string|null,',
          '"parts":{"a":number,"b":number,"c":number,"d":number,"e":number}}',
          `score=a+b+c+d+e. ${passHint}`,
          'high+пустой functionalDifference / только косметика → rejectCode=NOT_ACTUALLY_NEW. productType или "none". reason: 1 фраза RU.',
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

  // Deterministic novelty already passed hardReject; model may still veto.
  const n = gate.novelty!;
  const modelEvidence = Array.isArray(parsed.noveltyEvidence)
    ? parsed.noveltyEvidence.filter((x): x is string => typeof x === 'string' && !!x.trim())
    : n.noveltyEvidence;
  const functionalDifference =
    typeof parsed.functionalDifference === 'string' && parsed.functionalDifference.trim()
      ? parsed.functionalDifference.trim()
      : n.functionalDifference;
  const marketSaturation =
    parsed.marketSaturation === 'low' ||
    parsed.marketSaturation === 'medium' ||
    parsed.marketSaturation === 'high'
      ? parsed.marketSaturation
      : n.marketSaturation;
  const isActuallyNew =
    parsed.isActuallyNew !== false &&
    modelEvidence.length > 0 &&
    !(marketSaturation === 'high' && !functionalDifference);
  const interesting =
    parsed.interesting === false || noProduct || !isActuallyNew
      ? false
      : score >= SCOUT_SCORE_THRESHOLD;
  if (!interesting && (noProduct || !isActuallyNew) && score > 0) score = 0;

  return {
    interesting,
    score: interesting ? score : Math.min(score, SCOUT_SCORE_THRESHOLD - 1),
    reason:
      typeof parsed.reason === 'string'
        ? parsed.reason
        : noProduct
          ? 'Нет явного покупаемого продукта/устройства.'
          : !isActuallyNew
            ? 'Нет доказательства новизны (NOT_ACTUALLY_NEW).'
            : 'No reason provided by scout model.',
    productType: productType || 'none',
    isActuallyNew,
    noveltyEvidence: modelEvidence,
    existingAlternatives:
      typeof parsed.existingAlternatives === 'string'
        ? parsed.existingAlternatives
        : n.existingAlternatives,
    functionalDifference,
    marketSaturation,
    rejectCode: interesting ? null : isActuallyNew ? null : 'NOT_ACTUALLY_NEW',
  };
}

export { scoutArticle as scouterArticle, evaluateTopicLocal };
