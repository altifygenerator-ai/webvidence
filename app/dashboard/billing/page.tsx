import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { BillingPortalButton } from '@/components/billing-portal-button';
import { requireViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PLANS } from '@/lib/plans';

export default async function Billing({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; updated?: string; trial?: string }>;
}) {
  const user = await requireViewer();
  const params = await searchParams;
  const db = createAdminClient();
  const { data: subscription } = await db
    .from('subscriptions')
    .select('status,plan,current_period_end,cancel_at_period_end,stripe_customer_id,trial_end')
    .eq('user_id', user.id)
    .maybeSingle();

  const trialEnd = subscription?.trial_end ? new Date(subscription.trial_end) : null;
  const isTrialing = subscription?.status === 'trialing' && Boolean(trialEnd);
  return (
    <AppShell admin={user.isAdmin}>
      <div className="topline">
        <div><div className="eyebrow">Billing</div><h2>{PLANS[user.plan].name} plan</h2></div>
        <span className="tag">{isTrialing ? '7-day trial' : subscription?.status || (user.plan === 'free' ? 'free' : 'admin')}</span>
      </div>

      {params.success === '1' && params.trial === '1' ? (
        <div className="notice">Your Freelancer trial checkout is complete. Stripe is confirming access through the webhook. The first $39 charge is due after 7 days unless you cancel first.</div>
      ) : params.success === '1' ? (
        <div className="notice">Checkout completed. Stripe is confirming the subscription through the webhook. Refresh shortly if the plan has not updated yet.</div>
      ) : null}
      {params.updated === '1' ? <div className="notice">Stripe accepted the plan change. The webhook will update your Webvidence access.</div> : null}

      <div className="billing-summary">
        <div>
          <small>Current access</small>
          <b>{PLANS[user.plan].name}</b>
          <span>{PLANS[user.plan].searches} searches, {PLANS[user.plan].audits} analyses, and {PLANS[user.plan].messages} outreach drafts per month</span>
        </div>
        <div>
          <small>{isTrialing ? 'Trial ends' : 'Renewal'}</small>
          <b>{trialEnd && isTrialing ? trialEnd.toLocaleDateString() : subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : 'Not applicable'}</b>
          <span>
            {isTrialing
              ? 'Full Freelancer access until this date · Then $39/month unless canceled'
              : subscription?.cancel_at_period_end
                ? 'Cancels at the end of the current period'
                : 'Active until changed'}
          </span>
        </div>
      </div>

      <div className="billing-actions">
        <Link className="btn primary" href="/pricing">Compare or upgrade plans</Link>
        {subscription?.stripe_customer_id ? <BillingPortalButton /> : null}
      </div>
      <p className="muted">Plans and usage are enforced on the server. Changing browser code cannot grant paid access.</p>
    </AppShell>
  );
}
