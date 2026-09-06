'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';

type ChiefMode = 'publish' | 'revise';

type JobView = {
  id: string;
  status: string;
  message?: string;
  articleUrl?: string;
  imageCount?: number;
  previewImages?: { url: string; role: string; caption?: string }[];
  duplicateSlug?: string;
  duplicateTitle?: string;
};

type ReviseView = {
  status: string;
  slug?: string;
  title?: string;
  wordCount?: number;
  articleUrl?: string;
  message?: string;
  i18n?: { en?: string; tr?: string };
};

export default function EditorialChiefPage() {
  const [mode, setMode] = useState<ChiefMode>('publish');
  const [pin, setPin] = useState('');
  const [url, setUrl] = useState('');
  const [replaceSlug, setReplaceSlug] = useState('');
  const [slug, setSlug] = useState('');
  const [note, setNote] = useState('');
  const [job, setJob] = useState<JobView | null>(null);
  const [revise, setRevise] = useState<ReviseView | null>(null);
  const [removeSlug, setRemoveSlug] = useState('');
  const [removeImageUrl, setRemoveImageUrl] = useState('');
  const [removeResult, setRemoveResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!job?.id || !pin) return;
    if (['PUBLISHED', 'UPDATED', 'DUPLICATE', 'FAILED'].includes(job.status)) return;
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

  async function onSubmitPublish(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setJob(null);
    setRevise(null);
    try {
      const res = await fetch('/api/editorial/chief', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pin}`,
        },
        body: JSON.stringify({
          pin,
          url,
          note: note || undefined,
          replaceSlug: replaceSlug.trim() || undefined,
        }),
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

  async function onRemoveVisual(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setRemoveResult('');
    try {
      const res = await fetch('/api/editorial/chief', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pin}`,
        },
        body: JSON.stringify({
          pin,
          mode: 'remove-visual',
          slug: removeSlug.trim(),
          imageUrl: removeImageUrl.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || 'Failed');
        return;
      }
      setRemoveResult(`Removed · ${data.remaining} image(s) left · ${data.articleUrl}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitRevise(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setJob(null);
    setRevise(null);
    try {
      const res = await fetch('/api/editorial/chief', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pin}`,
        },
        body: JSON.stringify({ pin, mode: 'revise', slug, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || 'Failed');
        return;
      }
      setRevise({
        status: data.status,
        slug: data.slug,
        title: data.title,
        wordCount: data.wordCount,
        articleUrl: data.articleUrl,
        i18n: data.i18n,
      });
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
          Высокий приоритет: новая статья по URL или правка уже опубликованной. EN/TR синхронизируются с RU автоматически.
        </p>

        <div className="mt-6 flex gap-2 text-[12px]">
          <button
            type="button"
            onClick={() => setMode('publish')}
            className={`border px-3 py-1.5 ${
              mode === 'publish'
                ? 'border-[var(--text)] bg-[var(--text)] text-[var(--bg)]'
                : 'border-[var(--border)] bg-[var(--surface)]'
            }`}
          >
            Новая статья
          </button>
          <button
            type="button"
            onClick={() => setMode('revise')}
            className={`border px-3 py-1.5 ${
              mode === 'revise'
                ? 'border-[var(--text)] bg-[var(--text)] text-[var(--bg)]'
                : 'border-[var(--border)] bg-[var(--surface)]'
            }`}
          >
            Исправить опубликованную
          </button>
        </div>

        {mode === 'publish' ? (
          <form onSubmit={onSubmitPublish} className="mt-6 space-y-4">
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
              URL источника
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
              ЗАМЕНИТЬ СТАТЬЮ (slug, optional)
              <input
                type="text"
                value={replaceSlug}
                onChange={(e) => setReplaceSlug(e.target.value)}
                placeholder="chatgpt-s-computer-history-tracks-your-clicks-and-keystrokes"
                className="mt-1 w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] outline-none focus:border-[var(--accent)]"
              />
            </label>
            <p className="text-[11px] text-[var(--muted)]">
              Если тема уже на сайте — укажите старый slug: Chief обновит её на месте, а не создаст chatgpt-2.
            </p>
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
        ) : (
          <form onSubmit={onSubmitRevise} className="mt-6 space-y-4">
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
              SLUG или URL статьи на SmartProto
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="chief-xej8eb-48vt или https://www.smartproto.net/articles/..."
                className="mt-1 w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="block text-[12px] text-[var(--muted)]">
              ЖЕЛАНИЕ ШЕФА (обязательно)
              <textarea
                rows={5}
                required
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="ироничный обзор ~330 слов: немцы догоняют китайцев..."
                className="mt-1 w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] outline-none focus:border-[var(--accent)]"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="border border-[var(--border)] bg-[var(--text)] px-4 py-2 text-[13px] font-medium text-[var(--bg)] disabled:opacity-50"
            >
              ПЕРЕПИСАТЬ СТАТЬЮ
            </button>
          </form>
        )}

        {error ? <p className="mt-4 text-[13px] text-red-600">{error}</p> : null}

        {job ? (
          <div className="mt-6 border border-[var(--border)] bg-[var(--surface)] p-4 text-[13px]">
            <p className="font-medium tracking-wide">{job.status}</p>
            {job.message ? <p className="mt-1 text-[var(--muted)]">{job.message}</p> : null}
            {job.duplicateTitle ? (
              <p className="mt-2">
                {job.status === 'UPDATED' ? 'UPDATED: ' : job.status === 'DUPLICATE' ? 'DUPLICATE: ' : ''}
                {job.duplicateTitle}
                {job.duplicateSlug ? (
                  <>
                    <br />
                    SLUG: /articles/{job.duplicateSlug}
                    {job.status === 'DUPLICATE' ? (
                      <>
                        <br />
                        <span className="text-[var(--muted)]">
                          Уже на сайте — укажите slug в «Заменить статью» или вкладку «Исправить опубликованную».
                        </span>
                      </>
                    ) : null}
                  </>
                ) : null}
              </p>
            ) : null}
            {job.articleUrl ? (
              <p className="mt-2">
                <a href={job.articleUrl} className="text-[var(--accent)] hover:underline">
                  {job.articleUrl}
                </a>
                {typeof job.imageCount === 'number' ? (
                  <span className="mt-1 block text-[var(--muted)]">
                    Изображений: {job.imageCount} (hero + gallery)
                  </span>
                ) : null}
                {job.previewImages?.length ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {job.previewImages.map((img) => (
                      <div key={img.url} className="border border-[var(--border)]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.url}
                          alt={img.caption || img.role}
                          className="aspect-[4/3] w-full object-cover"
                        />
                        <p className="px-1 py-0.5 text-[10px] uppercase text-[var(--muted)]">{img.role}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </p>
            ) : null}
          </div>
        ) : null}

        {revise ? (
          <div className="mt-6 border border-[var(--border)] bg-[var(--surface)] p-4 text-[13px]">
            <p className="font-medium tracking-wide">{revise.status}</p>
            {revise.title ? <p className="mt-1">{revise.title}</p> : null}
            {revise.wordCount ? (
              <p className="mt-1 text-[var(--muted)]">~{revise.wordCount} слов</p>
            ) : null}
            {revise.i18n ? (
              <p className="mt-1 text-[var(--muted)]">
                EN: {revise.i18n.en || '—'} · TR: {revise.i18n.tr || '—'}
              </p>
            ) : null}
            {revise.articleUrl ? (
              <p className="mt-2">
                <a href={revise.articleUrl} className="text-[var(--accent)] hover:underline">
                  {revise.articleUrl}
                </a>
              </p>
            ) : null}
          </div>
        ) : null}

        <form onSubmit={onRemoveVisual} className="mt-8 space-y-3 border-t border-[var(--border)] pt-6">
          <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--muted)]">
            Visual Desk — remove bad asset
          </p>
          <label className="block text-[12px] text-[var(--muted)]">
            PIN
            <input
              type="text"
              required
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="mt-1 w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block text-[12px] text-[var(--muted)]">
            Article slug
            <input
              type="text"
              required
              value={removeSlug}
              onChange={(e) => setRemoveSlug(e.target.value)}
              placeholder="my-article-slug"
              className="mt-1 w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block text-[12px] text-[var(--muted)]">
            Image URL to remove
            <input
              type="text"
              required
              value={removeImageUrl}
              onChange={(e) => setRemoveImageUrl(e.target.value)}
              placeholder="/api/media/slug/gallery-01.jpg"
              className="mt-1 w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[13px] disabled:opacity-50"
          >
            REMOVE ASSET
          </button>
          {removeResult ? <p className="text-[13px] text-green-700">{removeResult}</p> : null}
        </form>

        <p className="mt-10 text-[12px] text-[var(--muted)]">
          <Link href="/editorial/author" className="hover:text-[var(--accent)]">
            ← EDITORIAL / AUTHOR
          </Link>
        </p>
      </div>
    </main>
  );
}
