/**
 * SP-A-065G / SP-A-079 / SP-A-084 — editorial visual fallback stock.
 * UI-only: brand / org / category banners. Never claims a tile is a product photo.
 * SP-A-084: ≥5 distinct atmospheric stock templates per category; stable hash rotation;
 * adjacent cards skip already-used asset IDs.
 */

export type VisualFallbackKind = 'brand' | 'organization' | 'category' | 'topic' | 'stock';

/** Editorial category keys for stock pools + CSS tone. */
export type VisualCategoryKey =
  | 'ai_future'
  | 'robotics'
  | 'mobility'
  | 'healthtech'
  | 'smart_home'
  | 'research'
  | 'china_tech'
  | 'gadget'
  | 'energy'
  | 'future_work'
  | 'gaming'
  | 'open_source'
  | 'future_tech'
  | 'business';

export type VisualTopicKey =
  | 'prototype'
  | 'research'
  | 'rumor'
  | 'concept'
  | 'review'
  | 'chief';

export interface VisualStockAsset {
  /** Stable id: `{category}-{n}` */
  id: string;
  /** Atmospheric editorial photo (not a gray wall). */
  url: string;
  /** Short scene label for aria / debug. */
  scene: string;
}

export interface VisualFallbackSpec {
  kind: VisualFallbackKind;
  /** Reader caption — never claims this is a product photo. */
  caption: string;
  /** Brand / org / category display name on the tile. */
  headline: string;
  /** Short subtitle under the headline. */
  subtitle: string;
  categoryKey: VisualCategoryKey;
  topicKey?: VisualTopicKey;
  /** Single-letter / short mark for the tile monogram (overlay only). */
  mark: string;
  /** Category / topic badge label. */
  badge: string;
  /** SP-A-084 stock banner when no exact photo. */
  assetId?: string;
  imageUrl?: string;
}

export const MIN_TEMPLATES_PER_CATEGORY = 5;

/** Subject brands only — not news outlets. */
const BRAND_RULES: { re: RegExp; name: string; mark?: string; cat?: VisualCategoryKey }[] = [
  { re: /\bopenai\b|\bchat\s*gpt\b|\bgpt-?\d|aardvark|\bastra\b/i, name: 'OpenAI', mark: 'O', cat: 'ai_future' },
  { re: /\banthropic\b|\bclaude\b/i, name: 'Anthropic', mark: 'A', cat: 'ai_future' },
  { re: /\bdeepmind\b|\bgemini\b|\bgoogle\s+ai\b|\bgoogle\b(?=.*\b(model|robot|ai|pixel)\b)/i, name: 'Google', mark: 'G', cat: 'ai_future' },
  { re: /\bmeta\b(?=.*\b(ai|llama|bracelet|quest|ray-?ban)\b)|\bllama\b/i, name: 'Meta', mark: 'M', cat: 'ai_future' },
  { re: /\bmicrosoft\b|\bcopilot\b/i, name: 'Microsoft', mark: 'M', cat: 'ai_future' },
  { re: /\bperplexity\b/i, name: 'Perplexity', mark: 'P', cat: 'ai_future' },
  { re: /\blenovo\b|\blegion\b|\by700\b/i, name: 'Lenovo', mark: 'L', cat: 'gadget' },
  { re: /\bvolkswagen\b|\b\bvw\b|\bid\.?\s*era\b|\bid\.?\s*\d/i, name: 'Volkswagen', mark: 'V', cat: 'mobility' },
  { re: /\bgeely\b|\bgalaxy\s+tt\b/i, name: 'Geely', mark: 'G', cat: 'mobility' },
  { re: /\bnintendo\b|\bswitch\b/i, name: 'Nintendo', mark: 'N', cat: 'gaming' },
  { re: /\bxiaomi\b|\bredmi\b|\bhyperos\b/i, name: 'Xiaomi', mark: 'X', cat: 'china_tech' },
  { re: /\bhuawei\b|\bharmonyos\b/i, name: 'Huawei', mark: 'H', cat: 'china_tech' },
  { re: /\bdji\b/i, name: 'DJI', mark: 'D', cat: 'mobility' },
  { re: /\bunitree\b/i, name: 'Unitree', mark: 'U', cat: 'robotics' },
  { re: /\bagibot\b/i, name: 'AgiBot', mark: 'A', cat: 'robotics' },
  { re: /\btacta(?:bot)?\b/i, name: 'Tacta', mark: 'T', cat: 'robotics' },
  { re: /\biqoo\b/i, name: 'iQOO', mark: 'i', cat: 'china_tech' },
  { re: /\binsta360\b/i, name: 'Insta360', mark: 'I', cat: 'gadget' },
  { re: /\bkeychron\b/i, name: 'Keychron', mark: 'K', cat: 'gadget' },
  { re: /\brainpoint\b/i, name: 'RainPoint', mark: 'R', cat: 'smart_home' },
  { re: /\bdelta\s+children\b|\baero\s+smart\b/i, name: 'Delta Children', mark: 'D', cat: 'smart_home' },
  { re: /\bsamsung\b/i, name: 'Samsung', mark: 'S', cat: 'gadget' },
  { re: /\bapple\b|\biphone\b|\bvision\s*pro\b/i, name: 'Apple', mark: 'A', cat: 'gadget' },
  { re: /\btesla\b|\boptimus\b/i, name: 'Tesla', mark: 'T', cat: 'robotics' },
  { re: /\bfigure\s*ai\b|\bfigure\s+\d/i, name: 'Figure', mark: 'F', cat: 'robotics' },
  { re: /\bmedtronic\b|\bpillcam\b/i, name: 'Medtronic', mark: 'M', cat: 'healthtech' },
  { re: /\bjoby\b/i, name: 'Joby', mark: 'J', cat: 'mobility' },
  { re: /\bgadget\s*flow\b/i, name: 'Gadget Flow', mark: 'G', cat: 'gadget' },
];

