/**
 * SP-LIGHT-001 — economy mode on the shared Hetzner VPS.
 *
 * SMARTPROTO_LIGHT=true → site stays up; newsroom publishes at most 2 quality
 * pieces / 24h; no catch-up bursts; optional desks sleep.
 * SMARTPROTO_LIGHT=false (or unset) → previous AUTO behaviour.
 */

export const LIGHT_DAILY_CAP = 2;
export const LIGHT_NEWS_INTERVAL_MS = 12 * 60 * 60 * 1000;
export const LIGHT_ARTICLE_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const LIGHT_POLL_MS = 5 * 60 * 1000;
export const LIGHT_TRANSLATE_DRIP_MS = 12 * 60 * 60 * 1000;
export const LIGHT_SCOUT_LIMIT = 4;
export const LIGHT_PIPELINE_BUDGET = 2;

export function isLightMode(): boolean {
  const v = (process.env.SMARTPROTO_LIGHT || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}
