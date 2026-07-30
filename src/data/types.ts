export type ArticleStatus = 'draft' | 'reviewed' | 'published' | 'archived';

export interface Article {
  slug: string;
  title: string;
  category: string;
  status: ArticleStatus;
  date: string;
  publishedAt?: string;
  readTime: string;
  description: string;
  content: string;
  links: { name: string; url: string }[];
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface Draft extends Partial<Omit<Article, 'status'>> {
  status: 'draft';
  source: 'show-hn' | 'reddit' | 'manual';
  validated: boolean;
  generatedAt: string;
}
