'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';

type JobView = {
  id: string;
  status: string;
  message?: string;
  articleUrl?: string;
  duplicateSlug?: string;
  duplicateTitle?: string;
};

export default function EditorialChiefPage() {
  const [pin, setPin] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!job?.id || !pin) return;
    if (['PUBLISHED', 'DUPLICATE', 'FAILED'].includes(job.status)) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/editorial/chief?jobId=${encodeURIComponent(job.id)}&pin=${encodeURIComponent(pin)}`,
          { headers: { Authorization: `Bearer ${pin}` } },
        );
        const data = await res.json();
        if (data.job) setJob(data.job);
      } catch {
        /* ignore */
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [job?.id, job?.status, pin]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setJob(null);
    try {
      const res = await fetch('/api/editorial/chief', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pin}`,
        },
        body: JSON.stringify({ pin, url, note: note || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || data.message || 'Failed');
        return;
      }
      setJob(data.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto max-w-xl px-4 py-8">
        <p className="text-[12px] text-[var(--muted)]">EDITORIAL / CHIEF</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Chief Fast Lane</h1>
        <p className="mt-2 text-[14px] text-[var(--muted)]">
          Высокий приоритет: URL сразу в пайплайн. Scout 70 не применяется; dedupe/fact/source — да.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block text-[12px] text-[var(--muted)]">
            PIN
            <input
              type="text"
              name="pin"
              required
              autoComplete="one-time-code"
              inputMode="numeric"
              enterKeyHint="done"
              placeholder="······-······"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="mt-1 w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-[18px] tracking-widest outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block text-[12px] text-[var(--muted)]">
            URL
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
              className="mt-1 w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block text-[12px] text-[var(--muted)]">
            NOTE (optional)
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="интересна возможность малого бизнеса"
              className="mt-1 w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="border border-[var(--border)] bg-[var(--text)] px-4 py-2 text-[13px] font-medium text-[var(--bg)] disabled:opacity-50"
          >
            SUBMIT
          </button>
        </form>

        {error ? <p className="mt-4 text-[13px] text-red-600">{error}</p> : null}

        {job ? (
          <div className="mt-6 border border-[var(--border)] bg-[var(--surface)] p-4 text-[13px]">
            <p className="font-medium tracking-wide">{job.status}</p>
            {job.message ? <p className="mt-1 text-[var(--muted)]">{job.message}</p> : null}
            {job.duplicateTitle ? (
              <p className="mt-2">
                TITLE: {job.duplicateTitle}
                {job.duplicateSlug ? (
                  <>
                    <br />
                    SLUG / URL: /articles/{job.duplicateSlug}
                  </>
                ) : null}
              </p>
            ) : null}
            {job.articleUrl ? (
              <p className="mt-2">
                <a href={job.articleUrl} className="text-[var(--accent)] hover:underline">
                  {job.articleUrl}
                </a>
              </p>
            ) : null}
          </div>
        ) : null}

        <p className="mt-10 text-[12px] text-[var(--muted)]">
          <Link href="/editorial/author" className="hover:text-[var(--accent)]">
            ← EDITORIAL / AUTHOR
          </Link>
        </p>
      </div>
    </main>
  );
}
