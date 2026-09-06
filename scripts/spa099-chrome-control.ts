/**
 * SP-A-099 — chrome localization dictionary control (no live mutate).
 */
import { LOCALE_UI } from '../src/lib/i18n/locales';

function main() {
  console.log('SP-A-099 chrome localization control');
  let failed = 0;

  for (const locale of ['ru', 'en', 'tr'] as const) {
    const ui = LOCALE_UI[locale];
    const required: (keyof typeof ui)[] = [
      'navHome',
      'navNews',
      'navScout',
      'sources',
      'originalPublication',
      'related',
      'footerEditorial',
      'footerScout',
      'searchPlaceholder',
      'searchEmpty',
      'authorLabel',
      'homeFeed',
      'htmlLang',
      'ogLocale',
    ];
    for (const k of required) {
      if (!ui[k]) {
        console.log(`FAIL ${locale}.${k} empty`);
        failed++;
      }
    }
  }

  // No RU chrome strings in EN/TR dictionaries (spot-check common leaks)
  const leakRe = /Главная|Источники|Оригинальная|Читайте|Прислать|Редакция|Поиск по/;
  for (const locale of ['en', 'tr'] as const) {
    const blob = Object.values(LOCALE_UI[locale]).join(' | ');
    if (leakRe.test(blob)) {
      console.log(`FAIL RU leak in ${locale} dictionary`);
      failed++;
    } else {
      console.log(`OK ${locale} dictionary free of RU chrome`);
    }
  }

  if (LOCALE_UI.en.sources !== 'Sources and verification') {
    console.log('FAIL EN sources wording');
    failed++;
  } else console.log('OK EN sources wording');

  if (LOCALE_UI.tr.sources !== 'Kaynaklar ve doğrulama') {
    console.log('FAIL TR sources wording');
    failed++;
  } else console.log('OK TR sources wording');

  if (LOCALE_UI.ru.htmlLang !== 'ru' || LOCALE_UI.en.htmlLang !== 'en' || LOCALE_UI.tr.htmlLang !== 'tr') {
    console.log('FAIL htmlLang');
    failed++;
  } else console.log('OK htmlLang map');

  if (failed) {
    console.error(`CONTROL FAIL (${failed})`);
    process.exit(1);
  }
  console.log('CONTROL PASS');
}

main();
