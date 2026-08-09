/**
 * SP-A-064 — Photo entity extraction (Photo Scout role).
 * Turns a drafted article into a concrete visual subject:
 * company, brand, model, object, type, aliases, status.
 * WRONG IMAGE > NO IMAGE still applies — rumored/unconfirmed → strict.
 */
import { getOpenRouterClient, parseJsonObject, clampText } from '../ai/shared';

export type ProductStatus = 'product' | 'prototype' | 'rumor' | 'unknown';

export interface PhotoEntity {
  company: string | null;
  brand: string | null;
  model: string | null;
  object: string | null;
  objectType: string | null;
  aliases: string[];
  lab: string | null;
  status: ProductStatus;
  /** Short English/Latin tokens useful for page context matching. */
  matchTokens: string[];
}

const PHOTO_ENTITY_MODEL =
  process.env.OPENROUTER_PHOTO_ENTITY_MODEL ??
  process.env.OPENROUTER_SCOUT_MODEL ??
  'deepseek/deepseek-v4-flash:latest';

const SYSTEM = [
  'You extract the VISUAL SUBJECT of a SmartProto tech article for photo matching.',
  'Return ONLY JSON with keys:',
  'company, brand, model, object, objectType, aliases (string[]), lab, status, matchTokens (string[]).',
  'status must be one of: product | prototype | rumor | unknown.',
  'object = what to photograph (e.g. "neural wristband", "mechanical keyboard").',
  'objectType = category (wearable/interface, keyboard, bassinet, irrigation, phone, ...).',
  'matchTokens = 3–8 distinctive Latin tokens that should appear near a correct photo',
  '(brand, model code, product line). Prefer exact proper nouns over generic words.',
  'If the article is a rumor/leak/unannounced product, status=rumor and leave model null if uncertain.',
  'Never invent a specific model number that is not in the text.',
  'company/brand examples: Meta, Altar, Delta Children, RainPoint, iQOO.',
].join(' ');

/** Heuristic fallback when AI is unavailable — better than empty. */
export function extractPhotoEntityHeuristic(title: string, text: string): PhotoEntity {
  const blob = `${title}\n${text}`;
  const brandMatch = blob.match(
    /\b(Meta|Facebook|Altar|Delta\s+Children|RainPoint|iQOO|Redmi|Xiaomi|Huawei|Honor|OPPO|vivo|OnePlus|Samsung|Apple|Google|Sony|Lenovo|ASUS|Nothing|Realme|Motorola|Insta360|DJI|Anker|Casio|GoPro|Corsair|Lofree|Marantz|Fitbit|Nike|Glorious)\b/i,
  );
  const brand = brandMatch ? brandMatch[1].replace(/\s+/g, ' ') : null;
  const company = brand;
  let model: string | null = null;
  if (brand) {
    const after = blob.slice(brandMatch!.index! + brandMatch![0].length);
    const m = after.match(/^\s*([A-Za-z]?[\w.-]{1,24}(?:\s+(?:II|2|Pro|Max|Ultra|Air|Aero))?)/);
    if (m) {
      const tok = m[1].trim();
      if (!/^(представил|представила|launches|announces|with|для|и|the|a)$/i.test(tok)) {
        model = tok.length <= 40 ? tok : null;
      }
    }
  }
  // Named products in title without brand list hit
  if (!brand) {
    const named = title.match(/\b([A-Z][A-Za-z0-9][A-Za-z0-9+.-]{1,30})\b/);
    if (named) {
      return {
        company: named[1],
        brand: named[1],
        model: null,
        object: title.slice(0, 80),
        objectType: 'gadget',
        aliases: [named[1]],
        lab: null,
        status: /слух|rumor|leak|предположительно/i.test(blob) ? 'rumor' : 'unknown',
        matchTokens: [named[1]],
      };
    }
  }
  const status: ProductStatus = /слух|rumor|leak|предположительно|ожидаем/i.test(blob)
    ? 'rumor'
    : brand
      ? 'product'
      : 'unknown';
  let object: string | null = brand ? `${brand}${model ? ' ' + model : ''}`.trim() : null;
  let objectType: string | null = null;
  if (/браслет|wristband|bracelet/i.test(blob)) {
    object = 'neural gesture wristband';
    objectType = 'wearable/interface';
  } else if (/клавиатур|keyboard/i.test(blob)) {
    object = 'mechanical keyboard';
    objectType = 'keyboard';
  } else if (/люльк|bassinet/i.test(blob)) {
    object = 'smart bassinet';
    objectType = 'bassinet';
  } else if (/полив|irrigation|watering/i.test(blob)) {
    object = 'smart irrigation system';
    objectType = 'irrigation';
  }
  const matchTokens = [brand, model, object].filter(Boolean).map((s) => String(s));
  // Prefer short distinctive tokens
  const tokens = [
    brand,
    model,
    ...(/браслет|wristband/i.test(blob) ? ['wristband', 'neuromotor', 'sEMG'] : []),
    ...(/altar/i.test(blob) ? ['Altar', 'Altar II'] : []),
    ...(/aero|bassinet|люльк/i.test(blob) ? ['Aero', 'bassinet'] : []),
    ...(/rainpoint|полив/i.test(blob) ? ['RainPoint', 'irrigation'] : []),
  ]
    .filter(Boolean)
    .map(String);
  return {
    company,
    brand,
    model,
    object,
    objectType,
    aliases: [...new Set(tokens)],
    lab: null,
    status,
    matchTokens: [...new Set(tokens.filter((t) => t.length >= 2))],
  };
}

