'use client';

import { useEffect, useState } from 'react';
import {
  INTEREST_SCORES,
  telegramShareUrl,
  whatsappShareUrl,
  type InterestScore,
  type PublicInterestStats,
  type ShareChannel,
} from '@/lib/interest-rating-shared';

type Props = { slug: string; title: string; summary?: string };

const VOTE_KEY = 'sp-interest-vote:';
const MLT_KEY = 'sp-interest-mlt:';
const ANON_KEY = 'sp-anon-id';

function anonId(): string {
  try {
    const existing = localStorage.getItem(ANON_KEY);
    if (existing && existing.length >= 8) return existing;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(ANON_KEY, id);
    return id;
  } catch {
    return `anon-session-${Date.now()}`;
  }
}

function fmtAvg(avg: number) {
  return Number.isInteger(avg) ? String(avg) : avg.toFixed(1).replace('.', ',');
}

function votesWord(n: number) {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return 'голос';
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'голоса';
  return 'голосов';
}

export function InterestRating({ slug, title, summary = '' }: Props) {
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<InterestScore | null>(null);
  const [moreLiked, setMoreLiked] = useState(false);
  const [stats, setStats] = useState<PublicInterestStats | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const n = Number(localStorage.getItem(`${VOTE_KEY}${slug}`));
      if (n >= 1 && n <= 10 && Number.isInteger(n)) setSelected(n as InterestScore);
      if (localStorage.getItem(`${MLT_KEY}${slug}`) === '1') setMoreLiked(true);
    } catch {
      /* ignore */
    }
    let on = true;
    fetch(`/api/interest-rating?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (on && d?.stats) setStats(d.stats as PublicInterestStats);
      })
      .catch(() => undefined);
    return () => {
      on = false;
    };
  }, [slug]);

  const pageUrl = typeof window !== 'undefined' ? window.location.href.split('#')[0] : '';

  async function post(body: Record<string, unknown>) {
    const res = await fetch('/api/interest-rating', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (data?.stats) setStats(data.stats as PublicInterestStats);
    return res.ok && Boolean(data?.ok);
  }

  async function vote(score: InterestScore) {
    if (busy) return;
    setBusy(true);
    setSelected(score);
    try {
      localStorage.setItem(`${VOTE_KEY}${slug}`, String(score));
    } catch {
      /* ignore */
    }
    try {
      await post({ action: 'rating', slug, score, anonId: anonId() });
    } catch {
      /* retry allowed */
    } finally {
      setBusy(false);
    }
  }

  async function moreLike() {
    if (busy || moreLiked) return;
    setBusy(true);
    setMoreLiked(true);
    try {
      localStorage.setItem(`${MLT_KEY}${slug}`, '1');
    } catch {
      /* ignore */
    }
    try {
      await post({ action: 'more_like_this', slug, anonId: anonId() });
    } catch {
      /* silent */
    } finally {
      setBusy(false);
    }
  }

  async function track(channel: ShareChannel) {
    try {
      await post({ action: 'share', slug, channel, anonId: anonId() });
    } catch {
      /* silent */
    }
  }

  async function share() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: summary || title, url: pageUrl });
        await track('native');
        return;
      } catch {
        /* fallback */
      }
    }
    setShareOpen((v) => !v);
  }

  async function openChannel(channel: 'telegram' | 'whatsapp') {
    const url =
      channel === 'telegram'
        ? telegramShareUrl(pageUrl, title)
        : whatsappShareUrl(pageUrl, title);
    await track(channel);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      await track('copy');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* silent */
    }
  }

  if (!mounted) {
    return <section className="mt-10 border-t border-[var(--border)] pt-6" aria-hidden><div className="h-20" /></section>;
  }

  const btn =
    'h-9 px-3 text-xs font-semibold rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--accent)]';
  const scoreBtn = (active: boolean) =>
    `min-w-9 h-9 px-2.5 text-sm font-semibold rounded border transition-colors ${
      active
        ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
    } disabled:opacity-60`;

  return (
    <section className="mt-10 border-t border-[var(--border)] pt-6" aria-label="Обратная связь читателя">
      <p className="font-serif text-sm font-bold text-[var(--text)]">Насколько вам было интересно?</p>
      <div role="group" aria-label="Оценка от 1 до 10" className="mt-3 flex flex-wrap gap-1.5">
        {INTEREST_SCORES.map((score) => (
          <button
            key={score}
            type="button"
            disabled={busy}
            onClick={() => vote(score)}
            aria-pressed={selected === score}
            className={scoreBtn(selected === score)}
          >
            {score}
          </button>
        ))}
      </div>

      {selected !== null && (
        <p className="mt-3 text-xs text-[var(--muted)] leading-relaxed">
          Спасибо! Ваш голос помогает SmartProto выбирать более интересные темы.
          {stats?.avg != null
            ? ` · средняя ${fmtAvg(stats.avg)} · ${stats.count}\u00a0${votesWord(stats.count)}`
            : ''}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || moreLiked}
          onClick={moreLike}
          className={
            moreLiked
              ? 'h-9 px-3 text-xs font-semibold rounded border border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
              : btn
          }
        >
          {moreLiked ? 'Учтено' : '❤️ Хочу больше такого'}
        </button>
        <button type="button" onClick={share} className={btn}>
          📤 Поделиться
        </button>
      </div>

      {shareOpen && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => openChannel('telegram')} className="h-8 px-2.5 text-xs rounded border border-[var(--border)]">
            Telegram
          </button>
          <button type="button" onClick={() => openChannel('whatsapp')} className="h-8 px-2.5 text-xs rounded border border-[var(--border)]">
            WhatsApp
          </button>
          <button type="button" onClick={copyLink} className="h-8 px-2.5 text-xs rounded border border-[var(--border)]">
            {copied ? 'Скопировано' : 'Копировать ссылку'}
          </button>
        </div>
      )}
    </section>
  );
}