const ORG_RULES: { re: RegExp; name: string; mark?: string; cat?: VisualCategoryKey }[] = [
  { re: /\bcsail\b|\bmit\b(?=.*\b(lab|robot|research|manipulat|crest|simulator))/i, name: 'MIT', mark: 'M', cat: 'research' },
  { re: /\bucl\b/i, name: 'UCL', mark: 'U', cat: 'research' },
  { re: /\beth(\s+zürich|\s+zurich|\b)/i, name: 'ETH', mark: 'E', cat: 'research' },
  { re: /\bieee\b/i, name: 'IEEE', mark: 'I', cat: 'research' },
  { re: /\bstanford\b/i, name: 'Stanford', mark: 'S', cat: 'research' },
  { re: /\bcarnegie\s+mellon|\bcmu\b/i, name: 'CMU', mark: 'C', cat: 'research' },
  { re: /\bberkeley\b|\buc\s*berkeley\b/i, name: 'UC Berkeley', mark: 'B', cat: 'research' },
];

const CATEGORY_LABELS: Record<VisualCategoryKey, string> = {
  ai_future: 'AI',
  robotics: 'Robotics',
  mobility: 'Mobility',
  healthtech: 'Health',
  smart_home: 'Smart Home',
  research: 'Science',
  china_tech: 'Asia Tech',
  gadget: 'Gadgets',
  energy: 'Energy',
  future_work: 'Future Work',
  gaming: 'Gaming',
  open_source: 'Open Source',
  future_tech: 'Future Tech',
  business: 'Business',
};

/** Reader-facing RU labels (cards / filters). */
export const CATEGORY_PUBLIC_LABELS: Record<VisualCategoryKey, string> = {
  ai_future: 'AI',
  robotics: 'Роботы',
  mobility: 'Мобильность',
  healthtech: 'Здоровье',
  smart_home: 'Умный дом',
  research: 'Наука',
  china_tech: 'Технологии',
  gadget: 'Гаджеты',
  energy: 'Энергия',
  future_work: 'Будущее работы',
  gaming: 'Игры',
  open_source: 'Open Source',
  future_tech: 'Технологии',
  business: 'Бизнес',
};

