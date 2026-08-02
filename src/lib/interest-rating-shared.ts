export const INTEREST_SCORES = [5, 6, 7, 8, 9, 10] as const;
export type InterestScore = (typeof INTEREST_SCORES)[number];

export type SlugInterestStats = {
  count: number;
  sum: number;
  avg: number;
  scores: Record<InterestScore, number>;
};

export function isInterestScore(value: unknown): value is InterestScore {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    (INTEREST_SCORES as readonly number[]).includes(value)
  );
}
