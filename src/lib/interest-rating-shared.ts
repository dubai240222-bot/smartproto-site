export const INTEREST_SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type InterestScore = (typeof INTEREST_SCORES)[number];

export const MIN_PUBLIC_VOTES = 5;

export const SHARE_CHANNELS = ['telegram', 'whatsapp', 'copy', 'native'] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export type SlugInterestStats = {
  count: number;
  sum: number;
  avg: number;
  scores: Record<InterestScore, number>;
  moreLikeThis: number;
  shares: number;
  shareTelegram: number;
  shareWhatsApp: number;
  shareCopy: number;
  shareNative: number;
};

export type PublicInterestStats = {
  count: number;
  avg: number | null;
  moreLikeThis: number;
  shares: number;
};

export function isInterestScore(value: unknown): value is InterestScore {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    (INTEREST_SCORES as readonly number[]).includes(value)
  );
}

export function isShareChannel(value: unknown): value is ShareChannel {
  return typeof value === 'string' && (SHARE_CHANNELS as readonly string[]).includes(value);
}

export function emptyScores(): Record<InterestScore, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 };
}

export function emptySlugStats(): SlugInterestStats {
  return {
    count: 0,
    sum: 0,
    avg: 0,
    scores: emptyScores(),
    moreLikeThis: 0,
    shares: 0,
    shareTelegram: 0,
    shareWhatsApp: 0,
    shareCopy: 0,
    shareNative: 0,
  };
}

export function toPublicStats(stats: SlugInterestStats): PublicInterestStats {
  return {
    count: stats.count,
    avg: stats.count >= MIN_PUBLIC_VOTES ? stats.avg : null,
    moreLikeThis: stats.moreLikeThis,
    shares: stats.shares,
  };
}

/** Pure re-rate math: one active score per visitor; update replaces previous. */
export function applyRatingUpdate(
  stats: SlugInterestStats,
  next: InterestScore,
  previous: InterestScore | null,
): SlugInterestStats {
  const scores = { ...stats.scores };
  let count = stats.count;
  let sum = stats.sum;

  if (previous !== null) {
    scores[previous] = Math.max(0, scores[previous] - 1);
    sum -= previous;
  } else {
    count += 1;
  }

  scores[next] += 1;
  sum += next;

  return {
    ...stats,
    count,
    sum,
    avg: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
    scores,
  };
}

export function telegramShareUrl(pageUrl: string, title: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(title)}`;
}

export function whatsappShareUrl(pageUrl: string, title: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${title} ${pageUrl}`)}`;
}

export function cleanAnonId(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length < 8 || raw.length > 64) return null;
  const cleaned = raw.replace(/[^\w-]/g, '').slice(0, 64);
  return cleaned.length >= 8 ? cleaned : null;
}

export function isValidSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && slug.length > 0 && slug.length <= 200 && /^[\w.-]+$/.test(slug);
}
