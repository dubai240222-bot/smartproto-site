'use client';

import { useState } from 'react';
import {
  resolveVisualFallback,
  visualFallbackToneClass,
  type VisualCategoryKey,
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
  agentId?: string;
  aspectRatio?: string;
  className?: string;
  /** Article hero without photo: slightly shorter editorial tile. */
  compactFallback?: boolean;
}

const IMAGE_CLASS =
  'h-full w-full object-cover brightness-[1.04] contrast-[1.02] saturate-[1.06] transition-[transform,filter] duration-500 ease-out group-hover:scale-[1.04] group-hover:brightness-110 group-hover:saturate-110';

/** Soft abstract silhouettes — decorative only, not product photos. */
function CategorySilhouette({
  categoryKey,
  className = '',
}: {
  categoryKey: VisualCategoryKey;
  className?: string;
}) {
  const common = {
    className: `pointer-events-none absolute text-[var(--text)]/10 ${className}`,
    'aria-hidden': true as const,
    viewBox: '0 0 120 120',
    fill: 'currentColor',
  };
  switch (categoryKey) {
    case 'robotics':
      return (
        <svg {...common}>
          <rect x="38" y="28" width="44" height="36" rx="8" />
          <rect x="48" y="64" width="24" height="28" rx="4" />
          <circle cx="52" cy="42" r="4" />
          <circle cx="68" cy="42" r="4" />
        </svg>
      );
    case 'mobility':
      return (
        <svg {...common}>
          <path d="M20 72h80l-8-24H28L20 72zm16-10a8 8 0 1 0 0.01 0zm48 0a8 8 0 1 0 0.01 0z" />
          <path d="M34 48h52l6 14H28l6-14z" opacity="0.7" />
        </svg>
      );
    case 'ai_future':
      return (
        <svg {...common}>
          <circle cx="60" cy="60" r="28" fill="none" stroke="currentColor" strokeWidth="4" />
          <circle cx="60" cy="60" r="8" />
          <path d="M60 20v12M60 88v12M20 60h12M88 60h12M32 32l8 8M80 80l8 8M88 32l-8 8M32 88l8-8" stroke="currentColor" strokeWidth="4" fill="none" />
        </svg>
      );
    case 'healthtech':
      return (
        <svg {...common}>
          <path d="M60 22c-14 0-26 10-26 28 0 22 26 48 26 48s26-26 26-48c0-18-12-28-26-28z" opacity="0.85" />
          <rect x="54" y="42" width="12" height="28" rx="2" fill="var(--bg)" opacity="0.55" />
          <rect x="46" y="50" width="28" height="12" rx="2" fill="var(--bg)" opacity="0.55" />
        </svg>
      );
    case 'energy':
      return (
        <svg {...common}>
          <path d="M66 18 38 68h22l-6 34 34-58H66z" />
        </svg>
      );
    case 'research':
      return (
        <svg {...common}>
          <circle cx="48" cy="44" r="22" fill="none" stroke="currentColor" strokeWidth="5" />
          <path d="M64 60 92 96" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
        </svg>
      );
    case 'smart_home':
      return (
        <svg {...common}>
          <path d="M20 58 60 24l40 34v42H20V58z" />
          <rect x="48" y="66" width="24" height="34" opacity="0.45" />
        </svg>
      );
    case 'future_work':
      return (
        <svg {...common}>
          <rect x="24" y="40" width="72" height="48" rx="6" />
          <rect x="40" y="28" width="40" height="12" rx="3" />
          <path d="M40 58h40M40 70h28" stroke="var(--bg)" strokeWidth="4" opacity="0.5" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="30" y="34" width="60" height="52" rx="10" />
          <circle cx="60" cy="56" r="14" opacity="0.45" />
        </svg>
      );
  }
}

