/**
 * SP-A-096 — cheap-first Reader Scout moderation (no AI).
 * UNTRUSTED public input → reject obvious abuse before editorial Scout/Editor spend.
 *
 * Legitimate tech journalism about sensitive topics (security, medical, defense)
 * must not be auto-blocked solely for topic keywords when the host looks editorial.
 */

export type ReaderModerationVerdict =
  | { ok: true; status: 'safe'; reason: string }
  | {
      ok: false;
      status: 'rejected_abuse' | 'rejected_spam' | 'rejected_unsafe';
      reason: string;
    };

/** Known editorial / research hosts — soft allow for sensitive-topic news framing. */
const TRUSTED_EDITORIAL_HOSTS = new Set(
  [
    'news.mit.edu',
    'mit.edu',
    'csail.mit.edu',
    'spectrum.ieee.org',
    'ieee.org',
    'techcrunch.com',
    'theverge.com',
    'engadget.com',
    'newatlas.com',
    'hackaday.com',
    'yankodesign.com',
    'thegadgetflow.com',
    'androidauthority.com',
    '9to5google.com',
    'technode.com',
    'therobotreport.com',
    'techxplore.com',
    'wyss.harvard.edu',
    'ethz.ch',
    'arxiv.org',
    'nature.com',
    'science.org',
    'sciencemag.org',
    'wired.com',
    'arstechnica.com',
    'reuters.com',
    'bbc.com',
    'bbc.co.uk',
    'theguardian.com',
    'nytimes.com',
    'washingtonpost.com',
    'openai.com',
    'deepmind.google',
    'blog.google',
    'nvidia.com',
    'microsoft.com',
    'apple.com',
    'amazon.science',
    'forklog.com',
    'ithome.com',
    'github.com',
    'gitlab.com',
    'huggingface.co',
  ].map((h) => h.toLowerCase()),
);

const SUSPICIOUS_TLDS = new Set([
  'xyz',
  'top',
  'click',
  'loan',
  'gq',
  'tk',
  'ml',
  'cf',
  'work',
  'zip',
  'mov',
  'country',
  'stream',
  'gdn',
  'pw',
  'cc',
  'icu',
  'buzz',
  'rest',
  'surf',
]);

const SHORTENER_HOSTS = new Set([
  'bit.ly',
  't.co',
  'tinyurl.com',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'cutt.ly',
  'rebrand.ly',
  'rb.gy',
  'shorturl.at',
]);

/** Hard unsafe — rarely legitimate as a submission destination. */
const UNSAFE_PATTERNS: RegExp[] = [
  /\b(porn|porno|pornography|xxx|onlyfans|fansly|camgirl|camboy|hentai|nsfw)\b/i,
  /\b(sex\s*cam|adult\s*video|escort\s*service|prostitut)/i,
  /\b(gore|beheading|snuff\s*film|graphic\s*violence)\b/i,
  /\b(child\s*porn|csam|underage\s*sex)\b/i,
  /\b(terrorist|terrorism\s*recruit|join\s*isis|make\s*a\s*bomb\s*at\s*home)\b/i,
  /\b(buy\s*weapons?|guns?\s*for\s*sale|ammo\s*for\s*sale|explosives?\s*for\s*sale|illegal\s*firearms?)\b/i,
  /\b(buy\s*(cocaine|heroin|fentanyl|meth|mdma|lsd)|drug\s*marketplace|darknet\s*market)\b/i,
  /\b(stolen\s*(cards?|goods|credentials)|counterfeit\s*(goods|passports?|ids?)|fake\s*id\s*shop)\b/i,
  /\b(phishing|steal\s*(passwords?|seed\s*phrase)|malware\s*download|rat\s*toolkit|credential\s*harvest)\b/i,
];

const SPAM_PATTERNS: RegExp[] = [
  /\b(casino|online\s*casino|slots?\s*bonus|betting\s*bonus|gambling)\b/i,
  /\b(ai\s*casino|crypto\s*casino|free\s*spins?|no\s*deposit\s*bonus)\b/i,
  /\b(forex\s*signal|guaranteed\s*profit|get\s*rich|passive\s*income\s*bot|investment\s*solicitation)\b/i,
  /\b(pump\s*and\s*dump|shitcoin|memecoin\s*presale|100x\s*gem)\b/i,
  /\b(buy\s*followers|cheap\s*backlinks|seo\s*spam|guest\s*post\s*service)\b/i,
  /\b(affiliate\s*(offer|link|program)|sponsored\s*post\s*for\s*sale)\b/i,
  /\b(viagra|cialis|male\s*enhancement)\b/i,
  /\b(work\s*from\s*home\s*\$|make\s*\$\d+[k]?\s*\/?\s*(day|week))\b/i,
];

const ABUSE_PATTERNS: RegExp[] = [
  /\b(click\s*here\s*now|limited\s*offer|act\s*now|weight\s*loss\s*miracle)\b/i,
  /\b(telegram\s*channel\s*subscribe|whatsapp\s*group\s*join)\s*.{0,40}\b(invest|crypto|casino)\b/i,
];

