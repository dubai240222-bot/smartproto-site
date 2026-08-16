/**
 * SP-A-098G — Archive Translation Editor pick (cheap heuristics, no LLM).
 * Ranks RU archive needing EN/TR by human/evergreen/theme value + coverage balance.
 * Soft topic diversity vs recent archive jobs (no extra LLM). One article/locale job at a time.
 */
import {
  detectHumanDoor,
  isGreyGadgetNoise,
  isShareWorthyStory,
} from '@/lib/ai/human-priority-gate';
import type { LocalizationLanguage } from '@/lib/i18n/locales';

export type LocSnapshot = {
  translationStatus?: string;
  localizedTitle?: string;
  localizedExcerpt?: string;
  localizedContent?: string;
  translatorModel?: string;
  translatedAt?: string;
} | null;

/** Mirror of post-publish-translate isTestLocalization (no circular import). */
function isTestLocalization(loc: LocSnapshot): boolean {
  if (!loc) return false;
  const title = loc.localizedTitle || '';
  const excerpt = loc.localizedExcerpt || '';
  const model = loc.translatorModel || '';
  return (
    /^\[TEST\]/i.test(title) ||
    /manual-fixture/i.test(model) ||
    /architecture-validation/i.test(excerpt)
  );
}

export type ArchiveArticleInput = {
  id: string;
  slug?: string;
  title: string;
  summary?: string;
  content: string;
  category?: string;
  tags?: string[];
  publishedAt?: string;
};

/** Soft diversity buckets for archive drip (cheap, no LLM). */
export type ArchiveTopic =
  | 'ev_mobility'
  | 'health'
  | 'ai'
  | 'gadgets'
  | 'apps'
  | 'energy_sat'
  | 'smart_home'
  | 'inventions'
  | 'lifehacks'
  | 'travel'
  | 'robots'
  | 'other';

export type ArchiveTranslateJob<T extends ArchiveArticleInput = ArchiveArticleInput> = {
  article: T;
  language: LocalizationLanguage;
  score: number;
  factors: string[];
  topic: ArchiveTopic;
  valueScore: number;
  diversityModifier: number;
};

export type CoverageSnapshot = {
  ruTotal: number;
  withEn: number;
  withTr: number;
  withoutEn: number;
  withoutTr: number;
  enCoveragePct: number;
  trCoveragePct: number;
};

/** Human/evergreen theme signals — robots excluded (category alone must not boost). */
const THEME_VALUE_RE =
  /\b(prosthetic|протез|assistive|home\s+dialysis|smart\s*home|умн\w*\s+дом|health(?:tech)?|медицин|app\b|приложен|invention|изобретен|prototype|прототип|mobility|электромобил|energy|solar|солнечн)\b/i;

const COMMODITY_REFRESH_RE =
  /\b(color|colour|colorway|оттенк|spec(?:s)?\s+refresh|обновлен\w*\s+характеристик|budget\s+phone|бюджетн\w*\s+смартфон|gaming\s+(mouse|keyboard)|игров\w*\s+(мышь|клавиатур))\b/i;

const MS_HOUR = 60 * 60 * 1000;
const RECENT_REJECT_MS = 48 * MS_HOUR;
/** Prefer lagging locale when coverage gap ≥ this fraction (5pp). */
const COVERAGE_GAP = 0.05;
/** Look back at this many recent archive translation jobs for soft saturation. */
const RECENT_ARCHIVE_JOBS = 8;
/** Localization ≥1h after RU publish ≈ archive drip (not post-publish pair). */
const ARCHIVE_LAG_MS = MS_HOUR;
/** Soft: each recent same-topic job nudges score (capped). Exceptional value still wins. */
const DIVERSITY_PENALTY_PER = 5;
const DIVERSITY_PENALTY_CAP = 15;
const DIVERSITY_UNDERREP_BOOST = 4;

const EV_MOBILITY_RE =
  /\b(ev\b|electric\s+vehicle|e-?bike|e-?scooter|micromobility|автономн\w*\s+авто|электромобил|электросамокат|дрон|drone|vtol)\b/i;
