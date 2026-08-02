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
  // Soft/app roundups / podcasts — not physical consumer gadgets
  /\blaunchers?\b/i,
  /\bapp deals?\b/i,
  /\bfreebies\b/i,
  /\bandroid app deals\b/i,
  /\bpixelated\b/i,
  /\bpodcast\b/i,
  /\bbest apps?\b/i,
  /\bapps? you should skip\b/i,
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
  /\bprinter\b/i,
  /\b3d print/i,
  /\bdrone\b/i,
  /\bmouse\b/i,
  /\blamp\b/i,
  /\bspeaker\b/i,
  /\bmicrophone\b/i,
  /\bmic\b/i,
  /\bwatch\b/i,
  /\bring\b/i,
  /\brobot\b/i,
  /\bvacuum\b/i,
  /\bnotebook\b/i,
  /\bmonitor\b/i,
  /\brouter\b/i,
  /\btracker\b/i,
  /\bheadset\b/i,
  /\bportable\b/i,
  /\bbattery\b/i,
  /\bsensor\b/i,
  /\bdisplay\b/i,
  /\bice maker\b/i,
  /\bsmartwatch\b/i,
  /\bsmart ring\b/i,
  /\bnuc\b/i,
  /\bdesktop\b/i,
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
  // Chinese consumer gadgets (China Collector / IT之家 / 36Kr)
  /手机|手表|手环|耳机|音箱|手柄|键盘|鼠标|相机|充电器|充电宝|显示器|平板|眼镜|路由器|扫地|投影|无人机|散热器|支架臂/,
  /智能家居|可穿戴|消费电子|游戏手柄/,
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
  /предзаказ|pre-?order|kickstarter|indiegogo|анонс|\b(launched|launching|product launch|launches)\b|термоэлектри|sodium-?ion|натрий-?ион|живого перевода|live translat|новой систем|без интернета|offline|складывает одежд|измеряет показатель|поддерживает \d+\s*язык|патент|новая модель|new model|перв\w*\s+серийн|фабричн|debut|unveils?|announces?|представлен|推出|发布|发售|预热|上市|开售|首发|预售|众筹|新品|新款|搭载/i;
const COSMETIC_RE =
  /нов(ый|ая|ое|ым)?\s+цвет|new color|другой упаковк|new packaging|только (цвет|форма|упаковка|дизайн)/i;
const FAKE_NEW_RE =
  /продавец назвал|назвал[аи]?\s+новинк|\bстарые?\b.{0,40}(наушник|tws|товар)/i;
const SATURATED_RE =
  /обычный\s+(мини-?)?вентилятор|мини-?вентилятор с новым цветом|power bank.{0,40}упаковк|\btws\b/i;

/**
 * SP-A-039-ALT (from SP-A-038) — niche PC / engineering parts. Not a full ban:
 * reject only when there is no strong consumer angle.
 */
const NICHE_TECH_PATTERNS: RegExp[] = [
  /\bcpu\s*cooler\b/i,
  /\b(air|liquid|aio)\s*cooler\b/i,
  /\bcpu\s*cooling\b/i,
  /\bmotherboard\b/i,
  /\bmainboard\b/i,
  /\b(atx|m-?atx|mini-?itx)\s*(motherboard|board|case)?\b/i,
  /\bpc\s*case\b/i,
  /\bcomputer\s*case\b/i,
  /\b(atx|sfx)\s*(psu|power\s*supply)\b/i,
  /\bpc\s*(psu|power\s*supply)\b/i,
  /\b(ddr4|ddr5)\s*(ram|memory|dimm)\b/i,
  /\bram\s*(kit|module|stick|dimm)\b/i,
  /\bthermal\s*(paste|compound|grease)\b/i,
  /\binternal\s*(pc|computer)\s*component\b/i,
  /\binternal\s*(ssd|nvme|hdd|drive)\b/i,
  /\bserver\s*(ssd|hdd|ram|cpu|motherboard|component|psu|blade|drive)\b/i,
  /\benterprise\s*(ssd|hdd|hardware|server|storage|nvme)\b/i,
  /\b(bare|naked)\s*pcb\b/i,
  /\b(developer|dev)\s*board\b/i,
  /\bnas\s*(bay|drive\s*cage|parts?|backplane|controller|hdd\s*tray)\b/i,
  /\bматеринск/i,
  /\bкулер\s*(для\s*)?(процессор|cpu)/i,
  /\b(компьютерн\w*\s+)?блок\s*питания\b/i,
  /\bтермопаст/i,
  /\bсерверн\w*\s*(ssd|накопител|компонент|железо)/i,
  /\bвнутренн\w*\s*(ssd|накопител)/i,
  /主板|导热硅脂|服务器(硬盘|SSD|组件)|开发板|机箱电源|内部SSD/,
];

