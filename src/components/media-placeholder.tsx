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
          className="h-full w-full object-cover"
        />
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
