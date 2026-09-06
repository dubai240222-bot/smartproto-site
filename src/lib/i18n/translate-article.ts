/**
 * SP-A-098 — post-publish EN/TR localization (not a second newsroom).
 * Max 1 AI call per language. Never blocks RU publish.
 */
import { createHash } from 'node:crypto';
import { getOpenRouterClient, parseJsonObject } from '@/lib/ai/shared';
import type { LocalizationLanguage } from '@/lib/i18n/locales';
import { runTranslationQa } from '@/lib/i18n/translation-qa';
import type { ArticleLocalization } from '@/lib/data-store/localizations-repo';

const TRANSLATE_MODEL =
  process.env.OPENROUTER_TRANSLATE_MODEL ||
  process.env.OPENROUTER_EDITOR_MODEL ||
  'google/gemini-2.5-flash-lite';

export type CanonicalForTranslation = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  category?: string;
  author?: string;
  authorDesk?: string;
};

export type TranslateLanguageResult = {
  language: LocalizationLanguage;
  status: 'published' | 'rejected';
  aiCalls: number;
  reason?: string;
  localization?: ArticleLocalization;
  qaChecks?: string[];
};

function turkishLatinize(input: string): string {
  return input
    .replace(/İ/g, 'I')
    .replace(/I/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/Ş/g, 'S')
    .replace(/ş/g, 's')
    .replace(/Ğ/g, 'G')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'U')
    .replace(/ü/g, 'u')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'C')
    .replace(/ç/g, 'c');
}

export function slugifyLocalizedTitle(
  title: string,
  language: LocalizationLanguage,
  articleId: string,
): string {
  const baseSrc = language === 'tr' ? turkishLatinize(title) : title;
  let base = baseSrc
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);
  if (base.length < 6) {
    const frag = createHash('sha1').update(articleId).digest('hex').slice(0, 8);
    base = `story-${frag}`;
  }
  return base;
}

function isOpinionish(category?: string): boolean {
  return /column|opinion|колонк|мнение|review_opinion|обзор\s*\/\s*мнение/i.test(
    category || '',
  );
}