const CATEGORY_SUBTITLES: Record<VisualCategoryKey, string> = {
  ai_future: 'Искусственный интеллект и агенты',
  robotics: 'Роботы и воплощённый ИИ',
  mobility: 'Транспорт и мобильность',
  healthtech: 'Здоровье и диагностика',
  smart_home: 'Умный дом',
  research: 'Наука и лаборатории',
  china_tech: 'Азиатский tech-desk',
  gadget: 'Гаджеты и устройства',
  energy: 'Энергия и инфраструктура',
  future_work: 'Будущее работы',
  gaming: 'Игры и интерактив',
  open_source: 'Код и разработчики',
  future_tech: 'Технологии будущего',
  business: 'Новые модели дохода',
};

const TOPIC_META: Record<
  VisualTopicKey,
  { label: string; subtitle: string; mark: string; caption: string }
> = {
  prototype: {
    label: 'Prototype',
    subtitle: 'Прототип / ранняя демонстрация',
    mark: 'P',
    caption: 'Редакционный баннер',
  },
  research: {
    label: 'Research',
    subtitle: 'Исследование и лабораторный результат',
    mark: 'R',
    caption: 'Редакционный баннер',
  },
  rumor: {
    label: 'Rumor / Leak',
    subtitle: 'Утечка или неподтверждённый сигнал',
    mark: '?',
    caption: 'Редакционный баннер',
  },
  concept: {
    label: 'Concept',
    subtitle: 'Концепт и ранний дизайн',
    mark: 'C',
    caption: 'Редакционный баннер',
  },
  review: {
    label: 'Review',
    subtitle: 'Обзор и практический разбор',
    mark: '✓',
    caption: 'Редакционный баннер',
  },
  chief: {
    label: 'Chief Pick',
    subtitle: 'Выбор главного редактора',
    mark: '★',
    caption: 'Редакционный баннер',
  },
};

/** spfb=1 marks curated stock so homepage weak-tile filter can allow them. */
function stock(id: string, photoId: string, scene: string): VisualStockAsset {
  return {
    id,
    scene,
    url: `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=1400&q=80&spfb=1`,
  };
}

/**
 * SP-A-084 — ≥5 distinct compositions per category (not one bg + different text).
 * Curated Unsplash scenes: bright / atmospheric editorial banners.
 */
