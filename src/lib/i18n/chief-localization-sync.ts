/**
 * Chief articles — EN/TR must mirror canonical RU text/meaning after every publish or revise.
 */
import type { CanonicalForTranslation } from '@/lib/i18n/translate-article';
import { translateArticleLanguage } from '@/lib/i18n/translate-article';
import type { LocalizationLanguage } from '@/lib/i18n/locales';
import { isPostPublishTranslationEnabled } from '@/lib/i18n/post-publish-translate';

const LANGS: LocalizationLanguage[] = ['en', 'tr'];

export function isChiefArticle(article: {
  agentId?: string | null;
  tags?: string[] | null;
  slug?: string | null;
}): boolean {
  const agent = String(article.agentId || '').toLowerCase();
  if (agent === 'chief-fast-lane' || agent.startsWith('chief-')) return true;
  if (/\bchief-/i.test(String(article.slug || ''))) return true;
  return (article.tags || []).some((t) => /^chief(-revise)?$/i.test(String(t || '').trim()));
}

export type ChiefLocalizationSyncReport = {
  articleId: string;
  slug: string;
  results: Awaited<ReturnType<typeof translateArticleLanguage>>[];
  totalAiCalls: number;
};

/** Re-translate EN+TR from current RU canonical (Chief publish/revise). Never throws. */
export async function syncChiefArticleLocalizations(
  article: CanonicalForTranslation,
): Promise<ChiefLocalizationSyncReport> {
  const results: Awaited<ReturnType<typeof translateArticleLanguage>>[] = [];
  if (!isPostPublishTranslationEnabled()) {
    console.log('[chief-i18n] translation disabled — skip chief sync');
    return { articleId: article.id, slug: article.slug, results, totalAiCalls: 0 };
  }
  if (!article?.id || !article.title?.trim() || !article.content?.trim()) {
    console.log('[chief-i18n] incomplete article — skip chief sync');
    return { articleId: article.id || '', slug: article.slug || '', results, totalAiCalls: 0 };
  }

  for (const language of LANGS) {
    try {
      const r = await translateArticleLanguage(article, language, {
        forceRetranslate: true,
        retryRejected: true,
        chiefArticle: true,
        preserveLocalizedSlug: true,
      });
      results.push(r);
      console.log(
        `[chief-i18n] sync ${language} article=${article.id} status=${r.status} ai=${r.aiCalls}` +
          (r.reason ? ` reason=${r.reason}` : '') +
          (r.localization ? ` slug=${r.localization.localizedSlug}` : ''),
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.log(`[chief-i18n] sync ${language} HARD-FAIL article=${article.id}: ${reason}`);
      results.push({
        language,
        status: 'rejected',
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
