/**
 * SP-A-065F — Cross-tick diversity guard (lightweight).
 * Soft preference away from repeating robotics/research publishes — not a hard ban.
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
const MOBILITY_RE = /\b(ev\b|electric vehicle|scooter|drone|vtol|avionics|autonomous car|mobility)\b|дрон|электромобил/i;
const HEALTH_RE = /\b(health|medical|hospital|patient|bassinet|wearable.?health|wellness)\b|медицин|здоров/i;
const SMARTHOME_RE = /\b(smart home|irrigation|thermostat|doorbell|watering|bassinet)\b|умн\w*\s+дом|полив/i;
const AI_FUTURE_RE =
  /\b(ai model|llm|chatgpt|claude|gemini|agentic|frontier model|on-device ai|neural)\b|искусственн\w*\s+интеллект|\bии\b/i;
const CHINA_RE = /\b(china|chinese|xiaomi|huawei|oppo|vivo|iqoo|technode|shenzhen)\b|китай/i;
const UNUSUAL_RE =
  /\b(wristband|neuromuscular|gesture|foldable|translator|invention|unusual)\b|браслет|изобретен/i;
const CONSUMER_RE =
  /\b(gadget|keyboard|phone|smartphone|earbuds|headphones|monitor|charger|crowdfund)\b|гаджет|клавиатур|смартфон/i;

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
  if (SMARTHOME_RE.test(hay) && !ROBOTICS_RE.test(hay)) return 'smart_home';
  if (UNUSUAL_RE.test(hay)) return 'unusual_invention';
  if (AI_FUTURE_RE.test(hay) && !ROBOTICS_RE.test(hay)) return 'ai_future';
  if (CONSUMER_RE.test(hay)) return 'consumer_gadget';
  if (ROBOTICS_RE.test(hay)) return 'robotics_research';
  return 'other';
}

export function focusOfArticle(a: FocusArticleLike): EditorialFocus {
  return inferEditorialFocus({
    title: a.title,
    text: `${a.summary || ''}\n${(a.content || '').slice(0, 500)}`,
    tags: a.tags,
    sourceUrl: a.sourceUrl,
  });
}

/** True when the last 2 publishes are both robotics/research. */
export function roboticsResearchStreak(recent: FocusArticleLike[], n = 2): boolean {
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
 * When robotics/research already filled last 2 publishes:
 * prefer other focus ≥ floor, unless robotics leads by ≥ advantageMargin.
 */
export function pickDiversityWinner<T>(opts: {
  passers: DiversityPasser<T>[];
  recent: FocusArticleLike[];
  advantageMargin?: number;
}): { winner: DiversityPasser<T> | null; reason: string; streak: boolean } {
  const margin = opts.advantageMargin ?? 10;
  const streak = roboticsResearchStreak(opts.recent, 2);
  const passers = [...opts.passers].sort((a, b) => b.score - a.score);
  if (!passers.length) return { winner: null, reason: 'no passers', streak };

  if (!streak) {
    return {
      winner: passers[0],
      reason: `no robotics streak — take highest passer (${passers[0].focus} ${passers[0].score})`,
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
  advantageMargin = 10,
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
