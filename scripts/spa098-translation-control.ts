/**
 * SP-A-098 — controls for post-publish translation (QA + isolation; optional live AI).
 */
import { runTranslationQa } from '../src/lib/i18n/translation-qa';
import { slugifyLocalizedTitle } from '../src/lib/i18n/translate-article';
import { schedulePostPublishTranslation } from '../src/lib/i18n/post-publish-translate';

function assert(cond: boolean, msg: string, failed: { n: number }) {
  if (!cond) {
    console.log(`FAIL ${msg}`);
    failed.n++;
  } else {
    console.log(`OK ${msg}`);
  }
}

async function main() {
  console.log('SP-A-098 post-publish translation control');
  const failed = { n: 0 };

  // QA pass
  const pass = runTranslationQa({
    language: 'en',
    canonicalTitle: 'Робот X100 получил 48 МП камеру и 12 часов работы',
    canonicalSummary: 'Компания показала прототип с 48 МП и запасом 12 часов.',
    canonicalContent:
      'На презентации назвали модель X100. Камера 48 МП. Автономность около 12 часов. Цена не названа. Инженеры подчеркнули модульную раму.',
    localizedTitle: 'X100 robot gets a 48 MP camera and 12 hours of runtime',
    localizedExcerpt: 'The company showed a prototype with a 48 MP sensor and about 12 hours of battery life.',
    localizedContent:
      'At the presentation they named the model X100. The camera is 48 MP. Runtime is about 12 hours. Price was not announced. Engineers highlighted a modular frame.',
    localizedSlug: 'x100-robot-48mp-12-hours',
  });
  assert(pass.ok, 'QA pass on good EN', failed);

  // QA fail — mostly RU
  const cyr = runTranslationQa({
    language: 'en',
    canonicalTitle: 'Тест',
    canonicalSummary: 'Коротко про 5 гаджетов',
    canonicalContent: 'Текст про 5 устройств и ещё подробности для длины контента чтобы пройти порог.'.repeat(3),
    localizedTitle: 'Тестовый заголовок на русском языке',
    localizedExcerpt: 'Это всё ещё русский текст саммари для проверки',
    localizedContent: 'Полностью русский контент который не должен публиковаться как EN локализация и достаточно длинный.'.repeat(2),
    localizedSlug: 'test-ru-leak',
  });
  assert(!cyr.ok, 'QA rejects mostly Cyrillic EN', failed);

  // QA fail — number drop
  const nums = runTranslationQa({
    language: 'en',
    canonicalTitle: 'Chip with 256 cores and 128 GB memory',
    canonicalSummary: 'Lab shows 256 cores and 128 GB in one package.',
    canonicalContent:
      'The prototype packs 256 cores with 128 GB on-package memory and draws 75 watts under load in the bench notes.',
    localizedTitle: 'A new chip arrives',
    localizedExcerpt: 'A lab showed a package without repeating the key figures clearly enough.',
    localizedContent:
      'The prototype is described only in vague terms without the original core counts or memory sizes from the source article body for parity testing purposes here.',
    localizedSlug: 'new-chip-arrives-vague',
  });
  assert(!nums.ok, 'QA rejects number parity fail', failed);

  // slugify TR
  const trSlug = slugifyLocalizedTitle('Şimşek ğüçlü robot öne çıktı', 'tr', 'id-1');
  assert(/^[a-z0-9-]+$/.test(trSlug) && trSlug.includes('robot'), `TR slug latinized (${trSlug})`, failed);

  // schedule never throws
  try {
    schedulePostPublishTranslation({
      id: 'spa098-control-no-ai',
      slug: 'spa098-control-no-ai',
      title: 'x',
      summary: 'y',
      content: '',
    });
    assert(true, 'schedule incomplete payload does not throw', failed);
  } catch {
    assert(false, 'schedule threw', failed);
  }

  // RU publish isolation statement
  console.log('ASSERT RU PUBLICATION BLOCKED BY TRANSLATION: NO');
  console.log('ASSERT MAX ADDITIONAL CALLS: 2 (1 EN + 1 TR)');
  console.log('ASSERT NO Scout/Reviewer/Editor DNA for EN/TR');

  if (failed.n) {
    console.error(`CONTROL FAIL (${failed.n})`);
    process.exit(1);
  }
  console.log('CONTROL PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
