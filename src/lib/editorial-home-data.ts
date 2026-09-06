import { getAllArticles, type Article } from '@/data/articles';
import { listPublishedLocalizations } from '@/data/localizations';
import { sortArticlesByPublishedDate } from '@/lib/article-utils';
import { localeArticlePath, type AppLocale, type LocalizationLanguage } from '@/lib/i18n/locales';

/** Canonical article + locale-specific display fields for homepage cards. */
export type HomeStory = {
  article: Article;
  title: string;
  summary: string;
  href: string;
};

function textBlob(a: Article): string {
  const tags = Array.isArray(a.tags) ? a.tags.join(' ') : '';
  return `${a.category} ${tags} ${a.title} ${a.summary} ${a.content}`.toLowerCase();
}

/** Category filter — same rules as RU homepage (canonical RU category names in URLs). */
export function filterHomeStoriesByCategory(categoryName: string, stories: HomeStory[]): HomeStory[] {
  const norm = categoryName.toLowerCase().trim();
  if (!norm) return stories;

  return stories.filter(({ article: a, title, summary }) => {
    const cat = a.category.toLowerCase();
    const titleL = title.toLowerCase();
    const summaryL = summary.toLowerCase();
    const content = a.content.toLowerCase();
    const tags = Array.isArray(a.tags) ? a.tags.join(' ').toLowerCase() : '';
    const blob = `${textBlob(a)} ${titleL} ${summaryL}`;

    if (norm === 'китай' || norm === 'china' || norm === 'qwen') return cat.includes('гаджет');
    if (norm === 'производство' || norm === 'серия' || norm === 'серийное') {
      return (
        cat.includes('гаджет') ||
        cat.includes('смартфон') ||
        cat.includes('новинк') ||
        blob.includes('представил') ||
        blob.includes('анонсир') ||
        blob.includes('в продаже') ||
        blob.includes('производител')
      );
    }
    if (norm === 'новинки') return cat.includes('новинк') || titleL.includes('новинк');
    if (norm === 'гаджеты') return cat.includes('гаджет') || titleL.includes('гаджет');
    if (norm === 'приложения' || norm === 'apps' || norm === 'приложен') {
      return (
        cat.includes('приложен') ||
        tags.includes('приложен') ||
        blob.includes('mobile app') ||
        blob.includes('app store') ||
        /\bapps?\b/.test(tags) ||
        titleL.includes('app')
      );
    }
    if (norm === 'смартфоны') {
      return cat.includes('смартфон') || blob.includes('smartphone') || titleL.includes('iphone');
    }
    if (norm === 'ai' || norm === 'ии' || norm === 'искусственный интеллект') {
      return cat.includes('ии') || cat.includes('ai') || blob.includes('assistant') || blob.includes('chatgpt');
    }
    if (norm === 'робототехника' || norm === 'роботы') return cat.includes('робот') || titleL.includes('robot');
    if (norm === 'open source') {
      return cat.includes('open source') || titleL.includes('open source') || content.includes('open source');
    }
    if (norm === 'наука') {
      return cat.includes('наук') || blob.includes('research') || titleL.includes('lab');
    }
    return cat.includes(norm) || tags.includes(norm) || titleL.includes(norm) || summaryL.includes(norm);
  });
}

export function listHomeStories(locale: AppLocale): HomeStory[] {
  const articles = sortArticlesByPublishedDate(getAllArticles());

  if (locale === 'ru') {
    return articles.map((article) => ({
      article,
      title: article.title,
      summary: article.summary,
      href: localeArticlePath('ru', article.slug),
    }));
  }

  const lang = locale as LocalizationLanguage;
  const locs = listPublishedLocalizations(lang);
  const byId = new Map(articles.map((a) => [a.id, a]));

  const stories: HomeStory[] = [];
  for (const loc of locs) {
    const article = byId.get(loc.articleId);
    if (!article) continue;
    stories.push({
      article,
      title: loc.localizedTitle,
      summary: loc.localizedExcerpt || '',
      href: localeArticlePath(locale, loc.localizedSlug),
    });
  }

  return stories.sort((a, b) =>
    String(b.article.publishedAt).localeCompare(String(a.article.publishedAt)),
  );
}
