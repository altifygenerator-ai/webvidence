import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { BillingPortalButton } from '@/components/billing-portal-button';
import { requireViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PLANS } from '@/lib/plans';

export default async function Billing({ searchParams }: { searchParams: Promise<{ success?: string; updated?: string }> }) {
  const user = await requireViewer();
  const params = await searchParams;
  const db = createAdminClient();
  const { data: subscription } = await db.from('subscriptions').select('status,plan,current_period_end,cancel_at_period_end,stripe_customer_id').eq('user_id', user.id).maybeSingle();

  return (
    <AppShell admin={user.isAdmin}>
      <div className="topline"><div><div className="eyebrow">Billing</div><h2>{PLANS[user.plan].name} plan</h2></div><span className="tag">{subscription?.status || (user.plan === 'free' ? 'free' : 'admin')}</span></div>
      {params.success === '1' ? <div className="notice">Checkout completed. Stripe is confirming the subscription through the webhook. Refresh shortly if the plan has not updated yet.</div> : null}
      {params.updated === '1' ? <div className="notice">Stripe accepted the plan change. The webhook will update your Webvidence access.</div> : null}
      <div className="billing-summary">
        <div><small>Current access</small><b>{PLANS[user.plan].name}</b><span>{PLANS[user.plan].searches} searches, {PLANS[user.plan].audits} analyses, and {PLANS[user.plan].messages} outreach drafts per month</span></div>
        <div><small>Renewal</small><b>{subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : 'Not applicable'}</b><span>{subscription?.cancel_at_period_end ? 'Cancels at the end of the paid period' : 'Active until changed'}</span></div>
      </div>
      <div className="billing-actions"><Link className="btn primary" href="/pricing">Compare or upgrade plans</Link>{subscription?.stripe_customer_id ? <BillingPortalButton /> : null}</div>
      <p className="muted">Plans and usage are enforced on the server. Changing browser code cannot grant paid access.</p>
    </AppShell>
  );
}