const HEALTH_RE =
  /\b(health(?:tech)?|medical|hospital|patient|glucose|cgm|wellness|медицин|здоров|протез|prosthetic|assistive|dialysis)\b/i;
const AI_RE =
  /\b(ai|llm|chatgpt|claude|gemini|agentic|neural)\b|искусственн\w*\s+интеллект|\bии\b/i;
const APPS_RE =
  /\b(app\b|app\s+store|play\s+store|ios\s+app|android\s+app|mobile\s+app|приложен)\b/i;
const ENERGY_SAT_RE =
  /\b(solar|photovoltaic|home\s+battery|powerwall|starlink|satellite\s+(internet|phone|broadband)|солнечн|старлинк|спутник|энерг)\b/i;
const SMART_HOME_RE =
  /\b(smart\s*home|thermostat|doorbell|irrigation|bassinet|умн\w*\s+дом|полив)\b/i;
const INVENTION_RE =
  /\b(invention|prototype|first[- ]of[- ]its[- ]kind|изобретен|прототип)\b/i;
const LIFEHACK_RE =
  /\b(lifehack|life\s+hack|everyday\s+hack|kitchen\s+gadget|лайфхак|хитрост)\b/i;
const TRAVEL_RE =
  /\b(travel\s+(gadget|tech|kit)|portable\s+translator|luggage|путешеств|тревел)\b/i;
const ROBOTS_RE =
  /\b(robot|robotics|humanoid|manipulat|exoskeleton|робот)\b/i;
const GADGET_RE =
  /\b(gadget|phone|smartphone|earbuds|headphones|monitor|charger|wearable|camera|гаджет|смартфон|наушник)\b/i;

export function classifyArchiveTopic(article: ArchiveArticleInput): ArchiveTopic {
  const cat = (article.category || '').toLowerCase();
  if (/робот|robot/i.test(cat)) return 'robots';
  if (/здоров|health|медицин/i.test(cat)) return 'health';
  if (/приложен|app/i.test(cat)) return 'apps';
  if (/энерг|energy|solar/i.test(cat)) return 'energy_sat';
  if (/дом|home/i.test(cat)) return 'smart_home';
  if (/гаджет|gadget|новинк/i.test(cat)) return 'gadgets';
  if (/изобрет/i.test(cat)) return 'inventions';

  const hay = `${article.title}\n${article.summary || ''}\n${(article.tags || []).join(' ')}\n${(article.content || '').slice(0, 900)}`;
  if (ROBOTS_RE.test(hay)) return 'robots';
  if (EV_MOBILITY_RE.test(hay)) return 'ev_mobility';
  if (HEALTH_RE.test(hay)) return 'health';
  if (ENERGY_SAT_RE.test(hay)) return 'energy_sat';
  if (SMART_HOME_RE.test(hay)) return 'smart_home';
  if (APPS_RE.test(hay)) return 'apps';
  if (TRAVEL_RE.test(hay)) return 'travel';
  if (LIFEHACK_RE.test(hay)) return 'lifehacks';
  if (INVENTION_RE.test(hay)) return 'inventions';
  if (AI_RE.test(hay)) return 'ai';
  if (GADGET_RE.test(hay)) return 'gadgets';
  return 'other';
}

/**
 * Recent archive drip themes from published localizations (translated well after RU publish).
 * Cheap DB/memory scan — no LLM.
 */
export function collectRecentArchiveTopics(
  articles: ArchiveArticleInput[],
  getLocalization: (articleId: string, language: LocalizationLanguage) => LocSnapshot,
  opts?: { limit?: number; now?: number },
): ArchiveTopic[] {
  const limit = Math.max(1, Math.min(opts?.limit ?? RECENT_ARCHIVE_JOBS, 10));
  const now = opts?.now ?? Date.now();
  const rows: { at: number; topic: ArchiveTopic }[] = [];

  for (const a of articles) {
    if (!a.id) continue;
    const publishedMs = Date.parse(a.publishedAt || '');
    for (const lang of ['en', 'tr'] as LocalizationLanguage[]) {
      const loc = getLocalization(a.id, lang);
      if (!isPublishedLocalization(loc)) continue;
      const t = Date.parse(loc!.translatedAt || '');
      if (!Number.isFinite(t) || t > now) continue;
      if (Number.isFinite(publishedMs) && t - publishedMs < ARCHIVE_LAG_MS) continue;
      rows.push({ at: t, topic: classifyArchiveTopic(a) });
    }
  }

  rows.sort((x, y) => y.at - x.at);
  return rows.slice(0, limit).map((r) => r.topic);
}

