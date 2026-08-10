'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';

type State =
  | { kind: 'idle' }
  | { kind: 'status'; status: string; message: string; articleUrl?: string; title?: string };

export default function EditorialAuthorPage() {
  const [token, setToken] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'AUTHOR_ARTICLE' | 'REVIEW_OPINION'>('AUTHOR_ARTICLE');
  const [text, setText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [note, setNote] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setState({ kind: 'status', status: 'RECEIVED', message: 'Received…' });
    setState({ kind: 'status', status: 'EDITING', message: 'Light editorial polish…' });
    try {
      const res = await fetch('/api/editorial/author', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          token,
          authorName,
          title,
          type,
          text,
          sourceUrl: sourceUrl || undefined,
          note: note || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({
          kind: 'status',
          status: data.status || 'FAILED',
          message: data.message || data.error || 'Failed',
          articleUrl: data.articleUrl,
          title: data.duplicateTitle,
        });
        return;
      }
      setState({
        kind: 'status',
        status: 'READY',
        message: data.typeLabel ? `${data.typeLabel}` : 'Ready',
      });
      setState({
        kind: 'status',
        status: 'PUBLISHED',
        message: data.typeLabel ? `${data.typeLabel} опубликована` : 'Published',
        articleUrl: data.articleUrl,
        title: data.title,
      });
    } catch (err) {
      setState({
        kind: 'status',
        status: 'FAILED',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-[12px] text-[var(--muted)]">EDITORIAL / AUTHOR</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Author Door</h1>
        <p className="mt-2 text-[14px] text-[var(--muted)]">
          Закрытая форма: свой текст остаётся вашим — лёгкая редактура без AI-новости.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block text-[12px] text-[var(--muted)]">
            Access token
            <input
              type="password"
              required
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="mt-1 w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block text-[12px] text-[var(--muted)]">
            AUTHOR NAME
            <input
              required
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              className="mt-1 w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block text-[12px] text-[var(--muted)]">
            TITLE
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block text-[12px] text-[var(--muted)]">
            TYPE
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'AUTHOR_ARTICLE' | 'REVIEW_OPINION')}
              className="mt-1 w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] outline-none focus:border-[var(--accent)]"
            >
              <option value="AUTHOR_ARTICLE">AUTHOR_ARTICLE — Авторская статья</option>
              <option value="REVIEW_OPINION">REVIEW_OPINION — Обзор / мнение</option>
            </select>
          </label>
          <label className="block text-[12px] text-[var(--muted)]">
            TEXT
            <textarea
              required
              rows={14}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="mt-1 w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-[13px] leading-relaxed outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block text-[12px] text-[var(--muted)]">
            OPTIONAL SOURCE URL
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://"
              className="mt-1 w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block text-[12px] text-[var(--muted)]">
            OPTIONAL NOTE
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <button
            type="submit"
            disabled={state.kind === 'status' && ['RECEIVED', 'EDITING', 'READY'].includes(state.status)}
            className="border border-[var(--border)] bg-[var(--text)] px-4 py-2 text-[13px] font-medium text-[var(--bg)] disabled:opacity-50"
          >
            SUBMIT
          </button>
        </form>

        {state.kind === 'status' ? (
          <div className="mt-6 border border-[var(--border)] bg-[var(--surface)] p-4 text-[13px]">
            <p className="font-medium tracking-wide">{state.status}</p>
            <p className="mt-1 text-[var(--muted)]">{state.message}</p>
            {state.title ? <p className="mt-2">{state.title}</p> : null}
            {state.articleUrl ? (
              <p className="mt-2">
                <a href={state.articleUrl} className="text-[var(--accent)] hover:underline">
                  {state.articleUrl}
                </a>
              </p>
            ) : null}
          </div>
        ) : null}

        <p className="mt-10 text-[12px] text-[var(--muted)]">
          <Link href="/editorial/chief" className="hover:text-[var(--accent)]">
            EDITORIAL / CHIEF →
          </Link>
        </p>
      </div>
    </main>
  );
}
