/**
 * SP-A-065F — Cross-tick diversity guard (lightweight).
 * Soft preference away from repeating robotics/research publishes — not a hard ban.
 * Strengthened: trigger after 1 recent robotics publish (was 2); tighter margin.
 * Topic saturation: soft prefer underrepresented focuses among last ~3–5 publishes
 * when scores are comparable; never hard-ban; strong always beats weak.
 */

export type EditorialFocus =
  | 'robotics_research'
  | 'consumer_gadget'
  | 'mobility'
  | 'healthtech'
  | 'smart_home'
  | 'ai_future'
  | 'china'
  | 'unusual_invention'
  | 'energy_sat'
  | 'other';

export interface FocusArticleLike {
  title?: string;
  summary?: string;
  content?: string;
  tags?: string[];
  sourceUrl?: string;
  category?: string;
}

const ROBOTICS_RE =
  /\b(robot|robotics|humanoid|manipulat|exoskeleton|tactile|csail|ieee spectrum robotics|therobotreport|robot report)\b|робот/i;
const RESEARCH_RE =
  /\b(research|lab\s+demo|prototype|peer[- ]reviewed|university|scientists?|optical tech|machine learning system)\b|исследован|лаборатор/i;
const MOBILITY_RE =
  /\b(ev\b|electric vehicle|e-?bike|e-?scooter|micromobility|solid[- ]state batter|ev charging|charging station|vtol|avionics|autonomous car)\b|дрон|электромобил|электросамокат/i;
const HEALTH_RE =
  /\b(health|medical|hospital|patient|bassinet|wearable.?health|wellness|glucose|cgm)\b|медицин|здоров|глюкоз/i;
const ENERGY_SAT_RE =
  /\b(solar|photovoltaic|home battery|starlink|direct[- ]to[- ]cell|satellite (internet|phone|broadband))\b|солнечн|старлинк|спутник/i;
const SMARTHOME_RE = /\b(smart home|irrigation|thermostat|doorbell|watering|bassinet)\b|умн\w*\s+дом|полив/i;
const AI_FUTURE_RE =
  /\b(ai model|llm|chatgpt|claude|gemini|agentic|frontier model|on-device ai|neural)\b|искусственн\w*\s+интеллект|\bии\b/i;
const CHINA_RE = /\b(china|chinese|xiaomi|huawei|oppo|vivo|iqoo|technode|shenzhen)\b|китай/i;
const UNUSUAL_RE =
  /\b(wristband|neuromuscular|gesture|foldable|translator|invention|unusual)\b|браслет|изобретен/i;
const CONSUMER_RE =
  /\b(gadget|keyboard|phone|smartphone|earbuds|headphones|monitor|charger|crowdfund|app\b|wearable|camera)\b|гаджет|клавиатур|смартфон|приложен/i;

export function inferEditorialFocus(input: {
  title?: string;
  text?: string;
  sourceName?: string;
  tags?: string[];
  sourceUrl?: string;
}): EditorialFocus {
  const hay = [
    input.title || '',
    input.text || '',
    input.sourceName || '',
    input.sourceUrl || '',
    ...(input.tags || []),
  ]
    .join('\n')
    .slice(0, 2500);

  const src = (input.sourceName || '').toLowerCase();
  if (
    src.includes('robot report') ||
    src.includes('ieee spectrum robotics') ||
    src.includes('mit csail') ||
    src.includes('eth zurich')
  ) {
    if (ROBOTICS_RE.test(hay) || RESEARCH_RE.test(hay) || /robot/i.test(hay)) {
      return 'robotics_research';
    }
  }

  if (ROBOTICS_RE.test(hay) && (RESEARCH_RE.test(hay) || /robot/i.test(hay))) {
    return 'robotics_research';
  }
  if (CHINA_RE.test(hay) && !ROBOTICS_RE.test(hay)) return 'china';
  if (MOBILITY_RE.test(hay)) return 'mobility';
  if (HEALTH_RE.test(hay) && !ROBOTICS_RE.test(hay)) return 'healthtech';
  if (ENERGY_SAT_RE.test(hay) && !ROBOTICS_RE.test(hay)) return 'energy_sat';
  if (SMARTHOME_RE.test(hay) && !ROBOTICS_RE.test(hay)) return 'smart_home';
  if (UNUSUAL_RE.test(hay)) return 'unusual_invention';
  if (AI_FUTURE_RE.test(hay) && !ROBOTICS_RE.test(hay)) return 'ai_future';
  if (CONSUMER_RE.test(hay)) return 'consumer_gadget';
  if (ROBOTICS_RE.test(hay)) return 'robotics_research';
  return 'other';
}

