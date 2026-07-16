import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { MarketingFooter } from '@/components/marketing-footer';
import { MarketingHeader } from '@/components/marketing-header';
import { absoluteUrl, publicMetadata, SITE_NAME, SITE_URL } from '@/lib/seo';

export const metadata: Metadata = publicMetadata({
  title: 'What Webvidence Opportunity Scores Mean',
  description: 'See how Webvidence scores website opportunities, how findings are weighted, how review activity affects the result, and how to use the score correctly.',
  path: '/scores',
  keywords: [
    'Webvidence score',
    'website opportunity score',
    'web design lead scoring',
    'website audit score meaning',
    'qualify web design prospects',
  ],
});

const weights = [
  { level: 'High finding', points: '+20', detail: 'A stronger issue such as a missing title, missing mobile viewport, a website error, or a very weak PageSpeed category.' },
  { level: 'Medium finding', points: '+11', detail: 'A useful sales or usability concern such as no inquiry form, no clear contact path, no clickable phone link, or a missing meta description.' },
  { level: 'Low finding', points: '+4', detail: 'A smaller issue or caution such as thin homepage copy, old copyright text, duplicate titles, or missing structured data.' },
  { level: 'Positive finding', points: '−2', detail: 'Something that tested well, such as strong PageSpeed results or dedicated service content.' },
];

const activity = [
  { reviews: '0–9 reviews', boost: '+0' },
  { reviews: '10–39 reviews', boost: '+1' },
  { reviews: '40–99 reviews', boost: '+3' },
  { reviews: '100+ reviews', boost: '+5' },
];

export default function ScoresPage() {
  const pageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${absoluteUrl('/scores')}#webpage`,
    url: absoluteUrl('/scores'),
    name: 'What Webvidence Opportunity Scores Mean',
    description: 'How Webvidence calculates and uses opportunity scores for web design prospects.',
    isPartOf: { '@id': `${SITE_URL}#website` },
    about: { '@id': `${SITE_URL}#software` },
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITE_NAME, item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'Opportunity scores', item: absoluteUrl('/scores') },
    ],
  };

  return (
    <>
      <JsonLd data={[pageSchema, breadcrumbSchema]} />
      <MarketingHeader />
      <main className="resource-page shell">
        <header className="resource-hero score-resource-hero">
          <div>
            <div className="section-code"><span>01</span> Opportunity scoring</div>
            <h1>A higher score means more to review.</h1>
            <p>The number is not a quality grade for the business. It is a quick way to sort prospects by how much usable website evidence Webvidence found.</p>
          </div>
          <div className="score-example" aria-label="Example opportunity score"><strong>78</strong><span>Opportunity</span><small>Ready to review</small></div>
        </header>

        <section className="score-explainer-grid">
          <article>
            <small>STARTING POINT</small>
            <h2>25 points when a website is present</h2>
            <p>The audit starts at 25, then adds or removes points based on the findings. A business listing with no website receives a 94 because the missing website is already a clear opportunity.</p>
          </article>
          <article>
            <small>FINAL RANGE</small>
            <h2>Scores stay between 8 and 100</h2>
            <p>The website-audit portion is kept between 8 and 98. A small review-activity boost is added afterward, and the final score is capped at 100.</p>
          </article>
        </section>

        <section className="score-section">
          <div className="score-section-heading"><div className="section-code"><span>02</span> Finding weights</div><h2>What adds points</h2></div>
          <div className="score-weight-table">
            {weights.map((item) => (
              <article key={item.level}>
                <div><b>{item.level}</b><strong>{item.points}</strong></div>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="score-section activity-section">
          <div className="score-section-heading"><div className="section-code"><span>03</span> Business activity</div><h2>Review count adds a small boost</h2><p>Review activity does not replace the website findings. It only adds a few points because an established, active business may be more useful to review than an inactive listing with the same site issues.</p></div>
          <div className="activity-grid">
            {activity.map((item) => <div key={item.reviews}><span>{item.reviews}</span><strong>{item.boost}</strong></div>)}
          </div>
        </section>

        <section className="score-bands">
          <div className="score-section-heading"><div className="section-code"><span>04</span> Using the number</div><h2>A practical way to sort the list</h2></div>
          <div className="score-band-list">
            <article><strong>70–100</strong><div><h3>Ready to review</h3><p>Webvidence automatically marks completed audits at 70 or above as ready to contact. Verify the findings and decide whether the business fits your offer.</p></div></article>
            <article><strong>40–69</strong><div><h3>Look closer</h3><p>There may be a useful angle, but the case is not as obvious. Review the site, business activity, project value, and your service fit before reaching out.</p></div></article>
            <article><strong>8–39</strong><div><h3>Lower priority</h3><p>The sampled site may already handle the basics well, or the audit did not find enough evidence for a strong website pitch.</p></div></article>
          </div>
          <p className="score-caution"><b>Important:</b> The 40-point grouping is a practical guide for reading the list, not a promise that every lead in that range is good or bad. The only automatic pipeline threshold is 70.</p>
        </section>

        <section className="score-section score-rules">
          <div><small>DO</small><h3>Use the score to decide what to inspect first.</h3></div>
          <div><small>DO NOT</small><h3>Tell a business that an automated tool gave its website a bad grade.</h3></div>
          <div><small>ALWAYS</small><h3>Open the evidence and verify it before sending outreach.</h3></div>
        </section>

        <section className="resource-cta">
          <div><small>See it on a real market</small><h2>Run a free search and open the evidence.</h2></div>
          <Link className="action primary" href="/signup"><span>Start free</span><b>↗</b></Link>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
