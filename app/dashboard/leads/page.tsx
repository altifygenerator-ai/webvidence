import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { LeadsTable } from '@/components/leads-table';
import { requireViewer } from '@/lib/security/auth';
import { createClient } from '@/lib/supabase/server';
import { PLANS } from '@/lib/plans';
import { getPriorityAction, type LeadOutcome } from '@/lib/leads/priority';
import { cookies } from 'next/headers';
import { getLocalDayBounds, normalizeTimezoneOffset, TIMEZONE_OFFSET_COOKIE } from '@/lib/leads/timezone';

type PipelineLead = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  website: string | null;
  status: string;
  opportunity_score: number | null;
  reviews: number | null;
  rating: number | null;
  last_audited_at: string | null;
  created_at: string;
  first_contacted_at: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  follow_up_step: number | null;
  follow_up_stopped_at: string | null;
  lead_outcome: LeadOutcome | null;
  manual_review_required: boolean;
  manual_review_reason: string | null;
};

const filters = [
  ['all', 'All active'],
  ['due', 'Due today'],
  ['overdue', 'Overdue'],
  ['never_contacted', 'Never contacted'],
  ['waiting', 'Waiting on reply'],
  ['complete', 'Sequence complete'],
  ['interested', 'Replies / interest'],
  ['proposal', 'Proposal sent'],
  ['manual_review', 'Manual review'],
] as const;

export default async function Leads({ searchParams }: { searchParams: Promise<{ view?: string; filter?: string }> }) {
  const user = await requireViewer();
  const { view, filter = 'all' } = await searchParams;
  const archived = view === 'archived';
  const supabase = await createClient();
  let query = supabase
    .from('leads')
    .select('id,name,city,state,website,status,opportunity_score,reviews,rating,last_audited_at,created_at,first_contacted_at,last_contacted_at,next_follow_up_at,follow_up_step,follow_up_stopped_at,lead_outcome,manual_review_required,manual_review_reason')
    .order('opportunity_score', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(500);
  query = archived ? query.eq('status', 'archived') : query.neq('status', 'archived');
  const { data, error } = await query;

  const now = new Date();
  const cookieStore = await cookies();
  const timezoneOffset = normalizeTimezoneOffset(cookieStore.get(TIMEZONE_OFFSET_COOKIE)?.value);
  const { start: startToday, end: endToday } = getLocalDayBounds(now, timezoneOffset);
  const rawLeads = (data || []) as PipelineLead[];
  const filteredLeads = archived ? rawLeads : rawLeads.filter((lead) => matchesFilter(lead, filter, startToday, endToday));
  const leads = filteredLeads
    .map((lead) => ({ ...lead, priority_action: getPriorityAction(lead, now, timezoneOffset) }))
    .sort((a, b) => Number(b.priority_action?.rank || 0) - Number(a.priority_action?.rank || 0) || Number(b.opportunity_score || 0) - Number(a.opportunity_score || 0))
    .slice(0, 100);

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
          <span className="tag">{leads.length} shown</span>
          {!archived && (user.isAdmin || PLANS[user.plan].exports
            ? <a className="btn" href="/api/export/leads">Export CSV</a>
            : <Link className="btn" href="/pricing">Unlock CSV export</Link>)}
        </div>
      </div>

      {!archived ? (
        <nav className="pipeline-filters" aria-label="Pipeline filters">
          {filters.map(([value, label]) => <Link className={filter === value ? 'active' : ''} key={value} href={value === 'all' ? '/dashboard/leads' : `/dashboard/leads?filter=${value}`}>{label}</Link>)}
        </nav>
      ) : null}

      {error && <div className="notice notice-error">{error.message}</div>}
      {!error && leads.length === 0 && (
        <div className="notice">{archived ? 'No archived prospects.' : filter === 'all' ? 'No prospects are saved yet. Run a live search to build your first list.' : 'No leads match this pipeline filter.'}</div>
      )}

      {leads.length > 0 && <LeadsTable leads={leads} archived={archived} />}
    </AppShell>
  );
}

function matchesFilter(lead: PipelineLead, filter: string, startToday: Date, endToday: Date) {
  const due = lead.next_follow_up_at ? new Date(lead.next_follow_up_at) : null;
  const activeSequence = !lead.lead_outcome && !lead.follow_up_stopped_at;
  if (filter === 'due') return Boolean(activeSequence && due && due >= startToday && due <= endToday);
  if (filter === 'overdue') return Boolean(activeSequence && due && due < startToday);
  if (filter === 'never_contacted') return !lead.first_contacted_at && !['do_not_contact', 'not_interested', 'won', 'lost'].includes(lead.status);
  if (filter === 'waiting') return Boolean(lead.first_contacted_at && activeSequence && ['contacted', 'follow_up'].includes(lead.status));
  if (filter === 'complete') return Boolean(lead.follow_up_stopped_at || ['no_response', 'closed_won', 'closed_lost'].includes(lead.lead_outcome || ''));
  if (filter === 'interested') return ['replied', 'interested', 'meeting_booked'].includes(lead.lead_outcome || '') || ['replied', 'interested'].includes(lead.status);
  if (filter === 'proposal') return lead.lead_outcome === 'proposal_sent' || lead.status === 'quote_sent';
  if (filter === 'manual_review') return lead.manual_review_required;
  return true;
}
