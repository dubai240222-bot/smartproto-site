/**
 * SP-A-102 — ranking of freelance / stringer contributors («внештатные»).
 * Counts only material that reached publish (or SAFE published reader tips),
 * never raw quarantine spam.
 */
import { getAllArticlesFromDb, type StoredArticle } from '@/lib/data-store/articles-repo';
import { getAllArticles, type Article } from '@/data/articles';
import {
  listReaderScoutSubmissions,
  READER_SCOUT_AGENT_ID,
} from '@/lib/editorial/reader-scout';

const STAFF_AUTHOR_LINK_AGENT_ID = 'staff-author-link';

export type StringerKind = 'staff' | 'reader' | 'author-door';

export type StringerRank = {
  key: string;
  displayName: string;
  kind: StringerKind;
  publishedCount: number;
  /** Soft score for ordering: publishes + reader interest bonus */
  score: number;
  lastPublishedAt?: string;
  sampleSlugs: string[];
};

const STRINGER_AGENT_RE = /^(staff-author-link|author-door|reader-scout)$/i;

function normalizeName(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function nameKey(name: string): string {
  return normalizeName(name).toLowerCase();
}

function loadArticles(): Array<Pick<Article, 'slug' | 'author' | 'agentId' | 'publishedAt' | 'authorDesk'>> {
  try {
    if (process.env.ARTICLES_STORE === 'sqlite') {
      return getAllArticlesFromDb().map((a: StoredArticle) => ({
        slug: a.slug,
        author: a.author,
        agentId: a.agentId,
        publishedAt: a.publishedAt,
        authorDesk: a.authorDesk,
      }));
    }
  } catch {
    /* fall through */
  }
  return getAllArticles();
}

function kindFromAgent(agentId?: string): StringerKind {
  const a = (agentId || '').toLowerCase();
  if (a === 'staff-author-link') return 'staff';
  if (a === 'author-door') return 'author-door';
  return 'reader';
}

/**
 * Build public leaderboard of внештатные who got something published.
 */
export async function buildStringerBoard(limit = 12): Promise<StringerRank[]> {
  const map = new Map<string, StringerRank>();

  const bump = (opts: {
    name: string;
    kind: StringerKind;
    publishedAt?: string;
    slug?: string;
    weight?: number;
  }) => {
    const displayName = normalizeName(opts.name);
    if (!displayName || displayName.length < 2) return;
    // Skip AUTO pen-name noise if someone stamped generic desk without real stringer
    if (/^(smartproto|редакц|auto|bot)$/i.test(displayName)) return;
    const key = nameKey(displayName);
    const cur = map.get(key) || {
      key,
      displayName,
      kind: opts.kind,
      publishedCount: 0,
      score: 0,
      sampleSlugs: [] as string[],
    };
    cur.publishedCount += 1;
    cur.score += opts.weight ?? 10;
    if (opts.slug && cur.sampleSlugs.length < 3 && !cur.sampleSlugs.includes(opts.slug)) {
      cur.sampleSlugs.push(opts.slug);
    }
    if (
      opts.publishedAt &&
      (!cur.lastPublishedAt || opts.publishedAt > cur.lastPublishedAt)
    ) {
      cur.lastPublishedAt = opts.publishedAt;
    }
    // Prefer staff label if mixed
    if (opts.kind === 'staff' || opts.kind === 'author-door') cur.kind = opts.kind;
    map.set(key, cur);
  };

  for (const a of loadArticles()) {
    const agent = (a.agentId || '').trim();
    if (!STRINGER_AGENT_RE.test(agent)) continue;
    if (agent.toLowerCase() === READER_SCOUT_AGENT_ID && !(a.author || '').trim()) continue;
    // Reader-scout with rotated AUTO pen name: only count if desk marks stringer
    if (agent.toLowerCase() === READER_SCOUT_AGENT_ID) {
      const desk = (a.authorDesk || '').toLowerCase();
      if (!desk.includes('reader') && !desk.includes('stringer') && !desk.includes('внештат')) {
        // Still count if author looks human and not from roster irony alone —
        // require explicit reader desk; published submissions handle anonymous tips.
        continue;
      }
    }
    bump({
      name: a.author || 'Аноним',
      kind: kindFromAgent(agent),
      publishedAt: a.publishedAt,
      slug: a.slug,
      weight: agent === STAFF_AUTHOR_LINK_AGENT_ID || agent === 'author-door' ? 12 : 10,
    });
  }

  // Published Reader Scout tips with a real submitter name
  try {
    const published = await listReaderScoutSubmissions('published');
    for (const s of published) {
      if (!s.submitterName?.trim()) continue;
      bump({
        name: s.submitterName,
        kind: 'reader',
        publishedAt: s.updatedAt || s.createdAt,
        slug: s.articleSlug,
        weight: 10,
      });
    }
  } catch {
    /* ignore */
  }

  return [...map.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.publishedCount !== a.publishedCount) return b.publishedCount - a.publishedCount;
      return (b.lastPublishedAt || '').localeCompare(a.lastPublishedAt || '');
    })
    .slice(0, Math.max(1, limit));
}

export function stringerKindLabel(kind: StringerKind, locale: 'ru' | 'en' | 'tr' = 'ru'): string {
  if (locale === 'en') {
    if (kind === 'staff') return 'Staff stringer';
    if (kind === 'author-door') return 'Correspondent';
    return 'Reader scout';
  }
  if (locale === 'tr') {
    if (kind === 'staff') return 'Serbest muhabir';
    if (kind === 'author-door') return 'Köşe yazarı';
    return 'Okur izci';
  }
  if (kind === 'staff') return 'Внештатный корреспондент';
  if (kind === 'author-door') return 'Автор / колонка';
  return 'Читатель-разведчик';
}
