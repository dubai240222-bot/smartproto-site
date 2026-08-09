/**
 * SP-A-064 — growing registry of known official / newsroom / lab domains.
 * Used by Photo Miners to follow primary-source links without a search API.
 * Extend as new manufacturers appear in the feed.
 */

export type OfficialKind = 'manufacturer' | 'newsroom' | 'presskit' | 'lab' | 'store';

export interface OfficialDomainEntry {
  domain: string;
  brandKeys: string[]; // lowercase match keys: "meta", "altar", "rainpoint"
  kind: OfficialKind;
}

/** Seed registry — safe, high-signal homes for product photography. */
export const OFFICIAL_DOMAIN_REGISTRY: OfficialDomainEntry[] = [
  { domain: 'about.meta.com', brandKeys: ['meta', 'facebook'], kind: 'newsroom' },
  { domain: 'meta.com', brandKeys: ['meta'], kind: 'manufacturer' },
  { domain: 'tech.facebook.com', brandKeys: ['meta', 'facebook'], kind: 'newsroom' },
  { domain: 'ai.meta.com', brandKeys: ['meta'], kind: 'lab' },
  { domain: 'www.meta.com', brandKeys: ['meta'], kind: 'manufacturer' },
  { domain: 'altar.computer', brandKeys: ['altar'], kind: 'manufacturer' },
  { domain: 'www.altar.computer', brandKeys: ['altar'], kind: 'manufacturer' },
  { domain: 'www.deltachildren.com', brandKeys: ['delta children', 'delta', 'aero'], kind: 'manufacturer' },
  { domain: 'deltachildren.com', brandKeys: ['delta children', 'delta'], kind: 'manufacturer' },
  { domain: 'www.rainpointonline.com', brandKeys: ['rainpoint'], kind: 'manufacturer' },
  { domain: 'rainpointonline.com', brandKeys: ['rainpoint'], kind: 'manufacturer' },
  { domain: 'www.myrainpoint.com', brandKeys: ['rainpoint'], kind: 'manufacturer' },
  { domain: 'iqoo.com', brandKeys: ['iqoo'], kind: 'manufacturer' },
  { domain: 'www.iqoo.com', brandKeys: ['iqoo'], kind: 'manufacturer' },
  { domain: 'www.insta360.com', brandKeys: ['insta360'], kind: 'manufacturer' },
  { domain: 'www.dji.com', brandKeys: ['dji'], kind: 'manufacturer' },
  { domain: 'www.apple.com', brandKeys: ['apple'], kind: 'manufacturer' },
  { domain: 'newsroom.apple.com', brandKeys: ['apple'], kind: 'newsroom' },
  { domain: 'blog.google', brandKeys: ['google'], kind: 'newsroom' },
  { domain: 'store.google.com', brandKeys: ['google'], kind: 'store' },
  { domain: 'www.samsung.com', brandKeys: ['samsung'], kind: 'manufacturer' },
  { domain: 'news.samsung.com', brandKeys: ['samsung'], kind: 'newsroom' },
  { domain: 'www.sony.com', brandKeys: ['sony'], kind: 'manufacturer' },
  { domain: 'www.lenovo.com', brandKeys: ['lenovo'], kind: 'manufacturer' },
  { domain: 'www.asus.com', brandKeys: ['asus'], kind: 'manufacturer' },
  { domain: 'rog.asus.com', brandKeys: ['asus', 'rog'], kind: 'manufacturer' },
  { domain: 'www.nothing.tech', brandKeys: ['nothing'], kind: 'manufacturer' },
  { domain: 'www.anker.com', brandKeys: ['anker'], kind: 'manufacturer' },
  { domain: 'www.gopro.com', brandKeys: ['gopro'], kind: 'manufacturer' },
  { domain: 'www.casio.com', brandKeys: ['casio'], kind: 'manufacturer' },
  { domain: 'www.lofree.co', brandKeys: ['lofree'], kind: 'manufacturer' },
  { domain: 'www.marantz.com', brandKeys: ['marantz'], kind: 'manufacturer' },
  { domain: 'www.fitbit.com', brandKeys: ['fitbit'], kind: 'manufacturer' },
  { domain: 'www.corsair.com', brandKeys: ['corsair'], kind: 'manufacturer' },
];

/** Trusted tech media — useful for press photos when official pages lack them. */
export const TRUSTED_MEDIA_HOSTS = new Set([
  'newatlas.com',
  'www.newatlas.com',
  'theverge.com',
  'www.theverge.com',
  'techcrunch.com',
  'www.techcrunch.com',
  'engadget.com',
  'www.engadget.com',
  'www.yankodesign.com',
  'yankodesign.com',
  'thegadgetflow.com',
  'www.thegadgetflow.com',
  'androidauthority.com',
  'www.androidauthority.com',
  '9to5google.com',
  'www.wired.com',
  'arstechnica.com',
  'www.theverge.com',
  'www.cnet.com',
  'www.digitaltrends.com',
]);

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function lookupOfficialDomains(brandHints: string[]): OfficialDomainEntry[] {
  const keys = brandHints.map((h) => h.toLowerCase().trim()).filter(Boolean);
  if (!keys.length) return [];
  return OFFICIAL_DOMAIN_REGISTRY.filter((e) =>
    e.brandKeys.some((bk) => keys.some((k) => k.includes(bk) || bk.includes(k))),
  );
}

export function classifyHostTier(
  host: string,
): 'official' | 'newsroom' | 'presskit' | 'lab' | 'trusted_media' | 'other' {
  const bare = host.replace(/^www\./, '');
  const hit = OFFICIAL_DOMAIN_REGISTRY.find(
    (e) => e.domain === host || e.domain === bare || e.domain.replace(/^www\./, '') === bare,
  );
  if (hit) {
    if (hit.kind === 'newsroom') return 'newsroom';
    if (hit.kind === 'presskit') return 'presskit';
    if (hit.kind === 'lab') return 'lab';
    return 'official';
  }
  if (TRUSTED_MEDIA_HOSTS.has(host) || TRUSTED_MEDIA_HOSTS.has(`www.${bare}`) || TRUSTED_MEDIA_HOSTS.has(bare)) {
    return 'trusted_media';
  }
  return 'other';
}
