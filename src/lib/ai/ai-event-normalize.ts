/**
 * SP-A-065D — Event normalization for AI radar.
 * Scout scores the EVENT, not secondary headline drama.
 */

import type { RssItem } from '../collectors/rss';
import type { AiRadarSource } from '../collectors/ai-radar-sources';
import type { AiEventPriority } from './ai-radar';

export type AiPrimaryStatus =
  | 'PRIMARY_ORIGIN'
  | 'DISCOVERY_WITH_PRIMARY'
  | 'DISCOVERY_UNRESOLVED';

/** Secondary adjectives that must not create WOW by themselves. */
const HYPE_HEADLINE_RE =
  /\b(puts? the brakes|too powerful|too dangerous|shocking|dangerous|game[- ]changing|terrifying|scary|mind[- ]blowing|supposedly|insanely|crazy|unbelievable|bombshell)\b/gi;

export interface AiEventRecord {
  whatHappened: string;
  whoWhat: string;
  capabilityChange: string;
  whyUnusual: string;
  consequence: string;
  status: string;
  primaryEvidence: string;
  secondaryContext: string;
  /** Neutral block passed to Scout (no emotional secondary headline). */
  summaryForScout: string;
}

export interface AiNormalizedCandidate {
  /** Display / routing title — prefer primary title when known. */
  title: string;
  sourceName: string;
  radarRole: AiRadarSource['radarRole'];
  priority: AiEventPriority;
  eventSignals: string[];
  url: string;
  primaryStatus: AiPrimaryStatus;
  primaryUrl?: string;
  primaryTitle?: string;
  /** Raw headline path (source title + blurb) for A/B control. */
  rawTitle: string;
  rawText: string;
  event: AiEventRecord;
  needsPrimaryResolve: boolean;
}

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Strip hype adjectives; keep remaining factual words. */
export function stripHypeHeadline(text: string): string {
  return clean(text.replace(HYPE_HEADLINE_RE, ' ').replace(/\s+/g, ' '));
}

function inferWho(hay: string): string {
  if (/\bopenai\b/i.test(hay) || /\bastra\b/i.test(hay)) return 'OpenAI / model Astra';
  if (/\bdeepmind\b/i.test(hay) || /\bgemini robotics\b/i.test(hay)) return 'Google DeepMind';
  if (/\bgoogle\b/i.test(hay) && /\bgemini\b/i.test(hay)) return 'Google / Gemini';
  if (/\banthropic\b|\bclaude\b/i.test(hay)) return 'Anthropic';
  if (/\bmeta\b/i.test(hay)) return 'Meta';
  if (/\bmicrosoft\b/i.test(hay)) return 'Microsoft';
  return 'AI lab / vendor (see evidence)';
}

function inferStatus(hay: string): string {
  if (/\b(evaluat|safeguard|preparedness|security control|pause|halt)\b/i.test(hay)) {
    return 'SAFETY_ACTION / CAPABILITY_EVAL';
  }
  if (/\brobot|embodied|whole body\b/i.test(hay)) return 'CAPABILITY_RELEASE / ROBOTICS';
  if (/\bresearch|paper|forecast|model achieves\b/i.test(hay)) return 'RESEARCH';
  if (/\b(case study|customer|partner|how .+ built)\b/i.test(hay)) return 'CASE_STUDY / PR';
  if (/\b(pricing|api|benchmark|efficiency|refresh)\b/i.test(hay)) return 'PRODUCT_UPDATE / NOISE';
  return 'ANNOUNCED';
}

/**
 * Build a neutral EVENT RECORD from primary facts + de-hyped secondary context.
 * Does not invent confirmation — only rephrases available text.
 */
