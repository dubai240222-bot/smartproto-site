/**
 * HARD editorial gate for SmartProto:
 * ONLY publish what ordinary people can BUY / PREORDER and USE
 * to improve life or work. Everything else is rejected.
 */

export type MarketSaturation = 'low' | 'medium' | 'high';
export interface NoveltyAssessment {
  isActuallyNew: boolean;
  noveltyEvidence: string[];
  existingAlternatives: string;
  functionalDifference: string;
  marketSaturation: MarketSaturation;
  rejectCode: string | null;
}
export interface HardRejectResult {
  reject: boolean;
  reason: string;
  rejectCode?: string | null;
  novelty?: NoveltyAssessment;
}

/** Topics that are never publishable, regardless of "wow". */
const HARD_REJECT_PATTERNS: RegExp[] = [
  // Politics / news without a product
  /\btrump\b/i,
  /\bwalz\b/i,
  /\bpolitic/i,
  /\belection\b/i,
  /\bgovernor\b/i,
  /\bsenate\b/i,
  /\bcongress\b/i,
  /\bwhite house\b/i,
  /\bkremlin\b/i,
  /\bполитик/i,
  /\bвыборы\b/i,
  // Celebrities / singers / culture drama
  /\bcelebrity\b/i,
  /\bcelebrities\b/i,
  /\bsinger\b/i,
  /\brapper\b/i,
  /\bactress\b/i,
  /\bactor\b/i,
  /\bbillboard hot 100\b/i,
  /\bbox office\b/i,
  /\bspider-?man\b/i,
  /\bfilm leak\b/i,
  /\bmovie leak\b/i,
  /\bmemoir\b/i,
  /\bauthor interview\b/i,
  /\bangela nissel\b/i,
  /\bgraphic novel\b/i,
  /\bкомикс\b/i,
  /\bграфический роман\b/i,
  /\bcommunity advisory\b/i,
  /\bsubscribe to it instead\b/i,
  /\bписател/i,
  /\bпевец\b/i,
  /\bзнаменит/i,
  /\bзнаменитост/i,
  // Nature / wildlife / elephants / non-product places
  /\bwildlife\b/i,
  /\belephant\b/i,
  /\bnatural history\b/i,
  /\bmuseum\b/i,
  /\bskyscraper\b/i,
  /\barchitecture\b/i,
  /\bmossy\b/i,
  /\bслоны?\b/i,
  /\bприрода\b/i,
  /\bмузей\b/i,
  // Pure culture / entertainment without a buyable device
  /\bgrief\b/i,
  /\bhow to watch\b/i,
  /\bopinion:\b/i,
  /\bshopping guide\b/i,
  /\bback to school\b/i,
  // Cars / automotive news without a consumer gadget
  /\bhybrid suv\b/i,
  /\blargest suv\b/i,
  /\boff-road (power|suv)\b/i,
  /\bgalaxy cruiser\b/i,
  /\baudi q9\b/i,
  /\b\d[\d,]*-?hp\b/i,
  // Internal / meta / infra — no consumer purchase path
  /\bdocker\b/i,
  /\bhacker news\b/i,
  /\bhn digest\b/i,
  /\bdevops\b/i,
  /\bkubernetes\b/i,
  /\bdeployment\b/i,
  /\bsmartproto\b/i,
  /\bраскатываем\b/i,
  /\b(npm package|open[- ]source library|sdk)\b/i,
  /\bалгоритм обработки массивов\b/i,
  /\binternal (site|note|digest)\b/i,
  /\bsite[- ]internal\b/i,
  // Event badges / OEM parts / concepts without a consumer SKU
  /\bdefcon\b/i,
  /\bconference badge\b/i,
  /\boe?m (component|part|fan)\b/i,
  /\bsolid[- ]state (micro)?fan\b/i,
  /\bxmems\b/i,
  /\bconcept (keyboard|device|product)\b/i,
  /\bdesigner (presented|unveiled) a concept\b/i,
  /\badvisory council\b/i,
  /\bcommercialization and innovation\b/i,
  /\bbrowser-based 3d editor\b/i,
  /\bsubscribe to it instead\b/i,
  /\bstewart platform\b/i,
  /\bvibe coding\b/i,
  /\bfeels like cheating\b/i,
  /\bdomesticating ai\b/i,
];

