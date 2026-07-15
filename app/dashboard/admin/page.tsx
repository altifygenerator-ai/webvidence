import { AppShell } from '@/components/app-shell';
import { requireAdmin } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { flags } from '@/lib/env';

export default async function Admin() {
  await requireAdmin();
  const db = createAdminClient();
  const month = new Date().toISOString().slice(0, 7);
  const monthStart = `${month}-01T00:00:00.000Z`;
  const [profiles, subscriptions, searches, audits, usage, jobs] = await Promise.all([
    db.from('profiles').select('id,plan,is_admin,suspended_at', { count: 'exact' }),
    db.from('subscriptions').select('status,plan'),
    db.from('search_runs').select('status,result_count,billable_requests').gte('created_at', monthStart),
    db.from('audits').select('id,status,pages_crawled', { count: 'exact' }).gte('created_at', monthStart),
    db.from('api_usage_log').select('provider,operation,units,estimated_cost,metadata').gte('created_at', monthStart),
    db.from('audit_jobs').select('status,result_status,attempts,error_message,created_at').gte('created_at', monthStart),
  ]);

  const activeSubscriptions = (subscriptions.data || []).filter((item) => ['active', 'trialing'].includes(item.status)).length;
  const pastDueSubscriptions = (subscriptions.data || []).filter((item) => item.status === 'past_due').length;
  const searchesRun = (searches.data || []).length;
  const businessesFound = (searches.data || []).reduce((total, item) => total + Number(item.result_count || 0), 0);
  const providerUnits = (usage.data || []).reduce((total, item) => total + Number(item.units || 0), 0);
  const estimatedCost = (usage.data || []).reduce((total, item) => total + Number(item.estimated_cost || 0), 0);
  const pagesChecked = (audits.data || []).reduce((total, item) => total + Number(item.pages_crawled || 0), 0);
  const jobCounts = countBy((jobs.data || []).map((job) => job.status));
  const providerRows = summarizeProviders(usage.data || []);

  return (
    <AppShell admin>
      <div className="topline"><div><div className="eyebrow">Restricted administration</div><h2>Launch control</h2></div><span className="tag">owner access</span></div>
      <div className="grid dashboard-metrics">
        <div className="card"><b>Total accounts</b><div className="metric">{profiles.count || 0}</div></div>
        <div className="card"><b>Active subscriptions</b><div className="metric">{activeSubscriptions}</div><small className="muted">{pastDueSubscriptions} past due</small></div>
        <div className="card"><b>Searches this month</b><div className="metric">{searchesRun}</div></div>
        <div className="card"><b>Analyses this month</b><div className="metric">{audits.count || 0}</div></div>
      </div>
      <section className="section admin-status-grid">
        <div className="card"><b>Business discovery</b><p className="muted">{businessesFound} businesses collected this month</p></div>
        <div className="card"><b>Pages inspected</b><p className="muted">{pagesChecked} public pages sampled across completed analyses</p></div>
        <div className="card"><b>Audit queue</b><p className="muted">{jobCounts.queued || 0} queued · {jobCounts.running || 0} running · {jobCounts.failed || 0} failed</p></div>
        <div className="card"><b>Provider usage</b><p className="muted">{providerUnits} logged units · ${estimatedCost.toFixed(4)} estimated list cost</p></div>
        <div className="card"><b>Demo mode</b><p className="muted">{flags.demo ? 'Enabled. Searches return sample data.' : 'Disabled. Live providers are active.'}</p></div>
        <div className="card"><b>Billing</b><p className="muted">{flags.billing ? 'Enabled. Stripe checkout and portal are active.' : 'Disabled by environment switch.'}</p></div>
      </section>

      <section className="section">
        <div className="panel-heading"><div><div className="eyebrow">Estimated API usage</div><h3>Provider breakdown</h3></div><small>Before provider free tiers, credits, or negotiated pricing.</small></div>
        <div className="table provider-usage-table">
          <div className="row head"><span>Provider</span><span>Operation</span><span>Units</span><span>Estimated cost</span></div>
          {providerRows.map((row) => (
            <div className="row" key={`${row.provider}-${row.operation}`}>
              <span><b>{row.provider.replaceAll('_', ' ')}</b></span>
              <span>{row.operation.replaceAll('_', ' ')}</span>
              <span>{row.units}</span>
              <span>${row.cost.toFixed(4)}</span>
            </div>
          ))}
          {providerRows.length === 0 ? <div className="notice">No provider usage has been logged this month.</div> : null}
        </div>
      </section>

      <div className="notice">Cost estimates use the rates configured in environment variables and may not match the final provider invoice. Google free usage and OpenAI model pricing should be checked against the provider dashboards.</div>
    </AppShell>
  );
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function summarizeProviders(rows: Array<{ provider: string; operation: string; units: number; estimated_cost: number | string | null }>) {
  const grouped = new Map<string, { provider: string; operation: string; units: number; cost: number }>();
  for (const row of rows) {
    const key = `${row.provider}:${row.operation}`;
    const current = grouped.get(key) || { provider: row.provider, operation: row.operation, units: 0, cost: 0 };
    current.units += Number(row.units || 0);
    current.cost += Number(row.estimated_cost || 0);
    grouped.set(key, current);
  }
  return Array.from(grouped.values()).sort((a, b) => b.cost - a.cost || b.units - a.units);
}