/** Strong consumer angle that can salvage a niche-tech match (SP-A-039-ALT). */
const STRONG_CONSUMER_ANGLE: RegExp[] = [
  /\b(ordinary|average)\s+(person|people|user|consumer)s?\b/i,
  /\bwithout\s+(technical|tech|engineering|pc[- ]building)\s+knowledge\b/i,
  /\bno\s+(technical|tech)\s+knowledge\b/i,
  /\bfinished\s+(device|product|gadget)\b/i,
  /\bplug[- ]?and[- ]?play\b/i,
  /\bunusual\s+design\b/i,
  /\bwow[- ]?factor\b/i,
  /\b(home|travel|car|health|sleep|study|comms|safety)\s+(use|benefit|gadget|device|robot)\b/i,
  /\bfor\s+(home|travel|car|health|sleep|study|kids|children|office|commute)\b/i,
  /\b(much\s+)?(cheaper|smaller|more\s+convenient)\s+than\b/i,
  /\bобычн\w*\s+человек/i,
  /\bбез\s+техн/i,
  /\bготовое\s+(устройств|издели)/i,
  /\bнеобычн\w*\s+дизайн/i,
  /\bдля\s+(дома|путешеств|авто|здоров|сна|учёб|учебы|дет)/i,
];

/** Preferred SmartProto categories (scout/reviewer guidance + local hints). SP-A-039-ALT */
export const PREFERRED_GADGET_CATEGORIES =
  'unusual smartphones, game controllers, wearables, smart rings, smart home, travel gadgets, AI hardware, home robots, cameras, audio gadgets, phone accessories, power banks/chargers, mini projectors, portable displays, car gadgets, translators, health/sleep devices, kitchen gadgets, children/education gadgets';

export function isNicheTechTopic(title: string, text = ''): boolean {
  const hay = `${title}\n${text}`;
  return NICHE_TECH_PATTERNS.some((re) => re.test(hay));
}

export function hasStrongConsumerAngle(title: string, text = ''): boolean {
  const hay = `${title}\n${text}`;
  return STRONG_CONSUMER_ANGLE.some((re) => re.test(hay));
}

export function assessNovelty(title: string, text = '', opts?: { sourceName?: string }): NoveltyAssessment {
  const hay = `${title}\n${text}`;
  const noveltyEvidence = NOVELTY_RE.test(hay) ? [NOVELTY_RE.source] : [];
  const cosmetic = COSMETIC_RE.test(hay);
  const fakeNew = FAKE_NEW_RE.test(hay);
  const high = SATURATED_RE.test(hay) || cosmetic || fakeNew;
  // Design/hardware launch feeds: buyable product signal counts as novelty evidence
  // when the snippet lacks explicit "launch/preorder" wording.
  const source = (opts?.sourceName || '').toLowerCase();
  const designFeed =
    source.includes('yanko') ||
    source.includes('new atlas') ||
    source.includes('hackaday') ||
    source.includes('engadget') ||
    source.includes('ithome') ||
    source.includes('it之家') ||
    source.includes('36kr') ||
    source.includes('anker');
  if (!noveltyEvidence.length && designFeed && !cosmetic && !fakeNew && !high) {
    if (BUYABLE_PRODUCT_PATTERNS.some((re) => re.test(hay))) {
      noveltyEvidence.push('design-feed-buyable-product');
    }
  }
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

export function hardRejectTopic(title: string, text = '', sourceName = ''): HardRejectResult {
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
  // SP-A-039-ALT: niche PC/engineering components — allow only with strong consumer angle.
  // Runs before NO_PRODUCT so ordinary coolers/boards get a clear niche reject code.
  if (isNicheTechTopic(title, text) && !hasStrongConsumerAngle(title, text)) {
    return {
      reject: true,
      reason:
        'Жёсткий reject: нишевый PC/engineering компонент без сильного consumer-angle (интересен только сборщикам ПК / инженерам / энтузиастам).',
      rejectCode: 'NICHE_NO_CONSUMER_ANGLE',
    };
  }
  if (!BUYABLE_PRODUCT_PATTERNS.some((re) => re.test(hay))) {
    return {
      reject: true,
      reason: 'Жёсткий reject: нет явного покупаемого продукта/устройства (buy/preorder).',
      rejectCode: 'NO_PRODUCT',
    };
  }
  const novelty = assessNovelty(title, text, { sourceName });
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

/** Keyword prefilter for RSS — must pass novelty; NO_PRODUCT may pass on known gadget feeds. */
export function looksBuyableGadget(title: string, text = '', sourceName = ''): boolean {
  const gate = hardRejectTopic(title, text, sourceName);
  if (!gate.reject) return true;
  // Never soften HARD_TOPIC / research / niche-PC rejects.
  if (
    gate.rejectCode === 'HARD_TOPIC' ||
    gate.rejectCode === 'NON_BUYABLE_RESEARCH' ||
    gate.rejectCode === 'NICHE_NO_CONSUMER_ANGLE'
  ) {
    return false;
  }

  const source = sourceName.toLowerCase();
  const hay = `${title} ${text}`.toLowerCase();
  if (
    /\b(tower|museum|building|architecture|wildlife|nature|author|memoir|singer|album|film|movie|trump|politic|graphic novel|advisory council|launcher|app deals|freebies|podcast|indie games?)\b/.test(
      hay,
    )
  ) {
    return false;
  }

  // Yanko / New Atlas: product-design feeds — let Reviewer decide when topic is clean.
  if (source.includes('yanko') || source.includes('new atlas')) {
    return true;
  }

  if (
    source.includes('hackaday') ||
    source.includes('gadget') ||
    source.includes('engadget') ||
    source.includes('adafruit') ||
    source.includes('raspberry')
  ) {
    if (gate.rejectCode === 'NO_PRODUCT') {
      return assessNovelty(title, text, { sourceName }).isActuallyNew;
    }
    // NOT_ACTUALLY_NEW on hardware feeds still blocked.
    return false;
  }
  return false;
}