export async function extractPhotoEntity(opts: {
  title: string;
  text: string;
  sourceUrl?: string;
}): Promise<PhotoEntity> {
  const fallback = extractPhotoEntityHeuristic(opts.title, opts.text);
  try {
    const client = getOpenRouterClient();
    const completion = await client.chat.completions.create({
      model: PHOTO_ENTITY_MODEL,
      temperature: 0.1,
      max_tokens: 500,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: clampText(
            JSON.stringify({
              title: opts.title,
              sourceUrl: opts.sourceUrl || '',
              text: opts.text.slice(0, 2500),
            }),
            3200,
          ),
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content || '';
    const parsed = parseJsonObject<{
      company?: string | null;
      brand?: string | null;
      model?: string | null;
      object?: string | null;
      objectType?: string | null;
      aliases?: string[];
      lab?: string | null;
      status?: string;
      matchTokens?: string[];
    }>(raw);

    const statusRaw = (parsed.status || fallback.status || 'unknown').toLowerCase();
    const status: ProductStatus = ['product', 'prototype', 'rumor', 'unknown'].includes(statusRaw)
      ? (statusRaw as ProductStatus)
      : 'unknown';

    const brand = (parsed.brand || parsed.company || fallback.brand || '').trim() || null;
    const company = (parsed.company || brand || fallback.company || '').trim() || null;
    const model = (parsed.model || fallback.model || '').trim() || null;
    const aliases = Array.isArray(parsed.aliases)
      ? parsed.aliases.map((a) => String(a).trim()).filter(Boolean).slice(0, 12)
      : fallback.aliases;
    const matchTokens = Array.isArray(parsed.matchTokens)
      ? parsed.matchTokens.map((a) => String(a).trim()).filter(Boolean).slice(0, 12)
      : [...new Set([brand, model, ...aliases].filter(Boolean).map(String))];

    if (!brand && !company && matchTokens.length === 0) return fallback;

    return {
      company,
      brand,
      model,
      object: (parsed.object || fallback.object || '').trim() || null,
      objectType: (parsed.objectType || fallback.objectType || '').trim() || null,
      aliases,
      lab: (parsed.lab || '').trim() || null,
      status,
      matchTokens: matchTokens.length ? matchTokens : fallback.matchTokens,
    };
  } catch (err) {
    console.log(
      `[photo-entity] AI extract failed, heuristic used: ${err instanceof Error ? err.message : String(err)}`,
    );
    return fallback;
  }
}

/** Strict textual confirmation that nearby context refers to this entity. */
export function contextConfirmsEntity(context: string, entity: PhotoEntity): boolean {
  if (entity.status === 'rumor' && !entity.model) return false;
  const hay = context.toLowerCase();
  const tokens = entity.matchTokens.map((t) => t.toLowerCase()).filter((t) => t.length >= 2);
  if (!tokens.length) return false;

  // Require brand/company token when present.
  const brand = (entity.brand || entity.company || '').toLowerCase();
  if (brand) {
    const brandRe = new RegExp(`\\b${escapeRe(brand)}\\b`, 'i');
    if (!brandRe.test(hay) && !tokens.some((t) => t !== brand && new RegExp(`\\b${escapeRe(t)}\\b`, 'i').test(hay))) {
      // Allow if a distinctive non-generic alias hits (e.g. "Altar II")
      const strong = tokens.filter((t) => t.length >= 4 && t !== brand);
      if (!strong.some((t) => new RegExp(`\\b${escapeRe(t)}\\b`, 'i').test(hay))) return false;
    }
  }

  if (entity.model) {
    const modelRe = new RegExp(`\\b${escapeRe(entity.model.toLowerCase())}\\b`, 'i');
    if (entity.status === 'rumor' && !modelRe.test(hay)) return false;
  }

  // At least one matchToken must appear.
  return tokens.some((t) => new RegExp(`\\b${escapeRe(t)}\\b`, 'i').test(hay));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