export const CATEGORY_STOCK: Record<VisualCategoryKey, VisualStockAsset[]> = {
  ai_future: [
    stock('ai_future-1', 'photo-1677442136019-21780ecad995', 'neural glow desk'),
    stock('ai_future-2', 'photo-1620712943543-bcc4688e7485', 'robot face close'),
    stock('ai_future-3', 'photo-1485827404703-89b55fcc595e', 'white studio robot'),
    stock('ai_future-4', 'photo-1676299080920-8ac4c4c0d0e8', 'circuit light trails'),
    stock('ai_future-5', 'photo-1655720828018-edd2daec9349', 'ai headset collab'),
  ],
  robotics: [
    stock('robotics-1', 'photo-1485827404703-89b55fcc595e', 'friendly lab robot'),
    stock('robotics-2', 'photo-1535378917042-10a22c95931a', 'industrial arm'),
    stock('robotics-3', 'photo-1518314916381-77a37c2a49ae', 'humanoid silhouette'),
    stock('robotics-4', 'photo-1581091226825-a6a2a5aee158', 'engineer + robot'),
    stock('robotics-5', 'photo-1589254065878-42c9da997008', 'precision gripper'),
  ],
  healthtech: [
    stock('healthtech-1', 'photo-1576091160399-112ba8d25d1d', 'clinic tablet'),
    stock('healthtech-2', 'photo-1559757148-5c350d0d3c56', 'wearable health'),
    stock('healthtech-3', 'photo-1584982751601-97dcc096659c', 'diagnostics light'),
    stock('healthtech-4', 'photo-1579684385127-1ef15d508118', 'care tech scene'),
    stock('healthtech-5', 'photo-1631217868264-e5b90bb7e629', 'medical research'),
  ],
  mobility: [
    stock('mobility-1', 'photo-1558618666-fcd25c85cd64', 'ev city dusk'),
    stock('mobility-2', 'photo-1540962351504-0429c03f4a4d', 'aircraft cabin'),
    stock('mobility-3', 'photo-1492144534655-ae79c964c9d7', 'sport car front'),
    stock('mobility-4', 'photo-1474302770737-173ee21bab63', 'drone sky'),
    stock('mobility-5', 'photo-1449965408869-eaa3f722e40d', 'highway motion'),
  ],
  energy: [
    stock('energy-1', 'photo-1509391366360-2e959784a276', 'solar field'),
    stock('energy-2', 'photo-1473341304170-971dccb5ac1e', 'wind turbines'),
    stock('energy-3', 'photo-1466611653911-95081537e5b7', 'grid sunset'),
    stock('energy-4', 'photo-1497435334941-8c899ee9e8e9', 'battery pack glow'),
    stock('energy-5', 'photo-1569017388730-020d5f2d0624', 'hydro power'),
  ],
  smart_home: [
    stock('smart_home-1', 'photo-1558002038-1055907df827', 'living room glow'),
    stock('smart_home-2', 'photo-1586023492125-27b2c045efd7', 'modern interior'),
    stock('smart_home-3', 'photo-1556912173-46c336c7fd55', 'kitchen tech'),
    stock('smart_home-4', 'photo-1560448204-e02f11c3d0e2', 'apartment evening'),
    stock('smart_home-5', 'photo-1600607687939-ce8a6c25118c', 'home architecture'),
  ],
  research: [
    stock('research-1', 'photo-1532094349884-543bc11b234d', 'lab glassware'),
    stock('research-2', 'photo-1582719471384-894fbb16e074', 'microscope'),
    stock('research-3', 'photo-1507413245164-6160d8298b31', 'science bench'),
    stock('research-4', 'photo-1576086213369-97a306d36557', 'research notes'),
    stock('research-5', 'photo-1532187863486-abf9dbad1b69', 'pipette close'),
  ],
  business: [
    stock('business-1', 'photo-1460925895917-afdab827c52f', 'analytics desk'),
    stock('business-2', 'photo-1552664730-d307ca884978', 'team planning'),
    stock('business-3', 'photo-1556761175-5973dc0f32e7', 'startup huddle'),
    stock('business-4', 'photo-1507679799987-c73779587ccf', 'executive focus'),
    stock('business-5', 'photo-1454165804606-c3d57bc86b40', 'workspace laptop'),
  ],
  open_source: [
    stock('open_source-1', 'photo-1517694712202-14dd9538aa97', 'code keyboard'),
    stock('open_source-2', 'photo-1461749280684-dccba630e2f6', 'screen code'),
    stock('open_source-3', 'photo-1498050108023-c5249f4df085', 'dev desk'),
    stock('open_source-4', 'photo-1555066931-4365d14bab8c', 'dark IDE'),
    stock('open_source-5', 'photo-1516321318423-f06f85e504b3', 'pairing session'),
  ],
  future_tech: [
    stock('future_tech-1', 'photo-1451187580459-43490279c0fa', 'earth night grid'),
    stock('future_tech-2', 'photo-1518770660439-4636190af475', 'circuit board vivid'),
    stock('future_tech-3', 'photo-1526374965328-7f61d4dc18c5', 'matrix light'),
    stock('future_tech-4', 'photo-1504639725590-34d0984388bd', 'hologram hands'),
    stock('future_tech-5', 'photo-1635070041078-e363dbe005cb', 'abstract tech orb'),
  ],
  gadget: [
    stock('gadget-1', 'photo-1519389950473-47ba0277781c', 'desk gadgets'),
    stock('gadget-2', 'photo-1558346490-a72e53ae2d4f', 'color jumper bench'),
    stock('gadget-3', 'photo-1468495244123-6c6c332eeece', 'wearable watch'),
    stock('gadget-4', 'photo-1505740420928-5e560c06d30e', 'headphones product'),
    stock('gadget-5', 'photo-1526170375885-4d8ecf77b99f', 'camera gear'),
  ],
  gaming: [
    stock('gaming-1', 'photo-1542751371-adc38448a05e', 'esports RGB'),
    stock('gaming-2', 'photo-1511512578047-dfb367046420', 'controller close'),
    stock('gaming-3', 'photo-1493711662062-fa541adb3fc8', 'console living'),
    stock('gaming-4', 'photo-1552820728-8b83bb6b773f', 'arcade neon'),
    stock('gaming-5', 'photo-1606144042614-b2417e99c4e3', 'handheld play'),
  ],
  china_tech: [
    stock('china_tech-1', 'photo-1512941937669-90a1b58e7e9c', 'phone showcase'),
    stock('china_tech-2', 'photo-1592890288564-76628a30a657', 'device flatlay'),
    stock('china_tech-3', 'photo-1563013544-824ae1b704d3', 'urban night tech'),
    stock('china_tech-4', 'photo-1550009158-9ebf69173e03', 'electronics aisle'),
    stock('china_tech-5', 'photo-1580910051074-3eb694886505', 'smartphone hand'),
  ],
  future_work: [
    stock('future_work-1', 'photo-1497366216548-37526070297c', 'bright office'),
    stock('future_work-2', 'photo-1522071820081-009f0129c71c', 'collab table'),
    stock('future_work-3', 'photo-1517245386807-bb43f82c33c4', 'workshop board'),
    stock('future_work-4', 'photo-1600880292203-757bb62b4baf', 'remote desk'),
    stock('future_work-5', 'photo-1553877522-43269d4ea984', 'standup meeting'),
  ],
};

