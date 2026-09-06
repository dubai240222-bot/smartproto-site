'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';

type HackerNewsItem = {
  id: number;
  by?: string;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
  time?: number;
  type?: string;
  rank: number;
  hnUrl: string;
};

function formatDate(unixSeconds?: number) {
  if (!unixSeconds) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(unixSeconds * 1000));
}

function getOutboundUrl(item: HackerNewsItem) {
  return item.url || item.hnUrl;
}

/** Optional live HN strip — styled to match SmartProto editorial chrome. */
export function LiveFeedSection() {
  const [items, setItems] = useState<HackerNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadFeed() {
      try {
        setLoading(true);
        setError('');
        const response = await fetch('/api/feed', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('Не удалось загрузить ленту');
        }
        const data = (await response.json()) as { items?: HackerNewsItem[] };
        if (active) setItems(Array.isArray(data.items) ? data.items : []);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Ошибка загрузки');
          setItems([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadFeed();
    const timer = window.setInterval(() => void loadFeed(), 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section className="home-editorial mx-auto max-w-[1440px] px-2 pb-8 sm:px-4 lg:px-5">
      <div className="border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div>
            <p className="text-[12px] font-medium tracking-wide text-[var(--muted)]">Сигнал</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--text)] sm:text-xl">
              Hacker News · топ
            </h2>
            <p className="mt-1 text-[13px] font-normal text-[var(--muted)]">
              Живая внешняя лента · обновление каждые 5 минут
            </p>
          </div>
          <p className="text-[12px] tabular-nums text-[var(--muted)]">
            {loading ? '…' : `${items.length} историй`}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-[13px] text-[var(--muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загрузка…
          </div>
        ) : error ? (
          <p className="py-4 text-[13px] text-[var(--muted)]">{error}</p>
        ) : items.length > 0 ? (
          <div className="divide-y divide-[var(--border)]">
            {items.map((item) => (
              <article key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-normal tabular-nums text-[var(--muted)]">
                    #{item.rank} · {formatDate(item.time)} · {item.score ?? 0} pts
                  </p>
                  <h3 className="mt-1 text-[14px] font-medium leading-snug tracking-tight text-[var(--text)]">
                    {item.title || 'Без названия'}
                  </h3>
                </div>
                <a
                  href={getOutboundUrl(item)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-[var(--accent)] hover:underline"
                >
                  Источник
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </article>
            ))}
          </div>
        ) : (
          <p className="py-4 text-[13px] text-[var(--muted)]">Пока нет историй.</p>
        )}
      </div>
    </section>
  );
}
