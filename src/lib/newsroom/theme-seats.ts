/**
 * Thematic balance — redistribute a few Scout pool seats to underrepresented desks.
 * Same total limit; no extra AI calls. Pure heuristics (no LLM).
 */

import type { EditorialFocus } from './diversity-guard';
import { inferEditorialFocus } from './diversity-guard';

/** Underrepresented theme buckets we try to seat (2–4 seats total). */
export type ThemeSeatBucket =
  | 'ev_mobility'
  | 'healthtech'
  | 'energy_sat'
  | 'apps'
  | 'unusual_smarthome'
  | 'materials'
  | 'inventions'
  | 'lifehacks'
  | 'travel_tech';

export interface ThemeSeatItem {
  title: string;
  text?: string;
  url?: string;
  sourceName: string;
}

const EV_MOBILITY_RE =
  /\b(ev\b|electric\s+vehicle|e-?bike|e-?scooter|micromobility|solid[- ]state\s+batter|ev\s+charging|charging\s+(station|pad)|vehicle\s+charg)\b|электромобил|электросамокат/i;
const HEALTH_RE =
  /\b(health(?:tech)?|medical|hospital|patient|glucose|cgm|sleep\s+tracker|wearable.?health|wellness|blood\s+pressure|hearing\s+aid)\b|медицин|здоров|глюкоз/i;
const ENERGY_SAT_RE =
  /\b(solar|photovoltaic|home\s+battery|powerwall|starlink|direct[- ]to[- ]cell|satellite\s+(internet|phone|broadband)|constellation)\b|солнечн|старлинк|спутник/i;
const APPS_RE =
  /\b(app\b|app\s+store|play\s+store|testflight|ios\s+app|android\s+app|mobile\s+app|mobile\s+game|indie\s+game|приложен)\b/i;
const UNUSUAL_HOME_RE =
  /\b(unusual\s+smart\s*home|smart\s+mirror|robot\s+lawn|cry[- ]response|gesture\s+home|haptic\s+home|bassinet)\b|необычн\w*\s+умн/i;
const MATERIALS_RE =
  /\b(material|metamaterial|graphene|aerogel|self[- ]healing|biocompatible|nanomaterial)\b|материал|графен/i;
const INVENTION_RE =
  /\b(invention|prototype\s+gadget|first[- ]of[- ]its[- ]kind|never[- ]before|breakthrough\s+device)\b|изобретен|прототип/i;
const LIFEHACK_RE =
  /\b(lifehack|life\s+hack|everyday\s+hack|clever\s+gadget|kitchen\s+gadget|portable\s+tool)\b|лайфхак|хитрост/i;
const TRAVEL_RE =
  /\b(travel\s+(gadget|tech|kit)|packing|portable\s+(translator|projector|charger)|luggage|passport)\b|путешеств|тревел/i;

/** Minor app churn — filter out of app seats. */
const APP_MINOR_RE =
  /\b(version\s+\d|v\d+\.\d+|redesign|ui\s+refresh|dark\s+mode|bug\s*fix|minor\s+update|point\s+release|changelog|now\s+available\s+in|rolls?\s+out\s+to)\b/i;

const THEME_ORDER: ThemeSeatBucket[] = [
  'ev_mobility',
  'healthtech',
  'energy_sat',
  'apps',
  'unusual_smarthome',
  'materials',
  'inventions',
  'lifehacks',
  'travel_tech',
];

export function classifyThemeSeat(title: string, text = ''): ThemeSeatBucket | null {
  const hay = `${title}\n${text}`.slice(0, 1500);
  if (EV_MOBILITY_RE.test(hay)) return 'ev_mobility';
  if (HEALTH_RE.test(hay)) return 'healthtech';
  if (ENERGY_SAT_RE.test(hay)) return 'energy_sat';
  if (APPS_RE.test(hay)) return 'apps';
  if (UNUSUAL_HOME_RE.test(hay)) return 'unusual_smarthome';
  if (MATERIALS_RE.test(hay)) return 'materials';
  if (INVENTION_RE.test(hay)) return 'inventions';
  if (LIFEHACK_RE.test(hay)) return 'lifehacks';
  if (TRAVEL_RE.test(hay)) return 'travel_tech';
  return null;
}

export function isMinorAppUpdate(title: string, text = ''): boolean {
  return APP_MINOR_RE.test(`${title}\n${text}`);
}

/** Map theme seat → editorial focus for saturation accounting. */
export function themeSeatToFocus(bucket: ThemeSeatBucket): EditorialFocus {
  switch (bucket) {
    case 'ev_mobility':
      return 'mobility';
    case 'healthtech':
      return 'healthtech';
    case 'unusual_smarthome':
      return 'smart_home';
    case 'apps':
      return 'consumer_gadget';
    case 'inventions':
    case 'lifehacks':
    case 'materials':
    case 'travel_tech':
      return 'unusual_invention';
    case 'energy_sat':
      return 'energy_sat';
    default:
      return 'other';
  }
}

export function topicBucketLabel(title: string, text = '', sourceName = ''): string {
  const theme = classifyThemeSeat(title, text);
  if (theme) return theme;
  return inferEditorialFocus({ title, text, sourceName });
}