function haystack(opts: {
  title?: string;
  category?: string;
  tags?: string[];
  summary?: string;
}): string {
  return [opts.title, opts.category, ...(opts.tags || []), opts.summary]
    .filter(Boolean)
    .join('\n')
    .slice(0, 1200);
}

export function resolveVisualCategory(opts: {
  title?: string;
  category?: string;
  tags?: string[];
  summary?: string;
}): VisualCategoryKey {
  const hay = haystack(opts);
  const publicCat = (opts.category || '').toLowerCase();

  if (/\b(robot|humanoid|exoskeleton|manipulat|tacta|unitree|optimus|soft\s+robot)\b|робот/i.test(hay)) {
    return 'robotics';
  }
  if (
    /\b(drone|evtol|vehicle|mobility|rfid|gps|автопилот|электромобил|ev\b|air\s*taxi|аэротакси|joby|летающ)\b|volkswagen|geely|мобильност/i.test(
      hay,
    ) ||
    /мобильност/i.test(publicCat)
  ) {
    return 'mobility';
  }
  if (/\b(solar|battery|energy|grid|power|окон.*энерг|счет за свет|энерг|аккумулятор)\b|энерг/i.test(hay)) {
    return 'energy';
  }
  if (
    /\b(health|medical|wearable|sleep|bassinet|cry|здоров|капсул|гастро|диагност|breast cancer|медицин)\b|здоров/i.test(
      hay,
    )
  ) {
    return 'healthtech';
  }
  if (/\b(smart\s*home|watering|soil|thermostat|умн\w*\s*дом|полив|3d\s*print.*house|дом из|печат.*жил)\b/i.test(hay)) {
    return 'smart_home';
  }
  if (/\b(game|gaming|esport|консол|nintendo|switch|игро)/i.test(hay) || /игры/i.test(publicCat)) {
    return 'gaming';
  }
  if (/\b(open\s*source|github|developer|devops|разработчик|open-source)\b/i.test(hay)) {
    return 'open_source';
  }
  if (
    /\b(ipo|funding|revenue|income|startup|бизнес|доход|market share)\b/i.test(hay) ||
    /бизнес/i.test(publicCat)
  ) {
    return 'business';
  }
  if (
    /\b(office|workplace|future\s+of\s+work|automation\s+of\s+work|удаленн|офисн)\b/i.test(hay) ||
    /future\s*work/i.test(publicCat)
  ) {
    return 'future_work';
  }
  if (/\b(csail|ieee|university|laboratory|researchers?|peer[- ]reviewed|lab\s+demo|материал|science)\b|исследован|наук/i.test(hay)) {
    return 'research';
  }
  if (/\b(xiaomi|huawei|iqoo|oppo|vivo|oneplus)\b/i.test(hay)) {
    return 'china_tech';
  }
  if (
    /\b(ai|a\.i\.|llm|gpt|openai|gemini|claude|model|agentic|ии|нейро|perplexity|grok)\b/i.test(hay) ||
    publicCat === 'ai' ||
    publicCat === 'ии'
  ) {
    return 'ai_future';
  }
  if (
    /\b(gadget|гаджет|earbuds|headphones|keyboard|mouse|monitor|смартфон|smartphone|pixel|iphone|galaxy\s*s\d|phone)\b/i.test(
      hay,
    ) ||
    /гаджет|смартфон/i.test(publicCat)
  ) {
    return 'gadget';
  }
  // SP-A-084 — unknown → Future Tech / General, NEVER default Gadget.
  return 'future_tech';
}

