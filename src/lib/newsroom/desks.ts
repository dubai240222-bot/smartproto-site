/**
 * Editorial desks / topics for autonomous newsroom rotation (TEST mode).
 * Export clear registry for tick + nextTopic().
 */
import { appSourceFeedPairs } from '../collectors/app-sources';

export type DeskId =
  | 'apps'
  | 'gadgets'
  | 'world-tech'
  | 'ai'
  | 'wonder-goods'
  | 'china'
  | 'health-home'
  | 'games';

export type DeskChannel = 'rss' | 'apps' | 'china';

export interface Desk {
  id: DeskId;
  /** English label for logs */
  label: string;
  /** Russian rubric hint */
  labelRu: string;
  channel: DeskChannel;
  /** Category written on publish */
  publishCategory: string;
  /** RSS [name, url] — empty for china channel */
  sources: [string, string][];
  /**
   * Soft title/text filter for mixed feeds.
   * Apps desk uses dedicated looksUsefulApp instead.
   */
  topicPattern?: RegExp;
  tags: string[];
}

const GADGET_CORE: [string, string][] = [
  ['Yanko Design', 'https://www.yankodesign.com/feed/'],
  ['New Atlas', 'https://newatlas.com/index.rss'],
  ['Hackaday', 'https://hackaday.com/blog/feed/'],
  ['Engadget', 'https://www.engadget.com/rss.xml'],
];

const WORLD_TECH: [string, string][] = [
  ['TechCrunch', 'https://techcrunch.com/feed/'],
  ['The Verge', 'https://www.theverge.com/rss/index.xml'],
  ['Engadget', 'https://www.engadget.com/rss.xml'],
  ['9to5Google', 'https://9to5google.com/feed/'],
  ['Android Authority', 'https://www.androidauthority.com/feed/'],
];

/**
 * Round-robin order. SP-A-054: AI desk boosted (listed first + again in ROTATION_ORDER).
 * China is one desk — not always first; public labels strip China/Qwen.
 */
export const DESKS: Desk[] = [
  {
    id: 'ai',
    label: 'Artificial intelligence',
    labelRu: 'AI',
    channel: 'rss',
    publishCategory: 'AI',
    sources: [
      ['TechCrunch', 'https://techcrunch.com/feed/'],
      ['The Verge', 'https://www.theverge.com/rss/index.xml'],
      ['Engadget', 'https://www.engadget.com/rss.xml'],
      ['New Atlas', 'https://newatlas.com/index.rss'],
      ['9to5Google', 'https://9to5google.com/feed/'],
      ...appSourceFeedPairs().slice(0, 3),
    ],
    topicPattern:
      /\b(ai|a\.i\.|artificial intelligence|chatgpt|gemini|claude|llm|gpt|machine learning|neural|copilot|agentic|autonom(?:y|ous)|superintelligence|agi|on[- ]device ai|ai[- ]powered|foundation model|reasoning model)\b|искусственн\w*\s+интеллект|\bии\b|нейросет|автономн/i,
    tags: ['AI', 'ии', 'приложения'],
  },
  {
    id: 'apps',
    label: 'Mobile apps',
    labelRu: 'Приложения',
    channel: 'apps',
    publishCategory: 'Приложения',
    sources: appSourceFeedPairs(),
    tags: ['приложения', 'app', 'mobile'],
  },
  {
    id: 'gadgets',
    label: 'Interesting gadgets',
    labelRu: 'Гаджеты',
    channel: 'rss',
    publishCategory: 'Гаджеты',
    sources: [
      ...GADGET_CORE,
      ['TechCrunch', 'https://techcrunch.com/feed/'],
      ['The Verge', 'https://www.theverge.com/rss/index.xml'],
    ],
    tags: ['гаджет', 'новинка'],
  },
  {
    id: 'world-tech',
    label: 'World tech news',
    labelRu: 'Технологии',
    channel: 'rss',
    publishCategory: 'Гаджеты',
    sources: WORLD_TECH,
    topicPattern:
      /\b(gadget|device|wearable|phone|smartphone|earbuds?|headphones?|tablet|camera|charger|dock|smart\s*home|launch|unveils?|announces?)\b|гаджет|смартфон|наушник|запуск|анонс/i,
    tags: ['технологии', 'новинка'],
  },
  {
    id: 'wonder-goods',
    label: 'Useful wonder goods',
    labelRu: 'Находки',
    channel: 'rss',
    publishCategory: 'Гаджеты',
    sources: [
      ['Yanko Design', 'https://www.yankodesign.com/feed/'],
      ['New Atlas', 'https://newatlas.com/index.rss'],
      ['Hackaday', 'https://hackaday.com/blog/feed/'],
    ],
    tags: ['находка', 'гаджет', 'дизайн'],
  },
  {
    id: 'china',
    label: 'Chinese new developments',
    // SP-A-050: public rubric is reader-friendly; China desk stays internal.
    labelRu: 'Гаджеты',
    channel: 'china',
    publishCategory: 'Гаджеты',
    sources: [],
    tags: ['новинка', 'гаджет'],
  },
  {
    id: 'health-home',
    label: 'Health / sleep / travel / home',
    labelRu: 'Здоровье и дом',
    channel: 'rss',
    publishCategory: 'Здоровье',
    sources: [
      ['New Atlas', 'https://newatlas.com/index.rss'],
      ['Yanko Design', 'https://www.yankodesign.com/feed/'],
      ['Engadget', 'https://www.engadget.com/rss.xml'],
      ['The Verge', 'https://www.theverge.com/rss/index.xml'],
    ],
    topicPattern:
      /\b(health|sleep|fitness|travel|home|kitchen|pillow|vacuum|air\s*purifier|wellness|thermostat|mattress|blood\s*pressure|glucose|meditation)\b|здоров|сон|фитнес|путешеств|умный\s*дом|кухн/i,
    tags: ['здоровье', 'дом', 'гаджет'],
  },
  {
    id: 'games',
    label: 'Games / unusual controllers',
    labelRu: 'Игры',
    channel: 'rss',
    publishCategory: 'Игры',
    sources: [
      ['TouchArcade', 'https://toucharcade.com/feed/'],
      ['Yanko Design', 'https://www.yankodesign.com/feed/'],
      ['Engadget', 'https://www.engadget.com/rss.xml'],
      ['The Verge', 'https://www.theverge.com/rss/index.xml'],
    ],
    topicPattern:
      /\b(game|gaming|gamepad|controller|arcade|steam\s*deck|nintendo|playstation|xbox|vr|handheld)\b|игр|геймпад|контроллер|аркад/i,
    tags: ['игры', 'гаджет'],
  },
];

/**
 * SP-A-054 — round-robin desks. AI once per round (not 3×) so robots/AI don't starve gadgets/apps.
 */
export const ROTATION_ORDER: DeskId[] = [
  'gadgets',
  'ai',
  'apps',
  'wonder-goods',
  'health-home',
  'world-tech',
  'games',
  'china',
];

export function getDesk(id: DeskId): Desk {
  const d = DESKS.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown desk: ${id}`);
  return d;
}

export function listDeskIds(): DeskId[] {
  return DESKS.map((d) => d.id);
}

export function rotationLength(): number {
  return ROTATION_ORDER.length;
}

export function deskAtRotationIndex(index: number): Desk {
  const id = ROTATION_ORDER[((index % ROTATION_ORDER.length) + ROTATION_ORDER.length) % ROTATION_ORDER.length]!;
  return getDesk(id);
}