/** Soft diversity: prefer underrepresented topics when value is comparable. */
export function archiveDiversityModifier(
  topic: ArchiveTopic,
  recentTopics: ArchiveTopic[],
): { modifier: number; factor: string } {
  if (!recentTopics.length) {
    return { modifier: 0, factor: 'diversity:neutral_empty' };
  }
  const same = recentTopics.filter((t) => t === topic).length;
  const saturated = same >= 2 || (same >= 1 && recentTopics.length >= 5 && same / recentTopics.length >= 0.4);

  if (saturated) {
    const penalty = -Math.min(DIVERSITY_PENALTY_CAP, same * DIVERSITY_PENALTY_PER);
    return {
      modifier: penalty,
      factor: `diversity:soft_sat(${topic}×${same}/${recentTopics.length};${penalty})`,
    };
  }

  if (same === 0) {
    const dominant = recentTopics[0];
    const domCount = recentTopics.filter((t) => t === dominant).length;
    if (domCount >= 2 && topic !== dominant) {
      return {
        modifier: DIVERSITY_UNDERREP_BOOST,
        factor: `diversity:underrep(+${DIVERSITY_UNDERREP_BOOST};vs_${dominant}×${domCount})`,
      };
    }
  }

  return { modifier: 0, factor: `diversity:ok(${topic}×${same}/${recentTopics.length})` };
}

export function isPublishedLocalization(loc: LocSnapshot): boolean {
  if (!loc || loc.translationStatus !== 'published') return false;
  return !isTestLocalization(loc);
}

export function isInProgressLocalization(loc: LocSnapshot): boolean {
  if (!loc) return false;
  if (isTestLocalization(loc)) return false;
  return loc.translationStatus === 'draft' || loc.translationStatus === 'qa';
}

/** Soft-skip recent non-empty rejects to avoid burning Flash Lite on the same pair. */
export function isRecentlyRejected(loc: LocSnapshot, now = Date.now()): boolean {
  if (!loc || loc.translationStatus !== 'rejected') return false;
  if (isTestLocalization(loc)) return false;
  const body = loc.localizedContent;
  // Empty husks (killed mid-flight) are retryable — not "recent reject".
  if (typeof body === 'string' && !body.trim()) return false;
  const hardFail = /\|error:|ai_fail|hard:/i.test(loc.translatorModel || '');
  if (hardFail) return false;
  const t = Date.parse(loc.translatedAt || '');
  if (!Number.isFinite(t)) return true;
  return now - t < RECENT_REJECT_MS;
}

export function localeEligible(
  loc: LocSnapshot,
  opts?: { now?: number },
): { ok: boolean; reason?: string } {
  if (isPublishedLocalization(loc)) return { ok: false, reason: 'already_published' };
  if (isInProgressLocalization(loc)) return { ok: false, reason: 'in_progress' };
  if (isRecentlyRejected(loc, opts?.now)) return { ok: false, reason: 'recent_reject' };
  return { ok: true };
}

export function computeCoverage(
  articles: ArchiveArticleInput[],
  getLocalization: (articleId: string, language: LocalizationLanguage) => LocSnapshot,
): CoverageSnapshot {
  let withEn = 0;
  let withTr = 0;
  let ruTotal = 0;
  for (const a of articles) {
    if (!a.id || !a.title || !a.content) continue;
    ruTotal += 1;
    if (isPublishedLocalization(getLocalization(a.id, 'en'))) withEn += 1;
    if (isPublishedLocalization(getLocalization(a.id, 'tr'))) withTr += 1;
  }
  const enCoveragePct = ruTotal ? Math.round((withEn / ruTotal) * 1000) / 10 : 0;
  const trCoveragePct = ruTotal ? Math.round((withTr / ruTotal) * 1000) / 10 : 0;
  return {
    ruTotal,
    withEn,
    withTr,
    withoutEn: Math.max(0, ruTotal - withEn),
    withoutTr: Math.max(0, ruTotal - withTr),
    enCoveragePct,
    trCoveragePct,
  };
}

