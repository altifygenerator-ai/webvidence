import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { LeadsTable } from '@/components/leads-table';
import { requireViewer } from '@/lib/security/auth';
import { createClient } from '@/lib/supabase/server';
import { PLANS } from '@/lib/plans';

export default async function Leads({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireViewer();
  const { view } = await searchParams;
  const archived = view === 'archived';
  const supabase = await createClient();
  let query = supabase
    .from('leads')
    .select('id,name,city,state,website,status,opportunity_score,reviews,rating,last_audited_at,created_at')
    .order('opportunity_score', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(100);
  query = archived ? query.eq('status', 'archived') : query.neq('status', 'archived');
  const { data: leads, error } = await query;

  return (
    <AppShell admin={user.isAdmin}>
      <div className="topline">
        <div>
          <div className="eyebrow">Pipeline</div>
          <h2>{archived ? 'Archived prospects' : 'Saved prospects'}</h2>
        </div>
        <div className="pipeline-head-actions">
          <Link className={`btn ${!archived ? 'primary' : ''}`} href="/dashboard/leads">Active</Link>
          <Link className={`btn ${archived ? 'primary' : ''}`} href="/dashboard/leads?view=archived">Archived</Link>
          <span className="tag">{leads?.length || 0} shown</span>
          {!archived && (user.isAdmin || PLANS[user.plan].exports
            ? <a className="btn" href="/api/export/leads">Export CSV</a>
            : <Link className="btn" href="/pricing">Unlock CSV export</Link>)}
        </div>
      </div>

      {error && <div className="notice notice-error">{error.message}</div>}
      {!error && (!leads || leads.length === 0) && (
        <div className="notice">{archived ? 'No archived prospects.' : 'No prospects are saved yet. Run a live search to build your first list.'}</div>
      )}

      {leads && leads.length > 0 && <LeadsTable leads={leads} archived={archived} />}
    </AppShell>
  );
}
