/**
 * SP-A-065G — cheap visual fallback for articles without a safe product photo.
 * UI-only: infer brand / lab / category from title + tags + category.
 * Never use RSS source name as the article brand (e.g. Robot Report ≠ Tacta).
 */

export type VisualFallbackKind = 'brand' | 'organization' | 'category';

/** Editorial category keys for CSS tile tone. */
export type VisualCategoryKey =
  | 'ai_future'
  | 'robotics'
  | 'mobility'
  | 'healthtech'
  | 'smart_home'
  | 'research'
  | 'china_tech'
  | 'gadget';

export interface VisualFallbackSpec {
  kind: VisualFallbackKind;
  /** Reader caption — never claims this is a product photo. */
  caption: string;
  /** Brand / org / category display name on the tile. */
  headline: string;
  categoryKey: VisualCategoryKey;
  /** Single-letter / short mark for the tile monogram. */
  mark: string;
}

/** Subject brands only — not news outlets. */
const BRAND_RULES: { re: RegExp; name: string; mark?: string; cat?: VisualCategoryKey }[] = [
  { re: /\bopenai\b|\bchat\s*gpt\b|\bgpt-?\d|aardvark|\bastra\b/i, name: 'OpenAI', mark: 'O', cat: 'ai_future' },
  { re: /\banthropic\b|\bclaude\b/i, name: 'Anthropic', mark: 'A', cat: 'ai_future' },
  { re: /\bdeepmind\b|\bgemini\b|\bgoogle\s+ai\b|\bgoogle\b(?=.*\b(model|robot|ai)\b)/i, name: 'Google', mark: 'G', cat: 'ai_future' },
  { re: /\bmeta\b(?=.*\b(ai|llama|bracelet|quest|ray-?ban)\b)|\bllama\b/i, name: 'Meta', mark: 'M', cat: 'ai_future' },
  { re: /\bmicrosoft\b|\bcopilot\b/i, name: 'Microsoft', mark: 'M', cat: 'ai_future' },
  { re: /\bxiaomi\b|\bredmi\b|\bhyperos\b/i, name: 'Xiaomi', mark: 'X', cat: 'china_tech' },
  { re: /\bhuawei\b|\bharmonyos\b/i, name: 'Huawei', mark: 'H', cat: 'china_tech' },
  { re: /\bdji\b/i, name: 'DJI', mark: 'D', cat: 'mobility' },
  { re: /\bunitree\b/i, name: 'Unitree', mark: 'U', cat: 'robotics' },
  { re: /\btacta(?:bot)?\b/i, name: 'Tacta', mark: 'T', cat: 'robotics' },
  { re: /\biqoo\b/i, name: 'iQOO', mark: 'i', cat: 'china_tech' },
  { re: /\binsta360\b/i, name: 'Insta360', mark: 'I', cat: 'gadget' },
  { re: /\brainpoint\b/i, name: 'RainPoint', mark: 'R', cat: 'smart_home' },
  { re: /\bdelta\s+children\b|\baero\s+smart\b/i, name: 'Delta Children', mark: 'D', cat: 'smart_home' },
  { re: /\bsamsung\b/i, name: 'Samsung', mark: 'S', cat: 'gadget' },
  { re: /\bapple\b|\biphone\b|\bvision\s*pro\b/i, name: 'Apple', mark: 'A', cat: 'gadget' },
  { re: /\btesla\b|\boptimus\b/i, name: 'Tesla', mark: 'T', cat: 'robotics' },
  { re: /\bfigure\s*ai\b|\bfigure\s+\d/i, name: 'Figure', mark: 'F', cat: 'robotics' },
];

