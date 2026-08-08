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
  'Ты разведчик SmartProto — оповещения о интересных изобретениях, полезных возможностях',
  'гаджетов/приложений и grounded новостях мира ИИ (что умеет, чем помогает, шаги к автономии).',
  'HARD FILTER: нужен конкретный предмет интереса — устройство, приложение, AI-система/модель/демо',
  'или изобретение с ясной пользой. Не обязательно «уже можно купить сегодня».',
  'Публичный текст БЕЗ цен и БЕЗ ссылок — оценивай смысл и новизну, не витрину.',
  'Главный вопрос: обычный человек скажет «неужели / полезно / хочу знать»?',
  'Поля: isActuallyNew, noveltyEvidence[], functionalDifference, marketSaturation, rejectCode.',
  '',
  'Оценка 0–100 строго суммой A–E:',
  'A желание узнать/попробовать 0–30; B новизна / wow-disbelief 0–20; C практическая польза 0–20;',
  'D ясность «что это» 0–15; E значимость для читателя SmartProto 0–15.',
  'Проходной балл концептуально 75/100.',
  '',
  'ПРИОРИТЕТ: unusual gadgets/apps, AI capability milestones, autonomy demos, полезные изобретения,',
  PREFERRED_GADGET_CATEGORIES + '.',
  '',
  'REJECT: политика/celebrities/культура; SEO listicles; commodity/overplayed (цвет флагмана, endless leaks);',
  'нишевый PC без consumer-angle; материалы только про цену+купить; кликбейт sci-fi без фактов;',
  'Docker/DevOps/API без consumer-смысла.',
  'KEEP AI news если есть конкретное достижение/возможность и понятная польза человеку.',
  'Не выдумывай цену и ссылки.',
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
      : 'interesting=true если score>=75 и есть конкретный гаджет/app/AI-достижение/изобретение с пользой (покупка НЕ обязательна), isActuallyNew, noveltyEvidence не пуст.';

  const client = getOpenRouterClient();
  const completion = await client.chat.completions.create({
    model: SCOUT_MODEL,
    temperature: 0.1,
    top_p: 0.9,
    max_tokens: 900,
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
