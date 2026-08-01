'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, ExternalLink, Loader2 } from 'lucide-react';

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
  if (!unixSeconds) {
    return 'Unknown time';
  }

  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(unixSeconds * 1000));
}

function getOutboundUrl(item: HackerNewsItem) {
  return item.url || item.hnUrl;
}

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
          throw new Error('Failed to load live feed');
        }

        const data = (await response.json()) as HackerNewsItem[];
        if (active) {
          setItems(Array.isArray(data) ? data : []);
        }
      } catch {
        if (active) {
          setError('Unable to load the live signal right now.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadFeed();

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="mx-auto max-w-7xl px-4 pb-16">
      <div className="rounded-[2rem] border border-white/8 bg-slate-950/60 p-6 shadow-[0_30px_110px_-55px_rgba(69,162,158,0.5)] md:p-8">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.28em] text-cyan-300">
              Live signal
            </span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Hacker News top stories, shown as a news-style feed
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
              This block keeps the site visibly alive before any AI model is connected. It pulls current signals from
              the public feed and presents them as clean editorial cards.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">Stories</p>
              <p className="mt-2 text-2xl font-semibold text-white">{loading ? '—' : items.length}</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">Refresh</p>
              <p className="mt-2 text-2xl font-semibold text-white">5 min</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-slate-950/80 px-5 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
            <span className="text-sm text-slate-300">Loading live signal...</span>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-5 py-4 text-sm text-amber-100">
            <p>{error}</p>
          </div>
        ) : items.length > 0 ? (
          <div className="grid gap-5 lg:grid-cols-3">
            {items.map((item) => (
              <article
                key={item.id}
                className="group flex h-full flex-col rounded-3xl border border-white/8 bg-slate-950/70 p-6 transition duration-300 hover:-translate-y-1 hover:border-cyan-400/30 hover:bg-white/7"
              >
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-300/90">Rank #{item.rank}</p>
                    <p className="mt-2 text-xs text-slate-400">{item.by || 'unknown author'}</p>
                  </div>
                  <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-300">
                    {item.type || 'story'}
                  </span>
                </div>

                <h3 className="text-xl font-semibold leading-tight text-white">{item.title || 'Untitled story'}</h3>

                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                  <span>{formatDate(item.time)}</span>
                  <span>•</span>
                  <span>{item.score ?? 0} points</span>
                  <span>•</span>
                  <span>{item.descendants ?? 0} comments</span>
                </div>

                <div className="mt-auto pt-6">
                  <a
                    href={getOutboundUrl(item)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-cyan-300 transition duration-300 hover:text-cyan-200"
                  >
                    Open source
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/8 bg-slate-950/80 px-5 py-4 text-sm text-slate-300">
            No live stories were returned yet.
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-xs text-slate-400">
          <span>Raw JSON live feed with no AI connection yet.</span>
          <span className="inline-flex items-center gap-2 text-cyan-300">
            News-style curation
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </section>
  );
}