async function callTranslateOnce(
  article: CanonicalForTranslation,
  language: LocalizationLanguage,
): Promise<{ title: string; summary: string; content: string; model: string }> {
  const client = getOpenRouterClient();
  const langName = language === 'en' ? 'English' : 'Turkish';
  const opinion = isOpinionish(article.category);

  const system = [
    `You are a professional localization translator for SmartProto technology media.`,
    `Translate the finished Russian editorial article into ${langName}.`,
    `This is localization, NOT a new article and NOT rewriting.`,
    `Preserve ALL facts, numbers, names, companies, product names, meaning, structure, human angle, and light irony if present.`,
    `Preserve authorship/voice. Do NOT invent facts, comparisons, specs, or conclusions.`,
    opinion
      ? `This is an author COLUMN/OPINION: preserve the author's argument and voice; do not flatten into generic newsroom prose.`
      : `Keep a clear journalistic tone matching the original.`,
    `Do not translate the author's personal name if it appears; keep it as-is.`,
    // SP-A-100F — small shared + TR guards (no AI QA, no translator rewrite).
    `NEVER introduce brand names that do not exist in the canonical article (e.g. "кубики"/blocks must NOT become "Lego" unless LEGO is in the source).`,
    `Do not invent new examples, brands, or metaphors absent from the source.`,
    language === 'tr'
      ? [
          `Preserve technical semantic class exactly: experiment/эксперимент → Turkish "deney", NOT "deneyim" (experience).`,
          `Prefer natural Turkish word order and phrasing over literal Russian syntax.`,
        ].join('\n')
      : '',
    `Return ONLY JSON: {"title":"...","summary":"...","content":"..."}`,
    `content may use blank-line paragraph breaks; no markdown headings required.`,
  ]
    .filter(Boolean)
    .join('\n');

  const user = [
    `Target language: ${langName} (${language})`,
    `Canonical RU title: ${article.title}`,
    `Canonical RU summary: ${article.summary}`,
    `Canonical RU content:`,
    article.content,
  ].join('\n\n');

  const completion = await client.chat.completions.create({
    model: TRANSLATE_MODEL,
    temperature: 0.2,
    max_tokens: 3500,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const raw = completion.choices[0]?.message?.content || '';
  const parsed = parseJsonObject<{ title?: string; summary?: string; content?: string }>(raw);
  const title = String(parsed.title || '').trim();
  const summary = String(parsed.summary || '').trim();
  const content = String(parsed.content || '').trim();
  if (!title || !summary || !content) {
    throw new Error('translation_json_incomplete');
  }
  return { title, summary, content, model: TRANSLATE_MODEL };
}

function uniqueSlug(
  language: LocalizationLanguage,
  desired: string,
  articleId: string,
  slugTaken: (lang: LocalizationLanguage, slug: string) => boolean,
): string {
  if (!slugTaken(language, desired)) return desired;
  const frag = createHash('sha1').update(`${articleId}:${language}`).digest('hex').slice(0, 6);
  const candidate = `${desired.slice(0, 70)}-${frag}`;
  if (!slugTaken(language, candidate)) return candidate;
  return `${desired.slice(0, 60)}-${Date.now().toString(36)}`;
}

/**
 * Translate one language with max 1 AI call + deterministic QA.
 * Persists localization row. Never throws to caller (returns rejected).
 */
export async function translateArticleLanguage(
  article: CanonicalForTranslation,
  language: LocalizationLanguage,
  deps?: {
    getExisting?: (articleId: string, language: LocalizationLanguage) => ArticleLocalization | null;
    upsert?: (loc: ArticleLocalization) => void;
    slugTaken?: (language: LocalizationLanguage, slug: string) => boolean;
    /** Re-attempt a prior rejected row (worker drip / controlled scripts). */
    retryRejected?: boolean;
  },
): Promise<TranslateLanguageResult> {
  try {
    const { getLocalization, upsertLocalization, getPublishedLocalizationBySlug } = await import(
      '@/lib/data-store/localizations-repo'
    );
    const getExisting = deps?.getExisting || getLocalization;
    const upsert = deps?.upsert || upsertLocalization;
    const slugTaken =
      deps?.slugTaken ||
      ((lang, slug) => {
        const hit = getPublishedLocalizationBySlug(lang, slug);
        return Boolean(hit && hit.articleId !== article.id);
      });

    const existing = getExisting(article.id, language);
    if (existing?.translationStatus === 'published') {
      return {
        language,
        status: 'published',
        aiCalls: 0,
        reason: 'already_published',
        localization: existing,
      };
    }
    if (existing?.translationStatus === 'rejected') {
      // Retry empty/failed attempts (tick process killed mid-flight left husks).
      const emptyBody = !(existing.localizedContent || '').trim();
      const hardFail = /\|error:|ai_fail|hard:/i.test(existing.translatorModel || '');
      if (!emptyBody && !hardFail && !deps?.retryRejected) {
        return {
          language,
          status: 'rejected',
          aiCalls: 0,
          reason: 'already_rejected',
          localization: existing,
        };
      }
    }

    let aiCalls = 0;
    let translated: { title: string; summary: string; content: string; model: string };
    try {
      translated = await callTranslateOnce(article, language);
      aiCalls = 1;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const failed: ArticleLocalization = {
        articleId: article.id,
        language,
        localizedTitle: article.title,
        localizedExcerpt: '',
        localizedContent: '',
        localizedSlug: slugifyLocalizedTitle(article.title, language, article.id),
        translationStatus: 'rejected',
        translatedAt: new Date().toISOString(),
        translatorModel: `${TRANSLATE_MODEL}|error:${reason.slice(0, 120)}`,
      };
      try {
        upsert(failed);
      } catch {
        /* persist best-effort */
      }
      return { language, status: 'rejected', aiCalls, reason: `ai_fail:${reason}` };
    }

    const desired = slugifyLocalizedTitle(translated.title, language, article.id);
    const slug = uniqueSlug(language, desired, article.id, slugTaken);

    const qaCandidate: ArticleLocalization = {
      articleId: article.id,
      language,
      localizedTitle: translated.title,
      localizedExcerpt: translated.summary,
      localizedContent: translated.content,
      localizedSlug: slug,
      translationStatus: 'qa',
      translatedAt: new Date().toISOString(),
      translatorModel: translated.model,
    };
    upsert(qaCandidate);

    const qa = runTranslationQa({
      language,
      canonicalTitle: article.title,
      canonicalSummary: article.summary,
      canonicalContent: article.content,
      localizedTitle: translated.title,
      localizedExcerpt: translated.summary,
      localizedContent: translated.content,
      localizedSlug: slug,
    });

    if (!qa.ok) {
      const rejected: ArticleLocalization = {
        ...qaCandidate,
        translationStatus: 'rejected',
        translatorModel: `${translated.model}|qa:${qa.reason}`,
      };
      upsert(rejected);
      return {
        language,
        status: 'rejected',
        aiCalls,
        reason: qa.reason,
        localization: rejected,
        qaChecks: qa.checks,
      };
    }

    const published: ArticleLocalization = {
      ...qaCandidate,
      translationStatus: 'published',
    };
    upsert(published);
    return {
      language,
      status: 'published',
      aiCalls,
      localization: published,
      qaChecks: qa.checks,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { language, status: 'rejected', aiCalls: 0, reason: `outer:${reason}` };
  }
}
