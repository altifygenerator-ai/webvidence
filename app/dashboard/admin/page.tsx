import { AppShell } from '@/components/app-shell';
import { requireAdmin } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { flags } from '@/lib/env';

export default async function Admin() {
  await requireAdmin();
  const db = createAdminClient();
  const month = new Date().toISOString().slice(0, 7);
  const [profiles, subscriptions, searches, audits, usage] = await Promise.all([
    db.from('profiles').select('id,plan,is_admin,suspended_at', { count: 'exact' }),
    db.from('subscriptions').select('status,plan'),
    db.from('search_runs').select('status,result_count,billable_requests').gte('created_at', `${month}-01T00:00:00.000Z`),
    db.from('audits').select('id', { count: 'exact', head: true }).gte('created_at', `${month}-01T00:00:00.000Z`),
    db.from('api_usage_log').select('provider,units,estimated_cost').gte('created_at', `${month}-01T00:00:00.000Z`),
  ]);

  const activeSubscriptions = (subscriptions.data || []).filter((item) => ['active', 'trialing', 'past_due'].includes(item.status)).length;
  const searchesRun = (searches.data || []).length;
  const businessesFound = (searches.data || []).reduce((total, item) => total + Number(item.result_count || 0), 0);
  const providerUnits = (usage.data || []).reduce((total, item) => total + Number(item.units || 0), 0);
  const estimatedCost = (usage.data || []).reduce((total, item) => total + Number(item.estimated_cost || 0), 0);

  return (
    <AppShell admin>
      <div className="topline"><div><div className="eyebrow">Restricted administration</div><h2>Launch control</h2></div><span className="tag">owner access</span></div>
      <div className="grid dashboard-metrics">
        <div className="card"><b>Total accounts</b><div className="metric">{profiles.count || 0}</div></div>
        <div className="card"><b>Active subscriptions</b><div className="metric">{activeSubscriptions}</div></div>
        <div className="card"><b>Searches this month</b><div className="metric">{searchesRun}</div></div>
        <div className="card"><b>Analyses this month</b><div className="metric">{audits.count || 0}</div></div>
      </div>
      <section className="section admin-status-grid">
        <div className="card"><b>Business discovery</b><p className="muted">{businessesFound} businesses collected this month</p></div>
        <div className="card"><b>Provider usage</b><p className="muted">{providerUnits} logged units · {estimatedCost ? `$${estimatedCost.toFixed(2)} estimated` : 'cost estimates not yet assigned'}</p></div>
        <div className="card"><b>Demo mode</b><p className="muted">{flags.demo ? 'Enabled. Searches return sample data.' : 'Disabled. Live providers are active.'}</p></div>
        <div className="card"><b>Billing</b><p className="muted">{flags.billing ? 'Enabled. Stripe checkout and portal are active.' : 'Disabled by environment switch.'}</p></div>
      </section>
      <div className="notice">Admin access is verified server-side using the protected profile role and configured owner email. Use Stripe and Supabase dashboards for manual account corrections during testing.</div>
    </AppShell>
  );
}
