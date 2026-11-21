/**
 * SP-A-42 — worker mode / credit cadence helpers (no OpenRouter, no newsroom prompts).
 */

export const CREDIT_COOLDOWN_MS_DEFAULT = 30 * 60 * 1000;

export function loadCreditCooldownMs(): number {
  const n = Number(process.env.SMARTPROTO_CREDIT_COOLDOWN_MS || CREDIT_COOLDOWN_MS_DEFAULT);
  return Number.isFinite(n) && n >= 60_000 ? Math.floor(n) : CREDIT_COOLDOWN_MS_DEFAULT;
}

export function shouldRecoverStalledOff(opts: {
  holdOff?: unknown;
  setAt?: unknown;
  recoverAfterMs: number;
  now?: number;
}): boolean {
  if (opts.holdOff === true || opts.holdOff === 'true') return false;
  const now = opts.now ?? Date.now();
  const setAt = opts.setAt ? Date.parse(String(opts.setAt)) : NaN;
  const ageMs = Number.isFinite(setAt) ? now - setAt : opts.recoverAfterMs;
  return ageMs >= opts.recoverAfterMs;
}

export type NewsTickDecision = 'run' | 'wait-cadence' | 'wait-credit-cooldown';

/**
 * lastNewsAt = last successful news tick (publish, reserve, or idle-ok).
 * lastCreditErrorAt = last OpenRouter credit failure.
 * After cooldown, resume immediately — do not wait another news interval.
 */
export function nextNewsTickDecision(opts: {
  lastNewsAt?: string | null;
  lastCreditErrorAt?: string | null;
  lastRunStatus?: string | null;
  newsIntervalMs: number;
  creditCooldownMs?: number;
  now?: number;
}): NewsTickDecision {
  const now = opts.now ?? Date.now();
  const cooldown = opts.creditCooldownMs ?? loadCreditCooldownMs();
  const creditAt = opts.lastCreditErrorAt ? Date.parse(opts.lastCreditErrorAt) : NaN;
  if (Number.isFinite(creditAt) && now - creditAt < cooldown) {
    return 'wait-credit-cooldown';
  }
  if (
    Number.isFinite(creditAt) &&
    now - creditAt >= cooldown &&
    (opts.lastRunStatus === 'credit_error' || Boolean(opts.lastCreditErrorAt))
  ) {
    return 'run';
  }
  const lastNews = opts.lastNewsAt ? Date.parse(opts.lastNewsAt) : NaN;
  if (!Number.isFinite(lastNews)) return 'run';
  if (now - lastNews >= opts.newsIntervalMs) return 'run';
  return 'wait-cadence';
}

export function patchStateAfterNewsTick(opts: {
  ok: boolean;
  published: boolean;
  reserved: boolean;
  creditError: boolean;
  now?: Date;
}): {
  lastRunAt: string;
  lastRunStatus: string;
  lastNewsAt?: string;
  lastCreditErrorAt?: string;
  lastCreditError?: string | null;
} {
  const now = (opts.now ?? new Date()).toISOString();
  if (opts.creditError) {
    return {
      lastRunAt: now,
      lastRunStatus: 'credit_error',
      lastCreditErrorAt: now,
      lastCreditError: 'openrouter',
    };
  }
  return {
    lastRunAt: now,
    lastRunStatus: opts.ok ? 'ok' : 'error',
    ...(opts.ok
      ? { lastNewsAt: now, lastCreditErrorAt: undefined, lastCreditError: null }
      : {}),
  };
}