/** Signals that a concrete purchasable / preorderable product is present. */
const BUYABLE_PRODUCT_PATTERNS: RegExp[] = [
  /\bgadget\b/i,
  /\bdevice\b/i,
  /\bwearable\b/i,
  /\bprojector\b/i,
  /\bkeyboard\b/i,
  /\bheadphone/i,
  /\bearbud/i,
  /\btoothbrush\b/i,
  /\bpower bank\b/i,
  /\btablet\b/i,
  /\bphone\b/i,
  /\bsmartphone\b/i,
  /\bcamera\b/i,
  /\bsmart home\b/i,
  /\bsmart glass/i,
  /\btranslator\b/i,
  /\bkickstarter\b/i,
  /\bindiegogo\b/i,
  /\bdock\b/i,
  /\bssd\b/i,
  /\bcharger\b/i,
  /\bpillow\b/i,
  /\broaster\b/i,
  /\bskillet\b/i,
  /\bfrying\b/i,
  /\bmp3\b/i,
  /\bsecurity key\b/i,
  /\be-?ink\b/i,
  /\bstream deck\b/i,
  /\bcontroller\b/i,
  /\bgamepad\b/i,
  /\brobot\b/i,
  /вентилятор/i,
  /\bfan\b/i,
  /нит[ьи]/i,
  /\bthread\b/i,
  /\blego\b/i,
  /\be-?bike\b/i,
  /\bchess\b/i,
  /\bшахмат/i,
  /\bpreorder\b/i,
  /\bpre-order\b/i,
  /\bavailable (to )?buy\b/i,
  /\bfor \$/i,
  /\bpriced at\b/i,
  /\bon sale\b/i,
  /\bamazon\b/i,
  /\btemu\b/i,
  /\btaobao\b/i,
  /\baliexpress\b/i,
  /\bгаджет/i,
  /\bустройств/i,
  /\bможно купить/i,
  /\bпредзаказ/i,
  /наушник/i,
  /\bпроектор/i,
  /\bклавиатур/i,
];

/** Lab / abstract research without a consumer SKU. */
const NON_BUYABLE_RESEARCH: RegExp[] = [
  /\bresearchers devise\b/i,
  /\bresearchers (from|at|have|developed|created)\b/i,
  /\blaboratory\b/i,
  /\blab prototype\b/i,
  /\bnot (yet )?commercially available\b/i,
  /\bno (clear )?path to (buy|purchase|consumers)\b/i,
  /\bлабораторн/i,
  /\bне массовый товар/i,
  /\bещё нельзя купить/i,
  /\bнельзя купить/i,
];

const NOVELTY_RE =
  /предзаказ|pre-?order|kickstarter|indiegogo|анонс|launch|термоэлектри|sodium-?ion|натрий-?ион|живого перевода|live translat|новой систем|без интернета|offline|складывает одежд|измеряет показатель|поддерживает \d+\s*язык|патент|новая модель|new model|перв\w*\s+серийн|фабричн/i;
const COSMETIC_RE =
  /нов(ый|ая|ое|ым)?\s+цвет|new color|другой упаковк|new packaging|только (цвет|форма|упаковка|дизайн)/i;
const FAKE_NEW_RE =
  /продавец назвал|назвал[аи]?\s+новинк|\bстарые?\b.{0,40}(наушник|tws|товар)/i;
const SATURATED_RE =
  /обычный\s+(мини-?)?вентилятор|мини-?вентилятор с новым цветом|power bank.{0,40}упаковк|\btws\b/i;

