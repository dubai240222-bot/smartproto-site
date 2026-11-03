'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';

type SubmitState = 'idle' | 'sending' | 'done' | 'error';

export default function ScoutPage() {
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [state, setState] = useState<SubmitState>('idle');
  const [message, setMessage] = useState('');
  const [challenge, setChallenge] = useState('');
  const [openedAt, setOpenedAt] = useState(0);
  const [contactEmail, setContactEmail] = useState<string | null>(null);

  async function loadChallenge() {
    try {
      const res = await fetch('/api/scout', { cache: 'no-store' });
      const data = (await res.json()) as { challenge?: string; issuedAt?: number };
      if (data.challenge) setChallenge(data.challenge);
      setOpenedAt(typeof data.issuedAt === 'number' ? data.issuedAt : Date.now());
    } catch {
      setOpenedAt(Date.now());
    }
  }

  useEffect(() => {
    void loadChallenge();
    // Public contact email is embedded via meta from a tiny endpoint-free hint:
    // read from a data attribute on document if present; else leave null.
    try {
      const el = document.querySelector('meta[name="smartproto-contact"]');
      const v = el?.getAttribute('content')?.trim();
      if (v && v.includes('@')) setContactEmail(v);
    } catch {
      /* ignore */
    }
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setState('sending');
    setMessage('');
    try {
      const res = await fetch('/api/scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          note,
          name,
          website: honeypot,
          challenge,
          openedAt,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setState('error');
        setMessage(data.message || data.error || 'Не удалось отправить находку.');
        void loadChallenge();
        return;
      }
      setState('done');
      setMessage(data.message || 'Спасибо. Находка передана в редакцию SmartProto.');
      setUrl('');
      setNote('');
      setName('');
      void loadChallenge();
    } catch {
      setState('error');
      setMessage('Сеть недоступна. Попробуйте ещё раз.');
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6 lg:px-8">
      <p className="text-[12px] font-medium tracking-wide text-[var(--muted)]">
        <Link href="/" className="hover:text-[var(--accent)]">
          ← SmartProto
        </Link>
      </p>
      <h1 className="mt-3 font-serif text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
        Прислать крутую новость
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--muted)] sm:text-[15px]">
        Одна ссылка — этого достаточно. Сначала находку проверяет редакция (спам, тема,
        безопасность). На почту владельца письмо попадает только после SAFE-проверки — сырой
        поток туда не идёт.
      </p>

      {state === 'done' ? (
        <div className="mt-8 border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-sm font-medium text-[var(--text)]">{message}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Публикация не гарантируется. Если материал выйдет — ваше имя может попасть в{' '}
            <Link href="/stringers" className="text-[var(--accent)] hover:underline">
              рейтинг внештатных
            </Link>
            .
          </p>
          <button
            type="button"
            className="mt-4 text-xs font-semibold text-[var(--accent)] hover:underline"
            onClick={() => {
              setState('idle');
              setMessage('');
            }}
          >
            Прислать ещё одну ссылку
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-4" autoComplete="off">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Ссылка на новость <span className="text-[var(--accent)]">*</span>
            </span>
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
              inputMode="url"
              className="w-full border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-base text-[var(--text)] outline-none ring-[var(--accent)] focus:ring-1"
            />
          </label>

          <details className="group border border-[var(--border)] bg-[var(--surface)] open:pb-3">
            <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              По желанию: почему это круто / ваше имя
            </summary>
            <div className="space-y-3 px-3 pt-1">
              <label className="block space-y-1.5">
                <span className="text-xs text-[var(--muted)]">Короткий комментарий</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={800}
                  placeholder="Что нового для человека?"
                  className="w-full border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] focus:ring-1"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs text-[var(--muted)]">Имя для рейтинга внештатных</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  placeholder="Как подписывать, если опубликуем"
                  className="w-full border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] focus:ring-1"
                />
              </label>
            </div>
          </details>

          {/* Honeypot — hidden from humans */}
          <label className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden" aria-hidden>
            Company
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </label>

          {state === 'error' && message ? (
            <p className="text-sm text-red-700 dark:text-red-400">{message}</p>
          ) : null}

          <button
            type="submit"
            disabled={state === 'sending' || !challenge}
            className="inline-flex w-full items-center justify-center bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60 sm:w-auto"
          >
            {state === 'sending' ? 'Отправляем…' : 'Отправить в редакцию'}
          </button>
          <p className="text-[11px] leading-relaxed text-[var(--muted)]">
            Защита: honeypot, антибот-токен, лимит частоты, только http(s), без javascript:/data:,
            без локальных адресов. Ссылку сервер не открывает за вас при приёме.
          </p>
        </form>
      )}

      <div className="mt-10 border-t border-[var(--border)] pt-6 text-sm text-[var(--muted)]">
        <p className="font-medium text-[var(--text)]">Связь с редакцией</p>
        <p className="mt-1">
          Вопросы и предложения — через эту форму. Личная почта владельца не публикуется: на неё
          уходят только SAFE-находки после фильтра редакции.
        </p>
        {contactEmail ? (
          <p className="mt-2">
            Редакционная почта:{' '}
            <a
              className="text-[var(--accent)] hover:underline"
              href={`mailto:${contactEmail}?subject=${encodeURIComponent('SmartProto: tip / contact')}`}
            >
              {contactEmail}
            </a>
          </p>
        ) : null}
        <p className="mt-3">
          <Link href="/stringers" className="text-[var(--accent)] hover:underline">
            Рейтинг лучших внештатных →
          </Link>
        </p>
      </div>
    </main>
  );
}
