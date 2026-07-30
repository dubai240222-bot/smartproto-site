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
    <section className="max-w-6xl mx-auto px-4 pb-12">
      <div className="flex justify-between items-end mb-8">
        <div>
          <span
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-4 border"
            style={{
              backgroundColor: 'var(--surface)',
              color: 'var(--primary)',
              borderColor: 'rgba(102, 252, 241, 0.2)',
            }}
          >
            Live Signal
          </span>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--heading)' }}>
            Hacker News top stories
          </h2>
        </div>
      </div>

      {loading ? (
        <div
          className="border rounded-xl p-6 flex items-center gap-3"
          style={{ backgroundColor: 'rgba(31, 40, 51, 0.5)', borderColor: 'var(--surface)' }}
        >
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--primary)' }} />
          <span style={{ color: 'var(--text)' }}>Loading live signal...</span>
        </div>
      ) : error ? (
        <div
          className="border rounded-xl p-6"
          style={{ backgroundColor: 'rgba(31, 40, 51, 0.5)', borderColor: 'var(--surface)' }}
        >
          <p style={{ color: 'var(--text)' }}>{error}</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {items.map((item) => (
            <article
              key={item.id}
              className="glow-card border rounded-xl p-6 h-full"
              style={{ backgroundColor: 'rgba(31, 40, 51, 0.5)', borderColor: 'var(--surface)' }}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="text-xs font-medium uppercase tracking-wider mb-2 block" style={{ color: 'var(--secondary)' }}>
                    Rank #{item.rank}
                  </span>
                  <p className="text-xs" style={{ color: 'var(--text)', opacity: 0.7 }}>
                    {item.by || 'unknown author'}
                  </p>
                </div>
                <span
                  className="text-xs font-medium px-2 py-1 rounded border"
                  style={{
                    backgroundColor: 'rgba(102, 252, 241, 0.1)',
                    color: 'var(--primary)',
                    borderColor: 'rgba(102, 252, 241, 0.2)',
                  }}
                >
                  {item.type || 'story'}
                </span>
              </div>

              <h3 className="text-xl font-bold mb-3" style={{ color: 'var(--heading)' }}>
                {item.title || 'Untitled story'}
              </h3>

              <div className="flex items-center gap-3 text-xs mb-4" style={{ color: 'var(--text)', opacity: 0.7 }}>
                <span>{formatDate(item.time)}</span>
                <span>-</span>
                <span>{item.score ?? 0} points</span>
                <span>-</span>
                <span>{item.descendants ?? 0} comments</span>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <span className="text-xs font-medium" style={{ color: 'var(--text)', opacity: 0.7 }}>
                  Raw JSON live feed
                </span>
                <a
                  href={getOutboundUrl(item)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium hover:opacity-80 transition-opacity"
                  style={{ color: 'var(--primary)' }}
                >
                  Open source
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
