import Link from 'next/link';
import { getAllArticles, type Article } from '@/data/articles';
import { GridStoryCard, LeadRailItem } from '@/components/article-card';
import { orderArticlesForHomepage } from '@/lib/homepage-editorial-mix';
import { sortArticlesByPublishedDate } from '@/lib/article-utils';

export const metadata = {
  title: 'Темы | SmartProto',
  description: 'Роботы, AI, гаджеты, наука и производство — тематические подборки SmartProto.',
};

export const dynamic = 'force-dynamic';

function textBlob(a: Article): string {
  const tags = Array.isArray(a.tags) ? a.tags.join(' ') : '';
  return `${a.category} ${tags} ${a.title} ${a.summary} ${a.content}`.toLowerCase();
}

function pickTheme(list: Article[], pred: (a: Article) => boolean, limit = 6): Article[] {
  return orderArticlesForHomepage(list.filter(pred)).slice(0, limit);
}

export default function EditorialPage() {
  const all = sortArticlesByPublishedDate(getAllArticles());

  const themes: { title: string; href: string; items: Article[] }[] = [
    {
      title: 'Роботы и Physical AI',
      href: '/?category=Роботы',
      items: pickTheme(all, (a) => /робот|robot|tacta|gemini robotics/i.test(textBlob(a))),
    },
    {
      title: 'AI и модели',
      href: '/?category=ИИ',
      items: pickTheme(
        all,
        (a) => /\bai\b|ии|llm|gemini|gpt|claude|модель|deepmind|openai/i.test(textBlob(a)),
      ),
    },
    {
      title: 'Гаджеты и производство',
      href: '/?category=Производство',
      items: pickTheme(
        all,
        (a) => /гаджет|смартфон|представил|анонсир|redmi|iphone|pixel/i.test(textBlob(a)),
      ),
    },
    {
      title: 'Из лабораторий',
      href: '/?category=Наука',
      items: pickTheme(
        all,
        (a) => /исследован|лаборатор|prototype|university|csail|наук|rfid/i.test(textBlob(a)),
      ),
    },
  ].filter((t) => t.items.length > 0);

  return (
    <main className="home-editorial min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto max-w-[1440px] space-y-6 px-2 py-3 sm:px-4 sm:py-4 lg:px-5">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div>
            <p className="text-[12px] font-medium tracking-wide text-[var(--muted)]">Подборки</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Темы редакции</h1>
            <p className="mt-1 text-[13px] font-normal text-[var(--muted)]">
              Роботы, AI, гаджеты и наука — подборки по темам
            </p>
          </div>
          <div className="flex gap-3 text-[12px]">
            <Link href="/" className="text-[var(--muted)] transition hover:text-[var(--accent)]">
              Главная
            </Link>
            <Link href="/all" className="text-[var(--muted)] transition hover:text-[var(--accent)]">
              Лента →
            </Link>
          </div>
        </header>

        {themes.length === 0 ? (
          <p className="border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--muted)]">
            Пока нет материалов для тематических блоков.
          </p>
        ) : (
          themes.map((theme) => (
            <section key={theme.title} className="border-b border-[var(--border)] pb-5">
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <h2 className="text-[12px] font-medium tracking-wide text-[var(--muted)]">
                  {theme.title}
                </h2>
                <Link
                  href={theme.href}
                  className="text-[11px] font-normal text-[var(--muted)] transition hover:text-[var(--accent)]"
                >
                  Все →
                </Link>
              </div>
              {theme.items.length >= 4 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {theme.items.slice(0, 4).map((article) => (
                    <GridStoryCard key={article.slug} article={article} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                  {theme.items.map((article) => (
                    <LeadRailItem key={article.slug} article={article} />
                  ))}
                </div>
              )}
            </section>
          ))
        )}
      </div>
    </main>
  );
}
