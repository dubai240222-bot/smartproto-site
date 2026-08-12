/**
 * SP-A-095 — human-readable source labels for disclosure UI.
 * Maps known hosts to editorial names; never invents missing contact email.
 */

import { RSS_SOURCES } from '@/lib/collectors/source-registry';

/** Extra host → display name (covers aliases not derived from feed URLs). */
const HOST_LABELS: Record<string, string> = {
  'news.mit.edu': 'MIT News',
  'mit.edu': 'MIT News',
  'csail.mit.edu': 'MIT CSAIL',
  'spectrum.ieee.org': 'IEEE Spectrum',
  'ieee.org': 'IEEE Spectrum',
  'techcrunch.com': 'TechCrunch',
  'openai.com': 'OpenAI',
  'forklog.com': 'ForkLog',
  'newatlas.com': 'New Atlas',
  'yankodesign.com': 'Yanko Design',
  'thegadgetflow.com': 'Gadget Flow',
  'hackaday.com': 'Hackaday',
  'theverge.com': 'The Verge',
  'engadget.com': 'Engadget',
  '9to5google.com': '9to5Google',
  'androidauthority.com': 'Android Authority',
  'technode.com': 'TechNode',
  'therobotreport.com': 'The Robot Report',
  'techxplore.com': 'Tech Xplore',
  'wyss.harvard.edu': 'Harvard Wyss Institute',
  'ethz.ch': 'ETH Zurich',
  'ithome.com': 'IT Home',
  'eurekalert.org': 'EurekAlert',
};

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function buildHostIndex(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [host, name] of Object.entries(HOST_LABELS)) {
    map.set(host, name);
  }
  for (const src of RSS_SOURCES) {
    const host = hostnameOf(src.feedUrl);
    if (!host) continue;
    // Prefer shorter display names from HOST_LABELS when present.
    if (!map.has(host)) {
      // Collapse "New Atlas Electronics" → still fine as registry name for that feed host.
      map.set(host, src.name.replace(/\s+(Electronics|Wearables|Gadgets|Robotics)$/i, ''));
    }
  }
  return map;
}

const HOST_INDEX = buildHostIndex();

/** Resolve a friendly source name from a URL. Falls back to bare hostname. */
export function sourceLabelFromUrl(url: string): string {
  const host = hostnameOf(url);
  if (!host) return url;

  const exact = HOST_INDEX.get(host);
  if (exact) return exact;

  // Match parent domain (e.g. blogs.nvidia.com → nvidia.com if mapped).
  const parts = host.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    const name = HOST_INDEX.get(candidate);
    if (name) return name;
  }

  return host;
}

export interface DisclosureSource {
  label: string;
  url: string;
}

/**
 * Build disclosure list for an article.
 * Today articles carry a single sourceUrl; keep room for multiple confirmations.
 */
export function disclosureSources(input: {
  sourceUrl?: string | null;
  extraUrls?: string[] | null;
}): DisclosureSource[] {
  const seen = new Set<string>();
  const out: DisclosureSource[] = [];

  const push = (raw?: string | null) => {
    const url = (raw || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) return;
    let key = url;
    try {
      key = new URL(url).href;
    } catch {
      /* keep raw */
    }
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label: sourceLabelFromUrl(url), url });
  };

  push(input.sourceUrl);
  for (const u of input.extraUrls || []) push(u);
  return out;
}
