'use client';

import { useEffect, useState } from 'react';
import {
  INTEREST_SCORES,
  type InterestScore,
  type SlugInterestStats,
} from '@/lib/interest-rating-shared';

type Props = {
  slug: string;
};

const STORAGE_VOTE_PREFIX = 'sp-interest-vote:';
const STORAGE_ANON = 'sp-anon-id';

function getOrCreateAnonId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_ANON);
    if (existing && existing.length >= 8) return existing;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(STORAGE_ANON, id);
    return id;
  } catch {
    return `anon-session-${Date.now()}`;
  }
}

function formatAvg(avg: number): string {
  return Number.isInteger(avg) ? String(avg) : avg.toFixed(1).replace('.', ',');
}

function pluralVotes(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'голос';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'голоса';
  return 'голосов';
}

export function InterestRating({ slug }: Props) {
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<InterestScore | null>(null);
  const [stats, setStats] = useState<SlugInterestStats | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(`${STORAGE_VOTE_PREFIX}${slug}`);
      const n = saved ? Number(saved) : NaN;
      if (n >= 5 && n <= 10 && Number.isInteger(n)) {
        setSelected(n as InterestScore);
      }
    } catch {
      // ignore
    }

    let active = true;
    fetch(`/api/interest-rating?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data?.stats) return;
        setStats(data.stats as SlugInterestStats);
      })
      .catch(() => {
        // silent — rating UI still works offline via localStorage
      });

    return () => {
      active = false;
    };
  }, [slug]);

  const vote = async (score: InterestScore) => {
    if (submitting || selected !== null) return;

    setSubmitting(true);
    setError('');
    setSelected(score);

    try {
      localStorage.setItem(`${STORAGE_VOTE_PREFIX}${slug}`, String(score));
    } catch {
      // ignore
    }

    try {
      const anonId = getOrCreateAnonId();
      const res = await fetch('/api/interest-rating', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, score, anonId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Не удалось сохранить оценку');
      }
      if (data.stats) {
        setStats(data.stats as SlugInterestStats);
      }
    } catch {
      setError('Оценка сохранена у вас локально. Сервер временно недоступен.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted) {
    return (
      <section className="mt-10 border-t border-[var(--border)] pt-6" aria-hidden>
        <div className="h-16" />
      </section>
    );
  }

  const voted = selected !== null;

  return (
    <section
      className="mt-10 border-t border-[var(--border)] pt-6"
      aria-label="Оценка интереса"
    >
      <p className="font-serif text-sm font-bold text-[var(--text)]">
        Насколько интересно?
      </p>
      <p className="mt-1 text-xs text-[var(--muted)] leading-relaxed">
        Если было интересно — поставьте оценку после чтения (10 — самое интересное, 5 — слабо).
      </p>

      <div
        role="group"
        aria-label="Оценка от 5 до 10"
        className="mt-4 flex flex-wrap gap-2"
      >
        {INTEREST_SCORES.map((score) => {
          const isActive = selected === score;
          const disabled = submitting || (voted && !isActive);

          return (
            <button
              key={score}
              type="button"
              disabled={disabled}
              onClick={() => vote(score)}
              aria-pressed={isActive}
              className={`min-w-10 h-9 px-3 text-sm font-semibold rounded border transition-colors ${
                isActive
                  ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
              } disabled:opacity-50 disabled:cursor-default`}
            >
              {score}
            </button>
          );
        })}
      </div>

      {voted && (
        <p className="mt-3 text-xs text-[var(--muted)]">
          Спасибо за оценку
          {stats && stats.count > 0
            ? ` · средняя ${formatAvg(stats.avg)} · ${stats.count}\u00a0${pluralVotes(stats.count)}`
            : ''}
          {selected ? ` · ваша: ${selected}` : ''}
        </p>
      )}

      {error && <p className="mt-2 text-xs text-[var(--muted)]">{error}</p>}
    </section>
  );
}