/** Count focus frequency among last n publishes (default 5). */
export function recentFocusCounts(
  recent: FocusArticleLike[],
  n = 5,
): Map<EditorialFocus, number> {
  const counts = new Map<EditorialFocus, number>();
  for (const a of recent.slice(0, n)) {
    const f = focusOfArticle(a);
    counts.set(f, (counts.get(f) || 0) + 1);
  }
  return counts;
}

/**
 * Soft topic-saturation reordering among comparable scores.
 * Never hard-bans. If best leads second by ≥ comparableMargin, best wins.
 * Otherwise prefer the passer whose focus appears less in recent publishes.
 */
export function applyTopicSaturationBias<T>(opts: {
  passers: DiversityPasser<T>[];
  recent: FocusArticleLike[];
  recentWindow?: number;
  /** Scores within this gap are "comparable" (default 5). */
  comparableMargin?: number;
}): { ordered: DiversityPasser<T>[]; modifier: string } {
  const window = opts.recentWindow ?? 5;
  const margin = opts.comparableMargin ?? 5;
  const ordered = [...opts.passers].sort((a, b) => b.score - a.score);
  if (ordered.length < 2) {
    return { ordered, modifier: 'n/a (fewer than 2 passers)' };
  }

  const counts = recentFocusCounts(opts.recent, window);
  const best = ordered[0]!;
  const alt = ordered.find((p) => p.focus !== best.focus) || ordered[1]!;
  if (best.score - alt.score >= margin) {
    return {
      ordered,
      modifier: `strong beats weak — ${best.focus} ${best.score} leads ${alt.focus} ${alt.score} by ≥${margin}`,
    };
  }

  const bestCount = counts.get(best.focus) || 0;
  const altCount = counts.get(alt.focus) || 0;
  if (altCount < bestCount) {
    const rest = ordered.filter((p) => p !== alt);
    return {
      ordered: [alt, ...rest],
      modifier: `soft saturation — prefer underrepresented ${alt.focus} (${altCount}/${window} recent) over ${best.focus} (${bestCount}/${window}); scores ${alt.score} vs ${best.score}`,
    };
  }

  return {
    ordered,
    modifier: `saturation neutral — keep ${best.focus} ${best.score} (recent ${bestCount} vs ${alt.focus} ${altCount})`,
  };
}

export function focusOfArticle(a: FocusArticleLike): EditorialFocus {
  return inferEditorialFocus({
    title: a.title,
    text: `${a.summary || ''}\n${(a.content || '').slice(0, 500)}`,
    tags: a.tags,
    sourceUrl: a.sourceUrl,
  });
}

/** True when the last n publishes are robotics/research (default n=1). */
export function roboticsResearchStreak(recent: FocusArticleLike[], n = 1): boolean {
  if (recent.length < n) return false;
  return recent.slice(0, n).every((a) => focusOfArticle(a) === 'robotics_research');
}

export interface DiversityPasser<T> {
  item: T;
  score: number;
  focus: EditorialFocus;
}

/**
 * Pick publish winner among Scout passers (≥ floor).
 * When the last publish was robotics/research:
 * prefer other focus ≥ floor, unless robotics leads by ≥ advantageMargin.
 */