function itemKey(it: ThemeSeatItem): string {
  return it.url || it.title;
}

/**
 * After a ranked list is built (best-first), reserve `seatCount` seats (default 3)
 * for underrepresented themes by swapping out the weakest non-theme slots (pool tail).
 * Does not change pool length.
 */
export function applyThemeSeats<T extends ThemeSeatItem>(
  pool: T[],
  ranked: T[],
  opts?: { seatCount?: number; maxPerSource?: number },
): { pool: T[]; seatsFilled: number; swaps: { out: string; in: string; theme: ThemeSeatBucket }[] } {
  const seatCount = Math.max(0, Math.min(opts?.seatCount ?? 3, 4));
  const maxPerSource = opts?.maxPerSource ?? 3;
  if (!pool.length || seatCount === 0) {
    return { pool: [...pool], seatsFilled: 0, swaps: [] };
  }

  const poolKeys = new Set(pool.map(itemKey));
  const perSource = new Map<string, number>();
  for (const p of pool) {
    perSource.set(p.sourceName, (perSource.get(p.sourceName) || 0) + 1);
  }

  const presentThemes = new Set(
    pool.map((p) => classifyThemeSeat(p.title, p.text || '')).filter(Boolean) as ThemeSeatBucket[],
  );

  const swaps: { out: string; in: string; theme: ThemeSeatBucket }[] = [];
  const next = [...pool];

  const candidatesByTheme = new Map<ThemeSeatBucket, T[]>();
  for (const it of ranked) {
    const theme = classifyThemeSeat(it.title, it.text || '');
    if (!theme) continue;
    if (poolKeys.has(itemKey(it))) continue;
    const list = candidatesByTheme.get(theme) || [];
    list.push(it);
    candidatesByTheme.set(theme, list);
  }

  let seatsFilled = 0;
  for (const theme of THEME_ORDER) {
    if (seatsFilled >= seatCount) break;
    if (presentThemes.has(theme)) continue;
    const cands = candidatesByTheme.get(theme) || [];
    const pick = cands.find((c) => (perSource.get(c.sourceName) || 0) < maxPerSource);
    if (!pick) continue;

    // Victim = last pool slot that is not already a reserved theme (weakest after best-first sort).
    let victimIdx = -1;
    for (let i = next.length - 1; i >= 0; i--) {
      const curTheme = classifyThemeSeat(next[i]!.title, next[i]!.text || '');
      if (curTheme && THEME_ORDER.includes(curTheme)) continue;
      victimIdx = i;
      break;
    }
    if (victimIdx < 0) victimIdx = next.length - 1;

    const out = next[victimIdx]!;
    perSource.set(out.sourceName, Math.max(0, (perSource.get(out.sourceName) || 1) - 1));
    perSource.set(pick.sourceName, (perSource.get(pick.sourceName) || 0) + 1);
    poolKeys.delete(itemKey(out));
    poolKeys.add(itemKey(pick));
    next[victimIdx] = pick;
    presentThemes.add(theme);
    seatsFilled += 1;
    swaps.push({
      out: out.title.slice(0, 60),
      in: pick.title.slice(0, 60),
      theme,
    });
  }

  return { pool: next, seatsFilled, swaps };
}

/**
 * Swap 1–2 app-desk candidates into the pool (same length). Filters minor version/redesign.
 * Prefer not to evict already-seated underrepresented themes.
 */
export function applyAppSeats<T extends ThemeSeatItem>(
  pool: T[],
  appCandidates: T[],
  opts?: { seatCount?: number },
): { pool: T[]; seatsFilled: number; swaps: { out: string; in: string }[] } {
  const seatCount = Math.max(0, Math.min(opts?.seatCount ?? 2, 2));
  if (!pool.length || seatCount === 0 || !appCandidates.length) {
    return { pool: [...pool], seatsFilled: 0, swaps: [] };
  }

  const poolKeys = new Set(pool.map(itemKey));
  const eligible = appCandidates.filter(
    (a) => !isMinorAppUpdate(a.title, a.text || '') && !poolKeys.has(itemKey(a)),
  );

  const next = [...pool];
  const swaps: { out: string; in: string }[] = [];
  let seatsFilled = 0;

  for (const app of eligible) {
    if (seatsFilled >= seatCount) break;
    let victimIdx = -1;
    for (let i = next.length - 1; i >= 0; i--) {
      const curTheme = classifyThemeSeat(next[i]!.title, next[i]!.text || '');
      if (curTheme && THEME_ORDER.includes(curTheme)) continue;
      victimIdx = i;
      break;
    }
    if (victimIdx < 0) {
      // No non-theme victim — skip further app seats rather than undoing theme balance.
      break;
    }
    const out = next[victimIdx]!;
    next[victimIdx] = app;
    poolKeys.add(itemKey(app));
    seatsFilled += 1;
    swaps.push({ out: out.title.slice(0, 60), in: app.title.slice(0, 60) });
  }

  return { pool: next, seatsFilled, swaps };
}
