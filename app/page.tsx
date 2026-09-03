import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { MarketingHeader } from '@/components/marketing-header';
import { getViewer } from '@/lib/security/auth';
import { CUSTOMER_PLAN_ORDER, PLANS } from '@/lib/plans';
import { MarketingFooter } from '@/components/marketing-footer';
import { absoluteUrl, publicMetadata, SITE_NAME, SITE_URL } from '@/lib/seo';

export const metadata: Metadata = publicMetadata({
  title: 'Research Local Businesses and Prepare Better Web Design Outreach',
  description: 'Build a repeatable local prospecting routine with prepared three-prospect sessions, public contact discovery, watched markets, follow-up reminders, and manual outreach.',
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
        description: 'Local business research and conversation-first outreach for independent web designers and developers.',
        publisher: { '@id': `${SITE_URL}#organization` },
        inLanguage: 'en-US',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}#software`,
        name: SITE_NAME,
        url: SITE_URL,
        description: 'Research local businesses, review public website evidence, decide who is worth contacting, and prepare editable outreach drafts.',
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Business research and outreach workflow software',
        operatingSystem: 'Web browser',
        browserRequirements: 'Requires a modern web browser and an internet connection.',
        provider: { '@id': `${SITE_URL}#organization` },
        featureList: [
          'Location and radius-based local business search',
          'Multi-page public website sampling',
          'Mobile PageSpeed checks',
          'Opportunity scoring',
          'Grounded editable outreach drafts',
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
        name: 'Research Local Businesses and Prepare Better Web Design Outreach',
        description: 'Research local businesses, understand the opportunity, and prepare better outreach.',
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
            <h1>Build a prospecting routine you can repeat.</h1>
            <p className="hero-lede">Search a market once, then work short prepared sessions. Webvidence checks public website evidence and contact paths, keeps follow-ups organized, and can watch a market for fresh prospects.</p>
            <div className="hero-actions">
              <Link className="action primary" href={viewer ? '/dashboard/campaigns' : '/signup'}><span>{viewer ? 'Find a market' : 'Try it free'}</span><b>↗</b></Link>
              <Link className="text-link" href="/#product-tour">See the app before signing up <span>↓</span></Link>
            </div>
            <div className="hero-note"><b>No mass-email automation.</b> Webvidence prepares the work and useful reminders. You choose the prospect, review the contact path, edit the draft, and send manually.</div>
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
          <div className="shell proof-inner"><span>SEARCH A MARKET</span><i /> <span>REVIEW THE BUSINESS</span><i /> <span>DECIDE WHO IS WORTH YOUR TIME</span><i /> <span>START A REAL CONVERSATION</span></div>
        </section>

        <section id="product-tour" className="product-tour">
          <div className="shell">
            <div className="product-tour-intro">
              <div>
                <div className="section-code"><span>02</span> What you actually get</div>
                <h2>From a location search to a repeatable working session.</h2>
              </div>
              <p>This is the working part of Webvidence. Search a market, then work one prepared prospect at a time: review, contact or pass, move to the next prospect, finish the session, and return when the next routine is ready.</p>
            </div>

            <div className="product-window" aria-label="Webvidence product preview">
              <div className="product-window-bar"><div><span /><span /><span /></div><b>Today</b><small>webvidence.app/dashboard</small></div>
              <div className="product-window-body">
                <aside className="product-mini-sidebar">
                  <b>WEBVIDENCE</b>
                  <nav><span className="active">01 Today</span><span>02 Find</span><span>03 Pipeline</span><span>04 Settings</span></nav>
                  <small>FOCUSED PROSPECTING</small>
                </aside>
                <div className="product-preview-main session-preview-main">
                  <div className="preview-heading"><div><small>TODAY</small><h3>3 prospects ready</h3></div><span>About 9 minutes</span></div>
                  <div className="preview-session-shell">
                    <div className="preview-session-progress"><span>PROSPECT 1 OF 3</span><div><i className="active" /><i /><i /></div></div>
                    <div className="preview-prospect-title"><div><small>ROOFING · AUSTIN, TX</small><h4>{previewResults[0].name}</h4></div><em>Active business</em></div>
                    <div className="preview-why"><small>WHY THIS IS WORTH A LOOK</small><b>No clear quote path on mobile</b><p>Established local business with public contact options and a concrete website opportunity.</p></div>
                    <div className="preview-signal-row"><span><small>Activity</small><b>4.8 · 47 reviews</b></span><span><small>Best reach</small><b>Facebook found</b></span><span><small>Opportunity</small><b>Quote path</b></span></div>
                    <div className="preview-contact-row"><button type="button">f&nbsp; Facebook <small>Best option</small></button><button type="button">✉&nbsp; Email</button><button type="button">↗&nbsp; Contact form</button></div>
                    <div className="preview-session-actions"><button className="primary" type="button">Start conversation</button><button type="button">Not a fit</button></div>
                  </div>
                  <div className="preview-session-note"><b>One prospect at a time.</b><span>Contact the good fits, pass the bad fits, and stop when the session is done.</span></div>
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
            <p>You already know how to build a site. Webvidence helps with the slower part: preparing a small batch, finding real public contact paths, clearing follow-ups, watching a market for new businesses, and giving you a clean stopping point.</p>
            <div className="workflow-links"><Link href="/scores">What the scores mean</Link><Link href="/faq">Read the FAQ</Link></div>
          </div>
          <div className="workflow-board">
            <article className="workflow-step offset-one"><span>01</span><div><small>PREPARE</small><h3>Search once, then start a short session.</h3><p>Webvidence recommends one prospect first and prepares a three-prospect batch by default.</p></div></article>
            <article className="workflow-step"><span>02</span><div><small>WORK</small><h3>Review, contact, or legitimately pass.</h3><p>Use verified website evidence and discovered public contact paths. Passing a poor fit still counts as useful progress.</p></div></article>
            <article className="workflow-step offset-two"><span>03</span><div><small>RETURN</small><h3>Finish cleanly and know when to come back.</h3><p>Set your prospecting days and session size. Optional email reminders can bring you back for due follow-ups, fresh watched-market prospects, or unfinished work.</p></div></article>
          </div>
        </section>

        <section className="manifesto">
          <div className="shell manifesto-grid">
            <div className="manifesto-number">04</div>
            <blockquote>A phone number is not enough to make a business a good lead.</blockquote>
            <div><h3>Webvidence helps you narrow the list.</h3><p>Look for an active business, a clear contact path, evidence worth reviewing, a service you can actually offer, and a reason to start the conversation without making something up.</p><Link className="text-link light" href={viewer ? '/dashboard' : '/signup'}>{viewer ? 'Return to your dashboard' : 'Open a free account'} <span>↗</span></Link></div>
          </div>
        </section>

        <section className="final-cta">
          <div className="shell final-cta-inner"><div><div className="section-code"><span>05</span> Try a real search</div><h2>Find out whether it saves you time.</h2><p>No card needed for the free plan.</p></div>
          <Link className="action primary large" href={viewer ? '/dashboard/campaigns' : '/signup'}><span>{viewer ? 'Find another market' : 'Start free'}</span><b>↗</b></Link></div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