export function pickDiversityWinner<T>(opts: {
  passers: DiversityPasser<T>[];
  recent: FocusArticleLike[];
  advantageMargin?: number;
  /** Soft topic saturation among last ~3–5 publishes (default on). */
  topicSaturation?: boolean;
}): { winner: DiversityPasser<T> | null; reason: string; streak: boolean } {
  const margin = opts.advantageMargin ?? 6;
  const streak = roboticsResearchStreak(opts.recent, 1);
  let passers = [...opts.passers].sort((a, b) => b.score - a.score);
  if (!passers.length) return { winner: null, reason: 'no passers', streak };

  if (!streak) {
    // Soft bias: if top is robotics and a broader desk is within margin, prefer breadth.
    const best = passers[0]!;
    if (best.focus === 'robotics_research') {
      const other = passers.find((p) => p.focus !== 'robotics_research');
      if (other && best.score - other.score < margin) {
        return {
          winner: other,
          reason: `soft breadth — prefer ${other.focus} ${other.score} over close robotics ${best.score}`,
          streak,
        };
      }
    }

    if (opts.topicSaturation !== false) {
      const sat = applyTopicSaturationBias({
        passers,
        recent: opts.recent,
        recentWindow: 5,
        comparableMargin: 5,
      });
      passers = sat.ordered;
      const pick = passers[0]!;
      if (pick !== best) {
        return {
          winner: pick,
          reason: `no robotics streak — ${sat.modifier}`,
          streak,
        };
      }
      return {
        winner: pick,
        reason: `no robotics streak — take highest passer (${pick.focus} ${pick.score}); ${sat.modifier}`,
        streak,
      };
    }

    return {
      winner: best,
      reason: `no robotics streak — take highest passer (${best.focus} ${best.score})`,
      streak,
    };
  }

  const robots = passers.filter((p) => p.focus === 'robotics_research');
  const others = passers.filter((p) => p.focus !== 'robotics_research');

  if (others.length && robots.length) {
    const bestR = robots[0];
    const bestO = others[0];
    if (bestR.score >= bestO.score + margin) {
      return {
        winner: bestR,
        reason: `robotics streak but outstanding +${bestR.score - bestO.score} (≥${margin}) vs ${bestO.focus}`,
        streak,
      };
    }
    return {
      winner: bestO,
      reason: `robotics streak — prefer ${bestO.focus} ${bestO.score} over robotics ${bestR.score}`,
      streak,
    };
  }
  if (others.length) {
    return {
      winner: others[0],
      reason: `robotics streak — only non-robotics passer ${others[0].focus} ${others[0].score}`,
      streak,
    };
  }
  return {
    winner: robots[0] || passers[0],
    reason: `robotics streak — no other focus ≥floor; allow robotics ${passers[0].score}`,
    streak,
  };
}

/** Simulation helper for control tests. */
export function simulateDiversitySequence(
  recentBefore: FocusArticleLike[],
  incoming: { title: string; text?: string; sourceName?: string; score: number }[],
  advantageMargin = 6,
): { before: EditorialFocus[]; picks: { title: string; focus: EditorialFocus; reason: string }[] } {
  const recent = [...recentBefore];
  const before = recent.slice(0, 5).map(focusOfArticle);
  const picks: { title: string; focus: EditorialFocus; reason: string }[] = [];
  // Process incoming as one tick's passers
  const passers = incoming.map((c) => ({
    item: c,
    score: c.score,
    focus: inferEditorialFocus(c),
  }));
  const { winner, reason } = pickDiversityWinner({
    passers,
    recent,
    advantageMargin,
  });
  if (winner) {
    picks.push({ title: winner.item.title, focus: winner.focus, reason });
    recent.unshift({
      title: winner.item.title,
      summary: winner.item.text,
      tags: [],
      sourceUrl: '',
    });
  }
  return { before, picks };
}
