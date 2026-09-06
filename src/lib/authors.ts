/**
 * Ironic foreign-correspondent bylines for SmartProto.
 * Irony lives in pen names / desks only — article tone stays calm tech journalism.
 *
 * SP-A-078: AUTO author pool ~12 names with anti-repeat rotation.
 * Do not rotate Chief Fast Lane / Author Door human bylines.
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

/** Stable roster: tech-magazine pen names (mixed gender, international). */
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
  // SP-A-078 — expand AUTO pool beyond 1–2 repeating names
  {
    id: 'sofia-reyes',
    name: 'София Рейес',
    desk: 'Madrid desk',
    agentId: 'eu-wire',
    bio: 'Мадридское бюро: понятные объяснения сложных новинок.',
  },
  {
    id: 'james-whitfield',
    name: 'Джеймс Уитфилд',
    desk: 'Boston desk',
    agentId: 'lab-wire',
    bio: 'Бостонская лента: lab demos и практический смысл исследований.',
  },
  {
    id: 'anya-petrova',
    name: 'Аня Петрова',
    desk: 'Nordic desk',
    agentId: 'nordic-wire',
    bio: 'Северное бюро: инженерия, энергия, аккуратный тон.',
  },
  {
    id: 'erik-lindqvist',
    name: 'Эрик Линдквист',
    desk: 'Stockholm desk',
    agentId: 'stockholm-wire',
    bio: 'Стокгольм: железо, софт и бытовые последствия технологий.',
  },
  {
    id: 'maya-okamoto',
    name: 'Майя Окамото',
    desk: 'Pacific desk',
    agentId: 'pacific-wire',
    bio: 'Тихоокеанская лента: гаджеты и будущие привычки.',
  },
];

/** SP-A-078 — AUTO rotation pool (~12). */
export const AUTO_AUTHOR_POOL = [
  'lin-jie',
  'park-soyeon',
  'klaus-weber',
  'eleanor-hale',
  'marco-bellini',
  'hana-okada',
  'tom-reed',
  'sofia-reyes',
  'james-whitfield',
  'anya-petrova',
  'erik-lindqvist',
  'maya-okamoto',
] as const;

const ASIA_PREFERRED = ['lin-jie', 'park-soyeon', 'hana-okada', 'maya-okamoto', 'anya-petrova'] as const;

const BY_ID = new Map(AUTHOR_ROSTER.map((a) => [a.id, a]));
const BY_AGENT = new Map(AUTHOR_ROSTER.map((a) => [a.agentId, a]));

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

function isHumanDoorPipeline(pipeline?: PipelineId, agentId?: string): boolean {
  const blob = `${pipeline || ''} ${agentId || ''}`.toLowerCase();
  return /chief-fast-lane|chief\b|author-door|author\/contributor|contributor/.test(blob);
}

/** Recent published display names (newest first) — best-effort, never throws. */
export function recentPublishedAuthorNames(limit = 5): string[] {
  try {
    if (process.env.ARTICLES_STORE === 'sqlite') {
      // Lazy require avoids circular import with articles.ts at module load.
      const { getAllArticlesFromDb } = require('@/lib/data-store/articles-repo') as {
        getAllArticlesFromDb: () => Array<{ author?: string; publishedAt?: string }>;
      };
      const rows = getAllArticlesFromDb() || [];
      return rows
        .slice()
        .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))
        .map((r) => (r.author || '').trim())
        .filter(Boolean)
        .slice(0, limit);
    }
  } catch {
    /* ignore — rotation still works via hash */
  }
  return [];
}

/**
 * Pick from AUTO pool; avoid names that already appear in the last few publishes.
 * Soft geographic preference only shapes order, never locks to one person.
 */
export function pickRotatingAutoAuthor(
  seed: string,
  opts?: {
    preferredIds?: readonly string[];
    avoidNames?: string[];
    recentLimit?: number;
    /** When true (publish-time), skip names from last N published articles. */
    avoidRecent?: boolean;
  },
): EditorialAuthor {
  const avoid = new Set(
    (
      opts?.avoidNames ??
      (opts?.avoidRecent ? recentPublishedAuthorNames(opts?.recentLimit ?? 5) : [])
    ).map((n) => n.trim().toLowerCase()),
  );
  const preferred = (opts?.preferredIds || []).map((id) => authorById(id));
  const rest = AUTO_AUTHOR_POOL.map((id) => authorById(id)).filter(
    (a) => !preferred.some((p) => p.id === a.id),
  );
  const pool = [...preferred, ...rest];
  const start = hashString(seed || 'smartproto') % pool.length;

  for (let i = 0; i < pool.length; i++) {
    const cand = pool[(start + i) % pool.length];
    if (!avoid.has(cand.name.toLowerCase())) return cand;
  }
  const mostRecent = [...avoid][0];
  for (let i = 0; i < pool.length; i++) {
    const cand = pool[(start + i) % pool.length];
    if (!mostRecent || cand.name.toLowerCase() !== mostRecent) return cand;
  }
  return pool[start];
}

