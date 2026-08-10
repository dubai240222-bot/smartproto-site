/**
 * HARD editorial gate for SmartProto:
 * ONLY publish what ordinary people can BUY / PREORDER and USE
 * to improve life or work. Everything else is rejected.
 *
 * Mode `app` (Mobile Apps desk): digital apps/games that help daily life OK;
 * still reject SEO spam, gambling, crypto pumps, generic roundups.
 */

export type MarketSaturation = 'low' | 'medium' | 'high';
export type EditorialMode = 'gadget' | 'app' | 'ai_radar';

export interface HardRejectOpts {
  sourceName?: string;
  mode?: EditorialMode;
}

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

function resolveOpts(sourceNameOrOpts: string | HardRejectOpts = ''): HardRejectOpts {
  if (typeof sourceNameOrOpts === 'string') return { sourceName: sourceNameOrOpts, mode: 'gadget' };
  return {
    sourceName: sourceNameOrOpts.sourceName || '',
    mode: sourceNameOrOpts.mode || 'gadget',
  };
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
  // Soft/app roundups / podcasts — not physical consumer gadgets (gadget mode)
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

/**
 * App-desk spam / scam — rejected even in mode=app.
 * Useful single-app launches and notable games are allowed separately.
 */
const APP_SPAM_PATTERNS: RegExp[] = [
  /\bbest apps?\b/i,
  /\btop\s+\d+\s+apps?\b/i,
  /\b\d+\s+apps?\s+(you|to)\b/i,
  /\bapps? you (need|should|must)\b/i,
  /\bapp deals?\b/i,
  /\bandroid app deals\b/i,
  /\bfreebies\b/i,
  /\blaunchers?\b/i,
  /\bgambling\b/i,
  /\bcasino\b/i,
  /\bsports?\s*betting\b/i,
  /\bcrypto\b/i,
  /\bbitcoin\b/i,
  /\bnft\b/i,
  /\bweb3\b/i,
  /\bairdrop\b/i,
  /\bseo\s*(app|apps|tool|tools|spam)\b/i,
  /\bpixelated\b/i,
  /\bpodcast\b/i,
];

/** Signals a concrete mobile app / notable mobile game. */
const USEFUL_APP_PATTERNS: RegExp[] = [
  /\bapp(s|lication)?\b/i,
  /\bios\b/i,
  /\bandroid\b/i,
  /\biphone\b/i,
  /\bipad\b/i,
  /\bapp store\b/i,
  /\bgoogle play\b/i,
  /\bplay store\b/i,
  /\btestflight\b/i,
  /\bmobile game\b/i,
  /\bindie game\b/i,
  /\bapk\b/i,
  /\bприложен/i,
  /\bмобильн\w*\s+(игр|приложен)/i,
  /应用|手游|App Store|Google Play/,
];

/** Signals that a concrete purchasable / preorderable product is present. */
const BUYABLE_PRODUCT_PATTERNS: RegExp[] = [
  /\bgadget\b/i,
  /\bdevice\b/i,
  /\bwearable\b/i,
  /\bbracelet\b/i,
  /\bbassinet\b/i,
  /\bcry\b/i,
  /\bsandal/i,
  /\bwatering\b/i,
  /\birrigation\b/i,
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
  /гаджет/i,
  /устройств/i,
  /можно купить/i,
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
  /нов(ый|ая|ое|ым)?\s+цвет|new color|new colour|colorway|другой упаковк|new packaging|только (цвет|форма|упаковка|дизайн)|finish\s*refresh|цветов(ой|ая)\s*обновлен/i;
const FAKE_NEW_RE =
  /продавец назвал|назвал[аи]?\s+новинк|\bстарые?\b.{0,40}(наушник|tws|товар)/i;
const SATURATED_RE =
  /обычный\s+(мини-?)?вентилятор|мини-?вентилятор с новым цветом|power bank.{0,40}упаковк|\btws\b/i;

/**
 * SP-A-054 — worn-out / overplayed mass products people already hear constantly.
 * Color refreshes, endless flagship rumor/leak churn, commodity phone accessories.
 */
const OVERPLAYED_MASS_PATTERNS: RegExp[] = [
  /\biphone\b.{0,50}\b(new\s+)?(color|colour|colorway|finish|hue|оттенк|цвет)\b/i,
  /\b(new\s+)?(color|colour|colorway|finish).{0,50}\biphone\b/i,
  /\biphone\s*(1[5-9]|2\d)\b.{0,50}\b(rumor|rumour|leak|concept|render|слу[хх]|утечк)\b/i,
  /\b(samsung\s+)?galaxy\s*s\s*2[4-9]\b.{0,50}\b(color|colour|colorway|rumor|rumour|leak)\b/i,
  /\bpixel\s*(8|9|10|11)\b.{0,50}\b(color|colour|colorway|rumor|rumour|leak)\b/i,
  /\bairpods?\b.{0,40}\b(new\s+)?(color|colour|case|чехол)\b/i,
  /\b(same\s+(phone|device)|just\s+a\s+new\s+color|только\s+новый\s+цвет|ещё\s+один\s+цвет)\b/i,
  /\b(magsafe|lightning)\s+(cable|charger|brick|cable\s*kit)\b/i,
  /\b(generic|обычн\w*)\s+(usb[- ]?c\s*)?(charger|зарядк|кабел)/i,
  /\b(flagship\s+)?(phone|smartphone)\s+(color|colour)\s+(refresh|update|option)\b/i,
];

/**
 * SP-A-049 / SP-A-050 — ordinary commodity / low-wow topics.
 * Downrank → hard reject unless strong wow / consumer angle (Casio CRW-H001 KEEP).
 */
const COMMODITY_LOW_WOW_PATTERNS: RegExp[] = [
  /\b(ordinary|generic|standard|basic)\s+(monitor|display|power\s*bank|charger|ssd)\b/i,
  /\b\d{2,3}(["″]|-?inch)?\s*(ips|va|tn)?\s*monitor\b/i,
  /\b(gaming\s*)?monitor\b.{0,40}\b(144|165|180|240)\s*hz\b/i,
  /\b(power\s*bank|портативн\w*\s*заряд|повербанк|пауэрбанк)\b/i,
  /\b(merch|merchandise|collab(?:oration)?|gift\s*box|blind\s*box)\b/i,
  /\b(коллаборац|мерч|подарочн\w*\s*набор|blind\s*box)\b/i,
  /\b(3d\s*printer\s*(filament|nozzle|bed)|soldering\s*(iron|station)|oscilloscope|multimeter|bench\s*supply)\b/i,
  /\b(maker[- ]?tool|cnc\s*spindle|hot\s*air\s*station|fume\s*extractor)\b/i,
  /обычн\w*\s*(монитор|пауэрбанк|повербанк|зарядк)/i,
  /монитор.{0,30}(144|165|180|240)\s*гц/i,
];

/**
 * SP-A-073 — gray everyday clutter readers should not spend time on.
 * Always rejected in gadget mode (no «для дома» salvage).
 * Mice, boomboxes/speakers/subwoofers, Indian budget phones, dull PC junk, cars-as-news.
 */
const GRAY_COMMODITY_HARD_PATTERNS: RegExp[] = [
  // Mice as the product (not “replaces your mouse”)
  /\b(gaming|wireless|wired|optical)?\s*(gaming\s+)?mouse\b|\b(игров\w*\s+)?мышь\b|\bмыши\b|\bмышек\b/i,
  /\b(aula|logitech|razer|steelseries|glorious|lamzu)\b.{0,40}\b(mouse|мышь)/i,
  /\b(sc\d{2,4}|g\s*pro|deathadder|viper)\b.{0,30}\b(mouse|мышь|dpi|polling)/i,
  // Speakers / boomboxes / subwoofers / party audio
  /\b(bluetooth\s+)?speaker\b|\bboombox\b|\bxboom\b|\bsubwoofer\b|\bсабвуфер/i,
  /\bпортативн\w*\s+(колонк|акустик)|\bколонк[аиуе]?\b|\bакустическ\w*\s+систем/i,
  /\bjbl\s*(pulse|flip|charge|boombox|xtreme)/i,
  /\blg\s+xboom|\bxboom\s+blast/i,
  // Indian / ultra-budget phone churn
  /\b(lava|micromax|itel)\b.{0,50}\b(phone|smartphone|smart\s*\d|мобил|смартфон)/i,
  /\blava\s+smart\b|\bmicromax\s+in\b/i,
  /\b(tecno|infinix)\b.{0,40}\b(spark|hot|camon|smart\s*\d|бюджетн)/i,
  /\b(бюджетн\w*\s+смартфон|budget\s+smartphone)\b/i,
  // Dull storage / dock clutter
  /\b(ssd\s*enclosure|nvme\s*(box|enclosure|корпус)|внешн\w*\s+ssd[- ]?бокс)\b/i,
  /\busb[- ]?hub\b|\bcard\s*reader\b|\bкардридер\b/i,
  // Cars / MPV as consumer “gadget” noise
  /\b(mpv|suv|седан|кроссовер)\b/i,
  /\b(автомобил|family\s+mpv|dongfeng|xinghai)\b/i,
  // Generic mechanical / gaming keyboards (Altar-class ultra-thin still needs KEEP or fail — treat as gray)
  /\b(mechanical|gaming|мембранн\w*)\s+keyboard\b|\bмеханическ\w*\s+клавиатур/i,
  // Generic TWS earbuds
  /\b(tws|true\s+wireless)\b.{0,40}\b(earbuds|наушник)/i,
  /\bopen[- ]?(fit|ear)\s*2?\b.{0,40}\b(наушник|earbuds|headphones|shokz)\b/i,
  /\bshokz\s+openfit\b/i,
];

/** “Replaces mouse/keyboard” inventions are NOT gray commodity. */
const REPLACES_PERIPHERAL_RE =
  /\b(replace|replaces|вместо|без\s+необходимости|отказаться\s+от)\b[\s\S]{0,40}\b(mouse|мыши|мышь|keyboard|клавиатур)/i;

export function isGrayCommodityHard(title: string, text = ''): boolean {
  if (isKeepWowException(title, text)) return false;
  const hay = `${title}\n${text}`;
  if (REPLACES_PERIPHERAL_RE.test(hay)) {
    // Only speakers/phones/cars/ssd still apply
    return GRAY_COMMODITY_HARD_PATTERNS.filter((re) => {
      const s = re.source.toLowerCase();
      return !/mouse|мышь|мыши|keyboard|клавиатур|aula|razer|logitech|sc\\d/i.test(s);
    }).some((re) => re.test(hay));
  }
  return GRAY_COMMODITY_HARD_PATTERNS.some((re) => re.test(hay));
}

/**
 * SP-A-054 — editorial ALERT mode: interesting AI capability / invention / useful software
 * may pass without a buyable SKU (no prices/links in public copy).
 */
const AI_OR_INVENTION_ALERT_RE =
  /\b(ai|a\.i\.|artificial intelligence|chatgpt|gemini|claude|llm|gpt(?:-\d)?|openai|anthropic|deepmind|astra|machine learning|neural|copilot|agentic|autonom(?:y|ous)|superintelligence|agi|on[- ]device ai|foundation model|reasoning model|deepfake|robotaxi|vtol|invention|prototype that|breakthrough|milestone|robotics?|humanoid|exoskeleton|critical cyber|cybersecur(?:ity|e)|preparedness framework)\b|искусственн\w*\s+интеллект|\bии\b|нейросет|автономн|изобретен|достижен\w*\s+(в\s+)?(ии|ai)|суперразум|робот/i;

export function isAiOrInventionAlert(title: string, text = ''): boolean {
  return AI_OR_INVENTION_ALERT_RE.test(`${title}\n${text}`);
}

/** KEEP reference — unusual wearables must not be killed by commodity rules. */
const KEEP_WOW_EXCEPTIONS: RegExp[] = [
  /\bcasio\b/i,
  /\bcrw[- ]?h001\b/i,
  /\bsmart\s*ring\b/i,
  /\bring[- ]?watch\b/i,
  /\bкольц[оа].{0,20}(час|smart|здоров)/i,
  /\bunusual\s+(phone|smartphone|controller|wearable)\b/i,
  /\bfoldable\b/i,
  /\btranslator\b/i,
  /\brobot\s*(vacuum|pet|companion|lawn)/i,
];

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

/** Preferred app desks — life improvement / learning / rare finds / wonderful games. */
export const PREFERRED_APP_CATEGORIES =
  'useful mobile apps (learn better, life improvement, productivity, health, travel), novel AI apps for consumers, rare App Store / Play finds, wonderful or notable mobile games — NOT SEO roundups, gambling, or crypto pumps';

export function isNicheTechTopic(title: string, text = ''): boolean {
  const hay = `${title}\n${text}`;
  return NICHE_TECH_PATTERNS.some((re) => re.test(hay));
}

export function hasStrongConsumerAngle(title: string, text = ''): boolean {
  const hay = `${title}\n${text}`;
  return STRONG_CONSUMER_ANGLE.some((re) => re.test(hay));
}

export function isKeepWowException(title: string, text = ''): boolean {
  const hay = `${title}\n${text}`;
  return KEEP_WOW_EXCEPTIONS.some((re) => re.test(hay));
}

/** SP-A-049: ordinary monitors / power banks / merch / niche maker-tools without wow. */
export function isCommodityLowWow(title: string, text = ''): boolean {
  if (isKeepWowException(title, text)) return false;
  const hay = `${title}\n${text}`;
  return COMMODITY_LOW_WOW_PATTERNS.some((re) => re.test(hay));
}

/** SP-A-054: worn-out mass-market topics (color refreshes, flagship rumor churn). */
export function isOverplayedMassTopic(title: string, text = ''): boolean {
  if (isKeepWowException(title, text)) return false;
  const hay = `${title}\n${text}`;
  return OVERPLAYED_MASS_PATTERNS.some((re) => re.test(hay));
}

export function assessNovelty(
  title: string,
  text = '',
  opts?: { sourceName?: string; mode?: EditorialMode },
): NoveltyAssessment {
  const hay = `${title}\n${text}`;
  const mode = opts?.mode || 'gadget';
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
    source.includes('gadget flow') ||
    source.includes('verge gadgets') ||
    source.includes('hackaday') ||
    source.includes('engadget') ||
    source.includes('ithome') ||
    source.includes('it之家') ||
    source.includes('36kr') ||
    source.includes('anker') ||
    source.includes('technode') ||
    source.includes('ieee') ||
    source.includes('robot report') ||
    source.includes('tech xplore');
  const appFeed =
    source.includes('macstories') ||
    source.includes('cult of mac') ||
    source.includes('toucharcade') ||
    source.includes('9to5google') ||
    source.includes('google play') ||
    source.includes('product hunt') ||
    source.includes('android authority') ||
    source.includes('appadvice');
  if (!noveltyEvidence.length && designFeed && !cosmetic && !fakeNew && !high) {
    if (BUYABLE_PRODUCT_PATTERNS.some((re) => re.test(hay))) {
      noveltyEvidence.push('design-feed-buyable-product');
    }
  }
  if (
    mode === 'app' &&
    !noveltyEvidence.length &&
    appFeed &&
    !cosmetic &&
    !fakeNew &&
    !high &&
    USEFUL_APP_PATTERNS.some((re) => re.test(hay))
  ) {
    noveltyEvidence.push('app-feed-concrete-app');
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

export function hardRejectTopic(
  title: string,
  text = '',
  sourceNameOrOpts: string | HardRejectOpts = '',
): HardRejectResult {
  const { sourceName = '', mode = 'gadget' } = resolveOpts(sourceNameOrOpts);
  const hay = `${title}\n${text}`.trim();
  if (!hay) {
    return {
      reject: true,
      reason:
        mode === 'app'
          ? 'Пустой материал — нет конкретного приложения.'
          : 'Пустой материал — нет покупаемого продукта.',
      rejectCode: 'NO_PRODUCT',
    };
  }

  // App spam always blocked (both modes).
  for (const re of APP_SPAM_PATTERNS) {
    if (re.test(hay)) {
      return {
        reject: true,
        reason: `Жёсткий reject: SEO/spam/gambling/crypto app-мусор (${re.source}).`,
        rejectCode: 'HARD_TOPIC',
      };
    }
  }

  // In app mode, skip gadget-only soft/app roundup patterns already covered by APP_SPAM;
  // still apply politics/celebrity/etc. from HARD_REJECT, but ignore the soft/app block lines.
  const hardPatterns =
    mode === 'app'
      ? HARD_REJECT_PATTERNS.filter(
          (re) =>
            !/launcher|app deals|freebies|android app deals|pixelated|podcast|best apps|apps\? you should/i.test(
              re.source,
            ),
        )
      : HARD_REJECT_PATTERNS;

  for (const re of hardPatterns) {
    if (re.test(hay)) {
      // SP-A-065C: AI cyber/preparedness stories often say "deployment" — not infra news.
      if (
        /\bdeployment\b/i.test(re.source) &&
        isAiOrInventionAlert(title, text) &&
        /\b(cyber|preparedness|frontier|capability|safety\s+incident|model\s+risk)\b/i.test(hay)
      ) {
        continue;
      }
      return {
        reject: true,
        reason: `Жёсткий reject: политика/знаменитости/культура/природа/непокупаемая тема (${re.source}).`,
        rejectCode: 'HARD_TOPIC',
      };
    }
  }
  for (const re of NON_BUYABLE_RESEARCH) {
    if (re.test(hay)) {
      // Allow grounded AI capability / autonomy milestone alerts (owner: invent + AI news).
      if (isAiOrInventionAlert(title, text)) {
        break;
      }
      return {
        reject: true,
        reason: 'Жёсткий reject: исследование/прототип без товара, который можно купить или предзаказать.',
        rejectCode: 'NON_BUYABLE_RESEARCH',
      };
    }
  }

  if (mode === 'app') {
    if (!USEFUL_APP_PATTERNS.some((re) => re.test(hay))) {
      return {
        reject: true,
        reason: 'Жёсткий reject: нет явного mobile app / game сигнала.',
        rejectCode: 'NO_PRODUCT',
      };
    }
    const novelty = assessNovelty(title, text, { sourceName, mode: 'app' });
    if (!novelty.isActuallyNew) {
      return {
        reject: true,
        reason: 'Жёсткий reject: NOT_ACTUALLY_NEW — нет новизны приложения / только косметика.',
        rejectCode: 'NOT_ACTUALLY_NEW',
        novelty,
      };
    }
    return { reject: false, reason: '', rejectCode: null, novelty };
  }

  // SP-A-065C — AI Early Warning desk: event/WOW/freedom signals, not SKU gate.
  if (mode === 'ai_radar') {
    if (!isAiOrInventionAlert(title, text) && !/\b(robot|model|agent|cyber|frontier)\b/i.test(hay)) {
      return {
        reject: true,
        reason: 'Жёсткий reject: нет AI/frontier event сигнала.',
        rejectCode: 'NO_PRODUCT',
      };
    }
    const novelty = assessNovelty(title, text, { sourceName, mode: 'gadget' });
    return { reject: false, reason: '', rejectCode: null, novelty };
  }

  // SP-A-054: reject worn-out / overplayed mass products (iPhone color refresh, rumor churn…).
  if (isOverplayedMassTopic(title, text)) {
    return {
      reject: true,
      reason:
        'Жёсткий reject: избитая/заезженная массовая тема (цвет флагмана, бесконечные слухи, commodity-аксессуар) — SP-A-054.',
      rejectCode: 'OVERPLAYED_MASS',
    };
  }

  // SP-A-073: gray everyday clutter — mice, speakers, Indian budget phones, cars…
  // No consumer-angle salvage: readers should not spend time on this.
  if (isGrayCommodityHard(title, text)) {
    return {
      reject: true,
      reason:
        'Жёсткий reject: бытовая серость (мышь/колонка/бюджетный телефон/клавиатура/авто) без сенсации — SP-A-073.',
      rejectCode: 'GRAY_COMMODITY',
    };
  }

  // SP-A-049 / SP-A-050: downrank ordinary monitors, power banks, merch, maker-tools.
  // Casio CRW-H001 / smart rings KEEP via isKeepWowException.
  if (isCommodityLowWow(title, text) && !hasStrongConsumerAngle(title, text)) {
    return {
      reject: true,
      reason:
        'Жёсткий reject: обычный монитор/пауэрбанк/мерч/maker-tool без сильного wow/consumer-angle (SP-A-049).',
      rejectCode: 'COMMODITY_LOW_WOW',
    };
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
  // SP-A-054 alert mode: AI capability / invention / useful software news may pass
  // without buy/preorder signal (no prices/links in public copy anyway).
  if (!BUYABLE_PRODUCT_PATTERNS.some((re) => re.test(hay))) {
    if (isAiOrInventionAlert(title, text)) {
      // allow through — novelty check still applies below with softer AI path
    } else {
      return {
        reject: true,
        reason: 'Жёсткий reject: нет явного покупаемого продукта/устройства (buy/preorder).',
        rejectCode: 'NO_PRODUCT',
      };
    }
  }
  const novelty = assessNovelty(title, text, { sourceName, mode: 'gadget' });
  if (!novelty.isActuallyNew && !isAiOrInventionAlert(title, text)) {
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
  const gate = hardRejectTopic(title, text, { sourceName, mode: 'gadget' });
  if (!gate.reject) return true;

  const source = sourceName.toLowerCase();
  const hay = `${title} ${text}`.toLowerCase();
  const discoveryResearch =
    source.includes('ieee') ||
    source.includes('robot report') ||
    source.includes('mit news') ||
    source.includes('mit csail') ||
    source.includes('csail') ||
    source.includes('wyss') ||
    source.includes('eth zurich') ||
    source.includes('tech xplore') ||
    source.includes('technode');

  // SP-A-065: research/robotics discovery feeds may reach Scout (status=RESEARCH), not auto-publish.
  if (
    gate.rejectCode === 'NON_BUYABLE_RESEARCH' &&
    discoveryResearch &&
    (isAiOrInventionAlert(title, text) || /\brobot|\bai\b|нейро|робот/i.test(hay))
  ) {
    return true;
  }

  // Never soften HARD_TOPIC / research / niche-PC / commodity / overplayed rejects.
  if (
    gate.rejectCode === 'HARD_TOPIC' ||
    gate.rejectCode === 'NON_BUYABLE_RESEARCH' ||
    gate.rejectCode === 'NICHE_NO_CONSUMER_ANGLE' ||
    gate.rejectCode === 'COMMODITY_LOW_WOW' ||
    gate.rejectCode === 'GRAY_COMMODITY' ||
    gate.rejectCode === 'OVERPLAYED_MASS'
  ) {
    return false;
  }

  if (
    /\b(tower|museum|building|architecture|wildlife|nature|author|memoir|singer|album|film|movie|trump|politic|graphic novel|advisory council|launcher|app deals|freebies|podcast|indie games?)\b/.test(
      hay,
    )
  ) {
    return false;
  }

  // Product-heavy feeds — let Scout/Reviewer decide when topic is clean (SP-A-050).
  if (
    source.includes('yanko') ||
    source.includes('new atlas') ||
    source.includes('gadget flow') ||
    source.includes('verge gadgets') ||
    discoveryResearch
  ) {
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
      return assessNovelty(title, text, { sourceName, mode: 'gadget' }).isActuallyNew;
    }
    // NOT_ACTUALLY_NEW on hardware feeds still blocked.
    return false;
  }
  return false;
}

/**
 * Prefilter for Mobile Apps desk — useful / novel apps & wonderful games.
 * Softens NOT_ACTUALLY_NEW slightly on dedicated app feeds when a concrete app signal exists.
 */
export function looksUsefulApp(title: string, text = '', sourceName = ''): boolean {
  const gate = hardRejectTopic(title, text, { sourceName, mode: 'app' });
  if (!gate.reject) return true;
  if (gate.rejectCode === 'HARD_TOPIC' || gate.rejectCode === 'NON_BUYABLE_RESEARCH') {
    return false;
  }

  const source = sourceName.toLowerCase();
  const hay = `${title}\n${text}`;
  if (!USEFUL_APP_PATTERNS.some((re) => re.test(hay))) return false;

  const dedicatedAppFeed =
    source.includes('macstories') ||
    source.includes('cult of mac') ||
    source.includes('toucharcade') ||
    source.includes('9to5google') ||
    source.includes('google play') ||
    source.includes('product hunt');

  if (dedicatedAppFeed && gate.rejectCode === 'NOT_ACTUALLY_NEW') {
    // Let Scout/Reviewer judge single-app stories from trusted app desks.
    return true;
  }
  if (dedicatedAppFeed && gate.rejectCode === 'NO_PRODUCT') {
    return true;
  }
  return false;
}