export function assessNovelty(title: string, text = ''): NoveltyAssessment {
  const hay = `${title}\n${text}`;
  const noveltyEvidence = NOVELTY_RE.test(hay) ? [NOVELTY_RE.source] : [];
  const cosmetic = COSMETIC_RE.test(hay);
  const fakeNew = FAKE_NEW_RE.test(hay);
  const high = SATURATED_RE.test(hay) || cosmetic || fakeNew;
  const functionalDifference = noveltyEvidence.length
    ? 'Функциональный/запусковый признак новизны.'
    : cosmetic
      ? 'Только косметическое отличие.'
      : '';
  const isActuallyNew = noveltyEvidence.length > 0 && !cosmetic && !fakeNew;
  return {
    isActuallyNew,
    noveltyEvidence,
    existingAlternatives: high ? 'Много аналогов на маркетплейсах.' : '',
    functionalDifference,
    marketSaturation: high ? 'high' : noveltyEvidence.length ? 'low' : 'medium',
    rejectCode: isActuallyNew ? null : 'NOT_ACTUALLY_NEW',
  };
}

export function hardRejectTopic(title: string, text = ''): HardRejectResult {
  const hay = `${title}\n${text}`.trim();
  if (!hay) {
    return { reject: true, reason: 'Пустой материал — нет покупаемого продукта.', rejectCode: 'NO_PRODUCT' };
  }
  for (const re of HARD_REJECT_PATTERNS) {
    if (re.test(hay)) {
      return {
        reject: true,
        reason: `Жёсткий reject: политика/знаменитости/культура/природа/непокупаемая тема (${re.source}).`,
        rejectCode: 'HARD_TOPIC',
      };
    }
  }
  for (const re of NON_BUYABLE_RESEARCH) {
    if (re.test(hay)) {
      return {
        reject: true,
        reason: 'Жёсткий reject: исследование/прототип без товара, который можно купить или предзаказать.',
        rejectCode: 'NON_BUYABLE_RESEARCH',
      };
    }
  }
  if (!BUYABLE_PRODUCT_PATTERNS.some((re) => re.test(hay))) {
    return {
      reject: true,
      reason: 'Жёсткий reject: нет явного покупаемого продукта/устройства (buy/preorder).',
      rejectCode: 'NO_PRODUCT',
    };
  }
  const novelty = assessNovelty(title, text);
  if (!novelty.isActuallyNew) {
    return {
      reject: true,
      reason: 'Жёсткий reject: NOT_ACTUALLY_NEW — нет новизны / массовый старый товар / только косметика.',
      rejectCode: 'NOT_ACTUALLY_NEW',
      novelty,
    };
  }
  return { reject: false, reason: '', rejectCode: null, novelty };
}

/** Deterministic Scout/U1 gate for tests (no OpenRouter). */
export function evaluateTopicLocal(title: string, text = '') {
  const gate = hardRejectTopic(title, text);
  const novelty = gate.novelty ?? assessNovelty(title, text);
  const interesting = !gate.reject;
  return {
    interesting,
    score: interesting ? 75 : 0,
    reason: gate.reject ? gate.reason : 'Покупаемый новый consumer-продукт с признаком новизны.',
    productType: interesting ? 'gadget' : 'none',
    ...novelty,
    rejectCode: gate.rejectCode ?? novelty.rejectCode,
    isActuallyNew: interesting,
  };
}

/** Keyword prefilter for RSS (same policy as hardRejectTopic, looser on product signals for gadget feeds). */
export function looksBuyableGadget(title: string, text = '', sourceName = ''): boolean {
  const gate = hardRejectTopic(title, text);
  if (gate.reject && !gate.reason.includes('нет явного покупаемого')) {
    return false;
  }
  if (!gate.reject) return true;

  // On known gadget feeds, allow through if hard topic reject did not fire —
  // product signal may be weak in the RSS snippet; Scout will re-check.
  const source = sourceName.toLowerCase();
  if (
    source.includes('yanko') ||
    source.includes('new atlas') ||
    source.includes('hackaday') ||
    source.includes('gadget') ||
    source.includes('engadget') ||
    source.includes('adafruit') ||
    source.includes('raspberry')
  ) {
    const hay = `${title} ${text}`.toLowerCase();
    if (/\b(tower|museum|building|architecture|wildlife|nature|author|memoir|singer|album|film|movie|trump|politic|graphic novel|advisory council)\b/.test(hay)) {
      return false;
    }
    return true;
  }
  return false;
}