/**
 * Choose one missing locale for an article.
 * EN first when neither and coverages comparable; prefer worse-covered language when gap ≥ 5pp.
 */
export function chooseArchiveLanguage(
  enDone: boolean,
  trDone: boolean,
  coverage: CoverageSnapshot,
): LocalizationLanguage | null {
  if (enDone && trDone) return null;
  if (enDone && !trDone) return 'tr';
  if (!enDone && trDone) return 'en';
  // neither
  const enFrac = coverage.ruTotal ? coverage.withEn / coverage.ruTotal : 0;
  const trFrac = coverage.ruTotal ? coverage.withTr / coverage.ruTotal : 0;
  if (trFrac + COVERAGE_GAP < enFrac) return 'tr';
  if (enFrac + COVERAGE_GAP < trFrac) return 'en';
  return 'en';
}

function scoreArticleValue(
  article: ArchiveArticleInput,
  now = Date.now(),
): { score: number; factors: string[] } {
  const text = `${article.summary || ''}\n${(article.content || '').slice(0, 1200)}`;
  const hay = `${article.title}\n${article.category || ''}\n${(article.tags || []).join(' ')}\n${text}`;
  const factors: string[] = [];
  let score = 40;

  const door = detectHumanDoor(article.title, text);
  const grey = isGreyGadgetNoise(article.title, text);
  const share = isShareWorthyStory(article.title, text);

  if (door !== 'none') {
    score += 28;
    factors.push(`door:${door}`);
  } else if (share) {
    score += 16;
    factors.push('share_worthy');
  } else {
    factors.push('no_door');
  }

  if (grey && door === 'none') {
    score -= 45;
    factors.push('grey_noise');
  } else if (grey) {
    score -= 8;
    factors.push('grey_cleared');
  }

  if (THEME_VALUE_RE.test(hay)) {
    score += 14;
    factors.push('theme_value');
  }
  if (COMMODITY_REFRESH_RE.test(hay)) {
    score -= 18;
    factors.push('commodity_refresh');
  }

  const cat = (article.category || '').toLowerCase();
  // cat:Роботы must NOT itself boost — soft diversity handles robot saturation.
  if (/робот|robot/i.test(cat)) {
    factors.push('cat_robots_no_boost');
  } else if (/здоров|health|приложен|app|наук|science|дом|home|изобрет|mobile|энерг/i.test(cat)) {
    score += 8;
    factors.push(`cat:${article.category}`);
  }
  if (/гаджет|gadget|новинк/i.test(cat) && door === 'none' && !share) {
    score -= 6;
    factors.push('cat_gadget_soft');
  }

  const publishedMs = Date.parse(article.publishedAt || '');
  if (Number.isFinite(publishedMs)) {
    const ageDays = (now - publishedMs) / (24 * MS_HOUR);
    if (ageDays >= 3 && ageDays <= 180) {
      score += 12;
      factors.push(`evergreen_age:${Math.round(ageDays)}d`);
    } else if (ageDays < 1) {
      score -= 4;
      factors.push('too_fresh');
    } else if (ageDays > 400) {
      score -= 10;
      factors.push(`stale:${Math.round(ageDays)}d`);
    } else {
      factors.push(`age:${Math.round(ageDays)}d`);
    }
  }

  const bodyLen = (article.content || '').trim().length;
  if (bodyLen >= 800) {
    score += 4;
    factors.push('body_ok');
  } else if (bodyLen < 200) {
    score -= 20;
    factors.push('body_thin');
  }

  // Mild tie-break: slightly prefer newer among equals (not newest-first primary).
  if (Number.isFinite(publishedMs)) {
    const ageHours = Math.max(0, (now - publishedMs) / MS_HOUR);
    score += Math.max(0, 3 - ageHours / (24 * 30));
  }

  return { score, factors };
}

/**
 * Rank archive translation jobs: one locale per article, value + coverage + soft
 * topic diversity vs recent archive jobs. No LLM / no extra AI calls.
 */
