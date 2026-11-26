/**
 * SP-A-075 — Author Door + Chief Fast Lane (single module, no second newsroom).
 * Scout ranking bypass for Chief = YES. Fact/source/dedupe/safety bypass = NO.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getAllArticles, type Article } from '@/data/articles';
import { getOpenRouterClient, clampText } from '@/lib/ai/shared';
import { extractArticlePlainText } from '@/lib/collectors/article-text';
import { getThematicFallback } from '@/lib/collectors/image-extractor';
import { downloadImagesLocally, resolveArticlePhotos } from '@/lib/collectors/photo-scout';
import { stampAuthorForPipeline } from '@/lib/authors';
import { toPublicCategory, toPublicTags } from '@/lib/public-labels';
import type { StoredArticle } from '@/lib/data-store/articles-repo';

/* ─── Auth (PIN primary; legacy token kept) ─── */

/** Normalize PIN / token for compare — digits+hyphen PIN may omit spaces/hyphens. */
export function normalizeEditorialPin(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, '');
}

function pinDigits(raw: string): string {
  return normalizeEditorialPin(raw).replace(/-/g, '');
}

function credentialsMatch(provided: string, expected: string, mode: 'pin' | 'token'): boolean {
  if (!provided || !expected) return false;
  if (mode === 'token') return provided === expected;
  const a = pinDigits(provided);
  const b = pinDigits(expected);
  return a.length >= 6 && a === b;
}

/**
 * Chief / Staff Author door auth.
 * Primary: SMARTPROTO_NEWS_PIN (short numeric-ish PIN, e.g. 098765-543210).
 * Legacy: EDITORIAL_DOOR_SECRET bearer/token still accepted when set.
 */
export function authorizeEditorialDoor(
  request: Request,
  body?: Record<string, unknown> | null,
): { ok: true } | { ok: false; status: number; error: string } {
  const pinSecret = (process.env.SMARTPROTO_NEWS_PIN || '').trim();
  const tokenSecret = (process.env.EDITORIAL_DOOR_SECRET || '').trim();
  if (!pinSecret && tokenSecret.length < 8) {
    return {
      ok: false,
      status: 503,
      error: 'Editorial doors not configured (set SMARTPROTO_NEWS_PIN or EDITORIAL_DOOR_SECRET).',
    };
  }
  const header = request.headers.get('authorization') || '';
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
  const fromBody =
    (typeof body?.pin === 'string' && body.pin) ||
    (typeof body?.token === 'string' && body.token) ||
    (typeof body?.accessToken === 'string' && body.accessToken) ||
    '';
  let fromQuery = '';
  try {
    const u = new URL(request.url);
    fromQuery = (
      u.searchParams.get('pin') ||
      u.searchParams.get('token') ||
      u.searchParams.get('accessToken') ||
      ''
    ).trim();
  } catch {
    /* ignore */
  }
  const provided = normalizeEditorialPin(bearer || String(fromBody).trim() || fromQuery);
  if (!provided) {
    return { ok: false, status: 401, error: 'Unauthorized. Provide the editorial PIN.' };
  }
  if (pinSecret && credentialsMatch(provided, pinSecret, 'pin')) {
    return { ok: true };
  }
  if (tokenSecret.length >= 8 && credentialsMatch(provided, tokenSecret, 'token')) {
    return { ok: true };
  }
  return { ok: false, status: 401, error: 'Unauthorized. Invalid PIN (or legacy token).' };
}

/* ─── Dedupe ─── */

export function normalizeUrl(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    u.hash = '';
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref']) {
      u.searchParams.delete(k);
    }
    u.pathname = (u.pathname.replace(/\/+$/, '') || '/').replace(/\/amp\/?$/i, '');
    u.hostname = u.hostname.replace(/^www\./i, '').toLowerCase();
    return u.toString();
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, '');
  }
}

