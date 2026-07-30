import type { MetadataRoute } from 'next';
import articles from '@/data/articles';

export const dynamic = 'force-static';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
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
    ...articles.map((article) => ({
      url: `${baseUrl}/articles/${article.slug}`,
      lastModified: new Date(article.publishedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}
