/**
 * One-shot live fixture repair for SP-A-097F1 (architecture validation only).
 */
import { getDb } from '../src/lib/data-store/db';
import { upsertLocalization, listPublishedLocalizations } from '../src/lib/data-store/localizations-repo';

const db = getDb();
const canon = db
  .prepare(
    `SELECT id, slug, title FROM articles
     WHERE slug = ?
     LIMIT 1`,
  )
  .get("these-3d-printed-objects-can-tell-you-if-they-re-being-used-properly") as
  | { id: string; slug: string; title: string }
  | undefined;

if (!canon) {
  console.error('canonical article not found');
  process.exit(1);
}

console.log(`canon id=${canon.id} slug=${canon.slug}`);

// Soft-disable prior mismatched fixture slugs
db.prepare(
  `UPDATE article_localizations SET translation_status='rejected'
   WHERE localized_slug IN (?, ?)`,
).run('iqoo-t-cooling-200mp-camera-test-en', 'iqoo-t-sogutma-200mp-kamera-test-tr');

upsertLocalization({
  articleId: canon.id,
  language: 'en',
  localizedTitle: '[TEST] 3D-printed objects that sense how they are used',
  localizedExcerpt:
    'Architecture-validation EN localization for an existing RU SmartProto story. Not an automatic translation pipeline output.',
  localizedContent:
    'This is a controlled EN localization fixture for SP-A-097F1.\n\nIt exists only to validate routing, language switching, hreflang, and locale-isolated search/related surfaces.\n\nCanonical editorial content remains the Russian article. No facts were added beyond the fixture purpose.',
  localizedSlug: '3d-printed-objects-sense-usage-test-en',
  translationStatus: 'published',
  translatedAt: new Date().toISOString(),
  translatorModel: 'manual-fixture',
});

upsertLocalization({
  articleId: canon.id,
  language: 'tr',
  localizedTitle: '[TEST] Nasıl kullanıldığını algılayan 3D baskılı nesneler',
  localizedExcerpt:
    'Mevcut bir RU SmartProto haberi için mimari doğrulama TR yerelleştirmesi. Otomatik çeviri çıktısı değildir.',
  localizedContent:
    'Bu, SP-A-097F1 için kontrollü bir TR yerelleştirme örneğidir.\n\nYalnızca yönlendirme, dil değiştirici, hreflang ve locale-izole arama/ilgili yazılar yüzeylerini doğrulamak için vardır.\n\nAsıl editoryal içerik Rusça makalededir. Fikstür amacı dışında yeni olgu eklenmemiştir.',
  localizedSlug: '3d-baskili-nesneler-kullanim-algisi-test-tr',
  translationStatus: 'published',
  translatedAt: new Date().toISOString(),
  translatorModel: 'manual-fixture',
});

console.log(
  'published',
  listPublishedLocalizations('en').map((x) => x.localizedSlug),
  listPublishedLocalizations('tr').map((x) => x.localizedSlug),
);
console.log('FIX OK');
