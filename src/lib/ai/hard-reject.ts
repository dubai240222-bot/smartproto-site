/**
 * HARD editorial gate for SmartProto:
 * ONLY publish what ordinary people can BUY / PREORDER and USE
 * to improve life or work. Everything else is rejected.
 */

export interface HardRejectResult {
  reject: boolean;
  reason: string;
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
  /\bнаушник/i,
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

export function hardRejectTopic(title: string, text = ''): HardRejectResult {
  const hay = `${title}\n${text}`.trim();
  if (!hay) {
    return { reject: true, reason: 'Пустой материал — нет покупаемого продукта.' };
  }

  for (const re of HARD_REJECT_PATTERNS) {
    if (re.test(hay)) {
      return {
        reject: true,
        reason: `Жёсткий reject: политика/знаменитости/культура/природа/непокупаемая тема (${re.source}).`,
      };
    }
  }

  for (const re of NON_BUYABLE_RESEARCH) {
    if (re.test(hay)) {
      return {
        reject: true,
        reason: 'Жёсткий reject: исследование/прототип без товара, который можно купить или предзаказать.',
      };
    }
  }

  const hasBuyableSignal = BUYABLE_PRODUCT_PATTERNS.some((re) => re.test(hay));
  if (!hasBuyableSignal) {
    return {
      reject: true,
      reason: 'Жёсткий reject: нет явного покупаемого продукта/устройства (buy/preorder).',
    };
  }

  return { reject: false, reason: '' };
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
