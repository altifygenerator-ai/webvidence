import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { StartSessionButton } from '@/components/start-session-button';
import { requireViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { estimateSessionMinutes } from '@/lib/retention/session';
import { ArrowRight, CalendarDays, Check, Clock3, MapPin, Radar, Search, TrendingUp } from 'lucide-react';

export default async function TodayPage() {
  const user = await requireViewer();
  const db = createAdminClient();
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  weekStart.setUTCHours(0, 0, 0, 0);
  const [{ data: session }, { data: routine }, { data: markets }, { data: events }, { data: readyRows }, { data: priorSessions }, { count: completedSessions }] = await Promise.all([
    db.from('prospecting_sessions').select('id,status,target_size,created_at').eq('user_id', user.id).in('status', ['ready', 'active']).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('prospecting_routines').select('weekdays,preferred_time,timezone,session_size,reminder_emails_enabled').eq('user_id', user.id).maybeSingle(),
    db.from('campaigns').select('id,name,category,location,last_refreshed_at,last_new_prospect_count,next_refresh_at').eq('workspace_id', user.workspaceId).not('watched_at', 'is', null).eq('status', 'active').order('updated_at', { ascending: false }).limit(6),
    db.from('lead_work_events').select('lead_id,event_type,created_at').eq('user_id', user.id).gte('created_at', weekStart.toISOString()).limit(500),
    db.from('leads').select('id').eq('workspace_id', user.workspaceId).in('status', ['new', 'reviewing', 'ready_to_contact']).is('passed_at', null).limit(500),
    db.from('prospecting_sessions').select('id').eq('user_id', user.id).limit(1000),
    db.from('prospecting_sessions').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'completed').gte('completed_at', weekStart.toISOString()),
  ]);
  let sessionItems: Array<{ status: string }> = [];
  if (session) {
    const { data } = await db.from('prospecting_session_items').select('status').eq('session_id', session.id);
    sessionItems = data || [];
  }
  const priorSessionIds = (priorSessions || []).map((item) => item.id);
  const { data: usedItems } = priorSessionIds.length ? await db.from('prospecting_session_items').select('lead_id').in('session_id', priorSessionIds).limit(5000) : { data: [] };
  const usedLeadIds = new Set((usedItems || []).map((item) => item.lead_id));
  const availableCount = (readyRows || []).filter((lead) => !usedLeadIds.has(lead.id)).length;
  const completedInSession = sessionItems.filter((item) => ['contacted', 'passed'].includes(item.status)).length;
  const actionsReady = session ? Math.max(0, sessionItems.length - completedInSession) : Math.min(3, availableCount);
  const weekly = {
    worked: new Set((events || []).filter((event) => ['reviewed', 'contacted', 'passed'].includes(event.event_type)).map((event) => event.lead_id)).size,
    contacted: (events || []).filter((event) => event.event_type === 'contacted').length,
    passed: (events || []).filter((event) => event.event_type === 'passed').length,
    followUps: (events || []).filter((event) => event.event_type === 'follow_up_completed').length,
    replies: (events || []).filter((event) => event.event_type === 'reply_recorded').length,
    sessions: completedSessions || 0,
  };
  return (
    <AppShell admin={user.isAdmin}>
      <div className="today-page">
        <header className="today-heading"><div><span className="today-date">{formatToday(now)}</span><h1>Today</h1><p>One small batch. Make the decisions, then be done.</p></div><span className="plan-pill">{user.plan === 'free' ? 'Free workspace' : `${user.plan} workspace`}</span></header>
        {actionsReady > 0 ? (
          <section className="today-session-card">
            <div className="today-session-signal"><span /><b>{session?.status === 'active' ? 'Session in progress' : 'Prepared for you'}</b></div>
            <div className="today-session-copy"><span>{actionsReady} action{actionsReady === 1 ? '' : 's'} ready</span><h2>{session?.status === 'active' ? 'Pick up where you left off.' : 'Your prospecting session is ready.'}</h2><p>Work through one business at a time. Start a conversation when it fits, or pass and move on.</p></div>
            <div className="today-session-meta"><span><Clock3 size={17} /> About {estimateSessionMinutes(actionsReady)} minutes</span><span><Check size={17} /> {completedInSession} of {sessionItems.length || actionsReady} complete</span></div>
            <div className="today-progress"><span style={{ width: `${sessionItems.length ? (completedInSession / sessionItems.length) * 100 : 0}%` }} /></div>
            <StartSessionButton sessionId={session?.id} label={session?.status === 'active' ? 'Continue session' : 'Start session'} />
          </section>
        ) : (
          <section className="today-empty-card"><div className="empty-radar"><Radar size={26} /></div><span className="session-kicker">Queue clear</span><h2>{weekly.worked ? 'You’re done for today.' : 'Find the first market worth working.'}</h2><p>{weekly.worked ? 'There is no unfinished prospecting work waiting. Your next watched-market refresh or routine can prepare the next batch.' : 'Search one business type and location. Webvidence will prepare the first few businesses worth a decision.'}</p><Link className="btn primary" href="/dashboard/campaigns"><Search size={17} /> Find a market</Link></section>
        )}
        {routine ? <div className="routine-strip"><CalendarDays size={17} /><span>Next routine: <b>{formatRoutine(routine.weekdays, routine.preferred_time)}</b></span><em>{routine.reminder_emails_enabled ? 'Email reminders on' : 'Email reminders off'}</em><Link href="/dashboard/settings">Change</Link></div> : null}
        <section className="weekly-results"><div className="section-heading-clean"><div><span className="session-kicker">This week</span><h2>Useful work, not busywork.</h2></div><TrendingUp size={20} /></div><div className="weekly-result-row"><div><b>{weekly.worked}</b><span>reviewed</span></div><div><b>{weekly.contacted}</b><span>conversations</span></div><div><b>{weekly.passed}</b><span>poor fits passed</span></div><div><b>{weekly.followUps}</b><span>follow-ups cleared</span></div><div><b>{weekly.replies}</b><span>replies recorded</span></div><div><b>{weekly.sessions}</b><span>sessions completed</span></div></div></section>
        <section className="watched-markets-section"><div className="section-heading-clean"><div><span className="session-kicker">Watched markets</span><h2>Working in the background.</h2></div><Link href="/dashboard/campaigns">Manage markets <ArrowRight size={15} /></Link></div>{markets?.length ? <div className="watched-market-list">{markets.map((market) => <article key={market.id}><div className="market-pulse"><span /></div><div><b>{market.category}</b><span><MapPin size={14} /> {market.location}</span></div><div className="market-status"><b>{market.last_new_prospect_count > 0 ? `${market.last_new_prospect_count} new` : 'Watching'}</b><small>{market.next_refresh_at ? `Next check ${new Date(market.next_refresh_at).toLocaleDateString()}` : 'Refresh scheduled'}</small></div></article>)}</div> : <div className="watched-empty"><p>Watch a market after a search and worthwhile new businesses can feed your next session.</p><Link href="/dashboard/campaigns">Find a market to watch</Link></div>}</section>
      </div>
    </AppShell>
  );
}

function formatToday(date: Date) { return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(date); }
function formatRoutine(days: number[], time: string) {
  const labels = days.map((day) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]).join(', ');
  const [hour, minute] = time.split(':').map(Number);
  const formatted = new Date(2000, 0, 1, hour, minute).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${labels} at ${formatted}`;
}
