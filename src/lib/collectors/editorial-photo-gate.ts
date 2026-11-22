/**
 * Magazine hero gate — a technically “authentic” lab snapshot can still kill
 * the article (paper figure with inset, on-skin close-up, 1990s PCB).
 * Prefer the category banner over a photo that makes the page look amateur.
 */

import { looksLikeStaleBreadboardPhoto } from '@/lib/visual-fallback';

export type MagazineHeroGate = { ok: true } | { ok: false; reason: string };

const PAPER_FIGURE_RE =
  /figshare|acs\.org|rsc\.org|onlinelibrary\.wiley|springernature|elifesciences|frontiersin\.org|mdpi\.com\/.+\/article|cell\.com\/.+\/fig|nature\.com\/.+\/(?:fig|extref|media)|science\.org\/doi|ieeexplore\.ieee\.org|nih\.gov\/pmc|arxiv\.org\/html|\/figures?[-_/]?\d|fig[-_]?\d{1,3}[-_.]|si[-_]fig|toc[-_]?(graphic|image)|graphical[-_]?abstract|supplementar/i;

const INSET_PANEL_RE =
  /\binset\b|multi[-_]?panel|figure[-_]?panel|composite[-_]?fig|рис\.?\s*\d|fig(?:ure)?\s*\d+[a-d]\b/i;

const ON_BODY_CLINICAL_RE =
  /\b(on[-_ ]?skin|epiderm|abdomen|belly|navel|forearm|torso|skin[-_ ]?patch|e[-_]?skin|electronic\s+skin|hydrogel|tattoo[-_ ]?elec|wearable[-_ ]?patch|flex(?:ible)?[-_ ]?pcb[-_ ]?on)\b|на\s+коже|живот|эпидерм/i;

const ON_BODY_STORY_RE =
  /\b(on[- ]?skin|epiderm|flexible\s+display|near[- ]?infrared|near[- ]?ir\b|bilingual\s+display|shared\s+signal|electronic\s+skin|e[- ]?skin|skin[- ]?patch|гибк\w*\s+диспле|двуязычн\w*\s+диспле|на\s+коже)\b/i;

export function looksLikePaperFigureUrl(...parts: Array<string | undefined | null>): boolean {
  return PAPER_FIGURE_RE.test(parts.filter(Boolean).join('\n'));
}

export function looksLikeOnBodyClinicalPhoto(...parts: Array<string | undefined | null>): boolean {
  return ON_BODY_CLINICAL_RE.test(parts.filter(Boolean).join('\n'));
}

export function storyPrefersBannerOverLabSnap(opts: {
  title?: string;
  summary?: string;
  tags?: string[];
  category?: string;
}): boolean {
  const hay = [opts.title, opts.summary, opts.category, ...(opts.tags || [])]
    .filter(Boolean)
    .join('\n');
  return ON_BODY_STORY_RE.test(hay);
}

/**
 * Sync. Reject heroes that read as journal figures, clinical skin close-ups,
 * or the old jumper-PCB stock — even when they are “the real device”.
 */
export function magazineHeroGate(opts: {
  articleTitle?: string;
  articleSummary?: string;
  articleTags?: string[];
  articleCategory?: string;
  articleSourceUrl?: string;
  heroUrl?: string;
  photoSourceUrls?: Array<string | undefined | null>;
  photoContext?: string;
}): MagazineHeroGate {
  const hero = opts.heroUrl || '';
  const sources = (opts.photoSourceUrls || []).filter(Boolean).join('\n');
  const blob = [hero, sources, opts.photoContext, opts.articleSourceUrl].filter(Boolean).join('\n');
  const story = {
    title: opts.articleTitle,
    summary: opts.articleSummary,
    tags: opts.articleTags,
    category: opts.articleCategory,
  };

  if (looksLikeStaleBreadboardPhoto(hero, sources, opts.photoContext)) {
    return { ok: false, reason: 'stale breadboard / muddy PCB stock' };
  }
  if (looksLikePaperFigureUrl(blob)) {
    return { ok: false, reason: 'journal figure / supplementary panel' };
  }
  if (INSET_PANEL_RE.test(blob)) {
    return { ok: false, reason: 'inset / multi-panel paper figure' };
  }
  if (looksLikeOnBodyClinicalPhoto(blob) || storyPrefersBannerOverLabSnap(story)) {
    return { ok: false, reason: 'on-skin / clinical lab snapshot' };
  }
  return { ok: true };
}
