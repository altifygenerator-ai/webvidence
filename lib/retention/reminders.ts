import { createAdminClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { logApiUsage } from '@/lib/data/api-usage';
import { makeReminderUnsubscribeToken } from '@/lib/retention/reminder-token';
import { startProspectingSession } from '@/lib/retention/session';
import type { PlanId } from '@/lib/plans';

type ReminderKind = 'session_ready' | 'follow_up_due' | 'market_new_prospects' | 'weekly_routine' | 'inactivity_rescue';

type RoutineRow = {
  user_id: string;
  workspace_id: string;
  days_of_week: number[];
  preferred_time: string;
  timezone_offset_minutes: number;
  session_size: number;
  reminder_email_enabled: boolean;
  weekly_routine_enabled: boolean;
};

export async function processRetentionReminders(now = new Date()) {
  if (!env.RESEND_API_KEY) return { checked: 0, sent: 0, skipped: 'RESEND_API_KEY is not configured.' };
  const db = createAdminClient();
  const { data, error } = await db.from('prospecting_routines')
    .select('user_id,workspace_id,days_of_week,preferred_time,timezone_offset_minutes,session_size,reminder_email_enabled,weekly_routine_enabled')
    .eq('reminder_email_enabled', true);
  if (error) throw new Error(`Could not load reminder routines: ${error.message}`);

  let sent = 0;
  for (const routine of (data || []) as RoutineRow[]) {
    const { data: profile } = await db.from('profiles').select('email,plan,is_admin').eq('id', routine.user_id).maybeSingle();
    const email = String(profile?.email || '').trim();
    if (!email || !routine.reminder_email_enabled) continue;
    const local = localParts(now, routine.timezone_offset_minutes);
    const preferred = parseTime(routine.preferred_time);
    const inPreferredWindow = local.hour === preferred.hour;
    let deliveredThisRun = false;

    if (inPreferredWindow && routine.days_of_week.includes(local.day)) {
      const exact = await firstSessionTask(routine, email, (profile?.plan || 'free') as PlanId, Boolean(profile?.is_admin));
      if (exact) {
        const delivered = await sendClaimedReminder({
          routine, email, kind: 'session_ready',
          dedupeKey: `session-ready:${local.date}`,
          subject: 'Your Webvidence prospecting session is ready',
          headline: 'Your next prospecting session is ready.',
          detail: `You have a prepared session waiting with up to ${routine.session_size} prospects. Work one prospect at a time, then stop cleanly when the session is complete.`,
          targetPath: exact,
          actionLabel: 'Start session',
        });
        sent += delivered;
        deliveredThisRun = deliveredThisRun || delivered > 0;
      }
    }

    const followUp = inPreferredWindow && !deliveredThisRun ? await firstDueFollowUp(routine.workspace_id, now) : null;
    if (followUp) {
      const delivered = await sendClaimedReminder({
        routine, email, kind: 'follow_up_due',
        dedupeKey: `follow-up:${followUp.id}:${local.date}`,
        subject: `Follow-up due: ${followUp.name}`,
        headline: `A follow-up with ${followUp.name} is due.`,
        detail: 'Open the exact prospect, review the conversation, and clear the follow-up when you send it.',
        targetPath: `/dashboard/leads/${followUp.id}?from=reminder#outreach`,
        actionLabel: 'Open follow-up',
      });
      sent += delivered;
      deliveredThisRun = deliveredThisRun || delivered > 0;
    }

    const market = inPreferredWindow && !deliveredThisRun ? await freshWatchedMarket(routine.user_id, routine.workspace_id, now) : null;
    if (market) {
      const exact = await firstSessionTask(routine, email, (profile?.plan || 'free') as PlanId, Boolean(profile?.is_admin));
      if (exact) {
        const delivered = await sendClaimedReminder({
          routine, email, kind: 'market_new_prospects',
          dedupeKey: `market:${market.id}:${String(market.last_refreshed_at).slice(0, 13)}`,
          subject: `${market.last_new_prospect_count} new prospect${market.last_new_prospect_count === 1 ? '' : 's'} found`,
          headline: 'A watched market found fresh prospects.',
          detail: `${market.last_new_prospect_count} new prospect${market.last_new_prospect_count === 1 ? '' : 's'} were added to Today and a prepared session is ready.`,
          targetPath: exact,
          actionLabel: 'Work next prospect',
        });
        sent += delivered;
        deliveredThisRun = deliveredThisRun || delivered > 0;
      }
    }

    if (!deliveredThisRun && routine.weekly_routine_enabled && inPreferredWindow && local.day === 0 && !routine.days_of_week.includes(local.day)) {
      const exact = await firstSessionTask(routine, email, (profile?.plan || 'free') as PlanId, Boolean(profile?.is_admin));
      if (exact) {
        const delivered = await sendClaimedReminder({
          routine, email, kind: 'weekly_routine',
          dedupeKey: `weekly:${local.isoWeek}`,
          subject: 'Your Webvidence week is ready',
          headline: 'Your weekly prospecting routine is ready.',
          detail: 'A short prepared session is ready for the week ahead, including due follow-ups and untouched prospects when available.',
          targetPath: exact,
          actionLabel: 'Start this week',
        });
        sent += delivered;
        deliveredThisRun = deliveredThisRun || delivered > 0;
      }
    }

    const rescue = inPreferredWindow && !deliveredThisRun
      ? await inactivityRescueTask(routine.user_id, routine.workspace_id, now)
      : null;
    if (rescue) {
      const delivered = await sendClaimedReminder({
        routine, email, kind: 'inactivity_rescue',
        dedupeKey: `rescue:${local.isoWeek}`,
        subject: 'You still have useful work waiting in Webvidence',
        headline: 'You have unfinished prospecting work waiting.',
        detail: 'Pick up the exact prospect you left off on. One reviewed, contacted, or legitimately passed prospect still counts as useful progress.',
        targetPath: rescue,
        actionLabel: 'Resume work',
      });
      sent += delivered;
      deliveredThisRun = deliveredThisRun || delivered > 0;
    }
  }
  return { checked: data?.length || 0, sent };
}

async function sendClaimedReminder(input: {
  routine: RoutineRow; email: string; kind: ReminderKind; dedupeKey: string;
  subject: string; headline: string; detail: string; targetPath: string; actionLabel: string;
}) {
  // The routine flag is intentionally checked again immediately before claiming/sending.
  if (!input.routine.reminder_email_enabled) return 0;
  const db = createAdminClient();
  const { data: current } = await db.from('prospecting_routines')
    .select('reminder_email_enabled')
    .eq('user_id', input.routine.user_id)
    .eq('workspace_id', input.routine.workspace_id)
    .maybeSingle();
  if (!current?.reminder_email_enabled) return 0;

  const { data: claim, error: claimError } = await db.from('reminder_deliveries').insert({
    workspace_id: input.routine.workspace_id,
    user_id: input.routine.user_id,
    kind: input.kind,
    dedupe_key: input.dedupeKey,
    target_path: input.targetPath,
    metadata: {},
  }).select('id').maybeSingle();
  // Unique(user_id, dedupe_key) makes concurrent cron executions race-safe.
  if (claimError || !claim) return 0;

  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  const targetUrl = `${baseUrl}${input.targetPath}`;
  const signature = makeReminderUnsubscribeToken(input.routine.user_id);
  const unsubscribeUrl = signature
    ? `${baseUrl}/api/reminders/unsubscribe?u=${encodeURIComponent(input.routine.user_id)}&sig=${encodeURIComponent(signature)}`
    : `${baseUrl}/dashboard/settings#routine`;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env.REMINDER_FROM_EMAIL,
        to: [input.email],
        subject: input.subject,
        html: reminderHtml(input.headline, input.detail, targetUrl, input.actionLabel, `${baseUrl}/dashboard/settings#routine`, unsubscribeUrl),
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    });
    const body = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok) throw new Error(body.message || `Resend returned ${response.status}.`);
    await db.from('reminder_deliveries').update({ provider_message_id: body.id || null }).eq('id', claim.id);
    await logApiUsage({
      workspaceId: input.routine.workspace_id,
      userId: input.routine.user_id,
      provider: 'webvidence_event', operation: 'reminder_sent', units: 1,
      metadata: { kind: input.kind, targetPath: input.targetPath },
    });
    return 1;
  } catch (error) {
    // Failed sends do not permanently consume the dedupe key, so a later cron run can retry.
    await db.from('reminder_deliveries').delete().eq('id', claim.id);
    console.error('Retention reminder send failed:', error);
    return 0;
  }
}