export function resolveVisualTopic(opts: {
  title?: string;
  category?: string;
  tags?: string[];
  summary?: string;
  agentId?: string;
}): VisualTopicKey | null {
  const hay = haystack(opts);
  const agent = (opts.agentId || '').toLowerCase();
  if (/chief|chief-fast-lane/i.test(agent) || /\bchief\b/i.test(hay)) return 'chief';
  if (/\b(rumor|leak|утечк|слух)\b/i.test(hay)) return 'rumor';
  if (/\b(prototype|прототип)\b/i.test(hay)) return 'prototype';
  if (/\b(concept|концепт|рендер)\b/i.test(hay)) return 'concept';
  if (/\b(review|обзор|hands-?on)\b/i.test(hay)) return 'review';
  if (/\b(research|lab|university|исследован|лаборатор)\b/i.test(hay)) return 'research';
  return null;
}

/** Stable non-crypto hash for slug → template index. */
export function hashSlug(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getCategoryStock(categoryKey: VisualCategoryKey): VisualStockAsset[] {
  const pool = CATEGORY_STOCK[categoryKey] || CATEGORY_STOCK.future_tech;
  return pool;
}

/**
 * Pick stock template: hash(slug|category) → 1..N, then skip used asset IDs.
 */
export function pickStockAsset(opts: {
  categoryKey: VisualCategoryKey;
  slug?: string;
  avoidAssetIds?: Iterable<string>;
}): VisualStockAsset {
  const pool = getCategoryStock(opts.categoryKey);
  const avoid = new Set(opts.avoidAssetIds || []);
  const seed = `${opts.slug || 'item'}|${opts.categoryKey}`;
  const start = hashSlug(seed) % pool.length;

  for (let i = 0; i < pool.length; i++) {
    const asset = pool[(start + i) % pool.length];
    if (!avoid.has(asset.id)) return asset;
  }
  return pool[start];
}

export function isStockFallbackUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  return /[?&]spfb=1(?:&|$)/.test(url) || /\/media\/fallbacks\//i.test(url);
}

function withStock(
  base: Omit<VisualFallbackSpec, 'assetId' | 'imageUrl'>,
  opts: { slug?: string; avoidAssetIds?: Iterable<string> },
): VisualFallbackSpec {
  const asset = pickStockAsset({
    categoryKey: base.categoryKey,
    slug: opts.slug,
    avoidAssetIds: opts.avoidAssetIds,
  });
  return {
    ...base,
    kind: base.kind === 'category' || base.kind === 'topic' ? 'stock' : base.kind,
    caption: 'Редакционный баннер',
    assetId: asset.id,
    imageUrl: asset.url,
  };
}

/**
 * Pick brand → organization → topic/category stock banner.
 * Always returns an imageUrl from category stock (no gray wall).
 */
