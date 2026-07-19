import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { requireViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PLANS } from '@/lib/plans';
import { getPriorityAction, type LeadOutcome } from '@/lib/leads/priority';
import { cookies } from 'next/headers';
import { normalizeTimezoneOffset, TIMEZONE_OFFSET_COOKIE } from '@/lib/leads/timezone';

type DashboardLead = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  website: string | null;
  status: string;
  opportunity_score: number | null;
  created_at: string;
  first_contacted_at: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  follow_up_step: number | null;
  follow_up_stopped_at: string | null;
  lead_outcome: LeadOutcome | null;
  manual_review_required: boolean;
};

export default async function Dashboard() {
  const user = await requireViewer();
  const db = createAdminClient();
  const now = new Date();
  const cookieStore = await cookies();
  const timezoneOffset = normalizeTimezoneOffset(cookieStore.get(TIMEZONE_OFFSET_COOKIE)?.value);
  const period = now.toISOString().slice(0, 7);

  const [leadResult, messageResult, usageResult, apiResult] = await Promise.all([
    db.from('leads').select('id,name,city,state,website,status,opportunity_score,created_at,first_contacted_at,last_contacted_at,next_follow_up_at,follow_up_step,follow_up_stopped_at,lead_outcome,manual_review_required').eq('workspace_id', user.workspaceId).limit(500),
    db.from('messages').select('status,direction').eq('workspace_id', user.workspaceId),
    db.from('usage_counters').select('metric,used').eq('user_id', user.id).eq('period', period),
    db.from('api_usage_log').select('provider,units,estimated_cost').eq('workspace_id', user.workspaceId).gte('created_at', `${period}-01T00:00:00.000Z`)
  ]);

  const leads = (leadResult.data || []) as DashboardLead[];
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

  const priorityLeads = leads
    .map((lead) => ({ lead, action: getPriorityAction(lead, now, timezoneOffset) }))
    .filter((item): item is { lead: DashboardLead; action: NonNullable<ReturnType<typeof getPriorityAction>> } => Boolean(item.action && item.action.rank > 0))
    .sort((a, b) => b.action.rank - a.action.rank)
    .slice(0, 8);

  const manualReviewCount = leads.filter((lead) => lead.manual_review_required).length;

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

      <section className="section today-work-section">
        <div className="panel-heading">
          <div><div className="eyebrow">Today&apos;s work</div><h3>What needs attention next</h3></div>
          <Link className="btn" href="/dashboard/leads?filter=due">Open pipeline</Link>
        </div>
        {priorityLeads.length ? (
          <div className="today-work-list">
            {priorityLeads.map(({ lead, action }) => (
              <article key={lead.id} className={`today-work-item priority-${action.kind}`}>
                <div>
                  <span className="priority-label">{action.label}</span>
                  <b>{lead.name}</b>
                  <small>{[lead.city, lead.state].filter(Boolean).join(', ') || 'Location unavailable'} · score {lead.opportunity_score ?? '—'}</small>
                  <p>{action.detail}</p>
                </div>
                <div className="today-work-actions">
                  <Link className="btn primary" href={`/dashboard/leads/${lead.id}#outreach`}>{action.kind === 'never_contacted' || action.kind === 'aging' ? 'Draft message' : 'Open follow-up'}</Link>
                  <Link className="btn" href={`/dashboard/leads/${lead.id}`}>Open file</Link>
                </div>
              </article>
            ))}
          </div>
        ) : <div className="notice">Nothing is overdue or waiting for a first contact right now.</div>}

        {manualReviewCount > 0 ? (
          <div className="manual-review-summary">
            <div><b>{manualReviewCount} website{manualReviewCount === 1 ? '' : 's'} need manual review</b><span>The site was found, but an automated check was blocked or could not reach it.</span></div>
            <Link className="btn" href="/dashboard/leads?filter=manual_review">Review pipeline</Link>
          </div>
        ) : null}
      </section>

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