async function firstSessionTask(routine: RoutineRow, email: string, plan: PlanId, isAdmin: boolean) {
  const db = createAdminClient();
  let session = await (async () => {
    const { data } = await db.from('prospecting_sessions')
      .select('id').eq('user_id', routine.user_id).eq('workspace_id', routine.workspace_id).eq('status', 'active')
      .order('started_at', { ascending: false }).limit(1).maybeSingle();
    return data;
  })();
  if (!session) {
    const prepared = await startProspectingSession({
      id: routine.user_id, email, workspaceId: routine.workspace_id, plan, isAdmin,
    }, 'reminder');
    session = prepared ? { id: prepared.id } : null;
  }
  if (!session) return null;
  const { data: item } = await db.from('prospecting_session_items').select('lead_id')
    .eq('session_id', session.id).in('status', ['pending', 'working']).order('position').limit(1).maybeSingle();
  return item ? `/dashboard/leads/${item.lead_id}?session=${session.id}&from=reminder#outreach` : null;
}

async function firstDueFollowUp(workspaceId: string, now: Date) {
  const db = createAdminClient();
  const { data } = await db.from('leads').select('id,name,next_follow_up_at')
    .eq('workspace_id', workspaceId).is('follow_up_stopped_at', null)
    .lte('next_follow_up_at', now.toISOString())
    .not('status', 'in', '(won,lost,not_interested,do_not_contact,archived)')
    .order('next_follow_up_at').limit(1).maybeSingle();
  return data;
}

