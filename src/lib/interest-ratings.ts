import { getArticleBySlug } from '@/data/articles';
import {
  INTEREST_SCORES,
  applyRatingUpdate,
  emptySlugStats,
  isInterestScore,
  type InterestScore,
  type ShareChannel,
  type SlugInterestStats,
} from '@/lib/interest-rating-shared';

export {
  INTEREST_SCORES,
  isInterestScore,
  toPublicStats,
  telegramShareUrl,
  whatsappShareUrl,
  cleanAnonId,
  isValidSlug,
  isShareChannel,
  MIN_PUBLIC_VOTES,
  applyRatingUpdate,
  emptySlugStats,
} from '@/lib/interest-rating-shared';
export type {
  InterestScore,
  ShareChannel,
  SlugInterestStats,
  PublicInterestStats,
} from '@/lib/interest-rating-shared';

const RL_WINDOW_SEC = 60;
const RL_MAX = 40;

export function isInterestStoreConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function redis(command: (string | number)[]): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('UPSTASH_NOT_CONFIGURED');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`UPSTASH_HTTP_${res.status}`);
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(data.error);
  return data.result;
}

async function redisPipeline(commands: (string | number)[][]): Promise<unknown[]> {
  const base = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const res = await fetch(`${base.replace(/\/$/, '')}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`UPSTASH_HTTP_${res.status}`);
  const data = (await res.json()) as Array<{ result?: unknown; error?: string }>;
  return data.map((row) => {
    if (row.error) throw new Error(row.error);
    return row.result;
  });
}

const agg = (slug: string) => `sp:fb:${slug}:agg`;
const ratingKey = (slug: string, anonId: string) => `sp:fb:${slug}:r:${anonId}`;
const mltKey = (slug: string, anonId: string) => `sp:fb:${slug}:m:${anonId}`;
const rlKey = (anonId: string) => `sp:fb:rl:${anonId}`;

function parseAgg(flat: unknown): SlugInterestStats {
  const stats = emptySlugStats();
  if (!Array.isArray(flat) || flat.length === 0) return stats;
  const map = new Map<string, string>();
  for (let i = 0; i + 1 < flat.length; i += 2) map.set(String(flat[i]), String(flat[i + 1]));
  const num = (k: string) => {
    const n = Number(map.get(k) || 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };
  for (const score of INTEREST_SCORES) stats.scores[score] = num(`d${score}`);
  stats.count = num('count') || INTEREST_SCORES.reduce((a, s) => a + stats.scores[s], 0);
  stats.sum = num('sum') || INTEREST_SCORES.reduce((a, s) => a + s * stats.scores[s], 0);
  stats.avg = stats.count > 0 ? Math.round((stats.sum / stats.count) * 10) / 10 : 0;
  stats.moreLikeThis = num('mlt');
  stats.shares = num('shares');
  stats.shareTelegram = num('sh_tg');
  stats.shareWhatsApp = num('sh_wa');
  stats.shareCopy = num('sh_cp');
  stats.shareNative = num('sh_nv');
  return stats;
}

export function resolveArticleMeta(slug: string) {
  const article = getArticleBySlug(slug);
  return article ? { slug: article.slug, category: article.category } : null;
}

export async function checkRateLimit(anonId: string): Promise<boolean> {
  if (!isInterestStoreConfigured()) return true;
  const key = rlKey(anonId);
  const count = Number(await redis(['INCR', key]));
  if (count === 1) await redis(['EXPIRE', key, RL_WINDOW_SEC]);
  return count <= RL_MAX;
}

export async function getSlugInterestStats(slug: string): Promise<SlugInterestStats> {
  if (!isInterestStoreConfigured()) return emptySlugStats();
  return parseAgg(await redis(['HGETALL', agg(slug)]));
}

export async function recordInterestVote(input: {
  slug: string;
  score: InterestScore;
  anonId: string;
}): Promise<{ stats: SlugInterestStats; updated: boolean }> {
  const voteKey = ratingKey(input.slug, input.anonId);
  const prevRaw = await redis(['GET', voteKey]);
  const previous =
    typeof prevRaw === 'string' && isInterestScore(Number(prevRaw))
      ? (Number(prevRaw) as InterestScore)
      : null;
  if (previous === input.score) {
    return { stats: await getSlugInterestStats(input.slug), updated: false };
  }

  const next = applyRatingUpdate(await getSlugInterestStats(input.slug), input.score, previous);
  const fields: (string | number)[] = ['count', next.count, 'sum', next.sum];
  for (const s of INTEREST_SCORES) fields.push(`d${s}`, next.scores[s]);
  await redisPipeline([
    ['SET', voteKey, String(input.score)],
    ['HSET', agg(input.slug), ...fields],
  ]);
  return { stats: next, updated: true };
}

export async function recordMoreLikeThis(input: {
  slug: string;
  anonId: string;
}): Promise<{ stats: SlugInterestStats; created: boolean }> {
  const set = await redis(['SET', mltKey(input.slug, input.anonId), '1', 'NX']);
  if (set !== 'OK') {
    return { stats: await getSlugInterestStats(input.slug), created: false };
  }
  await redis(['HINCRBY', agg(input.slug), 'mlt', 1]);
  return { stats: await getSlugInterestStats(input.slug), created: true };
}

const SHARE_FIELD: Record<ShareChannel, string> = {
  telegram: 'sh_tg',
  whatsapp: 'sh_wa',
  copy: 'sh_cp',
  native: 'sh_nv',
};

export async function recordShare(input: {
  slug: string;
  channel: ShareChannel;
}): Promise<SlugInterestStats> {
  await redisPipeline([
    ['HINCRBY', agg(input.slug), 'shares', 1],
    ['HINCRBY', agg(input.slug), SHARE_FIELD[input.channel], 1],
  ]);
  return getSlugInterestStats(input.slug);
}