export function pickArchiveTranslationJobs<T extends ArchiveArticleInput>(
  articles: T[],
  opts: {
    getLocalization: (articleId: string, language: LocalizationLanguage) => LocSnapshot;
    limit?: number;
    now?: number;
    coverage?: CoverageSnapshot;
    /** Override recent archive themes (tests). Default: last ~5–10 archive jobs. */
    recentTopics?: ArchiveTopic[];
  },
): ArchiveTranslateJob<T>[] {
  const limit = Math.max(1, Math.min(opts.limit ?? 1, 20));
  const now = opts.now ?? Date.now();
  const coverage = opts.coverage ?? computeCoverage(articles, opts.getLocalization);
  const enFrac = coverage.ruTotal ? coverage.withEn / coverage.ruTotal : 0;
  const trFrac = coverage.ruTotal ? coverage.withTr / coverage.ruTotal : 0;
  const recentTopics =
    opts.recentTopics ??
    collectRecentArchiveTopics(articles, opts.getLocalization, { limit: RECENT_ARCHIVE_JOBS, now });

  const scored: ArchiveTranslateJob<T>[] = [];

  for (const article of articles) {
    if (!article.id || !article.title || !article.content) continue;

    const en = opts.getLocalization(article.id, 'en');
    const tr = opts.getLocalization(article.id, 'tr');
    const enDone = isPublishedLocalization(en);
    const trDone = isPublishedLocalization(tr);
    const language = chooseArchiveLanguage(enDone, trDone, coverage);
    if (!language) continue;

    const loc = language === 'en' ? en : tr;
    const elig = localeEligible(loc, { now });
    if (!elig.ok) continue;

    // Other locale in-progress → still ok to translate the missing one.
    const { score: rawValue, factors } = scoreArticleValue(article, now);
    const topic = classifyArchiveTopic(article);
    const { modifier: diversityModifier, factor: divFactor } = archiveDiversityModifier(
      topic,
      recentTopics,
    );
    let valueScore = rawValue;
    let score = rawValue;
    const why = [...factors, `topic:${topic}`, divFactor];

    if (language === 'tr' && trFrac + COVERAGE_GAP < enFrac) {
      score += 10;
      valueScore += 10;
      why.push(`coverage_balance:tr_behind(${coverage.trCoveragePct}%<${coverage.enCoveragePct}%)`);
    } else if (language === 'en' && enFrac + COVERAGE_GAP < trFrac) {
      score += 10;
      valueScore += 10;
      why.push(`coverage_balance:en_behind(${coverage.enCoveragePct}%<${coverage.trCoveragePct}%)`);
    } else if (!enDone && !trDone) {
      why.push(language === 'en' ? 'en_first_neither' : 'tr_neither_lag');
    } else if (enDone && !trDone) {
      why.push('tr_only_missing');
    } else if (!enDone && trDone) {
      why.push('en_only_missing');
    }

    score += diversityModifier;
    why.push(`lang:${language}`);
    scored.push({
      article,
      language,
      score,
      factors: why,
      topic,
      valueScore,
      diversityModifier,
    });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ta = Date.parse(a.article.publishedAt || '') || 0;
    const tb = Date.parse(b.article.publishedAt || '') || 0;
    return tb - ta;
  });

  // Dedup article+locale (already unique per article) and article id once.
  const seenArticle = new Set<string>();
  const seenPair = new Set<string>();
  const out: ArchiveTranslateJob<T>[] = [];
  for (const job of scored) {
    const pair = `${job.article.id}:${job.language}`;
    if (seenPair.has(pair) || seenArticle.has(job.article.id)) continue;
    seenPair.add(pair);
    seenArticle.add(job.article.id);
    out.push(job);
    if (out.length >= limit) break;
  }
  return out;
}

/** Back-compat: articles only (language chosen inside drip). */
export function pickArticlesNeedingTranslationRanked<T extends ArchiveArticleInput>(
  articles: T[],
  opts: {
    getLocalization: (articleId: string, language: LocalizationLanguage) => LocSnapshot;
    limit?: number;
  },
): T[] {
  return pickArchiveTranslationJobs(articles, opts).map((j) => j.article);
}
