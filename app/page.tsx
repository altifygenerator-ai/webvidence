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
      <main>
        {viewer ? (
          <div className="signed-in-home shell">
            <div><span className="live-dot" /><small>You are signed in as</small><b>{viewer.email}</b><em>{PLANS[viewer.plan].name} access</em></div>
            <Link className="btn primary" href="/dashboard">Return to your prospect desk</Link>
          </div>
        ) : null}
        <section className="hero shell">
          <div className="hero-copy">
            <div className="section-code"><span>01</span> Prospect intelligence for web freelancers</div>
            <h1>Stop pitching<br /><em>without proof.</em></h1>
            <p className="hero-lede">Webvidence finds active local businesses, inspects the website they already have, and shows you the strongest reason to start a conversation.</p>
            <div className="hero-actions">
              <Link className="action primary" href={viewer ? '/dashboard/campaigns' : '/signup'}><span>{viewer ? 'Run a prospect search' : 'Find 10 free opportunities'}</span><b>↗</b></Link>
              <Link className="text-link" href="/#workflow">See how the evidence is built <span>↓</span></Link>
            </div>
            <div className="hero-note"><b>No contact dump.</b> Every prospect earns its place in the list.</div>
          </div>

          <div className="hero-evidence-wrap">
            <div className="scan-label">LIVE OPPORTUNITY FILE</div>
            <article className="evidence-sheet">
              <header className="sheet-head">
                <div><small>CASE / AR-0142</small><h2>Delta Ridge<br />Roofing</h2><p>Hot Springs, Arkansas</p></div>
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
              <div className="recommended-angle"><small>RECOMMENDED ANGLE</small><p>Mobile-first rebuild with dedicated service-area pages and a clearer quote path.</p></div>
              <div className="sheet-mark">EVIDENCE VERIFIED</div>
            </article>
            <div className="evidence-shadow-card"><span>Website checked</span><b>Up to 6 pages sampled</b><small>Metadata · contact paths · service structure · PageSpeed</small></div>
          </div>
        </section>

        <section className="proof-strip">
          <div className="shell proof-inner"><span>SEARCH LOCAL</span><i /> <span>INSPECT THE SITE</span><i /> <span>RANK THE OPPORTUNITY</span><i /> <span>START A REAL CONVERSATION</span></div>
        </section>

        <section id="workflow" className="workflow shell">
          <div className="workflow-intro">
            <div className="section-code"><span>02</span> The working session</div>
            <h2>One desk for the part nobody teaches.</h2>
            <p>You already know how to build the site. Webvidence helps you decide who is worth contacting, what is actually wrong, and how to open without sounding like every other freelancer in their inbox.</p>
            <div className="workflow-links"><Link href="/scores">What the scores mean</Link><Link href="/faq">Read the FAQ</Link></div>
          </div>
          <div className="workflow-board">
            <article className="workflow-step offset-one"><span>01</span><div><small>SEARCH THE MARKET</small><h3>Choose a trade and radius.</h3><p>Search local businesses by category, city, distance, review count, and website condition.</p></div></article>
            <article className="workflow-step"><span>02</span><div><small>REVIEW THE PROOF</small><h3>Inspect what is actually there.</h3><p>See real findings from the homepage and a small sample of important internal pages, plus mobile PageSpeed checks.</p></div></article>
            <article className="workflow-step offset-two"><span>03</span><div><small>WORK THE LEAD</small><h3>Start with one true observation.</h3><p>Generate a grounded opener, save the prospect, and keep the next follow-up in one place.</p></div></article>
          </div>
        </section>

        <section className="manifesto">
          <div className="shell manifesto-grid">
            <div className="manifesto-number">03</div>
            <blockquote>“A business should not be called a lead just because somebody found its phone number.”</blockquote>
            <div><h3>Webvidence is built around qualification.</h3><p>Active business. Visible website issue. Clear service fit. A factual reason to reach out. That is the standard.</p><Link className="text-link light" href={viewer ? '/dashboard' : '/signup'}>{viewer ? 'Return to your prospect desk' : 'Open your free prospect desk'} <span>↗</span></Link></div>
          </div>
        </section>

        <section className="final-cta shell">
          <div><div className="section-code"><span>04</span> Start with evidence</div><h2>Your next web client probably already has a visible problem.</h2></div>
          <Link className="action primary large" href={viewer ? '/dashboard/campaigns' : '/signup'}><span>{viewer ? 'Search your next market' : 'Find the first ten'}</span><b>↗</b></Link>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