function preferredIdsForSource(sourceUrl?: string, pipeline?: PipelineId): readonly string[] | undefined {
  if (looksChina({ sourceUrl }) || /china|qwen/i.test(String(pipeline || ''))) return ASIA_PREFERRED;
  if (looksKorea(sourceUrl)) return ['park-soyeon', 'hana-okada', 'maya-okamoto', ...ASIA_PREFERRED];
  if (looksJapan(sourceUrl)) return ['hana-okada', 'maya-okamoto', 'park-soyeon'];
  if (looksGerman(sourceUrl)) return ['klaus-weber', 'erik-lindqvist', 'eleanor-hale', 'tom-reed'];
  if (looksItalian(sourceUrl)) return ['marco-bellini', 'sofia-reyes', 'eleanor-hale'];
  return undefined;
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

  if (isHumanDoorPipeline(key)) {
    return authorById('eleanor-hale');
  }

  // SP-A-078: all AUTO pipelines rotate through the pool (no locked Eleanor / Lin Jie).
  return pickRotatingAutoAuthor(key, {
    preferredIds: preferredIdsForSource(undefined, key),
    avoidRecent: true,
  });
}

/** Domain / category heuristic when pipeline alone is not enough. */
export function pickAuthorForSource(
  sourceUrl: string | undefined,
  pipeline?: PipelineId,
  seed = sourceUrl || 'smartproto',
  opts?: { avoidRecent?: boolean },
): EditorialAuthor {
  if (isHumanDoorPipeline(pipeline)) {
    return authorById('eleanor-hale');
  }

  return pickRotatingAutoAuthor(seed, {
    preferredIds: preferredIdsForSource(sourceUrl, pipeline),
    avoidRecent: opts?.avoidRecent === true,
  });
}

/** Stable persona from slug — used when author is missing on existing articles. */
export function authorForSlug(slug: string, article?: AuthorResolvable): EditorialAuthor {
  if (article?.agentId && isHumanDoorPipeline(undefined, article.agentId)) {
    if (!isGenericAuthor(article.author)) {
      return {
        id: 'custom',
        name: article.author!.trim(),
        desk: article.authorDesk || 'News desk',
        agentId: article.agentId,
        bio: '',
      };
    }
  }
  return pickRotatingAutoAuthor(slug || 'smartproto', {
    preferredIds: preferredIdsForSource(article?.sourceUrl),
    avoidRecent: false,
  });
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

  if (article.agentId && isHumanDoorPipeline(undefined, article.agentId)) {
    const persona = authorById('eleanor-hale');
    return { ...persona, ...toAuthorStamp(persona) };
  }

  if (article.agentId) {
    const persona = pickRotatingAutoAuthor(article.slug || article.sourceUrl || article.agentId, {
      preferredIds: preferredIdsForSource(article.sourceUrl, article.agentId),
      avoidRecent: false,
    });
    return { ...persona, ...toAuthorStamp(persona) };
  }

  if (pipeline) {
    const persona = pickAuthorForSource(
      article.sourceUrl,
      pipeline,
      article.slug || article.sourceUrl,
      { avoidRecent: false },
    );
    return { ...persona, ...toAuthorStamp(persona) };
  }

  const persona = authorForSlug(article.slug || article.sourceUrl || 'smartproto', article);
  return { ...persona, ...toAuthorStamp(persona) };
}

/** Fields to spread into a new Article object at publish time. */
export function stampAuthorForPipeline(
  pipeline: PipelineId,
  opts?: { sourceUrl?: string; slug?: string; skipRotation?: boolean; agentId?: string },
): AuthorStamp {
  // Human doors / explicit skip: do not churn byline via AUTO pool.
  if (opts?.skipRotation || isHumanDoorPipeline(pipeline, opts?.agentId)) {
    const fixed =
      BY_AGENT.get(String(pipeline || '').toLowerCase()) ||
      authorById(/china|qwen/i.test(String(pipeline)) ? 'lin-jie' : 'eleanor-hale');
    return toAuthorStamp(fixed);
  }

  const persona = pickRotatingAutoAuthor(opts?.slug || opts?.sourceUrl || String(pipeline), {
    preferredIds: preferredIdsForSource(opts?.sourceUrl, pipeline),
    avoidRecent: true,
  });
  // Keep pipeline agentId on stamp for analytics; display name rotates.
  return {
    author: persona.name,
    authorDesk: persona.desk,
    agentId: String(pipeline || persona.agentId),
  };
}

/** Compact byline: «Имя · время» */
export function formatAuthorByline(authorName: string, timeLabel: string): string {
  return `${authorName} · ${timeLabel}`;
}

/** Article-page style: «Автор: Имя · время» */
export function formatAuthorCredit(authorName: string, timeLabel: string): string {
  return `Автор: ${authorName} · ${timeLabel}`;
}
