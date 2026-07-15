import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { requireViewer } from '@/lib/security/auth';
import { createClient } from '@/lib/supabase/server';
import { PLANS } from '@/lib/plans';

export default async function Leads() {
  const user = await requireViewer();
  const supabase = await createClient();
  const { data: leads, error } = await supabase
    .from('leads')
    .select('id,name,city,state,website,status,opportunity_score,reviews,rating,last_audited_at,created_at')
    .neq('status', 'archived')
    .order('opportunity_score', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <AppShell admin={user.isAdmin}>
      <div className="topline">
        <div>
          <div className="eyebrow">Pipeline</div>
          <h2>Saved prospects</h2>
        </div>
        <div className="pipeline-head-actions">
          <span className="tag">{leads?.length || 0} saved</span>
          {user.isAdmin || PLANS[user.plan].exports
            ? <a className="btn" href="/api/export/leads">Export CSV</a>
            : <Link className="btn" href="/pricing">Unlock CSV export</Link>}
        </div>
      </div>

      {error && <div className="notice notice-error">{error.message}</div>}
      {!error && (!leads || leads.length === 0) && (
        <div className="notice">No prospects are saved yet. Run a live search to build your first list.</div>
      )}

      {leads && leads.length > 0 && (
        <div className="table leads-table">
          <div className="row head">
            <span>Business</span>
            <span>Status</span>
            <span>Score</span>
            <span>Next step</span>
          </div>
          {leads.map((lead) => (
            <div className="row" key={lead.id}>
              <span>
                <b>{lead.name}</b><br />
                <small className="muted">{[lead.city, lead.state].filter(Boolean).join(', ') || 'Location unavailable'} · {lead.reviews || 0} reviews</small>
              </span>
              <span>{String(lead.status || 'new').replaceAll('_', ' ')}</span>
              <span><b>{lead.opportunity_score ?? '—'}</b></span>
              <span className="lead-row-actions">
                <Link className="btn primary" href={`/dashboard/leads/${lead.id}`}>Open file</Link>
                {lead.website ? <a className="btn" href={lead.website} target="_blank" rel="noreferrer">Site</a> : null}
              </span>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