/** Soft journalistic allow — sensitive topic + editorial framing. */
const LEGIT_TECH_CONTEXT: RegExp[] = [
  /\b(research|study|paper|journal|university|institute|lab|scientist)\b/i,
  /\b(cybersecurity|infosec|vulnerability|cve|malware\s*analysis|threat\s*detection)\b/i,
  /\b(moderation|content\s*safety|detection\s*model|safety\s*tech)\b/i,
  /\b(medical|clinical|biotech|healthtech|fda|trial)\b/i,
  /\b(defense\s*tech|military\s*technology|autonomous\s*systems?\s*policy)\b/i,
  /\b(robotics?|prototype|engineering|open[\s-]?source|hardware|ai\s*model)\b/i,
];

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function tldOf(host: string): string {
  const parts = host.split('.');
  return parts[parts.length - 1] || '';
}

function isTrustedHost(host: string): boolean {
  if (TRUSTED_EDITORIAL_HOSTS.has(host)) return true;
  for (const trusted of TRUSTED_EDITORIAL_HOSTS) {
    if (host.endsWith(`.${trusted}`)) return true;
  }
  return false;
}

function matchAny(text: string, patterns: RegExp[]): RegExp | null {
  for (const re of patterns) {
    if (re.test(text)) return re;
  }
  return null;
}

/**
 * Cheap content/URL moderation. No network fetch, no AI.
 */
export function cheapModerateReaderScout(input: {
  url: string;
  note?: string;
}): ReaderModerationVerdict {
  const url = (input.url || '').trim();
  const note = (input.note || '').trim();
  const host = hostnameOf(url);
  if (!host) {
    return { ok: false, status: 'rejected_unsafe', reason: 'invalid_host' };
  }

  if (SHORTENER_HOSTS.has(host)) {
    return { ok: false, status: 'rejected_spam', reason: 'url_shortener' };
  }

  const tld = tldOf(host);
  const haystack = `${url}\n${note}`.toLowerCase();

  // Hard unsafe first — even on trusted hosts if URL/note is explicit sales/abuse.
  const unsafe = matchAny(haystack, UNSAFE_PATTERNS);
  if (unsafe) {
    // Trusted editorial host + clear research/news framing → soft allow.
    if (isTrustedHost(host) && matchAny(haystack, LEGIT_TECH_CONTEXT)) {
      return {
        ok: true,
        status: 'safe',
        reason: `trusted_editorial_sensitive_topic:${host}`,
      };
    }
    return {
      ok: false,
      status: 'rejected_unsafe',
      reason: `unsafe_pattern:${unsafe.source.slice(0, 80)}`,
    };
  }

  const abuse = matchAny(haystack, ABUSE_PATTERNS);
  if (abuse) {
    return {
      ok: false,
      status: 'rejected_abuse',
      reason: `abuse_pattern:${abuse.source.slice(0, 80)}`,
    };
  }

  const spam = matchAny(haystack, SPAM_PATTERNS);
  if (spam) {
    if (isTrustedHost(host) && matchAny(haystack, LEGIT_TECH_CONTEXT)) {
      return {
        ok: true,
        status: 'safe',
        reason: `trusted_editorial_spam_keyword_context:${host}`,
      };
    }
    // "AI casino bonus" style — reject even with thin tech veneer on unknown hosts.
    return {
      ok: false,
      status: 'rejected_spam',
      reason: `spam_pattern:${spam.source.slice(0, 80)}`,
    };
  }

  if (SUSPICIOUS_TLDS.has(tld) && !isTrustedHost(host)) {
    // Suspicious TLD alone is not enough if note looks like solid tech journalism —
    // still quarantine-style reject as spam-risk for public untrusted intake.
    if (!matchAny(haystack, LEGIT_TECH_CONTEXT)) {
      return { ok: false, status: 'rejected_spam', reason: `suspicious_tld:${tld}` };
    }
  }

  // Promo-only tech veneer on unknown hosts: affiliate-y path tokens.
  if (
    !isTrustedHost(host) &&
    /\/(ref|aff|affiliate|promo|bonus|offer)\b/i.test(url) &&
    !matchAny(haystack, LEGIT_TECH_CONTEXT)
  ) {
    return { ok: false, status: 'rejected_spam', reason: 'affiliate_path' };
  }

  if (isTrustedHost(host)) {
    return { ok: true, status: 'safe', reason: `trusted_editorial_host:${host}` };
  }

  // Unknown host: allow into editorial queue only if not already rejected —
  // still UNTRUSTED; Scout/gates remain. Mark safe for seating.
  return { ok: true, status: 'safe', reason: `passed_cheap_filter:${host}` };
}

export function isTrustedEditorialHost(url: string): boolean {
  const host = hostnameOf(url);
  return host ? isTrustedHost(host) : false;
}
