/**
 * SP-A-098 — post-publish EN/TR translation.
 * MUST NEVER throw to the RU publish path.
 *
 * Prefer awaiting `runPostPublishTranslation` inside the newsroom tick child
 * process — fire-and-forget dies when the tick process exits (Hetzner worker
 * spawns ticks as short-lived children).
 *
 * SP-A-098G — archive drip uses `runArchiveLocaleTranslation` (1 locale / job).
 */
import type { CanonicalForTranslation } from '@/lib/i18n/translate-article';
import { translateArticleLanguage } from '@/lib/i18n/translate-article';
import type { LocalizationLanguage } from '@/lib/i18n/locales';
import {
  pickArchiveTranslationJobs,
  pickArticlesNeedingTranslationRanked,
  type ArchiveArticleInput,
  type LocSnapshot,
} from '@/lib/i18n/archive-translate-pick';

const LANGS: LocalizationLanguage[] = ['en', 'tr'];

export function isPostPublishTranslationEnabled(): boolean {
  return process.env.SMARTPROTO_TRANSLATE_ENABLED !== 'false';
}

export type PostPublishTranslationReport = {
  articleId: string;
  slug: string;
  results: Awaited<ReturnType<typeof translateArticleLanguage>>[];
  totalAiCalls: number;
};

/**
 * Run EN then TR sequentially (max 1 call each). Isolated errors.
 * Used after NEW RU publish — both locales in the same tick process.
 */
export async function runPostPublishTranslation(
  article: CanonicalForTranslation,
): Promise<PostPublishTranslationReport> {
  const results = [];
  for (const language of LANGS) {
    try {
      const r = await translateArticleLanguage(article, language);
      results.push(r);
      console.log(
        `[spa098] translate ${language} article=${article.id} status=${r.status} ai=${r.aiCalls}` +
          (r.reason ? ` reason=${r.reason}` : '') +
          (r.localization ? ` slug=${r.localization.localizedSlug}` : ''),
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.log(`[spa098] translate ${language} HARD-FAIL article=${article.id}: ${reason}`);
      results.push({
        language,
        status: 'rejected' as const,
        aiCalls: 0,
        reason: `hard:${reason}`,
      });
    }
  }
  return {
    articleId: article.id,
    slug: article.slug,
    results,
    totalAiCalls: results.reduce((n, r) => n + (r.aiCalls || 0), 0),
  };
}

/**
 * SP-A-098G — translate exactly one locale (archive drip: 1 AI call / job).
 */
export async function runArchiveLocaleTranslation(
  article: CanonicalForTranslation,
  language: LocalizationLanguage,
): Promise<PostPublishTranslationReport> {
  let result: Awaited<ReturnType<typeof translateArticleLanguage>>;
  try {
    result = await translateArticleLanguage(article, language, { retryRejected: true });
    console.log(
      `[spa098g] archive translate ${language} article=${article.id} status=${result.status} ai=${result.aiCalls}` +
        (result.reason ? ` reason=${result.reason}` : '') +
        (result.localization ? ` slug=${result.localization.localizedSlug}` : ''),
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.log(`[spa098g] archive translate ${language} HARD-FAIL article=${article.id}: ${reason}`);
    result = {
      language,
      status: 'rejected',
      aiCalls: 0,
      reason: `hard:${reason}`,
    };
  }
  return {
    articleId: article.id,
    slug: article.slug,
    results: [result],
    totalAiCalls: result.aiCalls || 0,
  };
}

/**
 * Schedule translation after successful RU publish (long-lived process only).
 * Newsroom tick MUST use await runPostPublishTranslation instead — see
 * maybeSyncToSqlite. Never throws to caller.
 */
export function schedulePostPublishTranslation(
  article: CanonicalForTranslation,
  opts?: { force?: boolean },
): void {
  try {
    if (!opts?.force && !isPostPublishTranslationEnabled()) {
      console.log('[spa098] translation disabled (SMARTPROTO_TRANSLATE_ENABLED=false)');
      return;
    }
    if (!article?.id || !article?.title || !article?.content) {
      console.log('[spa098] skip translate — incomplete article payload');
      return;
    }
    // Fire-and-forget — only safe when the Node process stays alive (e.g. doors API).
    void runPostPublishTranslation(article).catch((err) => {
      console.log(
        `[spa098] post-publish translate swallowed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  } catch (err) {
    console.log(
      `[spa098] schedule translate swallowed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/**
 * Pick archive jobs by value + EN/TR coverage (not newest-first only).
 * Prefer `pickArchiveTranslationJobs` when the language is needed.
 */
export function pickArticlesNeedingTranslation<
  T extends {
    id: string;
    slug: string;
    title: string;
    summary: string;
    content: string;
    publishedAt?: string;
    category?: string;
    tags?: string[];
  },
>(
  articles: T[],
  opts: {
    getLocalization: (
      articleId: string,
      language: LocalizationLanguage,
    ) => LocSnapshot;
    limit?: number;
  },
): T[] {
  return pickArticlesNeedingTranslationRanked(articles as ArchiveArticleInput[], {
    getLocalization: opts.getLocalization,
    limit: opts.limit,
  }) as T[];
}

export { pickArchiveTranslationJobs };
export type { ArchiveTranslateJob } from '@/lib/i18n/archive-translate-pick';

export function isTestLocalization(loc: {
  localizedTitle?: string;
  localizedExcerpt?: string;
  translatorModel?: string;
} | null | undefined): boolean {
  if (!loc) return false;
  const title = loc.localizedTitle || '';
  const excerpt = loc.localizedExcerpt || '';
  const model = loc.translatorModel || '';
  return (
    /^\[TEST\]/i.test(title) ||
    /manual-fixture/i.test(model) ||
    /architecture-validation/i.test(excerpt)
  );
}
