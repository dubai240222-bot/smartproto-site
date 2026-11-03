import type { MetadataRoute } from 'next';
import { getAllArticles } from '@/data/articles';
import { listPublishedLocalizations } from '@/data/localizations';
import { getPublicSiteUrl } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

/**
 * SP-A-103 — do not advertise empty locale homes or private editorial UI in the sitemap.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getPublicSiteUrl();
  const now = new Date();
  const articles = getAllArticles();
  const en = listPublishedLocalizations('en');
  const tr = listPublishedLocalizations('tr');

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/all`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/scout`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/stringers`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.5,
    },
  ];

  if (en.length > 0) {
    entries.push({
      url: `${baseUrl}/en`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    });
  }
  if (tr.length > 0) {
    entries.push({
      url: `${baseUrl}/tr`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    });
  }

  for (const article of articles) {
    entries.push({
      url: `${baseUrl}/articles/${article.slug}`,
      lastModified: new Date(article.publishedAt),
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }
  for (const loc of en) {
    entries.push({
      url: `${baseUrl}/en/articles/${loc.localizedSlug}`,
      lastModified: new Date(loc.translatedAt || now),
      changeFrequency: 'weekly',
      priority: 0.65,
    });
  }
  for (const loc of tr) {
    entries.push({
      url: `${baseUrl}/tr/articles/${loc.localizedSlug}`,
      lastModified: new Date(loc.translatedAt || now),
      changeFrequency: 'weekly',
      priority: 0.65,
    });
  }

  return entries;
}
