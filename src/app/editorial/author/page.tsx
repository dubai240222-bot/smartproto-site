'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';

type DeskMode = 'choose' | 'propose_link' | 'author_column';
type ColumnType = 'AUTHOR_ARTICLE' | 'COLUMN' | 'OPINION' | 'REVIEW' | 'REVIEW_OPINION';
type State =
  | { kind: 'idle' }
  | { kind: 'status'; status: string; message: string; articleUrl?: string; title?: string };

export default function EditorialAuthorPage() {
  const [deskMode, setDeskMode] = useState<DeskMode>('choose');
  const [token, setToken] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ColumnType>('AUTHOR_ARTICLE');
  const [text, setText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function onSubmitLink(e: FormEvent) {
    e.preventDefault();
    setState({ kind: 'status', status: 'RECEIVED', message: 'Проверка ссылки…' });
    try {
      const res = await fetch('/api/editorial/author', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode: 'propose_link',
          token,
          authorName,
          url,
          note: note || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({
          kind: 'status',
          status: data.status || 'FAILED',
          message: data.message || data.error || 'Failed',
          title: data.duplicateSlug,
        });
        return;
      }
      setState({
        kind: 'status',
        status: 'QUEUED',
        message: data.message || 'В очереди редакции (выше Reader Scout / AUTO).',
      });
    } catch (err) {
      setState({
        kind: 'status',
        status: 'FAILED',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function onSubmitColumn(e: FormEvent) {
    e.preventDefault();
    setState({ kind: 'status', status: 'RECEIVED', message: 'Received…' });
    setState({ kind: 'status', status: 'EDITING', message: 'Лёгкая редактура — голос автора сохраняется…' });
    try {
      const res = await fetch('/api/editorial/author', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode: 'author_column',
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
        status: 'PUBLISHED',
        message: data.typeLabel ? `${data.typeLabel} · автор сохранён` : 'Published',
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
        <p className="text-[12px] text-[var(--muted)]">EDITORIAL / STAFF AUTHOR</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Staff Author Desk</h1>
        <p className="mt-2 text-[14px] text-[var(--muted)]">
          Закрытый кабинет для доверенных авторов и журналистов. Без публичной регистрации.
          Приоритет: Chief → Staff Author → Reader Scout → AUTO.
        </p>

        {deskMode === 'choose' ? (
          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setDeskMode('propose_link');
                setState({ kind: 'idle' });
              }}
              className="border border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-left transition hover:border-[var(--accent)]"
            >
              <p className="text-[15px] font-semibold">Предложить новость</p>
              <p className="mt-2 text-[13px] text-[var(--muted)]">
                URL + угол. Высокий приоритет в очереди. Без прямой публикации — полный редакционный
                pipeline.
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setDeskMode('author_column');
                setState({ kind: 'idle' });
              }}
              className="border border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-left transition hover:border-[var(--accent)]"
            >
              <p className="text-[15px] font-semibold">Написать авторскую колонку</p>
              <p className="mt-2 text-[13px] text-[var(--muted)]">
                Свой текст и имя. Лёгкая редактура без превращения в AUTO-стиль.
              </p>
            </button>
          </div>
        ) : null}

        {deskMode !== 'choose' ? (
          <p className="mt-6">
            <button
              type="button"
              onClick={() => {
                setDeskMode('choose');
                setState({ kind: 'idle' });
              }}
              className="text-[12px] text-[var(--muted)] hover:text-[var(--accent)]"
            >
              ← Назад к выбору режима
            </button>
          </p>
        ) : null}

        {deskMode === 'propose_link' ? (
          <form onSubmit={onSubmitLink} className="mt-6 space-y-4">
            <h2 className="text-lg font-medium">Предложить новость</h2>
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
              NOTE / ANGLE
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Почему это важно / какой угол"
                className="mt-1 w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] outline-none focus:border-[var(--accent)]"
              />
            </label>
            <button
              type="submit"
              disabled={state.kind === 'status' && state.status === 'RECEIVED'}
              className="border border-[var(--border)] bg-[var(--text)] px-4 py-2 text-[13px] font-medium text-[var(--bg)] disabled:opacity-50"
            >
              ОТПРАВИТЬ В ОЧЕРЕДЬ
            </button>
          </form>
        ) : null}

        {deskMode === 'author_column' ? (
          <form onSubmit={onSubmitColumn} className="mt-6 space-y-4">
            <h2 className="text-lg font-medium">Авторская статья / колонка</h2>
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
                onChange={(e) => setType(e.target.value as ColumnType)}
                className="mt-1 w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] outline-none focus:border-[var(--accent)]"
              >
                <option value="AUTHOR_ARTICLE">AUTHOR_ARTICLE — Авторская статья</option>
                <option value="COLUMN">COLUMN — Колонка</option>
                <option value="OPINION">OPINION — Мнение</option>
                <option value="REVIEW">REVIEW — Обзор</option>
                <option value="REVIEW_OPINION">REVIEW_OPINION — Обзор / мнение</option>
              </select>
            </label>
            <label className="block text-[12px] text-[var(--muted)]">
              ARTICLE TEXT
              <textarea
                required
                rows={14}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="mt-1 w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-[13px] leading-relaxed outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="block text-[12px] text-[var(--muted)]">
              OPTIONAL SOURCE URL / REFERENCES
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://"
                className="mt-1 w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="block text-[12px] text-[var(--muted)]">
              OPTIONAL EDITOR NOTE
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] outline-none focus:border-[var(--accent)]"
              />
            </label>
            <button
              type="submit"
              disabled={state.kind === 'status' && ['RECEIVED', 'EDITING'].includes(state.status)}
              className="border border-[var(--border)] bg-[var(--text)] px-4 py-2 text-[13px] font-medium text-[var(--bg)] disabled:opacity-50"
            >
              ОПУБЛИКОВАТЬ КОЛОНКУ
            </button>
          </form>
        ) : null}

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
          {' · '}
          <Link href="/scout" className="hover:text-[var(--accent)]">
            Reader Scout (public)
          </Link>
        </p>
      </div>
    </main>
  );
}
