/**
 * SP-A-098 — post-publish EN/TR translation.
 * MUST NEVER throw to the RU publish path.
 *
 * Prefer awaiting `runPostPublishTranslation` inside the newsroom tick child
 * process — fire-and-forget dies when the tick process exits (Hetzner worker
 * spawns ticks as short-lived children).
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
 * Pick newest RU articles missing a published EN (and/or TR) localization.
 * Used by the Hetzner worker drip — bounded, never a mass backlog burst.
 */
export function pickArticlesNeedingTranslation<
  T extends { id: string; slug: string; title: string; summary: string; content: string; publishedAt?: string },
>(
  articles: T[],
  opts: {
    getLocalization: (
      articleId: string,
      language: LocalizationLanguage,
    ) => { translationStatus?: string; localizedTitle?: string; translatorModel?: string } | null;
    limit?: number;
  },
): T[] {
  const limit = Math.max(1, Math.min(opts.limit ?? 1, 5));
  const sorted = [...articles].sort((a, b) => {
    const ta = Date.parse(a.publishedAt || '') || 0;
    const tb = Date.parse(b.publishedAt || '') || 0;
    return tb - ta;
  });
  const out: T[] = [];
  for (const a of sorted) {
    if (!a.id || !a.title || !a.content) continue;
    const en = opts.getLocalization(a.id, 'en');
    const tr = opts.getLocalization(a.id, 'tr');
    const enDone = en?.translationStatus === 'published' && !isTestLocalization(en);
    const trDone = tr?.translationStatus === 'published' && !isTestLocalization(tr);
    if (enDone && trDone) continue;
    out.push(a);
    if (out.length >= limit) break;
  }
  return out;
}

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
