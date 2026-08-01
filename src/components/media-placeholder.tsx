'use client';

import { useState } from 'react';

interface MediaPlaceholderProps {
  imageUrl?: string;
  kind?: string;
  category?: string;
  title?: string;
  description?: string;
  label?: string;
  aspectRatio?: string;
  className?: string;
}

const IMAGE_CLASS =
  'h-full w-full object-cover brightness-[1.04] contrast-[1.02] saturate-[1.06] transition-[transform,filter] duration-500 ease-out group-hover:scale-[1.04] group-hover:brightness-110 group-hover:saturate-110';

/** Compact thumbnail with the same hover treatment and broken-image fallback. */
export function MediaThumb({
  imageUrl,
  title,
  className = '',
}: {
  imageUrl?: string;
  title?: string;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);

  if (!imageUrl || hasError) {
    return (
      <div
        className={`shrink-0 overflow-hidden rounded border border-[var(--border)] bg-[var(--surface)] ${className}`}
        aria-hidden
      />
    );
  }

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded border border-[var(--border)] bg-[var(--surface)] ${className}`}
    >
      <img
        src={imageUrl}
        alt={title || ''}
        onError={() => setHasError(true)}
        className={IMAGE_CLASS}
      />
    </div>
  );
}

export function MediaPlaceholder({
  imageUrl,
  kind,
  category,
  title,
  description,
  label,
  aspectRatio = 'aspect-video',
  className = '',
}: MediaPlaceholderProps) {
  const [hasError, setHasError] = useState(false);
  const displayCategory = category || label || (kind ? kind.toUpperCase() : 'ТЕХНОЛОГИИ');

  if (imageUrl && !hasError) {
    return (
      <div
        className={`relative overflow-hidden rounded border border-[var(--border)] bg-[var(--surface)] ${aspectRatio} ${className}`}
      >
        <img
          src={imageUrl}
          alt={title || displayCategory}
          onError={() => setHasError(true)}
          className={IMAGE_CLASS}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-white/5 opacity-70 transition-opacity duration-500 group-hover:opacity-40" />
      </div>
    );
  }

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-[var(--muted)] ${aspectRatio} ${className}`}
    >
      <div className="flex flex-col items-center justify-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
          {displayCategory}
        </span>
        {title && <h3 className="font-serif text-sm font-bold text-[var(--text)]">{title}</h3>}
        {description && <p className="max-w-xs text-xs text-[var(--muted)]">{description}</p>}
      </div>
    </div>
  );
}