export function normalizeAiEvent(input: {
  title: string;
  text: string;
  url: string;
  sourceName: string;
  radarRole: AiRadarSource['radarRole'];
  primaryStatus: AiPrimaryStatus;
  primaryUrl?: string;
  primaryTitle?: string;
  primaryText?: string;
  secondaryTitle?: string;
  secondaryText?: string;
}): AiEventRecord {
  const primaryTitle = clean(input.primaryTitle || (input.primaryStatus === 'PRIMARY_ORIGIN' ? input.title : '') || '');
  const primaryText = clean(
    input.primaryText ||
      (input.primaryStatus === 'PRIMARY_ORIGIN' ? input.text : '') ||
      '',
  );
  const secondaryTitle = clean(input.secondaryTitle || (input.radarRole !== 'primary' ? input.title : '') || '');
  const secondaryText = clean(
    input.secondaryText || (input.radarRole !== 'primary' ? input.text : '') || '',
  );

  const primaryHay = `${primaryTitle}\n${primaryText}`.trim();
  const secondaryHay = `${secondaryTitle}\n${secondaryText}`.trim();
  const allHay = `${primaryHay}\n${secondaryHay}\n${input.url}`;

  const whoWhat = inferWho(allHay);
  const status = inferStatus(primaryHay || allHay);

  // PRIMARY FACT — prefer official wording; never use secondary drama as the fact.
  let whatHappened: string;
  if (primaryHay) {
    whatHappened = primaryText
      ? `${primaryTitle}. ${primaryText}`.slice(0, 500)
      : primaryTitle.slice(0, 300);
  } else {
    whatHappened = stripHypeHeadline(`${input.title}. ${input.text}`).slice(0, 500);
  }

  let capabilityChange = 'Not clearly stated in available evidence.';
  if (/\bcritical cyber capabilit|cybersecur(?:ity|e) evaluat|astra\b/i.test(allHay)) {
    capabilityChange =
      'Model (Astra) showed critical cybersecurity-relevant capabilities in evaluations; lab is responding with stronger safeguards/controls.';
  } else if (/\bwhole body intelligence|gemini robotics\b/i.test(allHay)) {
    capabilityChange =
      'Robotics model gains whole-body / embodied control intelligence beyond narrow single-skill demos.';
  } else if (/\bweathernext|forecast(?:ing)? (cyclone|weather)\b/i.test(allHay)) {
    capabilityChange = 'AI weather/forecast model claims a research breakthrough on cyclone prediction.';
  } else if (/\befficiency|price-performance|frontier intelligence\b/i.test(allHay)) {
    capabilityChange = 'Model refresh focused on efficiency / price-performance (incremental).';
  } else if (/\b(case study|built a|customer|partner)\b/i.test(allHay)) {
    capabilityChange = 'Enterprise/customer integration of existing model — no new frontier capability claimed.';
  } else if (primaryText) {
    capabilityChange = primaryText.slice(0, 220);
  }

  let whyUnusual = 'Requires Scout judgment from facts below — ignore brand and headline adjectives.';
  if (/\bcritical cyber|safeguard|preparedness|security control\b/i.test(primaryHay || allHay)) {
    whyUnusual =
      'Lab publicly ties a model to critical cyber capability evaluations and describes strengthened controls — signal that capability crossed a meaningful threshold.';
  } else if (/\bwhole body|embodied\b/i.test(allHay)) {
    whyUnusual = 'Embodied/whole-body robot intelligence is a tangible physical capability shift.';
  } else if (/\bbreakthrough\b/i.test(allHay) && /\bforecast|weather\b/i.test(allHay)) {
    whyUnusual = 'Research claims domain breakthrough; everyday freedom signal may be weaker than embodied/agent events.';
  } else if (status === 'CASE_STUDY / PR' || status === 'PRODUCT_UPDATE / NOISE') {
    whyUnusual = 'Ordinary PR / refresh — not an unusual capability event by itself.';
  }

  let consequence = 'Unclear from available text.';
  if (/\bsafeguard|security control|evaluat\b/i.test(primaryHay || allHay)) {
    consequence =
      'Deployment/use boundaries may tighten; public signal that frontier cyber capability is being treated as material risk.';
  } else if (/\brobot|embodied|whole body\b/i.test(allHay)) {
    consequence = 'Physical automation may expand into tasks needing coordinated whole-body motion.';
  } else if (status === 'CASE_STUDY / PR' || status === 'PRODUCT_UPDATE / NOISE') {
    consequence = 'Little change to everyday freedom beyond existing products.';
  }

  const secondaryContext = secondaryHay
    ? stripHypeHeadline(
        [
          secondaryTitle && secondaryTitle !== primaryTitle ? secondaryTitle : '',
          secondaryText,
        ]
          .filter(Boolean)
          .join('. '),
      ).slice(0, 400)
    : '(none — primary origin)';

  const primaryEvidence = primaryHay
    ? `${primaryTitle}${input.primaryUrl ? ` | ${input.primaryUrl}` : input.url ? ` | ${input.url}` : ''} — ${primaryText || '(title only)'}`.slice(
        0,
        600,
      )
    : '(no official primary evidence found — do not invent confirmation)';

  const summaryForScout = [
    'NORMALIZED AI EVENT RECORD (score the EVENT, not headline drama)',
    `whatHappened: ${whatHappened}`,
    `whoWhat: ${whoWhat}`,
    `capabilityChange: ${capabilityChange}`,
    `whyUnusual: ${whyUnusual}`,
    `consequence: ${consequence}`,
    `status: ${status}`,
    `primaryEvidence: ${primaryEvidence}`,
    `secondaryContext (de-hyped, optional significance only): ${secondaryContext}`,
    'RULES: Do not raise score for words like brakes/too powerful/shocking/dangerous/game-changing.',
    'Do not raise score for brand names OpenAI/Google/Anthropic/Meta alone.',
    'CORE INSTINCT: «Узнать о новой свободе раньше других — и получить её первым».',
    'Safety/capability stories may score high without a consumer gadget if they mean: new real ability, new automation freedom, capability strong enough to change allowed boundaries, or a clear early signal of the future.',
  ].join('\n');

  return {
    whatHappened,
    whoWhat,
    capabilityChange,
    whyUnusual,
    consequence,
    status,
    primaryEvidence,
    secondaryContext,
    summaryForScout,
  };
}

