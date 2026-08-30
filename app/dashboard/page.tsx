import Link from 'next/link';
import { cookies } from 'next/headers';
import { AppShell } from '@/components/app-shell';
import { TodaySession } from '@/components/today-session';
import { ReminderReturnTracker } from '@/components/reminder-return-tracker';
import { requireViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PLANS } from '@/lib/plans';
import { getOnboardingStage } from '@/lib/onboarding';
import { getActiveSession } from '@/lib/retention/session';
import { getLocalDayBounds, normalizeTimezoneOffset, TIMEZONE_OFFSET_COOKIE } from '@/lib/leads/timezone';

export default async function Dashboard() {
  const user = await requireViewer();
  const db = createAdminClient();
  const now = new Date();
  const cookieStore = await cookies();
  const cookieOffset = normalizeTimezoneOffset(cookieStore.get(TIMEZONE_OFFSET_COOKIE)?.value);
  const { data: routine } = await db.from('prospecting_routines')
    .select('user_id,timezone_offset_minutes,days_of_week,preferred_time,session_size,reminder_email_enabled')
    .eq('user_id', user.id)
    .eq('workspace_id', user.workspaceId)
    .maybeSingle();
  const timezoneOffset = normalizeTimezoneOffset(routine?.timezone_offset_minutes ?? cookieOffset);
  const { start: startToday } = getLocalDayBounds(now, timezoneOffset);
  const startWeek = getLocalWeekStart(now, timezoneOffset);
  const period = now.toISOString().slice(0, 7);

  const [leadResult, messageResult, usageResult, apiResult, searchCountResult, completedTodayResult, completedWeekResult, watchedMarketResult, activeSession] = await Promise.all([
    db.from('leads').select('id,status,first_contacted_at,last_reviewed_at,last_worked_at,passed_at,next_follow_up_at,lead_outcome').eq('workspace_id', user.workspaceId).limit(1000),
    db.from('messages').select('id,lead_id,status,direction,intent,created_at,sent_at').eq('workspace_id', user.workspaceId).order('created_at', { ascending: false }).limit(1000),
    db.from('usage_counters').select('metric,used').eq('user_id', user.id).eq('period', period),
    db.from('api_usage_log').select('provider,units,estimated_cost').eq('workspace_id', user.workspaceId).gte('created_at', `${period}-01T00:00:00.000Z`),
    db.from('search_runs').select('id', { count: 'exact', head: true }).eq('workspace_id', user.workspaceId),
    db.from('prospecting_sessions').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('workspace_id', user.workspaceId).eq('status', 'completed').gte('completed_at', startToday.toISOString()),
    db.from('prospecting_sessions').select('id,completed_at').eq('user_id', user.id).eq('workspace_id', user.workspaceId).eq('status', 'completed').gte('completed_at', startWeek.toISOString()).order('completed_at', { ascending: false }).limit(100),
    db.from('watched_markets').select('id,campaign_id,last_refreshed_at,last_new_prospect_count,campaigns(category,location,status)').eq('user_id', user.id).eq('workspace_id', user.workspaceId).eq('status', 'active').order('updated_at', { ascending: false }).limit(6),
    getActiveSession(user.id, user.workspaceId || ''),
  ]);

  const leads = leadResult.data || [];
  const messages = messageResult.data || [];
  const sent = messages.filter((m) => m.status === 'sent' && m.direction !== 'inbound');
  const reviews = leads.filter((lead) => Boolean(lead.last_reviewed_at)).length;
  const onboardingStage = getOnboardingStage({
    searches: searchCountResult.count || 0,
    reviews,
    messages: messages.filter((message) => message.direction !== 'inbound').length,
    sentMessages: sent.length,
    repeatEstablished: Boolean(routine),
  });

  const actionable = leads.filter((lead) => {
    if (lead.passed_at || ['won','lost','not_interested','do_not_contact','archived'].includes(lead.status || '')) return false;
    if (lead.status === 'replied' || lead.status === 'interested') return true;
    if (lead.next_follow_up_at && Date.parse(lead.next_follow_up_at) <= now.getTime()) return true;
    return !lead.first_contacted_at;
  }).length;

  const stats = {
    reviewed: leads.filter((lead) => lead.last_reviewed_at && Date.parse(lead.last_reviewed_at) >= startWeek.getTime()).length,
    contacted: leads.filter((lead) => lead.first_contacted_at && Date.parse(lead.first_contacted_at) >= startWeek.getTime()).length,
    passed: leads.filter((lead) => lead.passed_at && Date.parse(lead.passed_at) >= startWeek.getTime()).length,
    followUpsCleared: messages.filter((message) => message.status === 'sent' && message.direction !== 'inbound' && message.intent === 'follow_up' && message.sent_at && Date.parse(message.sent_at) >= startWeek.getTime()).length,
    repliesRecorded: messages.filter((message) => message.direction === 'inbound' && Date.parse(message.created_at) >= startWeek.getTime()).length,
    sessionsCompleted: (completedWeekResult.data || []).length,
  };
  const searchUsed = usageResult.data?.find((item) => item.metric === 'search')?.used || 0;
  const auditUsed = usageResult.data?.find((item) => item.metric === 'audit')?.used || 0;
  const messageUsed = usageResult.data?.find((item) => item.metric === 'message')?.used || 0;
  const apiUnits = (apiResult.data || []).reduce((total, item) => total + Number(item.units || 0), 0);
  const estimatedCost = (apiResult.data || []).reduce((total, item) => total + Number(item.estimated_cost || 0), 0);
  const watchedMarkets = watchedMarketResult.data || [];

  return <AppShell admin={user.isAdmin}>
    <ReminderReturnTracker />
    <div className="topline"><div><div className="eyebrow">Prepared prospecting</div><h1>Today</h1></div><span className="tag">{PLANS[user.plan].name} plan</span></div>
    <TodaySession
      stage={onboardingStage}
      activeSession={activeSession}
      completedToday={Number(completedTodayResult.count || 0) > 0}
      queueCount={actionable}
      routine={routine ? {
        days: routine.days_of_week || [],
        preferredTime: routine.preferred_time,
        sessionSize: Number(routine.session_size || 3),
        remindersEnabled: Boolean(routine.reminder_email_enabled),
      } : null}
      stats={stats}
    />

    <section className="dashboard-watched-card" aria-label="Watched markets">
      <div className="dashboard-watched-head">
        <div><span className="eyebrow">Watched markets</span><h3>{watchedMarkets.length ? `${watchedMarkets.length} market${watchedMarkets.length === 1 ? '' : 's'} feeding Today` : 'Keep one market working between sessions'}</h3></div>
        <Link className="btn" href="/dashboard/campaigns">{watchedMarkets.length ? 'Manage markets' : 'Choose a market'}</Link>
      </div>
      {watchedMarkets.length ? <div className="dashboard-watched-list">{watchedMarkets.map((watch) => {
        const campaign = Array.isArray(watch.campaigns) ? watch.campaigns[0] : watch.campaigns;
        return <div key={watch.id}><b>{campaign?.category || 'Saved market'}</b><span>{campaign?.location || 'Location saved'} · {Number(watch.last_new_prospect_count || 0)} new on last refresh</span></div>;
      })}</div> : <p>Free includes one watched market. New, previously unseen businesses can be surfaced into the next prepared session.</p>}
    </section>

    <div className="dashboard-secondary-grid">
      <section className="dashboard-secondary-card"><div><span className="eyebrow">Pipeline</span><h3>Keep follow-ups and replies organized</h3><p>Audits, drafts, replies, follow-up dates, outcomes, and manual sending stay attached to each prospect.</p></div><Link className="btn" href="/dashboard/leads">Open pipeline</Link></section>
      <section className="dashboard-secondary-card"><div><span className="eyebrow">Routine</span><h3>{routine ? 'Your next return is already defined' : 'Finish the repeat step'}</h3><p>{routine ? 'Adjust prospecting days, session size, and optional external email reminders whenever your routine changes.' : 'Choose your prospecting days and preferred time so one useful session leads naturally to the next.'}</p></div><Link className="btn" href="/dashboard/settings#routine">{routine ? 'Edit routine' : 'Set routine'}</Link></section>
    </div>

    <details className="dashboard-usage-disclosure"><summary>Plan usage <small>{searchUsed} searches · {auditUsed} analyses · {messageUsed} drafts</small></summary><div className="usage-grid">
      <div><span>Local searches</span><b>{searchUsed} / {PLANS[user.plan].searches}</b><progress max={PLANS[user.plan].searches} value={searchUsed} /></div>
      <div><span>Website analyses</span><b>{auditUsed} / {PLANS[user.plan].audits}</b><progress max={PLANS[user.plan].audits} value={auditUsed} /></div>
      <div><span>Outreach drafts</span><b>{messageUsed} / {PLANS[user.plan].messages}</b><progress max={PLANS[user.plan].messages} value={messageUsed} /></div>
      {user.isAdmin ? <div><span>Logged provider units</span><b>{apiUnits}</b><small>{estimatedCost > 0 ? `$${estimatedCost.toFixed(2)} estimated` : 'Usage recorded for review'}</small></div> : null}
    </div></details>
  </AppShell>;
}

function getLocalWeekStart(now: Date, timezoneOffsetMinutes: number) {
  const local = new Date(now.getTime() - timezoneOffsetMinutes * 60_000);
  const day = local.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  local.setUTCDate(local.getUTCDate() - daysSinceMonday);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() + timezoneOffsetMinutes * 60_000);
}
