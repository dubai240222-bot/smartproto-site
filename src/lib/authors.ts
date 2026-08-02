/**
 * Ironic foreign-correspondent bylines for SmartProto.
 * Irony lives in pen names / desks only — article tone stays calm tech journalism.
 */

export type PipelineId =
  | 'china-qwen'
  | 'newsroom-scout'
  | 'rss-editor'
  | 'gadgets'
  | 'factory-shift'
  | 'publish-latest'
  | 'burst-hour'
  | string;

export interface EditorialAuthor {
  id: string;
  /** Display name shown in bylines */
  name: string;
  /** Implied bureau / desk flavor */
  desk: string;
  /** Pipeline / agent this persona usually represents */
  agentId: string;
  /** Short witty bio — not shown in article body by default */
  bio: string;
}

export interface AuthorStamp {
  author: string;
  authorDesk: string;
  agentId: string;
}

export interface AuthorResolvable {
  author?: string;
  authorDesk?: string;
  agentId?: string;
  slug?: string;
  category?: string;
  sourceUrl?: string;
  tags?: string[];
}

/** Stable roster: witty foreign-desk pen names, not ethnic caricature. */
export const AUTHOR_ROSTER: EditorialAuthor[] = [
  {
    id: 'lin-jie',
    name: 'Линь Цзе',
    desk: 'China desk',
    agentId: 'china-qwen',
    bio: 'Корреспондент китайской редакции — ловит запуски ещё на местных площадках.',
  },
  {
    id: 'park-soyeon',
    name: 'Пак Соён',
    desk: 'Korea desk',
    agentId: 'korea-wire',
    bio: 'Сеульское бюро: короткие брифинги по железу без лишнего шума.',
  },
  {
    id: 'klaus-weber',
    name: 'Клаус Вебер',
    desk: 'Berlin desk',
    agentId: 'rss-editor',
    bio: 'Берлинская редакция — спецификации читает как утреннюю газету.',
  },
  {
    id: 'eleanor-hale',
    name: 'Элеонора Хейл',
    desk: 'London desk',
    agentId: 'newsroom-scout',
    bio: 'Лондонское бюро новостной службы: спокойный тон, точный лид.',
  },
  {
    id: 'marco-bellini',
    name: 'Марко Беллини',
    desk: 'Milan desk',
    agentId: 'gadgets',
    bio: 'Миланский стол гаджетов — форма, материал, повседневное использование.',
  },
  {
    id: 'hana-okada',
    name: 'Хана Окада',
    desk: 'Tokyo desk',
    agentId: 'tokyo-wire',
    bio: 'Токийское бюро: нишевые устройства и аксессуары с местных витрин.',
  },
  {
    id: 'tom-reed',
    name: 'Том Рид',
    desk: 'US wire',
    agentId: 'factory-shift',
    bio: 'Американская лента релизов — полезные новинки без блогерского пафоса.',
  },
];

const BY_ID = new Map(AUTHOR_ROSTER.map((a) => [a.id, a]));
const BY_AGENT = new Map(AUTHOR_ROSTER.map((a) => [a.agentId, a]));

/** Western desks used for deterministic rotation when pipeline is generic RSS. */
const WESTERN_ROTATION = ['eleanor-hale', 'klaus-weber', 'marco-bellini', 'tom-reed', 'hana-okada'] as const;

const GENERIC_AUTHORS = new Set([
  '',
  'smartproto',
  'smart proto',
  'редакция',
  'редакция smartproto',
  'автор',
  'unknown',
  'unknown author',
  'admin',
  'editor',
]);

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function authorById(id: string): EditorialAuthor {
  return BY_ID.get(id) ?? AUTHOR_ROSTER[0];
}

function isGenericAuthor(name?: string): boolean {
  if (!name) return true;
  return GENERIC_AUTHORS.has(name.trim().toLowerCase());
}

