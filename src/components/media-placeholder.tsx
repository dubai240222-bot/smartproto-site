'use client';

import { useState } from 'react';
import {
  resolveVisualFallback,
  visualFallbackToneClass,
  type VisualFallbackSpec,
} from '@/lib/visual-fallback';

interface MediaPlaceholderProps {
  imageUrl?: string;
  kind?: string;
  category?: string;
  title?: string;
  description?: string;
  label?: string;
  tags?: string[];
  summary?: string;
  aspectRatio?: string;
  className?: string;
  /** Article hero without photo: slightly shorter editorial tile. */
  compactFallback?: boolean;
}

const IMAGE_CLASS =
  'h-full w-full object-cover brightness-[1.04] contrast-[1.02] saturate-[1.06] transition-[transform,filter] duration-500 ease-out group-hover:scale-[1.04] group-hover:brightness-110 group-hover:saturate-110';

function FallbackTile({
  spec,
  compact,
  className = '',
  aspectRatio,
}: {
  spec: VisualFallbackSpec;
  compact?: boolean;
  className?: string;
  aspectRatio?: string;
}) {
  const tone = visualFallbackToneClass(spec.categoryKey);
  return (
    <div
      className={`visual-fallback ${tone} relative flex overflow-hidden rounded border border-[var(--border)] ${
        aspectRatio || ''
      } ${className}`}
      role="img"
      aria-label={`${spec.caption}: ${spec.headline}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.55), transparent 45%), radial-gradient(circle at 80% 70%, rgba(0,0,0,0.06), transparent 40%)',
        }}
        aria-hidden
      />
      <div
        className={`relative z-[1] flex h-full w-full flex-col justify-between ${
          compact ? 'p-3 sm:p-4' : 'p-4 sm:p-5'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <span
            className={`visual-fallback__mark font-serif font-black leading-none text-[var(--text)] ${
              compact ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-5xl'
            }`}
          >
            {spec.mark}
          </span>
          <span className="rounded border border-[var(--border)] bg-[var(--surface)]/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)] backdrop-blur-[2px]">
            {spec.kind === 'brand' ? 'Brand' : spec.kind === 'organization' ? 'Lab' : 'Desk'}
          </span>
        </div>
        <div className="space-y-1">
          <p
            className={`font-serif font-bold leading-tight text-[var(--text)] ${
              compact ? 'text-sm sm:text-base' : 'text-base sm:text-xl'
            }`}
          >
            {spec.headline}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
            {spec.caption}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Compact thumbnail with the same hover treatment and editorial fallback. */
export function MediaThumb({
  imageUrl,
  title,
  category,
  tags,
  summary,
  className = '',
}: {
  imageUrl?: string;
  title?: string;
  category?: string;
  tags?: string[];
  summary?: string;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);
  const spec = resolveVisualFallback({ title, category, tags, summary });

  if (!imageUrl || hasError) {
    return (
      <FallbackTile
        spec={spec}
        compact
        className={`shrink-0 ${className}`}
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
  tags,
  summary,
  aspectRatio = 'aspect-video',
  className = '',
  compactFallback = false,
}: MediaPlaceholderProps) {
  const [hasError, setHasError] = useState(false);
  const spec = resolveVisualFallback({
    title,
    category: category || label || kind,
    tags,
    summary,
  });

  if (imageUrl && !hasError) {
    return (
      <div
        className={`relative overflow-hidden rounded border border-[var(--border)] bg-[var(--surface)] ${aspectRatio} ${className}`}
      >
        <img
          src={imageUrl}
          alt={title || spec.headline}
          onError={() => setHasError(true)}
          className={IMAGE_CLASS}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-white/5 opacity-70 transition-opacity duration-500 group-hover:opacity-40" />
      </div>
    );
  }

  return (
    <FallbackTile
      spec={spec}
      compact={compactFallback}
      aspectRatio={compactFallback ? 'aspect-[16/7] sm:aspect-[16/6]' : aspectRatio}
      className={className}
    />
  );
}

export type { VisualFallbackSpec };
