/**
 * SP-A-065G / SP-A-079 — editorial visual fallback for articles without a safe product photo.
 * UI-only: infer brand / org / category / topic from title + tags + category.
 * Never use RSS source name as the article brand (e.g. Robot Report ≠ Tacta).
 * Never claims the tile is a real product photo.
 */

export type VisualFallbackKind = 'brand' | 'organization' | 'category' | 'topic';

/** Editorial category keys for CSS tile tone. */
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
  | 'future_work';

export type VisualTopicKey =
  | 'prototype'
  | 'research'
  | 'rumor'
  | 'concept'
  | 'review'
  | 'chief';

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
  /** Single-letter / short mark for the tile monogram. */
  mark: string;
  /** Category / topic badge label. */
  badge: string;
}

/** Subject brands only — not news outlets. */
const BRAND_RULES: { re: RegExp; name: string; mark?: string; cat?: VisualCategoryKey }[] = [
  { re: /\bopenai\b|\bchat\s*gpt\b|\bgpt-?\d|aardvark|\bastra\b/i, name: 'OpenAI', mark: 'O', cat: 'ai_future' },
  { re: /\banthropic\b|\bclaude\b/i, name: 'Anthropic', mark: 'A', cat: 'ai_future' },
  { re: /\bdeepmind\b|\bgemini\b|\bgoogle\s+ai\b|\bgoogle\b(?=.*\b(model|robot|ai|pixel)\b)/i, name: 'Google', mark: 'G', cat: 'ai_future' },
  { re: /\bmeta\b(?=.*\b(ai|llama|bracelet|quest|ray-?ban)\b)|\bllama\b/i, name: 'Meta', mark: 'M', cat: 'ai_future' },
  { re: /\bmicrosoft\b|\bcopilot\b/i, name: 'Microsoft', mark: 'M', cat: 'ai_future' },
  { re: /\blenovo\b|\blegion\b|\by700\b/i, name: 'Lenovo', mark: 'L', cat: 'gadget' },
  { re: /\bvolkswagen\b|\b\bvw\b|\bid\.?\s*era\b|\bid\.?\s*\d/i, name: 'Volkswagen', mark: 'V', cat: 'mobility' },
  { re: /\bgeely\b|\bgalaxy\s+tt\b/i, name: 'Geely', mark: 'G', cat: 'mobility' },
  { re: /\bnintendo\b|\bswitch\b/i, name: 'Nintendo', mark: 'N', cat: 'gadget' },
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
  research: 'Research',
  china_tech: 'China Tech',
  gadget: 'Gadget',
  energy: 'Energy',
  future_work: 'Future Work',
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
};

const TOPIC_META: Record<
  VisualTopicKey,
  { label: string; subtitle: string; mark: string; caption: string }
> = {
  prototype: {
    label: 'Prototype',
    subtitle: 'Прототип / ранняя демонстрация',
    mark: 'P',
    caption: 'Тематическая иллюстрация',
  },
  research: {
    label: 'Research',
    subtitle: 'Исследование и лабораторный результат',
    mark: 'R',
    caption: 'Тематическая иллюстрация',
  },
  rumor: {
    label: 'Rumor / Leak',
    subtitle: 'Утечка или неподтверждённый сигнал',
    mark: '?',
    caption: 'Тематическая иллюстрация',
  },
  concept: {
    label: 'Concept',
    subtitle: 'Концепт и ранний дизайн',
    mark: 'C',
    caption: 'Тематическая иллюстрация',
  },
  review: {
    label: 'Review',
    subtitle: 'Обзор и практический разбор',
    mark: '✓',
    caption: 'Редакционная иллюстрация',
  },
  chief: {
    label: 'Chief Pick',
    subtitle: 'Выбор главного редактора',
    mark: '★',
    caption: 'Редакционная иллюстрация',
  },
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
    /\b(drone|evtol|vehicle|mobility|rfid|gps|автопилот|электромобил|ev\b|air\s*taxi|аэротакси)\b|volkswagen|geely/i.test(
      hay,
    )
  ) {
    return 'mobility';
  }
  if (/\b(solar|battery|energy|grid|power|окон.*энерг|счет за свет|энерг)\b/i.test(hay)) {
    return 'energy';
  }
  if (/\b(health|medical|wearable|sleep|bassinet|cry|здоров|капсул|гастро|диагност)\b/i.test(hay)) {
    return 'healthtech';
  }
  if (/\b(smart\s*home|watering|soil|thermostat|умн\w*\s*дом|полив)\b/i.test(hay)) {
    return 'smart_home';
  }
  if (
    /\b(office|workplace|future\s+of\s+work|automation\s+of\s+work|удаленн|офисн)\b/i.test(hay) ||
    /future\s*work/i.test(publicCat)
  ) {
    return 'future_work';
  }
  if (/\b(csail|ieee|university|laboratory|researchers?|peer[- ]reviewed|lab\s+demo)\b|исследован/i.test(hay)) {
    return 'research';
  }
  if (/\b(xiaomi|huawei|iqoo|china|китай|oppo|vivo|oneplus)\b/i.test(hay) || /китай|china/i.test(publicCat)) {
    return 'china_tech';
  }
  if (/\b(ai|a\.i\.|llm|gpt|openai|gemini|claude|model|agentic|ии|нейро)\b/i.test(hay) || publicCat === 'ai') {
    return 'ai_future';
  }
  return 'gadget';
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

/**
 * Pick brand → organization → topic → category. Never uses feed/source name.
 */
export function resolveVisualFallback(opts: {
  title?: string;
  category?: string;
  tags?: string[];
  summary?: string;
  agentId?: string;
}): VisualFallbackSpec {
  const hay = haystack(opts);
  const categoryKey = resolveVisualCategory(opts);

  for (const b of BRAND_RULES) {
    if (b.re.test(hay)) {
      return {
        kind: 'brand',
        caption: 'Редакционная иллюстрация',
        headline: b.name,
        subtitle: CATEGORY_SUBTITLES[b.cat || categoryKey],
        categoryKey: b.cat || categoryKey,
        mark: (b.mark || b.name.charAt(0)).toUpperCase(),
        badge: 'Brand',
      };
    }
  }

  for (const o of ORG_RULES) {
    if (o.re.test(hay)) {
      const cat = o.cat || 'research';
      return {
        kind: 'organization',
        caption: 'Редакционная иллюстрация',
        headline: o.name,
        subtitle: CATEGORY_SUBTITLES[cat],
        categoryKey: cat,
        mark: (o.mark || o.name.charAt(0)).toUpperCase(),
        badge: 'Organization',
      };
    }
  }

  const topic = resolveVisualTopic(opts);
  if (topic) {
    const meta = TOPIC_META[topic];
    return {
      kind: 'topic',
      caption: meta.caption,
      headline: meta.label,
      subtitle: meta.subtitle,
      categoryKey,
      topicKey: topic,
      mark: meta.mark,
      badge: meta.label,
    };
  }

  return {
    kind: 'category',
    caption: 'Тематическая иллюстрация',
    headline: CATEGORY_LABELS[categoryKey],
    subtitle: CATEGORY_SUBTITLES[categoryKey],
    categoryKey,
    mark: CATEGORY_LABELS[categoryKey].charAt(0).toUpperCase(),
    badge: CATEGORY_LABELS[categoryKey],
  };
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
      return 'vf-tone vf-tone--work';
    default:
      return 'vf-tone vf-tone--gadget';
  }
}