function domainOf(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function looksChina(article: AuthorResolvable): boolean {
  const blob = `${article.category ?? ''} ${(article.tags ?? []).join(' ')} ${article.sourceUrl ?? ''}`.toLowerCase();
  if (/китай|china|中国|中文/.test(blob)) return true;
  const host = domainOf(article.sourceUrl);
  return /\.(cn)$|ithome\.com|36kr\.com|zhihu\.com|jd\.com|tmall\.com|taobao\.com|xiaomi\.com|mi\.com|huawei\.com|oppo\.com|vivo\.com|lenovo\.com\.cn/.test(
    host,
  );
}

function looksKorea(url?: string): boolean {
  const host = domainOf(url);
  return /\.kr$|naver\.com|samsung\.com|kedglobal|korea/.test(host);
}

function looksJapan(url?: string): boolean {
  const host = domainOf(url);
  return /\.jp$|nikkei\.com|watch\.impress\.co\.jp|ascii\.jp|gigazine\.net/.test(host);
}

function looksGerman(url?: string): boolean {
  const host = domainOf(url);
  return /\.de$|heise\.de|golem\.de|chip\.de|computerbase\.de/.test(host);
}

function looksItalian(url?: string): boolean {
  const host = domainOf(url);
  return /\.it$|hwupgrade\.it|tomshw\.it/.test(host);
}

function westernByHash(seed: string): EditorialAuthor {
  const idx = hashString(seed) % WESTERN_ROTATION.length;
  return authorById(WESTERN_ROTATION[idx]);
}

/**
 * Pick a roster persona for a publishing pipeline.
 * Sibling autonomous publishers should call this when stamping new articles.
 */
export function pickAuthorForPipeline(pipeline: PipelineId): EditorialAuthor {
  const key = String(pipeline || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');

  if (key.includes('china') || key.includes('qwen')) {
    return authorById('lin-jie');
  }
  if (key.includes('korea') || key.includes('seoul')) {
    return authorById('park-soyeon');
  }
  if (key.includes('tokyo') || key.includes('japan')) {
    return authorById('hana-okada');
  }
  if (key.includes('gadget')) {
    return authorById('marco-bellini');
  }
  if (key.includes('newsroom') || key.includes('scout')) {
    return authorById('eleanor-hale');
  }
  if (key.includes('factory') || key.includes('burst')) {
    return authorById('tom-reed');
  }
  if (key.includes('rss') || key.includes('editor')) {
    return authorById('klaus-weber');
  }
  if (key.includes('publish-latest') || key.includes('latest')) {
    return westernByHash(key);
  }

  return BY_AGENT.get(key) ?? westernByHash(key || 'smartproto');
}

/** Domain / category heuristic when pipeline alone is not enough. */
export function pickAuthorForSource(
  sourceUrl: string | undefined,
  pipeline?: PipelineId,
  seed = sourceUrl || 'smartproto',
): EditorialAuthor {
  if (looksChina({ sourceUrl, category: '' })) return authorById('lin-jie');
  if (looksKorea(sourceUrl)) return authorById('park-soyeon');
  if (looksJapan(sourceUrl)) return authorById('hana-okada');
  if (looksGerman(sourceUrl)) return authorById('klaus-weber');
  if (looksItalian(sourceUrl)) return authorById('marco-bellini');

  if (pipeline) {
    const fromPipeline = pickAuthorForPipeline(pipeline);
    if (
      fromPipeline.id === 'eleanor-hale' ||
      fromPipeline.id === 'tom-reed' ||
      fromPipeline.id === 'klaus-weber' ||
      fromPipeline.id === 'marco-bellini'
    ) {
      const host = domainOf(sourceUrl);
      if (/techcrunch|theverge|arstechnica|wired|engadget|androidauthority|9to5/.test(host)) {
        return westernByHash(seed);
      }
    }
    return fromPipeline;
  }

  return westernByHash(seed);
}

/** Stable persona from slug — used when author is missing on existing articles. */
export function authorForSlug(slug: string, article?: AuthorResolvable): EditorialAuthor {
  if (article && looksChina(article)) return authorById('lin-jie');
  if (article && looksKorea(article.sourceUrl)) return authorById('park-soyeon');
  if (article && looksJapan(article.sourceUrl)) return authorById('hana-okada');
  if (article && looksGerman(article.sourceUrl)) return authorById('klaus-weber');
  if (article && looksItalian(article.sourceUrl)) return authorById('marco-bellini');
  return westernByHash(slug || 'smartproto');
}

export function toAuthorStamp(persona: EditorialAuthor): AuthorStamp {
  return {
    author: persona.name,
    authorDesk: persona.desk,
    agentId: persona.agentId,
  };
}

/**
 * Prefer stored author; otherwise infer from agentId / pipeline / source / slug hash.
 * Safe for render-time use — does not mutate article bodies.
 */
export function resolveAuthorForArticle(
  article: AuthorResolvable,
  pipeline?: PipelineId,
): EditorialAuthor & AuthorStamp {
  if (!isGenericAuthor(article.author)) {
    const byName = AUTHOR_ROSTER.find((a) => a.name === article.author);
    const persona =
      byName ??
      ({
        id: 'custom',
        name: article.author!.trim(),
        desk: article.authorDesk || 'News desk',
        agentId: article.agentId || pipeline || 'editorial',
        bio: '',
      } satisfies EditorialAuthor);
    return { ...persona, ...toAuthorStamp(persona), authorDesk: article.authorDesk || persona.desk };
  }

  if (article.agentId) {
    const byAgent = BY_AGENT.get(article.agentId) ?? pickAuthorForPipeline(article.agentId);
    return { ...byAgent, ...toAuthorStamp(byAgent) };
  }

  if (pipeline) {
    const persona = pickAuthorForSource(article.sourceUrl, pipeline, article.slug || article.sourceUrl);
    return { ...persona, ...toAuthorStamp(persona) };
  }

  const persona = authorForSlug(article.slug || article.sourceUrl || 'smartproto', article);
  return { ...persona, ...toAuthorStamp(persona) };
}

/** Fields to spread into a new Article object at publish time. */
export function stampAuthorForPipeline(
  pipeline: PipelineId,
  opts?: { sourceUrl?: string; slug?: string },
): AuthorStamp {
  const persona = pickAuthorForSource(
    opts?.sourceUrl,
    pipeline,
    opts?.slug || opts?.sourceUrl || pipeline,
  );
  return toAuthorStamp(persona);
}

/** Compact byline: «Имя · время» */
export function formatAuthorByline(authorName: string, timeLabel: string): string {
  return `${authorName} · ${timeLabel}`;
}

/** Article-page style: «Автор: Имя · время» */
export function formatAuthorCredit(authorName: string, timeLabel: string): string {
  return `Автор: ${authorName} · ${timeLabel}`;
}
