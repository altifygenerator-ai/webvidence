import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { MarketingHeader } from '@/components/marketing-header';
import { PlanAction } from '@/components/plan-action';
import { CUSTOMER_PLAN_ORDER, PLANS, isPaidPlan } from '@/lib/plans';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { MarketingFooter } from '@/components/marketing-footer';
import { absoluteUrl, publicMetadata, SITE_URL } from '@/lib/seo';

export const metadata: Metadata = publicMetadata({
  title: 'Pricing for Freelance Web Designers',
  description: 'Start free with local business searches and website analyses, or try the Freelancer plan free for 7 days with a card. Paid plans start at $19 per month.',
  path: '/pricing',
  keywords: [
    'Webvidence pricing',
    'web design lead generation pricing',
    'website audit software pricing',
    'freelancer prospecting tool pricing',
  ],
});

export default async function Pricing({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; checkout?: string }>;
}) {
  const viewer = await getViewer();
  const params = await searchParams;
  const intendedPlan = isPaidPlan(params.plan) ? params.plan : null;
  const shouldCheckout = params.checkout === '1';
  let freelancerTrialAvailable = !viewer;

  if (viewer && viewer.plan === 'free') {
    const db = createAdminClient();
    const { data: billing } = await db
      .from('subscriptions')
      .select('stripe_subscription_id,trial_end')
      .eq('user_id', viewer.id)
      .maybeSingle();
    freelancerTrialAvailable = !billing?.stripe_subscription_id && !billing?.trial_end;
  }

  const pricingSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${absoluteUrl('/pricing')}#webpage`,
    url: absoluteUrl('/pricing'),
    name: 'Webvidence Pricing',
    description: 'Free and paid plans for Webvidence local business prospecting and website audits.',
    mainEntity: {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}#software`,
      name: 'Webvidence',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web browser',
      offers: CUSTOMER_PLAN_ORDER.map((id) => {
        const plan = PLANS[id];
        return {
          '@type': 'Offer',
          name: `${plan.name} plan`,
          price: plan.price,
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          url: absoluteUrl(`/pricing?plan=${id}`),
          description: `${plan.searches} searches, ${plan.audits} analyzed prospects, ${plan.messages} outreach drafts, ${plan.campaigns} active campaigns, and ${plan.saved} saved leads per month.${id === 'freelancer' ? ' New eligible accounts can start with a 7-day card-required trial.' : ''}`,
        };
      }),
    },
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Webvidence', item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'Pricing', item: absoluteUrl('/pricing') },
    ],
  };

  return (
    <>
      <JsonLd data={[pricingSchema, breadcrumbSchema]} />
      <MarketingHeader />
      <main className="pricing-page shell">
        <div className="pricing-intro">
          <div className="section-code"><span>01</span> Low-risk pricing</div>
          <h1>Start with proof.<br />Scale when it works.</h1>
          <p className="hero-lede">
            Use the free plan to see whether Webvidence produces prospects you would actually contact.
            Upgrade when it becomes part of the weekly sales routine.
          </p>
          {viewer ? (
            <div className="pricing-account-state">
              Signed in as <b>{viewer.email}</b> · Current access: <strong>{PLANS[viewer.plan].name}</strong>
            </div>
          ) : null}
        </div>

        <div className="pricing">
          {CUSTOMER_PLAN_ORDER.map((id) => {
            const plan = PLANS[id];
            return (
              <div className={`price ${id === 'freelancer' ? 'featured' : ''}`} key={id}>
                {id === 'freelancer' && freelancerTrialAvailable ? <div className="trial-callout">Try every Freelancer feature free for 7 days</div> : null}
                <h3>{plan.name}</h3>
                <strong>${plan.price}</strong>
                <span>/mo</span>
                <ul>
                  <li>{plan.searches} local searches / month</li>
                  <li>{plan.audits} analyzed prospects</li>
                  <li>{plan.messages} outreach drafts</li>
                  <li>{plan.campaigns} active campaigns</li>
                  <li>{plan.saved} saved leads</li>
                  <li>{plan.exports ? 'CSV export' : 'No bulk export'}</li>
                </ul>
                <PlanAction
                  plan={id}
                  signedIn={Boolean(viewer)}
                  currentPlan={viewer?.plan}
                  autoStart={Boolean(viewer && intendedPlan === id && shouldCheckout)}
                  trialAvailable={id === 'freelancer' && freelancerTrialAvailable}
                />
              </div>
            );
          })}
        </div>
        <div className="pricing-help-row"><Link href="/faq">Plan and billing FAQ</Link><Link href="/scores">How opportunity scores work</Link></div>
      </main>
      <MarketingFooter />
    </>
  );
}
