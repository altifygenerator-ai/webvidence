import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { requireViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PLANS } from '@/lib/plans';

export default async function Dashboard() {
  const user = await requireViewer();
  const db = createAdminClient();
  const period = new Date().toISOString().slice(0, 7);

  const [leadResult, messageResult, usageResult, apiResult] = await Promise.all([
    db.from('leads').select('status,opportunity_score').eq('workspace_id', user.workspaceId),
    db.from('messages').select('status,direction').eq('workspace_id', user.workspaceId),
    db.from('usage_counters').select('metric,used').eq('user_id', user.id).eq('period', period),
    db.from('api_usage_log').select('provider,units,estimated_cost').eq('workspace_id', user.workspaceId).gte('created_at', `${period}-01T00:00:00.000Z`),
  ]);

  const leads = leadResult.data || [];
  const messages = messageResult.data || [];
  const ready = leads.filter((lead) => ['ready_to_contact', 'reviewing', 'new'].includes(lead.status)).length;
  const contacted = leads.filter((lead) => ['contacted', 'replied', 'interested', 'follow_up', 'quote_sent', 'won'].includes(lead.status)).length;
  const replies = leads.filter((lead) => ['replied', 'interested', 'quote_sent', 'won'].includes(lead.status)).length;
  const wins = leads.filter((lead) => lead.status === 'won').length;
  const searchUsed = usageResult.data?.find((item) => item.metric === 'search')?.used || 0;
  const auditUsed = usageResult.data?.find((item) => item.metric === 'audit')?.used || 0;
  const messageUsed = usageResult.data?.find((item) => item.metric === 'message')?.used || 0;
  const apiUnits = (apiResult.data || []).reduce((total, item) => total + Number(item.units || 0), 0);
  const estimatedCost = (apiResult.data || []).reduce((total, item) => total + Number(item.estimated_cost || 0), 0);

  return (
    <AppShell admin={user.isAdmin}>
      <div className="topline">
        <div><div className="eyebrow">Workspace overview</div><h2>Opportunity desk</h2></div>
        <span className="tag">{PLANS[user.plan].name} plan</span>
      </div>

      <div className="dashboard-welcome">
        <div><small>Signed in as</small><b>{user.email}</b><span>Your searches, audits, drafts, and pipeline are saved to this account.</span></div>
        <Link className="btn primary" href="/dashboard/campaigns">Run a new search</Link>
      </div>

      <div className="grid dashboard-metrics">
        <div className="card"><div className="muted">Ready to review</div><div className="metric">{ready}</div></div>
        <div className="card"><div className="muted">Worked prospects</div><div className="metric">{contacted}</div></div>
        <div className="card"><div className="muted">Replies / interest</div><div className="metric">{replies}</div></div>
        <div className="card"><div className="muted">Projects won</div><div className="metric">{wins}</div></div>
      </div>

      <section className="section usage-section">
        <div className="panel-heading"><div><div className="eyebrow">This month</div><h3>Plan usage and operations</h3></div></div>
        <div className="usage-grid">
          <div><span>Local searches</span><b>{searchUsed} / {PLANS[user.plan].searches}</b><progress max={PLANS[user.plan].searches} value={searchUsed} /></div>
          <div><span>Website analyses</span><b>{auditUsed} / {PLANS[user.plan].audits}</b><progress max={PLANS[user.plan].audits} value={auditUsed} /></div>
          <div><span>Outreach drafts</span><b>{messageUsed} / {PLANS[user.plan].messages}</b><progress max={PLANS[user.plan].messages} value={messageUsed} /></div>
          <div><span>Saved messages</span><b>{messages.length}</b><small>Draft, approved, and sent history</small></div>
          <div><span>Logged provider units</span><b>{apiUnits}</b><small>{estimatedCost > 0 ? `$${estimatedCost.toFixed(2)} estimated` : 'Usage is recorded for cost review'}</small></div>
        </div>
      </section>
    </AppShell>
  );
}