export function normalizeProductIdentity(text: string): string {
  return text
    .toLowerCase()
    .replace(/["'`]/g, '')
    .replace(/[^a-z0-9а-яё]+/gi, ' ')
    .replace(
      /\b(the|a|an|new|review|hands.?on|vs|versus|launch|announces?|unveils?|новинка|обзор|представил\w*|анонсир\w*|компания)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenOverlap(a: string, b: string): number {
  const sa = new Set(a.split(' ').filter((t) => t.length > 2));
  const sb = new Set(b.split(' ').filter((t) => t.length > 2));
  if (!sa.size || !sb.size) return 0;
  let hit = 0;
  for (const t of sa) if (sb.has(t)) hit += 1;
  return hit / Math.min(sa.size, sb.size);
}

export type DuplicateHit = {
  slug: string;
  title: string;
  sourceUrl: string;
  reason: string;
};

export function findPublishedDuplicate(opts: {
  url?: string;
  title?: string;
  text?: string;
  articles?: Article[];
}): DuplicateHit | null {
  const articles = opts.articles ?? getAllArticles();
  const url = normalizeUrl(opts.url || '');
  const titleId = normalizeProductIdentity(opts.title || '');
  const textId = normalizeProductIdentity(`${opts.title || ''} ${(opts.text || '').slice(0, 400)}`);

  for (const a of articles) {
    const aUrl = normalizeUrl(a.sourceUrl || '');
    if (url && aUrl && url === aUrl) {
      return { slug: a.slug, title: a.title, sourceUrl: a.sourceUrl, reason: 'same_url' };
    }
    if (url && aUrl) {
      try {
        const ua = new URL(url);
        const ub = new URL(aUrl);
        if (ua.hostname === ub.hostname) {
          const pa = ua.pathname.replace(/\/+$/, '');
          const pb = ub.pathname.replace(/\/+$/, '');
          if (pa === pb) {
            return { slug: a.slug, title: a.title, sourceUrl: a.sourceUrl, reason: 'canonical_url' };
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (titleId.length >= 10) {
    for (const a of articles) {
      const nameId = normalizeProductIdentity(a.title || '');
      const slugId = normalizeProductIdentity((a.slug || '').replace(/-/g, ' '));
      if (nameId && (nameId === titleId || slugId === titleId)) {
        return { slug: a.slug, title: a.title, sourceUrl: a.sourceUrl, reason: 'same_product' };
      }
      if (nameId.length >= 16 && titleId.length >= 16 && tokenOverlap(nameId, titleId) >= 0.92) {
        return { slug: a.slug, title: a.title, sourceUrl: a.sourceUrl, reason: 'same_event' };
      }
    }
  }

  if (textId.length >= 40 && titleId.length >= 12) {
    for (const a of articles) {
      const blob = normalizeProductIdentity(`${a.title} ${(a.summary || '').slice(0, 160)}`);
      if (
        blob.length >= 40 &&
        tokenOverlap(blob, textId) >= 0.95 &&
        tokenOverlap(normalizeProductIdentity(a.title || ''), titleId) >= 0.7
      ) {
        return { slug: a.slug, title: a.title, sourceUrl: a.sourceUrl, reason: 'same_event' };
      }
    }
  }
  return null;
}

function extractCanonicalUrl(html: string, baseUrl: string): string {
  const m =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i) ||
    html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
  const raw = m?.[1]?.trim() || '';
  if (!raw) return normalizeUrl(baseUrl);
  try {
    return normalizeUrl(new URL(raw, baseUrl).toString());
  } catch {
    return normalizeUrl(baseUrl);
  }
}

/**
 * SP-A-077 — Chief-only HTML enrich when generic extractor returns a thin teaser.
 * Does not change AUTO collectors.
 */
function enrichChiefSourceFromHtml(html: string, existing: string): string {
  const meta =
    html.match(
      /<meta[^>]+(?:property|name)=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    )?.[1] ||
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:description["']/i,
    )?.[1] ||
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    '';
  const articleChunk =
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ||
    html.match(
      /<div[^>]+class=["'][^"']*(?:post-content|entry-content|article-content|content-inner|news-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    )?.[1] ||
    '';
  const raw = (articleChunk || html)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  const parts = [existing, meta, raw.slice(0, 6000)].filter(Boolean);
  // Prefer longest unique blend
  const merged = parts
    .sort((a, b) => b.length - a.length)
    .reduce((acc, p) => (acc.includes(p.slice(0, 80)) ? acc : `${acc}\n\n${p}`.trim()), '');
  return merged.slice(0, 8000) || existing;
}

/** SP-A-077 — Chief must ship with a hero photo (AUTO may still publish without). */
export type ChiefPhotoKind = 'SOURCE_PHOTO' | 'WEB_PHOTO' | 'THEMATIC_PHOTO';

function extractSourcePhotoUrls(html: string, baseUrl: string, extra?: string): string[] {
  const out: string[] = [];
  const push = (raw: string | undefined) => {
    const t = (raw || '').trim();
    if (!t) return;
    try {
      const abs = new URL(t, baseUrl).toString();
      if (/^https?:\/\//i.test(abs) && !out.includes(abs)) out.push(abs);
    } catch {
      /* ignore */
    }
  };
  push(extra);
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/gi,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) push(m[1]);
  }
  return out;
}

async function ensureChiefArticlePhoto(opts: {
  slug: string;
  title: string;
  text: string;
  sourceUrl: string;
  html?: string;
  fallbackUrl?: string;
}): Promise<{
  images: NonNullable<Article['images']>;
  imageUrl: string;
  kind: ChiefPhotoKind;
  remoteUrl: string;
} | null> {
  // 1) Exact / close photo from source article (og:image, twitter:image, extract fallback).
  const sourceCandidates = extractSourcePhotoUrls(opts.html || '', opts.sourceUrl, opts.fallbackUrl);
  if (sourceCandidates.length) {
    const downloaded = await downloadImagesLocally(
      opts.slug,
      sourceCandidates.slice(0, 2).map((url, i) => ({
        url,
        role: (i === 0 ? 'hero' : 'secondary') as 'hero' | 'secondary',
      })),
    );
    if (downloaded.length) {
      return {
        images: downloaded,
        imageUrl: downloaded[0].url,
        kind: 'SOURCE_PHOTO',
        remoteUrl: downloaded[0].sourceUrl || sourceCandidates[0],
      };
    }
  }

  // 2) Web / photo-scout close match (exact product / research demo when available).
  try {
    const report = await resolveArticlePhotos({
      slug: opts.slug,
      title: opts.title,
      text: opts.text,
      sourceUrl: opts.sourceUrl,
      fallbackUrl: opts.fallbackUrl,
      html: opts.html,
      maxResearchPages: 2,
    });
    if (report.selected?.length) {
      return {
        images: report.selected,
        imageUrl: report.selected[0].url,
        kind: 'WEB_PHOTO',
        remoteUrl: report.selected[0].sourceUrl || report.selected[0].url,
      };
    }
  } catch {
    /* continue to thematic */
  }

  // 3) Honest thematic illustration by topic (never leave empty for Chief).
  const thematic = getThematicFallback(opts.title, 'Технологии');
  if (thematic) {
    const downloaded = await downloadImagesLocally(opts.slug, [{ url: thematic, role: 'hero' }]);
    if (downloaded.length) {
      return {
        images: downloaded.map((img) => ({
          ...img,
          // keep local url; sourceUrl stays remote thematic origin
        })),
        imageUrl: downloaded[0].url,
        kind: 'THEMATIC_PHOTO',
        remoteUrl: thematic,
      };
    }
  }

  return null;
}

/* ─── Publish helpers ─── */

const MODEL = process.env.OPENROUTER_EDITOR_MODEL ?? 'google/gemini-2.5-flash-lite';

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://smartproto.site').replace(/\/$/, '');
}

function slugifyTitle(title: string, prefix: string): string {
  const latin = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  if (latin.length >= 6) return latin;
  const hash = Math.abs(
    Array.from(title).reduce((h, ch) => ((h << 5) - h + ch.charCodeAt(0)) | 0, 0),
  )
    .toString(36)
    .slice(0, 8);
  return `${prefix}-${hash}-${Date.now().toString(36).slice(-4)}`;
}

function uniqueSlug(base: string, existing: Set<string>): string {
  let slug = base || `article-${Date.now()}`;
  if (!existing.has(slug)) return slug;
  for (let i = 2; i < 50; i++) {
    const c = `${base}-${i}`;
    if (!existing.has(c)) return c;
  }
  return `${base}-${Date.now()}`;
}

function summaryOf(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= 200) return t;
  const i = t.indexOf('.', 50);
  if (i > 0 && i <= 200) return t.slice(0, i + 1);
  return `${t.slice(0, 197)}...`;
}

function estimateReadTime(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 150))} мин`;
}

async function publishArticle(article: Article): Promise<void> {
  if (process.env.ARTICLES_STORE === 'sqlite') {
    const { upsertArticle } = await import('@/lib/data-store/articles-repo');
    // SP-A-098 translation is scheduled inside upsertArticle for new rows.
    upsertArticle(article as StoredArticle);
    return;
  }
  const articlesPath =
    process.env.SMARTPROTO_ARTICLES_PATH ||
    path.resolve(process.cwd(), 'src/data/articles.json');
  let list: Article[] = [];
  try {
    const raw = await fs.readFile(articlesPath, 'utf8');
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
    if (Array.isArray(parsed)) list = parsed as Article[];
  } catch {
    list = [];
  }
  const existed = list.some(
    (a) => a.slug === article.slug || a.id === article.id || a.sourceUrl === article.sourceUrl,
  );
  const next = list.filter(
    (a) => a.slug !== article.slug && a.id !== article.id && a.sourceUrl !== article.sourceUrl,
  );
  next.unshift(article);
  await fs.writeFile(articlesPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  // SP-A-098 — JSON-mode Chief/Author publish (sqlite path covered by upsertArticle).
  if (!existed) {
    try {
      const { schedulePostPublishTranslation } = await import('@/lib/i18n/post-publish-translate');
      schedulePostPublishTranslation({
        id: article.id,
        slug: article.slug,
        title: article.title,
        summary: article.summary,
        content: article.content,
        category: article.category,
        author: article.author,
        authorDesk: article.authorDesk,
      });
    } catch (err) {
      console.log(
        `[spa098] doors schedule swallowed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

/* ─── Author Door ─── */

export type AuthorType =
  | 'AUTHOR_ARTICLE'
  | 'COLUMN'
  | 'OPINION'
  | 'REVIEW'
  | 'REVIEW_OPINION';

export function normalizeAuthorType(raw: string): AuthorType | null {
  const t = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (t === 'AUTHOR_ARTICLE' || t === 'ARTICLE') return 'AUTHOR_ARTICLE';
  if (t === 'COLUMN') return 'COLUMN';
  if (t === 'OPINION') return 'OPINION';
  if (t === 'REVIEW') return 'REVIEW';
  if (t === 'REVIEW_OPINION' || t === 'REVIEWOPINION') return 'REVIEW_OPINION';
  return null;
}

export function authorTypeLabel(t: AuthorType): string {
  switch (t) {
    case 'COLUMN':
      return 'Колонка';
    case 'OPINION':
      return 'Мнение';
    case 'REVIEW':
      return 'Обзор';
    case 'REVIEW_OPINION':
      return 'Обзор / мнение';
    default:
      return 'Авторская статья';
  }
}

function authorFingerprintUrl(authorName: string, title: string): string {
  const key =
    normalizeProductIdentity(`${authorName} ${title}`).replace(/\s+/g, '-').slice(0, 96) || 'piece';
  return `editorial://author/${key}`;
}

async function polishAuthor(input: {
  authorName: string;
  title: string;
  type: AuthorType;
  text: string;
  sourceUrl?: string;
  note?: string;
}): Promise<{ title: string; text: string; tags: string[] }> {
  const client = getOpenRouterClient();
  const typeLabel = authorTypeLabel(input.type);
  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.25,
    max_tokens: 2200,
    messages: [
      {
        role: 'system',
        content: [
          'Ты редактор SmartProto для АВТОРСКИХ материалов и колонок (Staff Author Desk).',
          'Лёгкая редактура НЕ переписывание. СОХРАНЯЙ ГОЛОС АВТОРА.',
          'РАЗРЕШЕНО: орфография, читаемость, убрать повторы, сильнее title без «!», лёгкая структура, проверка явных противоречий.',
          'ЗАПРЕЩЕНО: менять позицию, выдумывать факты, стирать стиль, убирать авторство, кликбейт/реклама,',
          'превращать колонку в безличный AUTO-style article / пресс-релиз.',
          'Имя автора не менять и не подменять. Верни СТРОГО JSON: {"title":string,"text":string,"tags":string[]}',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `Автор: ${input.authorName}`,
          `Тип: ${typeLabel}`,
          input.sourceUrl ? `Источник: ${input.sourceUrl}` : '',
          input.note ? `Note: ${input.note}` : '',
          `Заголовок:\n${clampText(input.title, 200)}`,
          `Текст:\n${clampText(input.text, 12000)}`,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
  });
  const raw = String(completion.choices[0]?.message?.content || '').trim();
  try {
    const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return {
      title:
        typeof parsed.title === 'string' && parsed.title.trim()
          ? parsed.title.trim().replace(/!+/g, '').slice(0, 120)
          : input.title.trim(),
      text:
        typeof parsed.text === 'string' && parsed.text.trim()
          ? parsed.text.trim()
          : input.text.trim(),
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.filter((t): t is string => typeof t === 'string' && Boolean(t.trim())).slice(0, 8)
        : [typeLabel],
    };
  } catch {
    return { title: input.title.trim(), text: input.text.trim(), tags: [typeLabel] };
  }
}

export type AuthorPublishResult =
  | { ok: true; status: 'PUBLISHED'; slug: string; articleUrl: string; title: string; typeLabel: string }
  | {
      ok: false;
      status: 'DUPLICATE' | 'FAILED' | 'RECEIVED';
      code: string;
      message: string;
      duplicateSlug?: string;
      duplicateTitle?: string;
      articleUrl?: string;
    };

export async function publishAuthorContribution(input: {
  authorName: string;
  title: string;
  type: AuthorType;
  text: string;
  sourceUrl?: string;
  note?: string;
}): Promise<AuthorPublishResult> {
  const type = normalizeAuthorType(String(input.type || ''));
  if (!type) {
    return {
      ok: false,
      status: 'FAILED',
      code: 'VALIDATION',
      message: 'TYPE must be AUTHOR_ARTICLE | COLUMN | OPINION | REVIEW | REVIEW_OPINION.',
    };
  }
  const authorName = input.authorName.trim();
  const title = input.title.trim();
  const text = input.text.trim();
  const sourceUrl = (input.sourceUrl || '').trim();
  const note = (input.note || '').trim();

  if (!authorName || authorName.length < 2) {
    return { ok: false, status: 'FAILED', code: 'VALIDATION', message: 'AUTHOR NAME is required.' };
  }
  if (!title || title.length < 5) {
    return { ok: false, status: 'FAILED', code: 'VALIDATION', message: 'TITLE is required.' };
  }
  if (!text || text.length < 80) {
    return { ok: false, status: 'FAILED', code: 'VALIDATION', message: 'TEXT is too short.' };
  }
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
    return { ok: false, status: 'FAILED', code: 'VALIDATION', message: 'SOURCE URL must be http(s).' };
  }

  const fingerprint = authorFingerprintUrl(authorName, title);
  const identityUrl = sourceUrl || fingerprint;
  const dup =
    findPublishedDuplicate({ url: identityUrl, title, text }) ||
    (sourceUrl ? findPublishedDuplicate({ url: fingerprint }) : null);
  if (dup) {
    return {
      ok: false,
      status: 'DUPLICATE',
      code: 'DUPLICATE',
      message: 'ALREADY PUBLISHED',
      duplicateSlug: dup.slug,
      duplicateTitle: dup.title,
      articleUrl: `${siteBase()}/articles/${dup.slug}`,
    };
  }

  try {
    const polished = await polishAuthor({
      authorName,
      title,
      type,
      text,
      sourceUrl: sourceUrl || undefined,
      note: note || undefined,
    });
    const afterDup = findPublishedDuplicate({
      url: identityUrl,
      title: polished.title,
      text: polished.text,
    });
    if (afterDup) {
      return {
        ok: false,
        status: 'DUPLICATE',
        code: 'DUPLICATE',
        message: 'ALREADY PUBLISHED',
        duplicateSlug: afterDup.slug,
        duplicateTitle: afterDup.title,
        articleUrl: `${siteBase()}/articles/${afterDup.slug}`,
      };
    }

    const typeLabel = authorTypeLabel(type);
    const existing = new Set(getAllArticles().map((a) => a.slug));
    const slug = uniqueSlug(slugifyTitle(polished.title, 'author'), existing);
    const article: Article = {
      id: slug,
      slug,
      title: polished.title,
      category: type,
      tags: Array.from(new Set(toPublicTags([...polished.tags, typeLabel]))).slice(0, 10),
      summary: summaryOf(polished.text),
      content: polished.text,
      sourceUrl: identityUrl,
      publishedAt: new Date().toISOString(),
      readTime: estimateReadTime(polished.text),
      author: authorName,
      authorDesk: 'Staff Author / Journalist',
      agentId: 'author-door',
    };
    await publishArticle(article);
    return {
      ok: true,
      status: 'PUBLISHED',
      slug,
      articleUrl: `${siteBase()}/articles/${slug}`,
      title: polished.title,
      typeLabel,
    };
  } catch (err) {
    return {
      ok: false,
      status: 'FAILED',
      code: 'ERROR',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/* ─── SP-A-094 Staff Author Link queue (Mode A — propose news, no direct publish) ─── */

export const STAFF_AUTHOR_LINK_AGENT_ID = 'staff-author-link';
export const STAFF_AUTHOR_LINK_SOURCE_NAME = 'Staff Author';
export const STAFF_AUTHOR_LINK_SOURCE_TYPE = 'staff-author-link' as const;

export type StaffAuthorLinkStatus =
  | 'queued'
  | 'processing'
  | 'rejected'
  | 'duplicate'
  | 'published';

export type StaffAuthorLinkSubmission = {
  id: string;
  sourceType: typeof STAFF_AUTHOR_LINK_SOURCE_TYPE;
  status: StaffAuthorLinkStatus;
  url: string;
  normalizedUrl: string;
  note?: string;
  authorName: string;
  rejectReason?: string;
  articleSlug?: string;
  createdAt: string;
  updatedAt: string;
  attempts?: number;
};

function staffAuthorQueueDir(): string {
  const root = process.env.SMARTPROTO_DATA_DIR || path.resolve(process.cwd(), 'data');
  return path.join(root, 'staff-author-links');
}

async function ensureStaffAuthorDirs(): Promise<void> {
  await fs.mkdir(staffAuthorQueueDir(), { recursive: true });
}

async function persistStaffAuthorLink(sub: StaffAuthorLinkSubmission): Promise<void> {
  await ensureStaffAuthorDirs();
  await fs.writeFile(
    path.join(staffAuthorQueueDir(), `${sub.id}.json`),
    `${JSON.stringify(sub, null, 2)}\n`,
    'utf8',
  );
}

function validateStaffAuthorUrl(
  raw: string,
): { ok: true; url: string; normalized: string } | { ok: false; message: string } {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { ok: false, message: 'Укажите ссылку.' };
  if (/\s/.test(trimmed)) return { ok: false, message: 'Ссылка содержит пробелы.' };
  if (/^(javascript|data|file|vbscript|about):/i.test(trimmed)) {
    return { ok: false, message: 'Недопустимый тип ссылки.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, message: 'Некорректная ссылка.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, message: 'Разрешены только http/https ссылки.' };
  }
  if (!parsed.hostname || parsed.hostname.length < 3 || !parsed.hostname.includes('.')) {
    return { ok: false, message: 'Некорректный адрес сайта.' };
  }
  if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.)/i.test(parsed.hostname)) {
    return { ok: false, message: 'Локальные адреса не принимаются.' };
  }
  const normalized = normalizeUrl(parsed.toString());
  return { ok: true, url: parsed.toString(), normalized };
}

export async function listStaffAuthorLinks(
  status?: StaffAuthorLinkStatus,
): Promise<StaffAuthorLinkSubmission[]> {
  try {
    await ensureStaffAuthorDirs();
    const files = await fs.readdir(staffAuthorQueueDir());
    const out: StaffAuthorLinkSubmission[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(staffAuthorQueueDir(), f), 'utf8');
        const parsed = JSON.parse(raw) as StaffAuthorLinkSubmission;
        if (status && parsed.status !== status) continue;
        out.push(parsed);
      } catch {
        /* skip */
      }
    }
    out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    return out;
  } catch {
    return [];
  }
}

export async function getStaffAuthorLink(id: string): Promise<StaffAuthorLinkSubmission | null> {
  try {
    const raw = await fs.readFile(path.join(staffAuthorQueueDir(), `${id}.json`), 'utf8');
    return JSON.parse(raw) as StaffAuthorLinkSubmission;
  } catch {
    return null;
  }
}

export async function patchStaffAuthorLink(
  id: string,
  patch: Partial<StaffAuthorLinkSubmission>,
): Promise<StaffAuthorLinkSubmission | null> {
  const cur = await getStaffAuthorLink(id);
  if (!cur) return null;
  const next: StaffAuthorLinkSubmission = {
    ...cur,
    ...patch,
    id: cur.id,
    sourceType: STAFF_AUTHOR_LINK_SOURCE_TYPE,
    updatedAt: new Date().toISOString(),
  };
  await persistStaffAuthorLink(next);
  return next;
}

export type StaffAuthorLinkAcceptResult =
  | { ok: true; id: string; status: 'queued'; message: string }
  | {
      ok: false;
      status: 'rejected' | 'duplicate';
      code: 'VALIDATION' | 'DUPLICATE' | 'SAFETY';
      message: string;
      duplicateSlug?: string;
    };

/**
 * Mode A — trusted journalist proposes a URL. Queued only; never direct publish.
 * Priority seating: above Reader Scout / AUTO, below Chief.
 */
export async function acceptStaffAuthorLink(input: {
  url: string;
  note?: string;
  authorName: string;
}): Promise<StaffAuthorLinkAcceptResult> {
  const authorName = String(input.authorName || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  if (!authorName || authorName.length < 2) {
    return { ok: false, status: 'rejected', code: 'VALIDATION', message: 'Укажите имя автора.' };
  }
  const urlCheck = validateStaffAuthorUrl(input.url);
  if (!urlCheck.ok) {
    return { ok: false, status: 'rejected', code: 'VALIDATION', message: urlCheck.message };
  }
  const note = String(input.note || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 800);

  const dup = findPublishedDuplicate({ url: urlCheck.url });
  if (dup) {
    return {
      ok: false,
      status: 'duplicate',
      code: 'DUPLICATE',
      message: 'Эта ссылка уже опубликована.',
      duplicateSlug: dup.slug,
    };
  }
  const queued = await listStaffAuthorLinks();
  const queuedDup = queued.find(
    (s) =>
      s.normalizedUrl === urlCheck.normalized &&
      (s.status === 'queued' || s.status === 'processing' || s.status === 'published'),
  );
  if (queuedDup) {
    return {
      ok: false,
      status: 'duplicate',
      code: 'DUPLICATE',
      message: 'Эта ссылка уже в очереди редакции.',
      duplicateSlug: queuedDup.articleSlug,
    };
  }

  const now = new Date().toISOString();
  const id = `alink-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const sub: StaffAuthorLinkSubmission = {
    id,
    sourceType: STAFF_AUTHOR_LINK_SOURCE_TYPE,
    status: 'queued',
    url: urlCheck.url,
    normalizedUrl: urlCheck.normalized,
    note: note || undefined,
    authorName,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
  };
  await persistStaffAuthorLink(sub);
  return {
    ok: true,
    id,
    status: 'queued',
    message: 'Ссылка принята в редакционную очередь (Staff Author). Без прямой публикации.',
  };
}

/** Load queued staff-author links for newsroom tick — seated above Reader Scout. */
export async function loadQueuedStaffAuthorLinksForTick(limit = 4): Promise<
  Array<{
    submissionId: string;
    id: string;
    title: string;
    url: string;
    text: string;
    publishedAt: string;
    sourceName: string;
    authorName: string;
  }>
> {
  const queued = await listStaffAuthorLinks('queued');
  const out: Array<{
    submissionId: string;
    id: string;
    title: string;
    url: string;
    text: string;
    publishedAt: string;
    sourceName: string;
    authorName: string;
  }> = [];
  for (const s of queued.slice(0, limit)) {
    let host = 'link';
    try {
      host = new URL(s.url).hostname.replace(/^www\./, '');
    } catch {
      /* ignore */
    }
    let extracted = '';
    try {
      const page = await extractArticlePlainText(s.url, { maxChars: 6000, timeoutMs: 10000 });
      extracted = (page.text || '').slice(0, 6000);
    } catch {
      extracted = '';
    }
    const title = s.note?.trim()
      ? `${s.authorName}: ${s.note.trim().slice(0, 90)}`
      : `${s.authorName}: ${host}`;
    const text = [
      'SOURCE PACK (Staff Author / Journalist link — high priority, full editorial gates):',
      s.note ? `Угол журналиста: ${s.note}` : '',
      `Автор предложения: ${s.authorName}`,
      `Источник: ${s.url}`,
      extracted || '(текст страницы не извлечён — опирайся на URL/заметку)',
    ]
      .filter(Boolean)
      .join('\n\n');
    out.push({
      submissionId: s.id,
      id: `staff-author-link:${s.id}`,
      title,
      url: s.url,
      text,
      publishedAt: s.createdAt,
      sourceName: STAFF_AUTHOR_LINK_SOURCE_NAME,
      authorName: s.authorName,
    });
  }
  return out;
}

/* ─── Chief Fast Lane (Scout bypass; fact/source/dedupe kept) ─── */

export type ChiefJobStatus =
  | 'CHECKING'
  | 'DUPLICATE'
  | 'EDITING'
  | 'READY'
  | 'PUBLISHED'
  | 'FAILED';

export type ChiefJob = {
  id: string;
  status: ChiefJobStatus;
  url: string;
  note?: string;
  message?: string;
  articleSlug?: string;
  articleUrl?: string;
  duplicateSlug?: string;
  duplicateTitle?: string;
  /** SP-A-077 — how the required Chief hero was resolved */
  photoKind?: ChiefPhotoKind;
  photoUrl?: string;
  updatedAt: string;
  createdAt: string;
};

const chiefJobs = new Map<string, ChiefJob>();

function jobsDir(): string {
  const base = process.env.SMARTPROTO_DATA_DIR || path.resolve(process.cwd(), 'data');
  return path.join(base, 'editorial-jobs');
}

async function persistJob(job: ChiefJob): Promise<void> {
  chiefJobs.set(job.id, job);
  try {
    await fs.mkdir(jobsDir(), { recursive: true });
    await fs.writeFile(path.join(jobsDir(), `${job.id}.json`), `${JSON.stringify(job, null, 2)}\n`);
  } catch {
    /* best-effort */
  }
}

export async function getChiefJob(id: string): Promise<ChiefJob | null> {
  const mem = chiefJobs.get(id);
  if (mem) return mem;
  try {
    const raw = await fs.readFile(path.join(jobsDir(), `${id}.json`), 'utf8');
    const parsed = JSON.parse(raw) as ChiefJob;
    chiefJobs.set(id, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function patchJob(job: ChiefJob, p: Partial<ChiefJob>): ChiefJob {
  const next = { ...job, ...p, updatedAt: new Date().toISOString() };
  void persistJob(next);
  return next;
}

export function createChiefJob(url: string, note?: string): ChiefJob {
  const id = `chief-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const job: ChiefJob = {
    id,
    status: 'CHECKING',
    url: url.trim(),
    note: note?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    message: 'URL validation / duplicate check…',
  };
  void persistJob(job);
  return job;
}

async function writeChiefDraft(opts: {
  sourceText: string;
  sourceUrl: string;
  note?: string;
  reviewVerdict?: string;
  keyAspects?: string[];
}): Promise<{ title: string; text: string; tags: string[] }> {
  // SP-A-088 — ONE Editor layer: Chief uses the same writeDraft / Editorial DNA as AUTO.
  // No second prompt stack. Chief access preserved via chiefFastLane (skips hardReject).
  const { writeDraft } = await import('@/lib/ai/editor');
  const draft = await writeDraft(
    {
      format: 'article' as const,
      mode: 'ai_radar' as const,
      chiefFastLane: true,
      title: opts.note?.trim() || 'Chief Fast Lane source',
      sourceName: opts.sourceUrl,
      sourceUrl: opts.sourceUrl,
      text: [
        opts.note ? `NOTE главного редактора: ${opts.note}` : '',
        opts.keyAspects?.length ? `Аспекты: ${opts.keyAspects.join(' · ')}` : '',
        opts.sourceText,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
    {
      technicalVerdict:
        opts.reviewVerdict ||
        'PASS: Chief Fast Lane — Scout bypass; human editorial override; write full SmartProto voice.',
    },
  );
  if (draft.title.trim().toUpperCase() === 'REJECT') {
    throw new Error('Chief Editor returned REJECT — source unusable for SmartProto voice.');
  }
  return {
    title: draft.title.trim().replace(/!+/g, '').slice(0, 120),
    text: draft.text.trim(),
    tags: draft.tags.map((t) => t.trim()).slice(0, 8),
  };
}

/** Immediate pipeline — does not wait for AUTO cycle; does not call Scout. */
export async function runChiefFastLane(jobId: string): Promise<ChiefJob> {
  let job = await getChiefJob(jobId);
  if (!job) throw new Error(`Unknown chief job: ${jobId}`);
  if (['PUBLISHED', 'DUPLICATE', 'FAILED'].includes(job.status)) return job;

  try {
    job = patchJob(job, { status: 'CHECKING', message: 'Validating URL…' });
    const url = job.url.trim();
    if (!/^https?:\/\//i.test(url)) {
      return patchJob(job, { status: 'FAILED', message: 'URL must start with http(s)://' });
    }

    const page = await extractArticlePlainText(url, { maxChars: 8000, timeoutMs: 12000 });
    let html = '';
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru,en;q=0.8',
        },
        redirect: 'follow',
      });
      if (res.ok) html = await res.text();
    } catch {
      /* optional */
    }
    const canonical = html ? extractCanonicalUrl(html, url) : normalizeUrl(url);

    const dup =
      findPublishedDuplicate({ url: canonical || url }) || findPublishedDuplicate({ url });
    if (dup) {
      return patchJob(job, {
        status: 'DUPLICATE',
        message: 'ALREADY PUBLISHED',
        duplicateSlug: dup.slug,
        duplicateTitle: dup.title,
        articleSlug: dup.slug,
        articleUrl: `${siteBase()}/articles/${dup.slug}`,
      });
    }

    // SP-A-077 — Chief may get thin extractor output (e.g. ForkLog). Enrich from HTML
    // for this door only; AUTO extract path unchanged.
    let sourceText = page.text.trim();
    if (html && sourceText.length < 800) {
      const enriched = enrichChiefSourceFromHtml(html, sourceText);
      if (enriched.length > sourceText.length) sourceText = enriched;
    }

    if (!sourceText || sourceText.length < 80) {
      return patchJob(job, {
        status: 'FAILED',
        message: 'Could not read enough text from source URL (empty/blocked page).',
      });
    }

    // SP-A-077 — Chief = human editorial override.
    // Keep malware / obvious spam / empty. Do NOT apply AUTO substance depth (wordCount<40).
    job = patchJob(job, { status: 'EDITING', message: 'Source / safety sanity…' });
    const blob = sourceText.slice(0, 5000);
    if (
      /buy now|crypto giveaway|double your bitcoin|100x returns|\bporn\b|\bxxx\b|viagra|malware|phishing/i.test(
        blob,
      )
    ) {
      return patchJob(job, {
        status: 'FAILED',
        message: 'Source failed basic safety check (malware/spam patterns).',
      });
    }
    // Obviously unrelated spam landing (not a real article)
    if (
      sourceText.length < 200 &&
      !/[.!?。…]\s|[а-яёa-z]{4,}/i.test(sourceText)
    ) {
      return patchJob(job, {
        status: 'FAILED',
        message: 'Source failed: page does not look like a readable article.',
      });
    }

    job = patchJob(job, { status: 'EDITING', message: 'Writing chief draft…' });
    const draft = await writeChiefDraft({
      sourceText,
      sourceUrl: url,
      note: job.note,
      reviewVerdict: 'Chief override: Scout bypass; source readable; local safety OK.',
      keyAspects: [],
    });

    const afterDraftDup = findPublishedDuplicate({
      url: canonical || url,
      title: draft.title,
      text: draft.text,
    });
    if (afterDraftDup) {
      return patchJob(job, {
        status: 'DUPLICATE',
        message: 'ALREADY PUBLISHED',
        duplicateSlug: afterDraftDup.slug,
        duplicateTitle: afterDraftDup.title,
        articleSlug: afterDraftDup.slug,
        articleUrl: `${siteBase()}/articles/${afterDraftDup.slug}`,
      });
    }

    job = patchJob(job, { status: 'EDITING', message: 'Photo (required for Chief)…' });
    const existing = new Set(getAllArticles().map((a) => a.slug));
    const slug = uniqueSlug(slugifyTitle(draft.title, 'chief'), existing);
    const photo = await ensureChiefArticlePhoto({
      slug,
      title: draft.title,
      text: draft.text,
      sourceUrl: url,
      html: html || undefined,
      fallbackUrl: page.imageUrl || undefined,
    });
    if (!photo) {
      return patchJob(job, {
        status: 'FAILED',
        message: 'Chief publish blocked: no usable photo (source/web/thematic all failed).',
      });
    }

    job = patchJob(job, {
      status: 'READY',
      message: `Publishing with ${photo.kind}…`,
      photoKind: photo.kind,
      photoUrl: photo.imageUrl,
    });
    const article: Article = {
      id: slug,
      slug,
      title: draft.title,
      category: toPublicCategory('Технологии'),
      tags: Array.from(new Set(toPublicTags([...draft.tags, 'chief']))).slice(0, 10),
      summary: summaryOf(draft.text),
      content: draft.text,
      sourceUrl: url,
      publishedAt: new Date().toISOString(),
      readTime: estimateReadTime(draft.text),
      imageUrl: photo.imageUrl,
      images: photo.images,
      ...stampAuthorForPipeline('newsroom-scout', { sourceUrl: url, slug }),
      agentId: 'chief-fast-lane',
    };
    await publishArticle(article);
    return patchJob(job, {
      status: 'PUBLISHED',
      message: `Published (${photo.kind})`,
      articleSlug: slug,
      articleUrl: `${siteBase()}/articles/${slug}`,
      photoKind: photo.kind,
      photoUrl: photo.imageUrl,
    });
  } catch (err) {
    return patchJob(job, {
      status: 'FAILED',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
