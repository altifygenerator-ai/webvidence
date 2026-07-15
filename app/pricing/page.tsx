import { MarketingHeader } from '@/components/marketing-header';
import { PlanAction } from '@/components/plan-action';
import { CUSTOMER_PLAN_ORDER, PLANS, isPaidPlan } from '@/lib/plans';
import { getViewer } from '@/lib/security/auth';
import { MarketingFooter } from '@/components/marketing-footer';

export default async function Pricing({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; checkout?: string }>;
}) {
  const viewer = await getViewer();
  const params = await searchParams;
  const intendedPlan = isPaidPlan(params.plan) ? params.plan : null;
  const shouldCheckout = params.checkout === '1';

  return (
    <>
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
                />
              </div>
            );
          })}
        </div>
      </main>
      <MarketingFooter />
    </>
  );
}
