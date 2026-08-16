/**
 * SP-A-098G — archive translation coverage metrics for /api/health.
 */
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import {
  computeCoverage,
  isPublishedLocalization,
  type CoverageSnapshot,
} from '@/lib/i18n/archive-translate-pick';
import type { LocalizationLanguage } from '@/lib/i18n/locales';

const DEFAULT_DRIP_MS = 4 * 60 * 60 * 1000;

export type ArchiveTranslationHealth = {
  ru_total: number;
  without_en: number;
  without_tr: number;
  en_coverage_pct: number;
  tr_coverage_pct: number;
  archive_translates_last_24h: number;
  last_archive_translation_at: string | null;
  next_archive_translation_due: string | null;
  drip_interval_ms: number;
};

function dripIntervalMs(): number {
  const n = Number(process.env.SMARTPROTO_TRANSLATE_DRIP_INTERVAL_MS || DEFAULT_DRIP_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DRIP_MS;
}

function readWorkerTranslateState(): { lastTranslateDripAt?: string } {
  const dataDir = process.env.SMARTPROTO_DATA_DIR || path.resolve(process.cwd(), 'data');
  const stateFile = path.join(dataDir, 'worker-state.json');
  if (!existsSync(stateFile)) return {};
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    return {};
  }
}

function countArchiveTranslatesLast24h(): number {
  if (process.env.ARTICLES_STORE !== 'sqlite') return 0;
  try {
    const { getDb } = require('@/lib/data-store/db') as typeof import('@/lib/data-store/db');
    const db = getDb();
    // Localizations published ≥1h after RU publish ≈ archive drip (not post-publish pair).
    const row = db
      .prepare(
        `SELECT COUNT(*) AS n
         FROM article_localizations al
         JOIN articles a ON a.id = al.article_id
         WHERE al.translation_status = 'published'
           AND al.translated_at IS NOT NULL
           AND al.translated_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')
           AND (julianday(al.translated_at) - julianday(a.publishedAt)) * 24.0 >= 1.0
           AND COALESCE(al.localized_title, '') NOT LIKE '[TEST]%'
           AND COALESCE(al.translator_model, '') NOT LIKE '%manual-fixture%'`,
      )
      .get() as { n: number };
    return Number(row?.n || 0);
  } catch {
    return 0;
  }
}

export function buildArchiveTranslationHealth(
  articles: Array<{
    id: string;
    title: string;
    content: string;
    summary?: string;
    publishedAt?: string;
    category?: string;
    tags?: string[];
  }>,
  getLocalization: (articleId: string, language: LocalizationLanguage) => {
    translationStatus?: string;
    localizedTitle?: string;
    localizedExcerpt?: string;
    translatorModel?: string;
    translatedAt?: string;
  } | null,
): ArchiveTranslationHealth {
  const coverage: CoverageSnapshot = computeCoverage(articles, getLocalization);
  const interval = dripIntervalMs();
  const state = readWorkerTranslateState();
  const last = state.lastTranslateDripAt || null;
  let next: string | null = null;
  if (last) {
    const t = Date.parse(last);
    if (Number.isFinite(t)) next = new Date(t + interval).toISOString();
  } else {
    next = new Date().toISOString();
  }

  return {
    ru_total: coverage.ruTotal,
    without_en: coverage.withoutEn,
    without_tr: coverage.withoutTr,
    en_coverage_pct: coverage.enCoveragePct,
    tr_coverage_pct: coverage.trCoveragePct,
    archive_translates_last_24h: countArchiveTranslatesLast24h(),
    last_archive_translation_at: last,
    next_archive_translation_due: next,
    drip_interval_ms: interval,
  };
}

/** Exported for tests / scripts — published EN/TR counts. */
export function countPublishedLocales(
  articles: Array<{ id: string }>,
  getLocalization: (articleId: string, language: LocalizationLanguage) => Parameters<
    typeof isPublishedLocalization
  >[0],
): { en: number; tr: number } {
  let en = 0;
  let tr = 0;
  for (const a of articles) {
    if (isPublishedLocalization(getLocalization(a.id, 'en'))) en += 1;
    if (isPublishedLocalization(getLocalization(a.id, 'tr'))) tr += 1;
  }
  return { en, tr };
}
