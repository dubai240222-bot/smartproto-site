/**
 * SP-A-100F / Neakasa incident — deterministic product↔photo family gate.
 * Reject heroes whose visual family clashes with the article subject
 * (e.g. pet feeder story + e-bike / motorcycle photo).
 * No extra LLM call. Timeout-friendly: pure sync regex.
 */

export type ProductPhotoFamily =
  | 'pet_feeder'
  | 'vehicle'
  | 'phone'
  | 'audio'
  | 'robot'
  | 'camera'
  | 'wearable'
  | 'drone'
  | 'other';

const FAMILY_PATTERNS: Record<Exclude<ProductPhotoFamily, 'other'>, RegExp> = {
  pet_feeder:
    /\b(pet\s*feeder|cat\s*feeder|dog\s*feeder|wet\s*meal|fresh[- ]made|автокормуш|кормушк|влажн\w*\s+корм|сублимирован|neakasa|neakasa\s*riko|riko)\b|для\s+кошк|для\s+собак|кормлен\w*\s+питомц/i,
  vehicle:
    /\b(e-?bike|ebike|electric\s*bike|motorbike|motorcycle|scooter|moped|fat[- ]?tire|велосипед|электровелосипед|мотоцикл|скутер|aotos|ride\s+the\s+future|motos?)\b/i,
  phone:
    /\b(smartphone|смартфон|iphone|galaxy\s*z?\s*fold|pixel\s*\d|бюджетн\w*\s+телефон)\b/i,
  audio:
    /\b(headphones?|earbuds?|speaker|наушник|колонк|гарнитур|subwoofer)\b/i,
  robot:
    /\b(humanoid|robot\s*arm|industrial\s*robot|робот(?!\s*пылесос)|манипулятор)\b/i,
  camera:
    /\b(action\s*cam|mirrorless|insta360|gopro|экшн[- ]?камер|фотоаппарат)\b/i,
  wearable:
    /\b(smart\s*watch|fitness\s*band|умн\w*\s+час|фитнес[- ]?браслет|ar\s*glasses)\b/i,
  drone: /\b(drone|квадрокоптер|dji\s*mini|fpv)\b/i,
};

/** Families that must never be paired (article family → forbidden photo families). */
const CLASH: Partial<Record<ProductPhotoFamily, ProductPhotoFamily[]>> = {
  pet_feeder: ['vehicle', 'phone', 'audio', 'drone', 'camera'],
  vehicle: ['pet_feeder', 'phone', 'audio', 'wearable'],
  phone: ['vehicle', 'pet_feeder', 'drone'],
  audio: ['vehicle', 'pet_feeder'],
  wearable: ['vehicle', 'pet_feeder'],
  drone: ['pet_feeder', 'phone'],
  camera: ['pet_feeder', 'vehicle'],
  robot: ['pet_feeder', 'vehicle'],
};

export function inferProductPhotoFamily(...parts: string[]): ProductPhotoFamily {
  const hay = parts.filter(Boolean).join('\n');
  for (const [family, re] of Object.entries(FAMILY_PATTERNS) as [
    Exclude<ProductPhotoFamily, 'other'>,
    RegExp,
  ][]) {
    if (re.test(hay)) return family;
  }
  return 'other';
}

export type ProductPhotoGateResult =
  | { ok: true; articleFamily: ProductPhotoFamily; photoFamily: ProductPhotoFamily }
  | {
      ok: false;
      reason: string;
      articleFamily: ProductPhotoFamily;
      photoFamily: ProductPhotoFamily;
    };

/**
 * Reject when article subject family clashes with photo URL/context family.
 * Prefer NO IMAGE over a wrong product shot.
 */
export function gateProductPhotoMatch(opts: {
  articleTitle: string;
  articleText?: string;
  photoUrl: string;
  photoContext?: string;
}): ProductPhotoGateResult {
  const articleFamily = inferProductPhotoFamily(opts.articleTitle, opts.articleText || '');
  const photoFamily = inferProductPhotoFamily(
    opts.photoUrl,
    opts.photoContext || '',
  );

  if (articleFamily === 'other' || photoFamily === 'other') {
    return { ok: true, articleFamily, photoFamily };
  }
  if (articleFamily === photoFamily) {
    return { ok: true, articleFamily, photoFamily };
  }
  const banned = CLASH[articleFamily] || [];
  if (banned.includes(photoFamily)) {
    return {
      ok: false,
      reason: `product-photo mismatch: article=${articleFamily} photo=${photoFamily}`,
      articleFamily,
      photoFamily,
    };
  }
  return { ok: true, articleFamily, photoFamily };
}

/** Sync filter for candidate lists (no network / no LLM). */
export function filterMismatchedPhotoCandidates<
  T extends { url: string; context?: string },
>(
  articleTitle: string,
  articleText: string,
  candidates: T[],
): { kept: T[]; rejected: { url: string; reason: string }[] } {
  const kept: T[] = [];
  const rejected: { url: string; reason: string }[] = [];
  for (const c of candidates) {
    const g = gateProductPhotoMatch({
      articleTitle,
      articleText,
      photoUrl: c.url,
      photoContext: c.context || '',
    });
    if (!g.ok) {
      rejected.push({ url: c.url, reason: g.reason });
      continue;
    }
    kept.push(c);
  }
  return { kept, rejected };
}