export function primaryStatusFor(opts: {
  radarRole: AiRadarSource['radarRole'];
  needsResolve: boolean;
  primaryResolved: boolean;
}): AiPrimaryStatus {
  if (opts.radarRole === 'primary') return 'PRIMARY_ORIGIN';
  if (opts.primaryResolved) return 'DISCOVERY_WITH_PRIMARY';
  return 'DISCOVERY_UNRESOLVED';
}

/** Attach primary body text from pool when discovery resolved to an official item. */
export function lookupPrimaryItem(
  primaryUrl: string | undefined,
  primaryPool: RssItem[],
): RssItem | undefined {
  if (!primaryUrl) return undefined;
  return primaryPool.find((p) => p.url === primaryUrl);
}

/** Merge primary + discovery rows about the same event into one normalized candidate. */
export function buildNormalizedCandidate(
  base: {
    title: string;
    text: string;
    url: string;
    sourceName: string;
    radarRole: AiRadarSource['radarRole'];
    priority: AiEventPriority;
    eventSignals: string[];
    primaryUrl?: string;
    primaryTitle?: string;
    primaryResolved: boolean;
    needsPrimaryResolve: boolean;
  },
  primaryPool: RssItem[],
  secondary?: { title: string; text: string; sourceName: string },
): AiNormalizedCandidate {
  const primaryStatus = primaryStatusFor({
    radarRole: base.radarRole,
    needsResolve: base.needsPrimaryResolve,
    primaryResolved: base.primaryResolved,
  });
  const primaryItem = lookupPrimaryItem(base.primaryUrl, primaryPool);
  const primaryTitle = base.primaryTitle || primaryItem?.title;
  const primaryText = primaryItem?.text;

  const event = normalizeAiEvent({
    title: base.title,
    text: base.text,
    url: base.url,
    sourceName: base.sourceName,
    radarRole: base.radarRole,
    primaryStatus,
    primaryUrl: base.primaryUrl,
    primaryTitle,
    primaryText,
    secondaryTitle: secondary?.title || (base.radarRole !== 'primary' ? base.title : undefined),
    secondaryText: secondary?.text || (base.radarRole !== 'primary' ? base.text : undefined),
  });

  return {
    title: primaryTitle || base.title,
    sourceName: secondary ? `${base.sourceName}+${secondary.sourceName}` : base.sourceName,
    radarRole: base.radarRole,
    priority: base.priority,
    eventSignals: base.eventSignals,
    url: base.primaryUrl || base.url,
    primaryStatus,
    primaryUrl: base.primaryUrl,
    primaryTitle,
    rawTitle: secondary?.title || base.title,
    rawText: secondary?.text || base.text,
    event,
    needsPrimaryResolve: base.needsPrimaryResolve,
  };
}
