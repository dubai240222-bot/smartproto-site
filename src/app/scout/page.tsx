'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';

type SubmitState = 'idle' | 'sending' | 'done' | 'error';

export default function ScoutPage() {
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
        setMessage(data.message || data.error || 'Не удалось отправить находку.');
        return;
      }
      setState('done');
      setMessage(data.message || 'Спасибо. Находка передана в редакцию SmartProto.');
      setUrl('');
      setNote('');
      setName('');
      setEmail('');
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
        Нашли интересную технологию?
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--muted)] sm:text-[15px]">
        Пришлите ссылку — редакция SmartProto проверит её и, если тема подходит, подготовит
        материал. Вы не публикуете статью: только передаёте находку «живому» редакционному
        конвейеру.
      </p>

      {state === 'done' ? (
        <div className="mt-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-sm font-medium text-[var(--text)]">{message}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">Публикация не гарантируется.</p>
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
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              URL <span className="text-[var(--accent)]">*</span>
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
              Почему это интересно?
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={800}
              placeholder="Коротко: что нового для человека / почему стоит разобрать"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] focus:ring-1"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Имя / псевдоним
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
                Email
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
            disabled={state === 'sending'}
            className="inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {state === 'sending' ? 'Отправляем…' : 'Отправить в редакцию'}
          </button>
          <p className="text-[11px] leading-relaxed text-[var(--muted)]">
            Находка проходит обычную проверку редакции (безопасность, дедуп, Scout, Editor, фото).
            Прямой publish недоступен. Email не публикуется.
          </p>
        </form>
      )}
    </main>
  );
}
