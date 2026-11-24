/**
 * SP-A-42 — worker mode / credit cadence helpers (no OpenRouter, no newsroom prompts).
 */

import { isLightMode } from './light-mode';

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

/** After a long silence, AUTO may tick more often — production Scout floor unchanged. */
export const CATCHUP_STALE_MS_DEFAULT = 12 * 60 * 60 * 1000;
export const CATCHUP_WINDOW_MS_DEFAULT = 10 * 60 * 60 * 1000;
export const CATCHUP_TICK_GAP_MS_DEFAULT = 25 * 60 * 1000;
export const CATCHUP_MAX_PUBLISHES_DEFAULT = 3;
export const CATCHUP_MAX_TICKS_DEFAULT = 6;

export function shouldCatchUp(opts: {
  lastAutoPublicationAt?: string | null;
  lastRunAt?: string | null;
  catchupWindowStart?: string | null;
  catchupPublished?: number;
  catchupTicks?: number;
  now?: number;
}): { active: boolean; run: boolean } {
  if (isLightMode()) return { active: false, run: false };
  const now = opts.now ?? Date.now();
  const lastPub = opts.lastAutoPublicationAt ? Date.parse(opts.lastAutoPublicationAt) : NaN;
  const stale =
    !Number.isFinite(lastPub) || now - lastPub >= CATCHUP_STALE_MS_DEFAULT;
  if (!stale) return { active: false, run: false };

  const winStart = opts.catchupWindowStart ? Date.parse(opts.catchupWindowStart) : NaN;
  const inWindow = Number.isFinite(winStart) && now - winStart < CATCHUP_WINDOW_MS_DEFAULT;
  const published = inWindow ? Number(opts.catchupPublished || 0) : 0;
  const ticks = inWindow ? Number(opts.catchupTicks || 0) : 0;
  if (published >= CATCHUP_MAX_PUBLISHES_DEFAULT) return { active: false, run: false };
  // 0 publishes: do not stop after 6 idle ticks — homepage is still dead.
  if (published > 0 && ticks >= CATCHUP_MAX_TICKS_DEFAULT) return { active: false, run: false };

  const lastRun = opts.lastRunAt ? Date.parse(opts.lastRunAt) : NaN;
  if (Number.isFinite(lastRun) && now - lastRun < CATCHUP_TICK_GAP_MS_DEFAULT) {
    return { active: true, run: false };
  }
  return { active: true, run: true };
}

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
