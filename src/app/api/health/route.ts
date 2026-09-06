import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (process.env.ARTICLES_STORE === 'sqlite') {
      const { countArticles } = await import('@/lib/data-store/articles-repo');
      const { getAllArticles } = await import('@/data/articles');
      const { getLocalization } = await import('@/data/localizations');
      const { buildArchiveTranslationHealth } = await import(
        '@/lib/i18n/archive-translate-health'
      );
      const { buildAutoPublishHealth } = await import('@/lib/newsroom/auto-publish-health');
      const total = countArticles();
      const articles = getAllArticles();
      const archive = buildArchiveTranslationHealth(articles, getLocalization);
      const autoPublish = buildAutoPublishHealth({
        articles: articles.map((a) => ({
          slug: a.slug,
          publishedAt: a.publishedAt,
          agentId: a.agentId,
        })),
      });
      const overallStatus =
        autoPublish.auto_publish_stale && autoPublish.worker_mode !== 'off'
          ? 'degraded'
          : 'ok';
      return NextResponse.json({
        status: overallStatus,
        store: 'sqlite',
        articles: total,
        archive_translation: archive,
        auto_publish: autoPublish,
        warnings: autoPublish.auto_publish_stale ? ['AUTO_PUBLISH_STALE'] : [],
      });
    }
    return NextResponse.json({ status: 'ok', store: 'json' });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
