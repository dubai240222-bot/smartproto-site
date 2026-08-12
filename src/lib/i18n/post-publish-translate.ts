/**
 * SP-A-098 — fire-and-forget post-publish EN/TR translation.
 * MUST NEVER throw to the RU publish path / newsroom tick.
 */
import type { CanonicalForTranslation } from '@/lib/i18n/translate-article';
import { translateArticleLanguage } from '@/lib/i18n/translate-article';
import type { LocalizationLanguage } from '@/lib/i18n/locales';

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
 * Schedule translation after successful RU publish.
 * Never awaits from caller perspective in a way that can fail publish —
 * returns a void promise that swallows errors.
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
    // Fire-and-forget — RU publish already committed.
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
