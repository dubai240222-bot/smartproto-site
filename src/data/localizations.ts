/**
 * SP-A-097F1 — localization access (sqlite live / JSON fixture fallback).
 */
import jsonLocs from '@/data/article-localizations.json';
import type { LocalizationLanguage, TranslationStatus } from '@/lib/i18n/locales';
import type { ArticleLocalization } from '@/lib/data-store/localizations-repo';
import { isTestLocalization } from '@/lib/i18n/post-publish-translate';

const USE_SQLITE = process.env.ARTICLES_STORE === 'sqlite';

type JsonLoc = {
  articleId: string;
  language: LocalizationLanguage;
  localizedTitle: string;
  localizedExcerpt: string;
  localizedContent: string;
  localizedSlug: string;
  translationStatus: TranslationStatus;
  translatedAt?: string;
  translatorModel?: string;
};

const staticLocs = jsonLocs as JsonLoc[];

function fromJson(rows: JsonLoc[]): ArticleLocalization[] {
  return rows.map((r) => ({
    articleId: r.articleId,
    language: r.language,
    localizedTitle: r.localizedTitle,
    localizedExcerpt: r.localizedExcerpt || '',
    localizedContent: r.localizedContent || '',
    localizedSlug: r.localizedSlug,
    translationStatus: r.translationStatus,
    translatedAt: r.translatedAt || undefined,
    translatorModel: r.translatorModel || undefined,
  }));
}

/** Hide architecture-validation stubs from public EN/TR surfaces. */
function isPublicLocalization(l: ArticleLocalization): boolean {
  if (l.translationStatus !== 'published') return false;
  return !isTestLocalization(l);
}

export type { ArticleLocalization };

export function getPublishedLocalizationBySlug(
  language: LocalizationLanguage,
  slug: string,
): ArticleLocalization | null {
  if (USE_SQLITE) {
    const { getPublishedLocalizationBySlug: fromDb } = require('@/lib/data-store/localizations-repo');
    const hit = fromDb(language, slug) as ArticleLocalization | null;
    if (!hit || !isPublicLocalization(hit)) return null;
    return hit;
  }
  return (
    fromJson(staticLocs).find(
      (l) =>
        l.language === language &&
        l.localizedSlug === slug &&
        isPublicLocalization(l),
    ) || null
  );
}

export function getLocalization(
  articleId: string,
  language: LocalizationLanguage,
): ArticleLocalization | null {
  if (USE_SQLITE) {
    const { getLocalization: fromDb } = require('@/lib/data-store/localizations-repo');
    return fromDb(articleId, language) as ArticleLocalization | null;
  }
  return fromJson(staticLocs).find((l) => l.articleId === articleId && l.language === language) || null;
}

export function listPublishedLocalizations(language: LocalizationLanguage): ArticleLocalization[] {
  if (USE_SQLITE) {
    const { listPublishedLocalizations: fromDb } = require('@/lib/data-store/localizations-repo');
    return (fromDb(language) as ArticleLocalization[]).filter(isPublicLocalization);
  }
  return fromJson(staticLocs).filter((l) => l.language === language && isPublicLocalization(l));
}

export function listLocalizationsForArticle(articleId: string): ArticleLocalization[] {
  if (USE_SQLITE) {
    const { listLocalizationsForArticle: fromDb } = require('@/lib/data-store/localizations-repo');
    return fromDb(articleId) as ArticleLocalization[];
  }
  return fromJson(staticLocs).filter((l) => l.articleId === articleId);
}

/** Search card shape for locale-scoped header search (never mixes RU body into EN/TR). */
export type LocaleSearchItem = {
  articleId: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  publishedAt: string;
  href: string;
};

export function toLocaleSearchItems(
  language: LocalizationLanguage,
  canonicalById: Map<string, { category: string; publishedAt: string }>,
): LocaleSearchItem[] {
  return listPublishedLocalizations(language).map((l) => {
    const canon = canonicalById.get(l.articleId);
    return {
      articleId: l.articleId,
      slug: l.localizedSlug,
      title: l.localizedTitle,
      summary: l.localizedExcerpt,
      category: canon?.category || '',
      publishedAt: canon?.publishedAt || l.translatedAt || '',
      href: `/${language}/articles/${l.localizedSlug}`,
    };
  });
}
