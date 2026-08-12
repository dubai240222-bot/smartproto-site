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
  /** Stable slug for hash rotation (SP-A-084). */
  slug?: string;
  /** Asset IDs already visible nearby — skip duplicates. */
  avoidAssetIds?: string[];
  /** Optional pre-resolved fallback (from assignFallbackAssets). */
  fallbackSpec?: VisualFallbackSpec;
  aspectRatio?: string;
  className?: string;
  /** Article hero without photo: slightly shorter editorial tile. */
  compactFallback?: boolean;
}

const IMAGE_CLASS =
  'h-full w-full object-cover brightness-[1.04] contrast-[1.02] saturate-[1.06] transition-[transform,filter] duration-500 ease-out group-hover:scale-[1.04] group-hover:brightness-110 group-hover:saturate-110';

/** Atmospheric stock banner — never a gray monogram wall. */
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
  const pad =
    size === 'thumb'
      ? 'p-1.5'
      : compact || size === 'card'
        ? 'p-3 sm:p-4'
        : 'p-5 sm:p-7';

  return (
    <div
      className={`visual-fallback visual-fallback--stock ${tone} relative flex overflow-hidden rounded-lg border border-[var(--border)] ${
        aspectRatio || ''
      } ${className}`}
      role="img"
      aria-label={`${spec.caption}: ${spec.headline}`}
      data-vf-kind={spec.kind}
      data-vf-category={spec.categoryKey}
      data-vf-asset={spec.assetId || ''}
    >
      {spec.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={spec.imageUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/15"
        aria-hidden
      />
      <div className="visual-fallback__grain pointer-events-none absolute inset-0 opacity-40" aria-hidden />

      <div className={`relative z-[1] flex h-full w-full flex-col justify-end ${pad}`}>
        <div className="flex items-end justify-between gap-2">
          <div className={`max-w-[92%] ${size === 'thumb' ? 'space-y-0' : 'space-y-1'}`}>
            <p
              className={`font-serif font-bold leading-[1.1] text-white drop-shadow ${
                size === 'thumb'
                  ? 'text-[10px] line-clamp-2'
                  : compact
                    ? 'text-base sm:text-lg'
                    : 'text-xl sm:text-2xl'
              }`}
            >
              {spec.headline}
            </p>
            {size !== 'thumb' && (
              <p className={`line-clamp-2 text-white/80 ${compact ? 'text-[11px]' : 'text-xs sm:text-sm'}`}>
                {spec.subtitle}
              </p>
            )}
          </div>
          <span className="shrink-0 rounded-md border border-white/25 bg-black/35 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-white/90 backdrop-blur-[2px]">
            {spec.badge}
          </span>
        </div>
      </div>
    </div>
  );
}

function useFallbackSpec(opts: {
  title?: string;
  category?: string;
  tags?: string[];
  summary?: string;
  agentId?: string;
  slug?: string;
  avoidAssetIds?: string[];
  fallbackSpec?: VisualFallbackSpec;
}): VisualFallbackSpec {
  if (opts.fallbackSpec) return opts.fallbackSpec;
  return resolveVisualFallback({
    title: opts.title,
    category: opts.category,
    tags: opts.tags,
    summary: opts.summary,
    agentId: opts.agentId,
    slug: opts.slug,
    avoidAssetIds: opts.avoidAssetIds,
  });
}

/** Compact thumbnail with the same hover treatment and editorial fallback. */
export function MediaThumb({
  imageUrl,
  title,
  category,
  tags,
  summary,
  agentId,
  slug,
  avoidAssetIds,
  fallbackSpec,
  className = '',
}: {
  imageUrl?: string;
  title?: string;
  category?: string;
  tags?: string[];
  summary?: string;
  agentId?: string;
  slug?: string;
  avoidAssetIds?: string[];
  fallbackSpec?: VisualFallbackSpec;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);
  const spec = useFallbackSpec({
    title,
    category,
    tags,
    summary,
    agentId,
    slug,
    avoidAssetIds,
    fallbackSpec,
  });

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
      {/* eslint-disable-next-line @next/next/no-img-element */}
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
  slug,
  avoidAssetIds,
  fallbackSpec,
  aspectRatio = 'aspect-video',
  className = '',
  compactFallback = false,
}: MediaPlaceholderProps) {
  const [hasError, setHasError] = useState(false);
  const spec = useFallbackSpec({
    title,
    category: category || label || kind,
    tags,
    summary,
    agentId,
    slug,
    avoidAssetIds,
    fallbackSpec,
  });

  if (imageUrl && !hasError) {
    return (
      <div
        className={`relative overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] ${aspectRatio} ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
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

export type { VisualFallbackSpec, VisualCategoryKey };
