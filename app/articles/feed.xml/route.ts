import { getAllArticles } from '@/lib/articles';
import { absoluteUrl, SITE_NAME } from '@/lib/seo';

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const articles = getAllArticles();
  const items = articles.map((article) => `
    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${absoluteUrl(`/articles/${article.slug}`)}</link>
      <guid isPermaLink="true">${absoluteUrl(`/articles/${article.slug}`)}</guid>
      <description>${escapeXml(article.description)}</description>
      <pubDate>${new Date(`${article.publishedAt}T12:00:00Z`).toUTCString()}</pubDate>
      <category>${escapeXml(article.category)}</category>
    </item>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>${SITE_NAME} Articles</title>
    <link>${absoluteUrl('/articles')}</link>
    <description>Practical guides for freelance web designers and developers.</description>
    <language>en-us</language>${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