function FallbackTile({
  spec,
  compact,
  className = '',
  aspectRatio,
  size = 'card',
}: {
  spec: VisualFallbackSpec;
  compact?: boolean;
  className?: string;
  aspectRatio?: string;
  size?: 'thumb' | 'card' | 'hero';
}) {
  const tone = visualFallbackToneClass(spec.categoryKey);
  const isHero = size === 'hero' || (!compact && size === 'card' && !aspectRatio?.includes('16/9'));
  const pad =
    size === 'thumb'
      ? 'p-2'
      : compact || size === 'card'
        ? 'p-3 sm:p-4'
        : 'p-5 sm:p-7 md:p-8';

  return (
    <div
      className={`visual-fallback ${tone} relative flex overflow-hidden rounded-lg border border-[var(--border)] ${
        aspectRatio || ''
      } ${className}`}
      role="img"
      aria-label={`${spec.caption}: ${spec.headline}`}
      data-vf-kind={spec.kind}
      data-vf-category={spec.categoryKey}
    >
      <div className="visual-fallback__grain pointer-events-none absolute inset-0" aria-hidden />
      <div className="visual-fallback__orb pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full opacity-40 sm:h-52 sm:w-52" aria-hidden />
      <div className="visual-fallback__orb visual-fallback__orb--soft pointer-events-none absolute -bottom-12 -left-10 h-36 w-36 rounded-full opacity-30" aria-hidden />

      <CategorySilhouette
        categoryKey={spec.categoryKey}
        className={
          size === 'thumb'
            ? 'right-0 top-0 h-14 w-14'
            : compact
              ? 'right-1 top-1 h-24 w-24 sm:h-28 sm:w-28'
              : 'right-2 top-2 h-36 w-36 sm:right-4 sm:top-4 sm:h-48 sm:w-48 md:h-56 md:w-56'
        }
      />

      <div className={`relative z-[1] flex h-full w-full flex-col justify-between ${pad}`}>
        <div className="flex items-start justify-between gap-2">
          <span
            className={`visual-fallback__mark font-serif font-black leading-none tracking-tight text-[var(--text)] ${
              size === 'thumb'
                ? 'text-lg'
                : compact
                  ? 'text-3xl sm:text-4xl'
                  : isHero
                    ? 'text-5xl sm:text-6xl md:text-7xl'
                    : 'text-4xl sm:text-5xl'
            }`}
          >
            {spec.mark}
          </span>
          <span className="rounded-md border border-[var(--border)]/80 bg-[var(--surface)]/75 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] backdrop-blur-[2px]">
            {spec.badge}
          </span>
        </div>

        <div className={`max-w-[92%] ${size === 'thumb' ? 'space-y-0' : 'space-y-1.5'}`}>
          <p
            className={`font-serif font-bold leading-[1.1] text-[var(--text)] ${
              size === 'thumb'
                ? 'text-[11px] line-clamp-2'
                : compact
                  ? 'text-lg sm:text-xl'
                  : isHero
                    ? 'text-2xl sm:text-3xl md:text-4xl'
                    : 'text-xl sm:text-2xl'
            }`}
          >
            {spec.headline}
          </p>
          {size !== 'thumb' && (
            <p
              className={`text-[var(--muted)] ${
                compact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'
              } line-clamp-2`}
            >
              {spec.subtitle}
            </p>
          )}
          {size !== 'thumb' && (
            <p className="pt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
              {spec.caption}
            </p>
          )}
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
  agentId,
  className = '',
}: {
  imageUrl?: string;
  title?: string;
  category?: string;
  tags?: string[];
  summary?: string;
  agentId?: string;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);
  const spec = resolveVisualFallback({ title, category, tags, summary, agentId });

  if (!imageUrl || hasError) {
    return (
      <FallbackTile
        spec={spec}
        size="thumb"
        className={`shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] ${className}`}
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
  agentId,
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
    agentId,
  });

  if (imageUrl && !hasError) {
    return (
      <div
        className={`relative overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] ${aspectRatio} ${className}`}
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
      size={compactFallback ? 'card' : 'hero'}
      aspectRatio={compactFallback ? 'aspect-[16/7] sm:aspect-[16/6]' : aspectRatio}
      className={className}
    />
  );
}

export type { VisualFallbackSpec };
