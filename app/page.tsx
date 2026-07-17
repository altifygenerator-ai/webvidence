import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { MarketingHeader } from '@/components/marketing-header';
import { getViewer } from '@/lib/security/auth';
import { CUSTOMER_PLAN_ORDER, PLANS } from '@/lib/plans';
import { MarketingFooter } from '@/components/marketing-footer';
import { absoluteUrl, publicMetadata, SITE_NAME, SITE_URL } from '@/lib/seo';

export const metadata: Metadata = publicMetadata({
  title: 'Find Web Design Clients With Real Website Evidence',
  description: 'Search local businesses, audit up to six website pages, rank the strongest web design opportunities, and write outreach based on real findings.',
  path: '/',
});

const findings = [
  ['Conversion path', 'No inquiry form detected', 'High'],
  ['Search structure', 'No dedicated service pages', 'High'],
  ['Mobile contact', 'Phone number is not clickable', 'Review'],
  ['Technical trust', 'No structured data found', 'Review'],
];

const previewResults = [
  { name: 'Lone Pine Roofing', location: 'Austin, TX', score: 88, note: 'No quote form · weak mobile contact' },
  { name: 'Hill Country Exteriors', location: 'Round Rock, TX', score: 76, note: 'Slow mobile load · thin service content' },
  { name: 'Red Oak Roof Co.', location: 'Georgetown, TX', score: 54, note: 'Good basics · a few smaller gaps' },
];

