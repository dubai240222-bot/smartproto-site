/**
 * SP-A-064 image match policy — honest illustration levels.
 * NEVER present a non-exact photo as the exact product.
 */

export type ImageMatchLevel = 'exact' | 'series' | 'brand' | 'category' | 'none';

export const IMAGE_MATCH_LABELS: Record<ImageMatchLevel, string | null> = {
  exact: null,
  series: 'Похожая модель серии',
  brand: 'Иллюстрация бренда',
  category: 'Тематическая иллюстрация',
  none: null,
};

export function labelForMatchLevel(level: ImageMatchLevel | undefined | null): string | null {
  if (!level || level === 'exact' || level === 'none') return null;
  return IMAGE_MATCH_LABELS[level];
}

/** Map article/object signals → thematic category key for local illustrations. */
export function resolveCategoryKey(opts: {
  category?: string;
  objectType?: string | null;
  object?: string | null;
  title?: string;
}): string {
  const blob = `${opts.category || ''} ${opts.objectType || ''} ${opts.object || ''} ${opts.title || ''}`.toLowerCase();
  if (/смартфон|phone|smartphone|pura|iqoo|pixel|iphone/.test(blob)) return 'smartphone';
  if (/планшет|tablet|pad\b/.test(blob)) return 'tablet';
  if (/клавиатур|keyboard/.test(blob)) return 'keyboard';
  if (/мыш|mouse/.test(blob)) return 'mouse';
  if (/наушник|headphone|earbuds|openfit|wristband|браслет|watch|wearable/.test(blob))
    return 'wearable';
  if (/камер|camera|gimbal|insta360|osmo/.test(blob)) return 'camera';
  if (/люльк|bassinet|детск/.test(blob)) return 'bassinet';
  if (/полив|irrigation|watering/.test(blob)) return 'irrigation';
  if (/принтер|printer|3d/.test(blob)) return 'printer';
  if (/робот|robot/.test(blob)) return 'robot';
  if (/автомобил|mpv|vehicle|авто/.test(blob)) return 'vehicle';
  if (/ssd|nvme|накопител|storage/.test(blob)) return 'storage';
  return 'gadget';
}

/** Local thematic illustration path (served via /api/media). */
export function categoryIllustrationUrl(categoryKey: string): string {
  return `/api/media/_category/${categoryKey}.svg`;
}
