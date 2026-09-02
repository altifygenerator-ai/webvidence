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
  description: 'Research local businesses, decide who is worth contacting, and prepare grounded web design outreach without automatically sending anything.',
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
            <h1>Know who to contact today.</h1>
            <p className="hero-lede">Webvidence prepares a small prospecting session from real local businesses, shows why each one is worth your time, and helps you start a thoughtful conversation.</p>
            <div className="hero-actions">
              <Link className="action primary" href={viewer ? '/dashboard' : '/signup'}><span>{viewer ? 'Open today’s session' : 'Try your first session free'}</span><b>↗</b></Link>
              <Link className="text-link" href="/#product-tour">See the app before signing up <span>↓</span></Link>
            </div>
            <div className="hero-note"><b>No automatic sending.</b> You review the business, choose the approach, edit the draft, and stay in control.</div>
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
          <div className="shell proof-inner"><span>FIND A MARKET</span><i /> <span>WORK 3 PROSPECTS</span><i /> <span>CONTACT OR PASS</span><i /> <span>FINISH AND COME BACK READY</span></div>
        </section>

        <section id="product-tour" className="product-tour">
          <div className="shell">
            <div className="product-tour-intro">
              <div>
                <div className="section-code"><span>02</span> What you actually get</div>
                <h2>A finishable prospecting session, not another lead list.</h2>
              </div>
              <p>Open Webvidence, see the work that is ready, and make one decision at a time. Contact the good fits, pass on the poor ones, and stop when the batch is done.</p>
            </div>

            <div className="product-window" aria-label="Webvidence product preview">
              <div className="product-window-bar"><div><span /><span /><span /></div><b>Today</b><small>webvidence.app/dashboard</small></div>
              <div className="product-window-body">
                <aside className="product-mini-sidebar">
                  <b>WEBVIDENCE</b>
                  <nav><span className="active">01 Today</span><span>02 Find</span><span>03 Pipeline</span><span>04 Settings</span></nav>
                  <small>3-PROSPECT ROUTINE</small>
                </aside>
                <div className="product-preview-main retention-preview">
                  <div className="preview-heading"><div><small>MONDAY · TODAY</small><h3>3 actions ready</h3></div><span>About 8 minutes</span></div>
                  <div className="retention-preview-card">
                    <div className="retention-preview-top"><span>PROSPECT 1 OF 3</span><i><b /> <b /> <b /></i></div>
                    <h4>Delta Ridge Roofing</h4><small>Hot Springs, Arkansas · Active · 47 reviews</small>
                    <div className="retention-preview-reason"><b>Why Webvidence picked this</b><p>Active local business with a clear website opportunity and a public Facebook page.</p></div>
                    <div className="retention-preview-contact"><span>Facebook <em>Best</em></span><span>Email</span><span>Contact form</span></div>
                    <div className="retention-preview-actions"><button type="button">Start conversation</button><button type="button">Not a fit</button></div>
                  </div>
                  <div className="retention-preview-foot"><span>1 of 3</span><b>One business at a time. A real stopping point when you’re done.</b></div>
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
            <p>You already know how to build a site. Webvidence makes the slower part feel manageable by preparing a few worthwhile decisions and keeping the next follow-up ready.</p>
            <div className="workflow-links"><Link href="/scores">What the scores mean</Link><Link href="/faq">Read the FAQ</Link></div>
          </div>
          <div className="workflow-board">
            <article className="workflow-step offset-one"><span>01</span><div><small>PREPARE</small><h3>Get three worthwhile prospects.</h3><p>Search once or watch a market. Webvidence surfaces active businesses with real opportunities and usable public contact paths.</p></div></article>
            <article className="workflow-step"><span>02</span><div><small>DECIDE</small><h3>Contact or pass.</h3><p>See the reason, best next action, and conversation-first draft without digging through a full audit first.</p></div></article>
            <article className="workflow-step offset-two"><span>03</span><div><small>RETURN</small><h3>Finish and know what’s next.</h3><p>End with a clean summary. Follow-up reminders and watched markets bring you back only when useful work exists.</p></div></article>
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
          <div className="shell final-cta-inner"><div><div className="section-code"><span>05</span> Try the routine</div><h2>Work your first three prospects.</h2><p>No card needed for the free plan.</p></div>
          <Link className="action primary large" href={viewer ? '/dashboard' : '/signup'}><span>{viewer ? 'Open today' : 'Start your first session'}</span><b>↗</b></Link></div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
