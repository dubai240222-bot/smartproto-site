/**
 * SP-A-097F1 — multilingual foundation controls (no live mutate beyond assertions).
 */
import { getPublicSiteUrl } from '../src/lib/site-url';
import {
  getPublishedLocalizationBySlug,
  listPublishedLocalizations,
} from '../src/data/localizations';
import { getAllArticles, getArticleBySlug } from '../src/data/articles';
import { articleSwitcherLinks, buildArticleLanguageAlternates } from '../src/lib/i18n/article-alternates';
import { localeArticlePath } from '../src/lib/i18n/locales';

async function main() {
  console.log('SP-A-097F1 multilingual foundation control');
  let failed = 0;

  const site = getPublicSiteUrl();
  console.log(`site_url=${site}`);
  if (site !== 'https://www.smartproto.net' && !site.includes('smartproto.net')) {
    // Allow override only if non-localhost
    console.log('FAIL public site url still non-production-like');
    failed++;
  } else if (/127\.0\.0\.1|localhost/i.test(site)) {
    console.log('FAIL localhost in public site url');
    failed++;
  } else {
    console.log('OK public site url');
  }

  // Force localhost env should still sanitize
  const prev = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = 'http://127.0.0.1:3100';
  const sanitized = getPublicSiteUrl();
  process.env.NEXT_PUBLIC_SITE_URL = prev;
  if (sanitized !== 'https://www.smartproto.net') {
    console.log(`FAIL sanitize got ${sanitized}`);
    failed++;
  } else console.log('OK localhost sanitized to www.smartproto.net');

  const en = listPublishedLocalizations('en');
  const tr = listPublishedLocalizations('tr');
  console.log(`published_en=${en.length} published_tr=${tr.length}`);
  if (!en.length || !tr.length) {
    console.log('FAIL missing published fixtures');
    failed++;
  } else {
    console.log('OK fixtures published');
  }

  const enHit = getPublishedLocalizationBySlug('en', en[0]?.localizedSlug || '');
  const missing = getPublishedLocalizationBySlug('en', 'this-slug-does-not-exist-097f1');
  if (!enHit) {
    console.log('FAIL published slug lookup');
    failed++;
  } else console.log('OK en slug lookup');
  if (missing) {
    console.log('FAIL missing slug returned');
    failed++;
  } else console.log('OK missing localization → null');

  const canon = getAllArticles().find((a) => a.id === en[0]?.articleId) || getArticleBySlug('china-iqoo-t');
  if (!canon) {
    console.log('FAIL canonical article missing');
    failed++;
  } else {
    const alts = buildArticleLanguageAlternates({ articleId: canon.id, ruSlug: canon.slug });
    const langs = alts.languages || {};
    if (langs.ru !== localeArticlePath('ru', canon.slug)) {
      console.log('FAIL ru hreflang');
      failed++;
    } else console.log('OK ru hreflang');
    if (langs['x-default'] !== langs.ru) {
      console.log('FAIL x-default');
      failed++;
    } else console.log('OK x-default→ru');
    if (en.length && !langs.en) {
      console.log('FAIL en hreflang missing');
      failed++;
    } else console.log('OK en hreflang present');

    const sw = articleSwitcherLinks({ articleId: canon.id, ruSlug: canon.slug });
    if (!sw.ru || !sw.en || !sw.tr) {
      console.log(`FAIL switcher links ${JSON.stringify(sw)}`);
      failed++;
    } else console.log('OK switcher same-story links');

    // Unrelated article should disable EN/TR
    const other = getAllArticles().find((a) => a.id !== canon.id);
    if (other) {
      const sw2 = articleSwitcherLinks({ articleId: other.id, ruSlug: other.slug });
      if (sw2.en || sw2.tr) {
        console.log('FAIL unrelated article shows phantom localizations');
        failed++;
      } else console.log('OK missing translation disabled for other articles');
    }
  }

  // RU URL pattern unchanged
  if (localeArticlePath('ru', 'china-iqoo-t') !== '/articles/china-iqoo-t') {
    console.log('FAIL RU URL changed');
    failed++;
  } else console.log('OK RU URL unchanged');

  if (failed) {
    console.error(`CONTROL FAIL (${failed})`);
    process.exit(1);
  }
  console.log('CONTROL PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
