import type { MetadataRoute } from 'next';
import { getAllArticles } from '@/data/articles';
import { listPublishedLocalizations } from '@/data/localizations';
import { getPublicSiteUrl } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getPublicSiteUrl();
  const now = new Date();
  const articles = getAllArticles();
  const en = listPublishedLocalizations('en');
  const tr = listPublishedLocalizations('tr');

  return [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/en`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/tr`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/all`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/editorial`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...articles.map((article) => ({
      url: `${baseUrl}/articles/${article.slug}`,
      lastModified: new Date(article.publishedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...en.map((loc) => ({
      url: `${baseUrl}/en/articles/${loc.localizedSlug}`,
      lastModified: new Date(loc.translatedAt || now),
      changeFrequency: 'weekly' as const,
      priority: 0.65,
    })),
    ...tr.map((loc) => ({
      url: `${baseUrl}/tr/articles/${loc.localizedSlug}`,
      lastModified: new Date(loc.translatedAt || now),
      changeFrequency: 'weekly' as const,
      priority: 0.65,
    })),
  ];
}