async function freshWatchedMarket(userId: string, workspaceId: string, now: Date) {
  const db = createAdminClient();
  const since = new Date(now.getTime() - 26 * 60 * 60 * 1000).toISOString();
  const { data } = await db.from('watched_markets')
    .select('id,last_refreshed_at,last_new_prospect_count')
    .eq('user_id', userId).eq('workspace_id', workspaceId).eq('status', 'active')
    .gt('last_new_prospect_count', 0).gte('last_refreshed_at', since)
    .order('last_refreshed_at', { ascending: false }).limit(1).maybeSingle();
  return data;
}

async function inactivityRescueTask(userId: string, workspaceId: string, now: Date) {
  const db = createAdminClient();
  const stale = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const { data: session } = await db.from('prospecting_sessions').select('id,started_at')
    .eq('user_id', userId).eq('workspace_id', workspaceId).eq('status', 'active')
    .lte('started_at', stale).order('started_at').limit(1).maybeSingle();
  if (!session) return null;
  const { data: item } = await db.from('prospecting_session_items').select('lead_id')
    .eq('session_id', session.id).in('status', ['pending', 'working']).order('position').limit(1).maybeSingle();
  return item ? `/dashboard/leads/${item.lead_id}?session=${session.id}&from=reminder#outreach` : null;
}

function parseTime(value: string) {
  const [hour, minute] = value.slice(0, 5).split(':').map(Number);
  return { hour: Number.isFinite(hour) ? hour : 9, minute: Number.isFinite(minute) ? minute : 0 };
}

function localParts(now: Date, offsetMinutes: number) {
  // JS getTimezoneOffset semantics: local = UTC - offset.
  const shifted = new Date(now.getTime() - offsetMinutes * 60_000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const dayOfMonth = shifted.getUTCDate();
  return {
    day: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    date: `${year}-${String(month + 1).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`,
    isoWeek: isoWeekKey(shifted),
  };
}

function isoWeekKey(date: Date) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((copy.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${copy.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function reminderHtml(headline: string, detail: string, targetUrl: string, actionLabel: string, settingsUrl: string, unsubscribeUrl: string) {
  const esc = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#17201d;line-height:1.55"><div style="max-width:560px;margin:0 auto;padding:28px 18px"><h2>${esc(headline)}</h2><p>${esc(detail)}</p><p><a href="${esc(targetUrl)}" style="display:inline-block;padding:12px 18px;background:#17201d;color:white;text-decoration:none;border-radius:8px">${esc(actionLabel)}</a></p><hr style="border:0;border-top:1px solid #ddd;margin:28px 0"><p style="font-size:12px;color:#68706c">You are receiving this because Webvidence email reminders are enabled. <a href="${esc(settingsUrl)}">Reminder preferences</a> · <a href="${esc(unsubscribeUrl)}">Unsubscribe</a></p></div></body></html>`;
}
