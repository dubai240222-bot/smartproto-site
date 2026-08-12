/**
 * SP-A-097F1 — article_localizations SQLite repo (Hetzner ARTICLES_STORE=sqlite).
 */
import { getDb } from '@/lib/data-store/db';
import type { LocalizationLanguage, TranslationStatus } from '@/lib/i18n/locales';

export type ArticleLocalization = {
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

type Row = {
  article_id: string;
  language: string;
  localized_title: string;
  localized_excerpt: string;
  localized_content: string;
  localized_slug: string;
  translation_status: string;
  translated_at: string | null;
  translator_model: string | null;
};

function mapRow(r: Row): ArticleLocalization {
  return {
    articleId: r.article_id,
    language: r.language as LocalizationLanguage,
    localizedTitle: r.localized_title,
    localizedExcerpt: r.localized_excerpt || '',
    localizedContent: r.localized_content || '',
    localizedSlug: r.localized_slug,
    translationStatus: r.translation_status as TranslationStatus,
    translatedAt: r.translated_at || undefined,
    translatorModel: r.translator_model || undefined,
  };
}

export function upsertLocalization(loc: ArticleLocalization): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO article_localizations (
      article_id, language, localized_title, localized_excerpt, localized_content,
      localized_slug, translation_status, translated_at, translator_model, updated_at
    ) VALUES (
      @article_id, @language, @localized_title, @localized_excerpt, @localized_content,
      @localized_slug, @translation_status, @translated_at, @translator_model,
      strftime('%Y-%m-%dT%H:%M:%fZ','now')
    )
    ON CONFLICT(article_id, language) DO UPDATE SET
      localized_title=excluded.localized_title,
      localized_excerpt=excluded.localized_excerpt,
      localized_content=excluded.localized_content,
      localized_slug=excluded.localized_slug,
      translation_status=excluded.translation_status,
      translated_at=excluded.translated_at,
      translator_model=excluded.translator_model,
      updated_at=excluded.updated_at`,
  ).run({
    article_id: loc.articleId,
    language: loc.language,
    localized_title: loc.localizedTitle,
    localized_excerpt: loc.localizedExcerpt,
    localized_content: loc.localizedContent,
    localized_slug: loc.localizedSlug,
    translation_status: loc.translationStatus,
    translated_at: loc.translatedAt || null,
    translator_model: loc.translatorModel || null,
  });
}

export function getPublishedLocalizationBySlug(
  language: LocalizationLanguage,
  slug: string,
): ArticleLocalization | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM article_localizations
       WHERE language = ? AND localized_slug = ? AND translation_status = 'published'
       LIMIT 1`,
    )
    .get(language, slug) as Row | undefined;
  return row ? mapRow(row) : null;
}

export function getLocalization(
  articleId: string,
  language: LocalizationLanguage,
): ArticleLocalization | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM article_localizations WHERE article_id = ? AND language = ? LIMIT 1`,
    )
    .get(articleId, language) as Row | undefined;
  return row ? mapRow(row) : null;
}

export function listPublishedLocalizations(
  language: LocalizationLanguage,
): ArticleLocalization[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM article_localizations
       WHERE language = ? AND translation_status = 'published'
       ORDER BY COALESCE(translated_at, updated_at) DESC`,
    )
    .all(language) as Row[];
  return rows.map(mapRow);
}

export function listLocalizationsForArticle(articleId: string): ArticleLocalization[] {
  const rows = getDb()
    .prepare(`SELECT * FROM article_localizations WHERE article_id = ?`)
    .all(articleId) as Row[];
  return rows.map(mapRow);
}
