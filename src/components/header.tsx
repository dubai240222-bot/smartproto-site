'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Calendar, Search, X } from 'lucide-react';
import type { Article } from '@/data/articles';
import { ThemeToggle } from '@/components/theme-toggle';
import { formatPublishedAt } from '@/lib/article-utils';

export function Header({ articles }: { articles: Article[] }) {
  const [query, setQuery] = useState('');
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return articles.filter((article) => {
      return (
        article.title.toLowerCase().includes(q) ||
        article.summary.toLowerCase().includes(q) ||
        article.category.toLowerCase().includes(q) ||
        article.content.toLowerCase().includes(q)
      );
    });
  }, [articles, query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsResultsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]/95 text-[var(--text)] backdrop-blur-sm transition-colors">
      <div className="mx-auto max-w-[1280px] px-3 sm:px-5 lg:px-6">
        <div className="flex items-center justify-between gap-3 py-2 sm:py-2.5">
          {/* Brand — compact for editorial density */}
          <Link
            href="/"
            className="group inline-flex min-w-0 shrink-0 items-center gap-2 sm:gap-2.5"
            aria-label="SmartProto — на главную"
          >
            <Image
              src="/brand/smartproto-mark.png"
              alt=""
              width={512}
              height={512}
              priority
              className="h-8 w-8 shrink-0 object-contain sm:h-9 sm:w-9"
            />
            <span className="flex min-w-0 flex-col leading-none">
              <span className="text-base font-extrabold tracking-tight sm:text-lg">
                <span className="text-[var(--text)]">SMART</span>
                <span className="text-[var(--accent)]">PROTO</span>
              </span>
              <span className="mt-0.5 hidden text-[10px] font-medium text-[var(--muted)] md:block">
                Технологии раньше мейнстрима
              </span>
            </span>
          </Link>

          {/* Desktop nav — inline with brand row */}
          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-x-4 text-[11px] font-medium uppercase tracking-wide text-[var(--text)] lg:flex xl:gap-x-5">
            <Link href="/all" className="text-[var(--accent)] transition hover:opacity-90">
              Новости
            </Link>
            <Link href="/?category=Роботы" className="transition hover:text-[var(--accent)]">
              Роботы
            </Link>
            <Link href="/?category=ИИ" className="transition hover:text-[var(--accent)]">
              AI
            </Link>
            <Link href="/?category=Гаджеты" className="transition hover:text-[var(--accent)]">
              Гаджеты
            </Link>
            <Link href="/?category=Наука" className="transition hover:text-[var(--accent)]">
              Наука
            </Link>
            <Link href="/?category=Производство" className="transition hover:text-[var(--accent)]">
              Производство
            </Link>
            <Link href="/all" className="text-[var(--muted)] transition hover:text-[var(--accent)]">
              Ещё
            </Link>
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <div ref={searchRef} className="relative">
              <div className="relative hidden items-center sm:flex">
                <Search className="absolute left-2 h-3.5 w-3.5 text-[var(--muted)]" />
                <input
                  type="text"
                  placeholder="Поиск"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setIsResultsOpen(true);
                  }}
                  onFocus={() => setIsResultsOpen(true)}
                  className="w-32 rounded border border-[var(--border)] bg-[var(--bg)] py-1 pl-7 pr-7 text-xs text-[var(--text)] transition-all placeholder:text-[var(--muted)] focus:w-48 focus:border-[var(--accent)] focus:outline-none lg:w-40 lg:focus:w-56"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setIsResultsOpen(false);
                    }}
                    className="absolute right-1.5 text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
                className="rounded border border-[var(--border)] bg-[var(--bg)] p-1.5 text-[var(--text)] sm:hidden"
                aria-label="Поиск"
              >
                <Search className="h-3.5 w-3.5" />
              </button>

              {isResultsOpen && query.trim().length > 0 ? (
                <div className="absolute right-0 top-full z-50 mt-1.5 max-h-[70vh] w-80 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5 shadow-lg sm:w-96">
                  <div className="mb-2 flex items-center justify-between border-b border-[var(--border)] pb-1.5 text-xs text-[var(--muted)]">
                    <span>Результаты ({searchResults.length})</span>
                    <button type="button" onClick={() => setIsResultsOpen(false)}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {searchResults.length > 0 ? (
                    <div className="space-y-2">
                      {searchResults.map((article) => (
                        <Link
                          key={article.slug}
                          href={`/articles/${article.slug}`}
                          onClick={() => {
                            setIsResultsOpen(false);
                            setQuery('');
                          }}
                          className="block rounded p-1.5 transition hover:bg-[var(--bg)]"
                        >
                          <div className="text-[10px] font-semibold uppercase text-[var(--accent)]">
                            {article.category}
                          </div>
                          <h4 className="mt-0.5 line-clamp-2 font-serif text-sm font-bold leading-snug text-[var(--text)]">
                            {article.title}
                          </h4>
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-[var(--muted)]">
                            <Calendar className="h-3 w-3" />
                            {formatPublishedAt(article.publishedAt)}
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="py-5 text-center text-xs text-[var(--muted)]">
                      Материалы не найдены
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {isMobileSearchOpen ? (
              <div className="absolute inset-x-0 top-full z-40 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] p-2.5 shadow-md sm:hidden">
                <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                <input
                  type="text"
                  placeholder="Поиск по SmartProto"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setIsResultsOpen(true);
                  }}
                  autoFocus
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
                />
                <button type="button" onClick={() => setIsMobileSearchOpen(false)} className="p-1 text-[var(--muted)]">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}

            <span className="hidden select-none rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)] sm:inline">
              RU
            </span>
            <ThemeToggle />
          </div>
        </div>

        {/* Mobile / tablet nav */}
        <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--border)] py-1.5 text-[11px] font-medium text-[var(--text)] lg:hidden">
          <Link href="/all" className="font-medium text-[var(--accent)]">
            Новости
          </Link>
          <Link href="/?category=Роботы" className="transition hover:text-[var(--accent)]">
            Роботы
          </Link>
          <Link href="/?category=ИИ" className="transition hover:text-[var(--accent)]">
            AI
          </Link>
          <Link href="/?category=Гаджеты" className="transition hover:text-[var(--accent)]">
            Гаджеты
          </Link>
          <Link href="/?category=Наука" className="transition hover:text-[var(--accent)]">
            Наука
          </Link>
          <Link href="/?category=Производство" className="transition hover:text-[var(--accent)]">
            Производство
          </Link>
          <Link href="/all" className="text-[var(--muted)] transition hover:text-[var(--accent)]">
            Ещё
          </Link>
        </nav>
      </div>
    </header>
  );
}
