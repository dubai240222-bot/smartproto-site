'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import {
  LOCALE_UI,
  localeHomePath,
  type AppLocale,
} from '@/lib/i18n/locales';

type SubmitState = 'idle' | 'sending' | 'done' | 'error';

export function ScoutSubmitPage({ locale }: { locale: AppLocale }) {
  const ui = LOCALE_UI[locale];
  const homeHref = localeHomePath(locale);

  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [state, setState] = useState<SubmitState>('idle');
  const [message, setMessage] = useState('');

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
          email,
          website: honeypot,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setState('error');
        setMessage(data.message || data.error || ui.scoutErrorNetwork);
        return;
      }
      setState('done');
      setMessage(data.message || ui.scoutDoneMessage);
      setUrl('');
      setNote('');
      setName('');
      setEmail('');
    } catch {
      setState('error');
      setMessage(ui.scoutErrorNetwork);
    }
  }

  return (
    <main className="home-editorial mx-auto min-h-screen max-w-xl bg-[var(--bg)] px-4 py-10 text-[var(--text)] sm:px-6 lg:px-8">
      <p className="text-[12px] font-medium tracking-wide text-[var(--muted)]">
        <Link href={homeHref} className="hover:text-[var(--accent)]">
          ← SmartProto
        </Link>
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--text)] sm:text-3xl">
        {ui.scoutTitle}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--muted)] sm:text-[15px]">
        {ui.scoutIntro}
      </p>

      {state === 'done' ? (
        <div className="mt-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-sm font-medium text-[var(--text)]">{message}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">{ui.scoutDoneNote}</p>
          <button
            type="button"
            className="mt-4 text-xs font-semibold text-[var(--accent)] hover:underline"
            onClick={() => {
              setState('idle');
              setMessage('');
            }}
          >
            {ui.scoutSendAnother}
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {ui.scoutUrlLabel} <span className="text-[var(--accent)]">*</span>
            </span>
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] focus:ring-1"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {ui.scoutWhyLabel}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={800}
              placeholder={ui.scoutWhyPlaceholder}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] focus:ring-1"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {ui.scoutNameLabel}
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] focus:ring-1"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {ui.scoutEmailLabel}
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={120}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] focus:ring-1"
              />
            </label>
          </div>

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
            disabled={state === 'sending'}
            className="inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {state === 'sending' ? ui.scoutSubmitting : ui.scoutSubmit}
          </button>
          <p className="text-[11px] leading-relaxed text-[var(--muted)]">{ui.scoutFootnote}</p>
        </form>
      )}
    </main>
  );
}
