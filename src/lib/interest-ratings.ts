import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import {
  INTEREST_SCORES,
  isInterestScore,
  type InterestScore,
  type SlugInterestStats,
} from '@/lib/interest-rating-shared';

export { INTEREST_SCORES, isInterestScore };
export type { InterestScore, SlugInterestStats };

export type InterestStatsFile = {
  updatedAt: string;
  slugs: Record<string, SlugInterestStats>;
};

export type InterestVoteRecord = {
  slug: string;
  score: InterestScore;
  ts: string;
  anonId?: string;
};

const EMPTY_SCORES = (): Record<InterestScore, number> => ({
  5: 0,
  6: 0,
  7: 0,
  8: 0,
  9: 0,
  10: 0,
});

function projectDataPath(filename: string): string {
  return path.join(process.cwd(), 'data', filename);
}

function tmpDataPath(filename: string): string {
  return path.join('/tmp', `smartproto-${filename}`);
}

function candidatePaths(filename: string): string[] {
  const primary = projectDataPath(filename);
  // Vercel / serverless: project FS is often read-only; /tmp is writable per instance.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return [tmpDataPath(filename), primary];
  }
  return [primary, tmpDataPath(filename)];
}

export function emptySlugStats(): SlugInterestStats {
  return { count: 0, sum: 0, avg: 0, scores: EMPTY_SCORES() };
}

function normalizeSlugStats(raw: Partial<SlugInterestStats> | undefined): SlugInterestStats {
  const scores = EMPTY_SCORES();
  if (raw?.scores && typeof raw.scores === 'object') {
    for (const score of INTEREST_SCORES) {
      const n = Number((raw.scores as Record<number, unknown>)[score]);
      scores[score] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    }
  }

  let count = INTEREST_SCORES.reduce((acc, s) => acc + scores[s], 0);
  let sum = INTEREST_SCORES.reduce((acc, s) => acc + s * scores[s], 0);

  if (typeof raw?.count === 'number' && raw.count >= count) {
    count = Math.floor(raw.count);
  }
  if (typeof raw?.sum === 'number' && raw.sum >= sum) {
    sum = Math.floor(raw.sum);
  }

  return {
    count,
    sum,
    avg: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
    scores,
  };
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function loadStatsFromDisk(): Promise<{ data: InterestStatsFile; path: string }> {
  for (const filePath of candidatePaths('interest-stats.json')) {
    const parsed = await readJsonFile<InterestStatsFile>(filePath);
    if (parsed && parsed.slugs && typeof parsed.slugs === 'object') {
      return { data: parsed, path: filePath };
    }
  }
  return {
    data: { updatedAt: new Date(0).toISOString(), slugs: {} },
    path: candidatePaths('interest-stats.json')[0],
  };
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  const payload = JSON.stringify(data, null, 2) + '\n';
  await writeFile(tmp, payload, 'utf8');
  await writeFile(filePath, payload, 'utf8');
  try {
    await unlink(tmp);
  } catch {
    // ignore
  }
}

export async function getSlugInterestStats(slug: string): Promise<SlugInterestStats> {
  const { data } = await loadStatsFromDisk();
  return normalizeSlugStats(data.slugs[slug]);
}

export async function recordInterestVote(vote: InterestVoteRecord): Promise<{
  stats: SlugInterestStats;
  persisted: boolean;
}> {
  const { data, path: preferredPath } = await loadStatsFromDisk();
  const current = normalizeSlugStats(data.slugs[vote.slug]);
  current.scores[vote.score] += 1;
  current.count += 1;
  current.sum += vote.score;
  current.avg = Math.round((current.sum / current.count) * 10) / 10;

  const next: InterestStatsFile = {
    updatedAt: new Date().toISOString(),
    slugs: {
      ...data.slugs,
      [vote.slug]: current,
    },
  };

  let persisted = false;
  const writeOrder = [
    preferredPath,
    ...candidatePaths('interest-stats.json').filter((p) => p !== preferredPath),
  ];

  for (const filePath of writeOrder) {
    try {
      await writeJsonAtomic(filePath, next);
      persisted = true;
      break;
    } catch {
      // try next candidate
    }
  }

  // Append raw vote for offline analysis when FS allows (gitignored).
  if (persisted) {
    try {
      const ratingsPath = projectDataPath('interest-ratings.json');
      const existing = (await readJsonFile<InterestVoteRecord[]>(ratingsPath)) ?? [];
      const trimmed = Array.isArray(existing) ? existing.slice(-4999) : [];
      trimmed.push(vote);
      await writeJsonAtomic(ratingsPath, trimmed);
    } catch {
      // aggregates are enough
    }
  }

  return { stats: current, persisted };
}
