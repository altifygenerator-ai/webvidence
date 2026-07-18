import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArticleContent } from '@/components/article-content';
import { JsonLd } from '@/components/json-ld';
import { MarketingFooter } from '@/components/marketing-footer';
import { MarketingHeader } from '@/components/marketing-header';
import { getAllArticles, getArticleBySlug } from '@/lib/articles';
import { absoluteUrl, SITE_NAME, SITE_URL } from '@/lib/seo';

type ArticlePageProps = {
  params: Promise<{ slug: string }>;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

export function generateStaticParams() {
  return getAllArticles().map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) return {};

  const url = absoluteUrl(`/articles/${article.slug}`);
  const image = absoluteUrl('/opengraph-image');

  return {
    title: article.metaTitle,
    description: article.description,
    keywords: article.keywords,
    authors: [{ name: SITE_NAME, url: SITE_URL }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    category: article.category,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      siteName: SITE_NAME,
      title: article.metaTitle,
      description: article.description,
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt,
      authors: [SITE_URL],
      section: article.category,
      tags: article.keywords,
      images: [{ url: image, width: 1200, height: 630, alt: article.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: article.metaTitle,
      description: article.description,
      images: [image],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) notFound();

  const articleUrl = absoluteUrl(`/articles/${article.slug}`);
  const schemas: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      '@id': `${articleUrl}#article`,
      headline: article.title,
      description: article.description,
      url: articleUrl,
      mainEntityOfPage: articleUrl,
      datePublished: article.publishedAt,
      dateModified: article.updatedAt,
      wordCount: article.wordCount,
      articleSection: article.category,
      keywords: article.keywords.join(', '),
      image: absoluteUrl('/opengraph-image'),
      author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
      publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
      isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_NAME, item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Articles', item: absoluteUrl('/articles') },
        { '@type': 'ListItem', position: 3, name: article.title, item: articleUrl },
      ],
    },
  ];

  if (article.faqs.length) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      '@id': `${articleUrl}#faq`,
      mainEntity: article.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    });
  }

  const topLevelHeadings = article.headings.filter((heading) => heading.level === 2);

  return (
    <>
      <JsonLd data={schemas} />
      <MarketingHeader />
      <main className="article-page resource-page">
        <header className="article-hero">
          <nav className="article-breadcrumb" aria-label="Breadcrumb">
            <Link href="/articles">Articles</Link><span>/</span><span>{article.category}</span>
          </nav>
          <div className="section-code"><span>01</span> Webvidence field guide</div>
          <h1>{article.title}</h1>
          <p>{article.description}</p>
          <div className="article-byline">
            <span>Written by Webvidence</span>
            <span>{formatDate(article.publishedAt)}</span>
            <span>{article.readingMinutes} min read</span>
          </div>
        </header>

        <div className="article-layout">
          <aside className="article-aside">
            <div className="article-aside-block">
              <span>In this guide</span>
              <nav aria-label="Article sections">
                {topLevelHeadings.map((heading) => (
                  <a key={heading.id} href={`#${heading.id}`}>{heading.text}</a>
                ))}
              </nav>
            </div>
            <div className="article-aside-note">
              <small>Built from the same process</small>
              <p>Webvidence shortens the business search and website-review work. You still choose the lead, write the message, and handle the conversation.</p>
              <Link href="/signup">Try the free plan <span>↗</span></Link>
            </div>
          </aside>

          <article className="article-body">
            <ArticleContent markdown={article.markdown} headings={article.headings} />
            <footer className="article-end">
              <span>End of field guide</span>
              <Link href="/articles">← Back to all articles</Link>
            </footer>
          </article>
        </div>
      </main>
      <MarketingFooter />
    </>
  );
}