export default async function Home() {
  const viewer = await getViewer();
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@webvidence.app';
  const publicPlans = CUSTOMER_PLAN_ORDER.map((id) => PLANS[id]);
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: {
          '@type': 'ImageObject',
          url: absoluteUrl('/icon'),
          width: 512,
          height: 512,
        },
        email: supportEmail,
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description: 'Evidence-backed local business prospecting for freelance web designers and developers.',
        publisher: { '@id': `${SITE_URL}#organization` },
        inLanguage: 'en-US',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}#software`,
        name: SITE_NAME,
        url: SITE_URL,
        description: 'Find local businesses, audit their public websites, qualify web design opportunities, and create evidence-based outreach drafts.',
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Sales prospecting and website audit software',
        operatingSystem: 'Web browser',
        browserRequirements: 'Requires a modern web browser and an internet connection.',
        provider: { '@id': `${SITE_URL}#organization` },
        featureList: [
          'Location and radius-based local business search',
          'Multi-page public website sampling',
          'Mobile PageSpeed checks',
          'Opportunity scoring',
          'Evidence-based outreach drafts',
          'Saved prospect pipeline',
        ],
        offers: publicPlans.map((plan) => ({
          '@type': 'Offer',
          name: `${plan.name} plan`,
          price: plan.price,
          priceCurrency: 'USD',
          category: plan.price === 0 ? 'Free plan' : 'Monthly subscription',
          availability: 'https://schema.org/InStock',
          url: absoluteUrl('/pricing'),
        })),
      },
      {
        '@type': 'WebPage',
        '@id': `${SITE_URL}#webpage`,
        url: SITE_URL,
        name: 'Find Web Design Clients With Real Website Evidence',
        description: 'Search local businesses and qualify website opportunities with factual findings.',
        isPartOf: { '@id': `${SITE_URL}#website` },
        about: { '@id': `${SITE_URL}#software` },
        primaryImageOfPage: { '@type': 'ImageObject', url: absoluteUrl('/opengraph-image') },
        inLanguage: 'en-US',
      },
    ],
  };

  return (
    <>
      <JsonLd data={schema} />
      <MarketingHeader />
      <main className="marketing-home">
        {viewer ? (
          <div className="signed-in-home shell">
            <div><span className="live-dot" /><small>Signed in as</small><b>{viewer.email}</b><em>{PLANS[viewer.plan].name} access</em></div>
            <Link className="btn primary" href="/dashboard">Open your dashboard</Link>
          </div>
        ) : null}

        <section className="hero shell">
          <div className="hero-copy">
            <div className="section-code"><span>01</span> Built for freelance web developers</div>
            <h1>Find businesses worth contacting.</h1>
            <p className="hero-lede">Search a trade and location. Webvidence pulls in real businesses, checks the site, and helps you decide who is actually worth your time.</p>
            <div className="hero-actions">
              <Link className="action primary" href={viewer ? '/dashboard/campaigns' : '/signup'}><span>{viewer ? 'Run a prospect search' : 'Try it free'}</span><b>↗</b></Link>
              <Link className="text-link" href="/#product-tour">See the app before signing up <span>↓</span></Link>
            </div>
            <div className="hero-note"><b>No automatic spam.</b> You review the evidence and decide who to contact.</div>
          </div>

          <div className="hero-evidence-wrap">
            <div className="scan-label">EXAMPLE OPPORTUNITY FILE</div>
            <article className="evidence-sheet">
              <header className="sheet-head">
                <div><small>CASE / AR-0142</small><h2>Delta Ridge Roofing</h2><p>Hot Springs, Arkansas</p></div>
                <div className="score-seal"><span>91</span><small>Opportunity</small></div>
              </header>
              <div className="sheet-rule"><span>Detected evidence</span><span>4 findings</span></div>
              <div className="findings-list">
                {findings.map(([group, finding, level], i) => (
                  <div className="finding-row" key={finding}>
                    <span className="finding-index">0{i + 1}</span><div><small>{group}</small><b>{finding}</b></div><span className={`risk ${level === 'High' ? 'high' : ''}`}>{level}</span>
                  </div>
                ))}
              </div>
              <div className="recommended-angle"><small>Suggested service angle</small><p>Mobile-first rebuild with dedicated service-area pages and a clearer quote path.</p></div>
              <div className="sheet-mark">Evidence saved</div>
            </article>
            <div className="evidence-shadow-card"><span>Website checked</span><b>Up to 6 public pages sampled</b><small>Metadata · contact paths · service structure · PageSpeed</small></div>
          </div>
        </section>

        <section className="proof-strip">
          <div className="shell proof-inner"><span>SEARCH A MARKET</span><i /> <span>CHECK THE WEBSITE</span><i /> <span>RANK THE OPPORTUNITY</span><i /> <span>WRITE A REAL OPENER</span></div>
        </section>

        <section id="product-tour" className="product-tour">
          <div className="shell">
            <div className="product-tour-intro">
              <div>
                <div className="section-code"><span>02</span> What you actually get</div>
                <h2>From a location search to a usable prospect list.</h2>
              </div>
              <p>This is the working part of Webvidence. Search a market, open a business, read the findings, then draft a message without starting from a blank page.</p>
            </div>

            <div className="product-window" aria-label="Webvidence product preview">
              <div className="product-window-bar"><div><span /><span /><span /></div><b>Prospect search</b><small>webvidence.app/dashboard/campaigns</small></div>
              <div className="product-window-body">
                <aside className="product-mini-sidebar">
                  <b>WEBVIDENCE</b>
                  <nav><span className="active">01 Campaigns</span><span>02 Leads</span><span>03 Usage</span><span>04 Billing</span></nav>
                  <small>FREE PLAN · 5 SEARCHES</small>
                </aside>
                <div className="product-preview-main">
                  <div className="preview-heading"><div><small>NEW CAMPAIGN</small><h3>Find a local market</h3></div><span>Live Google data</span></div>
                  <div className="preview-search-row">
                    <div><small>Business type</small><b>Roofers</b></div>
                    <div><small>Location</small><b>Austin, Texas, United States</b></div>
                    <div><small>Radius</small><b>50 miles</b></div>
                    <button type="button">Run search</button>
                  </div>
                  <div className="preview-content-grid">
                    <div className="preview-result-list">
                      <div className="preview-list-head"><b>20 businesses found</b><small>Sorted by opportunity</small></div>
                      {previewResults.map((result, index) => (
                        <article key={result.name} className={index === 0 ? 'selected' : ''}>
                          <span>{String(index + 1).padStart(2, '0')}</span>
                          <div><b>{result.name}</b><small>{result.location}</small><p>{result.note}</p></div>
                          <strong>{result.score}</strong>
                        </article>
                      ))}
                    </div>
                    <div className="preview-lead-file">
                      <div className="preview-file-head"><div><small>SELECTED PROSPECT</small><h4>Lone Pine Roofing</h4></div><strong>88</strong></div>
                      <div className="preview-finding"><span>HIGH</span><div><b>No inquiry form found</b><small>The sampled pages do not show a clear request-a-quote form.</small></div></div>
                      <div className="preview-finding"><span>MED</span><div><b>Mobile phone path is weak</b><small>A visitor has to hunt for a usable call action.</small></div></div>
                      <div className="preview-outreach"><small>FACEBOOK OPENER</small><p>Hey, I came across your roofing work around Austin. I noticed the site makes it pretty hard to request a quote from a phone. Are most of your calls coming through Google right now or mainly referrals?</p></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p className="product-preview-note">Example interface using sample business information. Webvidence checks live public listings and websites when you run a search.</p>
          </div>
        </section>

        <section id="workflow" className="workflow shell">
          <div className="workflow-intro">
            <div className="section-code"><span>03</span> The working session</div>
            <h2>The part between learning web development and landing the job.</h2>
            <p>You already know how to build a site. Webvidence helps with the slower part: finding a market, checking businesses one at a time, and keeping the better opportunities organized.</p>
            <div className="workflow-links"><Link href="/scores">What the scores mean</Link><Link href="/faq">Read the FAQ</Link></div>
          </div>
          <div className="workflow-board">
            <article className="workflow-step offset-one"><span>01</span><div><small>SEARCH</small><h3>Pick a trade and location.</h3><p>Search by city, state or province, country, radius, category, review count, and website condition.</p></div></article>
            <article className="workflow-step"><span>02</span><div><small>REVIEW</small><h3>See what the site is missing.</h3><p>Open factual findings from the homepage and a small sample of useful internal pages, plus mobile PageSpeed checks.</p></div></article>
            <article className="workflow-step offset-two"><span>03</span><div><small>CONTACT</small><h3>Start with one true observation.</h3><p>Draft an opener, save notes, mark messages sent, and keep follow-up dates with the lead.</p></div></article>
          </div>
        </section>

        <section className="manifesto">
          <div className="shell manifesto-grid">
            <div className="manifesto-number">04</div>
            <blockquote>A phone number is not enough to make a business a good lead.</blockquote>
            <div><h3>Webvidence helps you narrow the list.</h3><p>Look for an active business, a visible website problem, a service you can actually offer, and a reason to start the conversation without making something up.</p><Link className="text-link light" href={viewer ? '/dashboard' : '/signup'}>{viewer ? 'Return to your dashboard' : 'Open a free account'} <span>↗</span></Link></div>
          </div>
        </section>

        <section className="final-cta">
          <div className="shell final-cta-inner"><div><div className="section-code"><span>05</span> Try a real search</div><h2>Find out whether it saves you time.</h2><p>No card needed for the free plan.</p></div>
          <Link className="action primary large" href={viewer ? '/dashboard/campaigns' : '/signup'}><span>{viewer ? 'Search another market' : 'Start free'}</span><b>↗</b></Link></div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
