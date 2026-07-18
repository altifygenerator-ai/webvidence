import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { MarketingFooter } from '@/components/marketing-footer';
import { MarketingHeader } from '@/components/marketing-header';
import { getAllArticles } from '@/lib/articles';
import { absoluteUrl, publicMetadata, SITE_NAME } from '@/lib/seo';

export const metadata: Metadata = publicMetadata({
  title: 'Web Design and Client-Finding Articles',
  description: 'Practical articles for freelance web designers and developers about finding local clients, reviewing business websites, outreach, follow-up, and useful marketing.',
  path: '/articles',
  keywords: [
    'web design articles',
    'find web design clients',
    'freelance web developer marketing',
    'web design outreach guides',
    'local business prospecting',
    'website audit guides',
  ],
});

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

export default function ArticlesPage() {
  const articles = getAllArticles();

  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `${absoluteUrl('/articles')}#collection`,
      url: absoluteUrl('/articles'),
      name: 'Webvidence Articles',
      description: metadata.description,
      isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: absoluteUrl('/') },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: articles.length,
        itemListElement: articles.map((article, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: absoluteUrl(`/articles/${article.slug}`),
          name: article.title,
        })),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_NAME, item: absoluteUrl('/') },
        { '@type': 'ListItem', position: 2, name: 'Articles', item: absoluteUrl('/articles') },
      ],
    },
  ];

  return (
    <>
      <JsonLd data={schema} />
      <MarketingHeader />
      <main className="articles-page resource-page">
        <header className="articles-hero resource-hero">
          <div className="section-code"><span>01</span> Practical field notes</div>
          <h1>Articles</h1>
          <p>Plainspoken guides on finding local clients, checking business websites, writing better outreach, and building a steadier freelance pipeline.</p>
        </header>

        <section className="article-index" aria-label="Webvidence articles">
          <div className="article-index-heading">
            <span>Latest guide</span>
            <p>The product stays the main thing. These are here for people who want the longer version of the process behind it.</p>
          </div>

          <div className="article-list">
            {articles.map((article, index) => (
              <article className="article-list-item" key={article.slug}>
                <div className="article-list-number">{String(index + 1).padStart(2, '0')}</div>
                <div className="article-list-copy">
                  <div className="article-list-meta">
                    <span>{article.category}</span>
                    <span>{formatDate(article.publishedAt)}</span>
                    <span>{article.readingMinutes} min read</span>
                  </div>
                  <h2><Link href={`/articles/${article.slug}`}>{article.title}</Link></h2>
                  <p>{article.excerpt}</p>
                </div>
                <Link className="article-list-link" href={`/articles/${article.slug}`} aria-label={`Read ${article.title}`}>
                  Read article <span>↗</span>
                </Link>
              </article>
            ))}
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