const ORG_RULES: { re: RegExp; name: string; mark?: string }[] = [
  { re: /\bcsail\b|\bmit\b(?=.*\b(lab|robot|research|manipulat))/i, name: 'MIT CSAIL', mark: 'M' },
  { re: /\beth(\s+zürich|\s+zurich|\b)/i, name: 'ETH', mark: 'E' },
  { re: /\bieee\b/i, name: 'IEEE', mark: 'I' },
  { re: /\bstanford\b/i, name: 'Stanford', mark: 'S' },
  { re: /\bcarnegie\s+mellon|\bcmu\b/i, name: 'CMU', mark: 'C' },
  { re: /\bberkeley\b|\buc\s*berkeley\b/i, name: 'UC Berkeley', mark: 'B' },
];

const CATEGORY_LABELS: Record<VisualCategoryKey, string> = {
  ai_future: 'AI / Future',
  robotics: 'Robotics',
  mobility: 'Mobility',
  healthtech: 'Healthtech',
  smart_home: 'Smart Home',
  research: 'Research',
  china_tech: 'China Tech',
  gadget: 'Gadget',
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

  if (/\b(robot|humanoid|exoskeleton|manipulat|tacta|unitree|optimus)\b|робот/i.test(hay)) {
    return 'robotics';
  }
  if (/\b(drone|evtol|vehicle|mobility|rfid|gps|автопилот)\b/i.test(hay)) return 'mobility';
  if (/\b(health|medical|wearable|sleep|bassinet|cry|здоров)\b/i.test(hay)) return 'healthtech';
  if (/\b(smart\s*home|watering|soil|thermostat|умн\w*\s*дом|полив)\b/i.test(hay)) {
    return 'smart_home';
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

/**
 * Pick brand → organization → category. Never uses feed/source name.
 */
export function resolveVisualFallback(opts: {
  title?: string;
  category?: string;
  tags?: string[];
  summary?: string;
}): VisualFallbackSpec {
  const hay = haystack(opts);
  const categoryKey = resolveVisualCategory(opts);

  for (const b of BRAND_RULES) {
    if (b.re.test(hay)) {
      return {
        kind: 'brand',
        caption: 'Иллюстрация бренда',
        headline: b.name,
        categoryKey: b.cat || categoryKey,
        mark: (b.mark || b.name.charAt(0)).toUpperCase(),
      };
    }
  }

  for (const o of ORG_RULES) {
    if (o.re.test(hay)) {
      return {
        kind: 'organization',
        caption: 'Иллюстрация организации',
        headline: o.name,
        categoryKey: 'research',
        mark: (o.mark || o.name.charAt(0)).toUpperCase(),
      };
    }
  }

  return {
    kind: 'category',
    caption: 'Редакционная иллюстрация',
    headline: CATEGORY_LABELS[categoryKey],
    categoryKey,
    mark: CATEGORY_LABELS[categoryKey].charAt(0).toUpperCase(),
  };
}

export function visualFallbackToneClass(key: VisualCategoryKey): string {
  switch (key) {
    case 'ai_future':
      return 'bg-[linear-gradient(145deg,#e8f0f4_0%,#d5e4ec_45%,#c5d5c8_100%)]';
    case 'robotics':
      return 'bg-[linear-gradient(145deg,#ebe6df_0%,#d9d2c6_50%,#c4b8a8_100%)]';
    case 'mobility':
      return 'bg-[linear-gradient(145deg,#e4eef2_0%,#c9dde8_55%,#b0c4d4_100%)]';
    case 'healthtech':
      return 'bg-[linear-gradient(145deg,#ebe8e4_0%,#e0d5d0_50%,#d4c4bc_100%)]';
    case 'smart_home':
      return 'bg-[linear-gradient(145deg,#e7eee8_0%,#d2e0d4_50%,#b9ceb8_100%)]';
    case 'research':
      return 'bg-[linear-gradient(145deg,#e9e7e2_0%,#ddd8cf_50%,#cfc6b8_100%)]';
    case 'china_tech':
      return 'bg-[linear-gradient(145deg,#f0e8e4_0%,#e4d4cc_50%,#d4bfb4_100%)]';
    default:
      return 'bg-[linear-gradient(145deg,#eceae6_0%,#ddd9d2_50%,#cfc9c0_100%)]';
  }
}
