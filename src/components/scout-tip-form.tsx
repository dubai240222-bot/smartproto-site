'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import type { AppLocale } from '@/lib/i18n/locales';
import { CONTACT_SCOUT_UI } from '@/lib/i18n/contact-scout';
import { localePath } from '@/lib/site-contact';
import { RegisterLocaleLinks } from '@/components/register-locale-links';

type Step = 'form' | 'otp' | 'done';
type Busy = 'idle' | 'otp' | 'submit';

export function ScoutTipForm({ locale }: { locale: AppLocale }) {
  const ui = CONTACT_SCOUT_UI[locale];
  const [step, setStep] = useState<Step>('form');
  const [busy, setBusy] = useState<Busy>('idle');
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [pendingId, setPendingId] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [emailConfigBlocked, setEmailConfigBlocked] = useState(false);

  function resetAll() {
    setStep('form');
    setBusy('idle');
    setUrl('');
    setEmail('');
    setName('');
    setNote('');
    setHoneypot('');
    setPendingId('');
    setCode('');
    setMessage('');
    setError('');
    setEmailConfigBlocked(false);
  }

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    if (busy !== 'idle') return;
    setBusy('otp');
    setError('');
    setEmailConfigBlocked(false);
    try {
      const res = await fetch('/api/scout/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          email,
          name,
          note,
          website: honeypot,
          locale,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        pendingId?: string;
        message?: string;
        error?: string;
        code?: string;
      };
      if (!res.ok || !data.ok || !data.pendingId) {
        if (data.code === 'EMAIL_CONFIG') {
          setEmailConfigBlocked(true);
          setError(ui.scoutEmailConfig);
        } else {
          setError(data.message || data.error || 'Error');
        }
        setBusy('idle');
        return;
      }
      setPendingId(data.pendingId);
      setStep('otp');
      setBusy('idle');
    } catch {
      setError(
        locale === 'en'
          ? 'Network unavailable. Try again.'
          : locale === 'tr'
            ? 'Ağ kullanılamıyor. Yeniden deneyin.'
            : 'Сеть недоступна. Попробуйте ещё раз.',
      );
      setBusy('idle');
    }
  }

  async function confirmSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy !== 'idle') return;
    setBusy('submit');
    setError('');
    try {
      const res = await fetch('/api/scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pendingId,
          code,
          website: honeypot,
          locale,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.message || data.error || 'Error');
        setBusy('idle');
        return;
      }
      setMessage(data.message || ui.scoutSuccess);
      setStep('done');
      setBusy('idle');
    } catch {
      setError(
        locale === 'en'
          ? 'Network unavailable. Try again.'
          : locale === 'tr'
            ? 'Ağ kullanılamıyor. Yeniden deneyin.'
            : 'Сеть недоступна. Попробуйте ещё раз.',
      );
      setBusy('idle');
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6 lg:px-8">
      <RegisterLocaleLinks
        ru={localePath('ru', '/scout')}
        en={localePath('en', '/scout')}
        tr={localePath('tr', '/scout')}
      />
      <p className="text-[12px] font-medium tracking-wide text-[var(--muted)]">
        <Link href={localePath(locale, '/')} className="hover:text-[var(--accent)]">
          {ui.backHome}
        </Link>
      </p>
      <h1 className="mt-3 font-serif text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
        {ui.scoutTitle}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--muted)] sm:text-[15px]">{ui.scoutLead}</p>

      {step === 'done' ? (
        <div className="mt-8 border-t border-[var(--border)] pt-6">
          <p className="text-sm font-medium text-[var(--text)]">{message || ui.scoutSuccess}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">{ui.scoutSuccessHint}</p>
          <button
            type="button"
            className="mt-4 text-xs font-semibold text-[var(--accent)] hover:underline"
            onClick={resetAll}
          >
            {ui.scoutAgain}
          </button>
        </div>
      ) : step === 'otp' ? (
        <form onSubmit={confirmSubmit} className="mt-8 space-y-4">
          <p className="text-sm text-[var(--muted)]">
            {email}
          </p>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {ui.scoutCodeLabel} <span className="text-[var(--accent)]">*</span>
            </span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm tracking-[0.3em] text-[var(--text)] outline-none ring-[var(--accent)] focus:ring-1"
              aria-invalid={Boolean(error)}
            />
          </label>
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
          {error ? <p className="text-sm text-red-700 dark:text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={busy !== 'idle' || code.length !== 6}
            className="inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {busy === 'submit' ? ui.scoutSubmitting : ui.scoutSubmit}
          </button>
          <button
            type="button"
            className="ml-3 text-xs font-semibold text-[var(--muted)] hover:text-[var(--accent)]"
            onClick={() => {
              setStep('form');
              setCode('');
              setError('');
            }}
          >
            ←
          </button>
        </form>
      ) : (
        <form onSubmit={requestCode} className="mt-8 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {ui.scoutUrl} <span className="text-[var(--accent)]">*</span>
            </span>
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
              inputMode="url"
              autoComplete="url"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] focus:ring-1"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {ui.scoutEmail} <span className="text-[var(--accent)]">*</span>
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={120}
              autoComplete="email"
              inputMode="email"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] focus:ring-1"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {ui.scoutName}
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoComplete="nickname"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] focus:ring-1"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {ui.scoutNote}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={800}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] focus:ring-1"
            />
          </label>

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

          {error ? <p className="text-sm text-red-700 dark:text-red-400">{error}</p> : null}
          {emailConfigBlocked ? (
            <p className="text-sm text-[var(--muted)]">
              <Link href={localePath(locale, '/contact')} className="text-[var(--accent)] hover:underline">
                {ui.footerContact}
              </Link>
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy !== 'idle'}
            className="inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {busy === 'otp' ? ui.scoutSendingCode : ui.scoutContinue}
          </button>
          <p className="text-[11px] leading-relaxed text-[var(--muted)]">{ui.scoutPrivacy}</p>
        </form>
      )}
    </main>
  );
}
