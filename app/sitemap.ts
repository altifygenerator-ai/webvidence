import type { MetadataRoute } from 'next';
import { getAllArticles } from '@/lib/articles';
import { SITE_URL } from '@/lib/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date();
  const articles = getAllArticles();

  return [
    { url: SITE_URL, lastModified: updated, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/pricing`, lastModified: updated, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/faq`, lastModified: updated, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/scores`, lastModified: updated, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/articles`, lastModified: updated, changeFrequency: 'weekly', priority: 0.75 },
    ...articles.map((article) => ({
      url: `${SITE_URL}/articles/${article.slug}`,
      lastModified: new Date(`${article.updatedAt}T00:00:00Z`),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    { url: `${SITE_URL}/terms`, lastModified: updated, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified: updated, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
