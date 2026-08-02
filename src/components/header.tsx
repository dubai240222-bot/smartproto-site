'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Calendar, Search, X } from 'lucide-react';
import articles from '@/data/articles';
import { ThemeToggle } from '@/components/theme-toggle';
import { formatPublishedAt } from '@/lib/article-utils';

export function Header() {
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
  }, [query]);

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
    <header className="border-b border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-colors">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
          {/* Brand: SP mark + HTML wordmark (scales; not a tiny raster lockup) */}
          <Link
            href="/"
            className="group inline-flex min-w-0 max-w-full shrink-0 items-center gap-3 self-start sm:gap-3.5"
            aria-label="SmartProto — на главную"
          >
            <Image
              src="/brand/smartproto-mark.png"
              alt=""
              width={512}
              height={512}
              priority
              className="h-12 w-12 shrink-0 object-contain sm:h-14 sm:w-14 md:h-16 md:w-16"
            />
            <span className="flex min-w-0 flex-col leading-none">
              <span className="text-[1.625rem] font-extrabold tracking-tight sm:text-[1.875rem] md:text-[2.25rem]">
                <span className="text-[var(--text)]">SMART</span>
                <span className="text-[var(--accent)]">PROTO</span>
              </span>
              <span className="mt-1.5 hidden text-[11px] font-medium leading-snug tracking-normal text-[var(--muted)] sm:block sm:text-xs md:text-[13px]">
                Технологии раньше, чем они станут мейнстримом
              </span>
            </span>
          </Link>

          {/* Right Controls: Search, RU, Theme Toggle */}
          <div className="flex shrink items-center gap-2 self-end sm:gap-3 md:self-auto">
            {/* Desktop Search */}
            <div ref={searchRef} className="relative">
              <div className="relative hidden items-center sm:flex">
                <Search className="absolute left-2.5 h-3.5 w-3.5 text-[var(--muted)]" />
                <input
                  type="text"
                  placeholder="Поиск по SmartProto"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setIsResultsOpen(true);
                  }}
                  onFocus={() => setIsResultsOpen(true)}
                  className="w-40 rounded border border-[var(--border)] bg-[var(--bg)] py-1.5 pl-8 pr-8 text-xs text-[var(--text)] transition-all duration-200 placeholder:text-[var(--muted)] focus:w-56 focus:border-[var(--accent)] focus:outline-none lg:w-48 lg:focus:w-64"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setIsResultsOpen(false);
                    }}
                    className="absolute right-2 text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Mobile search button toggle */}
              <button
                type="button"
                onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
                className="rounded border border-[var(--border)] bg-[var(--bg)] p-1.5 text-[var(--text)] sm:hidden"
                aria-label="Поиск"
              >
                <Search className="h-4 w-4" />
              </button>

              {/* Search Results Dropdown */}
              {isResultsOpen && query.trim().length > 0 && (
                <div className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-80 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 shadow-lg sm:w-96">
                  <div className="mb-2 flex items-center justify-between border-b border-[var(--border)] pb-2 text-xs text-[var(--muted)]">
                    <span>Результаты поиска ({searchResults.length})</span>
                    <button
                      type="button"
                      onClick={() => setIsResultsOpen(false)}
                      className="hover:text-[var(--text)]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {searchResults.length > 0 ? (
                    <div className="space-y-3">
                      {searchResults.map((article) => (
                        <Link
                          key={article.slug}
                          href={`/articles/${article.slug}`}
                          onClick={() => {
                            setIsResultsOpen(false);
                            setQuery('');
                          }}
                          className="block rounded p-2 transition hover:bg-[var(--bg)]"
                        >
                          <div className="text-[10px] font-semibold uppercase text-[var(--accent)]">
                            {article.category}
                          </div>
                          <h4 className="mt-0.5 line-clamp-2 font-serif text-sm font-bold leading-snug text-[var(--text)]">
                            {article.title}
                          </h4>
                          <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">
                            {article.summary}
                          </p>
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-[var(--muted)]">
                            <Calendar className="h-3 w-3" />
                            {formatPublishedAt(article.publishedAt)}
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="py-6 text-center text-xs text-[var(--muted)]">
                      Материалы не найдены
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mobile Search Overlay Input */}
            {isMobileSearchOpen && (
              <div className="absolute inset-x-0 top-full z-40 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] p-3 shadow-md sm:hidden">
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
                <button
                  type="button"
                  onClick={() => setIsMobileSearchOpen(false)}
                  className="p-1 text-[var(--muted)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Language Indicator */}
            <span className="select-none rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs font-semibold text-[var(--muted)]">
              RU
            </span>

            {/* Theme Toggle */}
            <ThemeToggle />
          </div>
        </div>

        {/* Navigation links */}
        <nav className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border)] pt-3 text-xs font-medium text-[var(--text)] sm:mt-4 sm:gap-x-5 md:gap-x-6">
          <Link href="/" className="transition hover:text-[var(--accent)]">
            Главная
          </Link>
          <Link
            href="/all"
            className="font-semibold text-[var(--accent)] transition hover:opacity-90"
          >
            Новости
          </Link>
          <Link href="/?category=Гаджеты" className="transition hover:text-[var(--accent)]">
            Гаджеты
          </Link>
          <Link href="/?category=ИИ" className="transition hover:text-[var(--accent)]">
            ИИ
          </Link>
          <Link href="/?category=Роботы" className="transition hover:text-[var(--accent)]">
            Роботы
          </Link>
          <Link href="/?category=Open Source" className="transition hover:text-[var(--accent)]">
            Open Source
          </Link>
          <Link href="/?category=Наука" className="transition hover:text-[var(--accent)]">
            Наука
          </Link>
          <Link href="/all" className="text-[var(--muted)] transition hover:text-[var(--accent)]">
            Архив
          </Link>
        </nav>
      </div>
    </header>
  );
}