export function resolveVisualFallback(opts: {
  title?: string;
  category?: string;
  tags?: string[];
  summary?: string;
  agentId?: string;
  slug?: string;
  avoidAssetIds?: Iterable<string>;
}): VisualFallbackSpec {
  const hay = haystack(opts);
  const categoryKey = resolveVisualCategory(opts);

  for (const b of BRAND_RULES) {
    if (b.re.test(hay)) {
      return withStock(
        {
          kind: 'brand',
          caption: 'Редакционный баннер',
          headline: b.name,
          subtitle: CATEGORY_SUBTITLES[b.cat || categoryKey],
          categoryKey: b.cat || categoryKey,
          mark: (b.mark || b.name.charAt(0)).toUpperCase(),
          badge: 'Brand',
        },
        opts,
      );
    }
  }

  for (const o of ORG_RULES) {
    if (o.re.test(hay)) {
      const cat = o.cat || 'research';
      return withStock(
        {
          kind: 'organization',
          caption: 'Редакционный баннер',
          headline: o.name,
          subtitle: CATEGORY_SUBTITLES[cat],
          categoryKey: cat,
          mark: (o.mark || o.name.charAt(0)).toUpperCase(),
          badge: 'Organization',
        },
        opts,
      );
    }
  }

  const topic = resolveVisualTopic(opts);
  if (topic) {
    const meta = TOPIC_META[topic];
    return withStock(
      {
        kind: 'topic',
        caption: meta.caption,
        headline: meta.label,
        subtitle: meta.subtitle,
        categoryKey,
        topicKey: topic,
        mark: meta.mark,
        badge: meta.label,
      },
      opts,
    );
  }

  return withStock(
    {
      kind: 'category',
      caption: 'Редакционный баннер',
      headline: CATEGORY_LABELS[categoryKey],
      subtitle: CATEGORY_SUBTITLES[categoryKey],
      categoryKey,
      mark: CATEGORY_LABELS[categoryKey].charAt(0).toUpperCase(),
      badge: CATEGORY_LABELS[categoryKey],
    },
    opts,
  );
}

/** Assign unique stock assets across a list (homepage / related). */
export function assignFallbackAssets<T extends { slug: string; title?: string; category?: string; tags?: string[]; summary?: string; agentId?: string }>(
  items: T[],
): Map<string, VisualFallbackSpec> {
  const used = new Set<string>();
  const out = new Map<string, VisualFallbackSpec>();
  for (const item of items) {
    const spec = resolveVisualFallback({ ...item, avoidAssetIds: used });
    if (spec.assetId) used.add(spec.assetId);
    out.set(item.slug, spec);
  }
  return out;
}

export function visualFallbackToneClass(key: VisualCategoryKey): string {
  switch (key) {
    case 'ai_future':
      return 'vf-tone vf-tone--ai';
    case 'robotics':
      return 'vf-tone vf-tone--robotics';
    case 'mobility':
      return 'vf-tone vf-tone--mobility';
    case 'healthtech':
      return 'vf-tone vf-tone--health';
    case 'smart_home':
      return 'vf-tone vf-tone--home';
    case 'research':
      return 'vf-tone vf-tone--research';
    case 'china_tech':
      return 'vf-tone vf-tone--china';
    case 'energy':
      return 'vf-tone vf-tone--energy';
    case 'future_work':
    case 'business':
      return 'vf-tone vf-tone--work';
    case 'gaming':
      return 'vf-tone vf-tone--gadget';
    case 'open_source':
      return 'vf-tone vf-tone--research';
    case 'future_tech':
      return 'vf-tone vf-tone--ai';
    default:
      return 'vf-tone vf-tone--gadget';
  }
}

export function stockInventoryReport(): {
  categories: number;
  minPerCategory: number;
  total: number;
  short: string[];
} {
  const keys = Object.keys(CATEGORY_STOCK) as VisualCategoryKey[];
  const short = keys.filter((k) => CATEGORY_STOCK[k].length < MIN_TEMPLATES_PER_CATEGORY);
  const total = keys.reduce((n, k) => n + CATEGORY_STOCK[k].length, 0);
  return {
    categories: keys.length,
    minPerCategory: MIN_TEMPLATES_PER_CATEGORY,
    total,
    short,
  };
}
