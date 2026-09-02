import { createAdminClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { searchBusinesses } from '@/lib/providers/google-places';
import { queueLeadAudits } from '@/lib/jobs/audits';
import { createUnsubscribeToken } from '@/lib/retention/unsubscribe';
import { logApiUsage } from '@/lib/data/api-usage';
import type { PlanId } from '@/lib/plans';

type ReminderType = 'session_ready' | 'follow_up_due' | 'market_update' | 'weekly_ready' | 'inactivity_rescue';
export async function runRetentionJobs() {
  return { markets: await refreshDueMarkets(), reminders: await sendUsefulReminders() };
}
export async function refreshDueMarkets() {
  const db = createAdminClient();
  const now = new Date();
  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!placesKey) return { checked: 0, surfaced: 0, skipped: 'GOOGLE_PLACES_API_KEY is not configured.' };
  const { data: campaigns } = await db.from('campaigns').select('id,workspace_id,user_id,category,location,radius_miles,center_lat,center_lng,watch_frequency_days').not('watched_at', 'is', null).eq('status', 'active').lte('next_refresh_at', now.toISOString()).limit(10);
  let surfaced = 0;
  for (const market of campaigns || []) {
    try {
      if (typeof market.center_lat !== 'number' || typeof market.center_lng !== 'number') continue;
      const { data: prior } = await db.from('leads').select('google_place_id').eq('workspace_id', market.workspace_id).eq('campaign_id', market.id).not('google_place_id', 'is', null).limit(5000);
      const result = await searchBusinesses({
        category: market.category, center: { latitude: market.center_lat, longitude: market.center_lng }, radiusMiles: market.radius_miles,
        maxResults: 10, apiKey: placesKey, resultMode: 'mixed', requestBudget: 2, poolSize: 30,
        seed: `watch:${market.id}:${now.toISOString().slice(0, 10)}`,
        excludePlaceIds: (prior || []).map((lead) => lead.google_place_id).filter(Boolean) as string[],
      });
      const candidates = result.businesses.filter((business) => business.businessStatus === 'OPERATIONAL' || business.reviews > 0).slice(0, 5);
      const inserted: Array<{ id: string; website: string | null; reviews: number; name: string }> = [];
      for (const business of candidates) {
        const { data, error } = await db.from('leads').insert({
          workspace_id: market.workspace_id, campaign_id: market.id, source: 'google_places', google_place_id: business.id,
          name: business.name, category: business.category, address: business.address, city: business.city, state: business.state,
          postal_code: business.postalCode, latitude: business.latitude, longitude: business.longitude, website: business.website,
          website_source: 'google_places', website_verification_status: business.website ? 'google_linked' : 'not_linked',
          phone: business.phone, google_maps_url: business.googleMapsUrl, reviews: business.reviews, rating: business.rating,
          business_status: business.businessStatus, raw_provider_data: { ...(business.raw as Record<string, unknown>), distanceMiles: business.distanceMiles },
        }).select('id,website,reviews,name').single();
        if (!error && data) inserted.push(data);
      }
      if (inserted.length) {
        const { data: profile } = await db.from('profiles').select('plan,is_admin').eq('id', market.user_id).maybeSingle();
        if (profile) await queueLeadAudits({ id: market.user_id, workspaceId: market.workspace_id, plan: profile.plan as PlanId, isAdmin: profile.is_admin }, inserted.slice(0, 3)).catch(() => undefined);
        await prepareSession(market.workspace_id, market.user_id, market.id, inserted.map((lead) => lead.id));
        surfaced += inserted.length;
        await productEvent(market.workspace_id, market.user_id, 'new_prospects_surfaced', { campaignId: market.id, count: inserted.length });
      }
      await db.from('campaigns').update({ last_refreshed_at: now.toISOString(), last_new_prospect_count: inserted.length, next_refresh_at: new Date(now.getTime() + Number(market.watch_frequency_days || 7) * 86400_000).toISOString(), updated_at: now.toISOString() }).eq('id', market.id);
      await productEvent(market.workspace_id, market.user_id, 'market_refreshed', { campaignId: market.id, count: inserted.length });
    } catch (error) { console.error('Watched market refresh failed:', market.id, error); }
  }
  return { checked: campaigns?.length || 0, surfaced };
}
async function prepareSession(workspaceId: string, userId: string, campaignId: string, leadIds: string[]) {
  const db = createAdminClient();
  const { data: open } = await db.from('prospecting_sessions').select('id').eq('user_id', userId).in('status', ['ready','active']).limit(1).maybeSingle();
  if (open || !leadIds.length) return;
  const selected = leadIds.slice(0, 3);
  const { data: session } = await db.from('prospecting_sessions').insert({ workspace_id: workspaceId, user_id: userId, campaign_id: campaignId, target_size: selected.length }).select('id').single();
  if (session) await db.from('prospecting_session_items').insert(selected.map((leadId, index) => ({ session_id: session.id, lead_id: leadId, position: index + 1 })));
}
export async function sendUsefulReminders() {
  const db = createAdminClient();
  if (!env.RESEND_API_KEY) return { sent: 0, skipped: 'RESEND_API_KEY is not configured.' };
  const { data: routines } = await db.from('prospecting_routines').select('user_id,workspace_id,weekdays,preferred_time,timezone,weekly_reminder_enabled,follow_up_reminders_enabled,market_reminders_enabled,inactivity_reminders_enabled').eq('reminder_emails_enabled', true).is('unsubscribed_at', null).limit(500);
  let sent = 0;
  for (const routine of routines || []) {
    const [{ data: profile }, { data: session }, { data: followUp }, { data: market }] = await Promise.all([
      db.from('profiles').select('email').eq('id', routine.user_id).maybeSingle(),
      db.from('prospecting_sessions').select('id,status,created_at').eq('user_id', routine.user_id).in('status', ['ready','active']).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      routine.follow_up_reminders_enabled ? db.from('leads').select('id,name,next_follow_up_at').eq('workspace_id', routine.workspace_id).lte('next_follow_up_at', new Date().toISOString()).not('next_follow_up_at', 'is', null).order('next_follow_up_at').limit(1).maybeSingle() : Promise.resolve({ data: null }),
      routine.market_reminders_enabled ? db.from('campaigns').select('id,category,last_new_prospect_count,last_refreshed_at').eq('workspace_id', routine.workspace_id).gt('last_new_prospect_count', 0).order('last_refreshed_at', { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (!profile?.email) continue;
    const dateKey = new Date().toISOString().slice(0, 10);
    if (followUp) sent += await deliver(routine, profile.email, 'follow_up_due', `followup:${followUp.id}:${dateKey}`, `/dashboard/leads/${followUp.id}`, `Follow-up due with ${followUp.name}`, 'A follow-up is due. Open the exact lead record and decide the next step.');
    else if (market && session) sent += await deliver(routine, profile.email, 'market_update', `market:${market.id}:${market.last_refreshed_at}`, `/dashboard/session/${session.id}`, `${market.last_new_prospect_count} new prospect${market.last_new_prospect_count === 1 ? '' : 's'} found`, `Your watched ${market.category} market found new businesses and prepared the next session.`);
    else if (session) {
      const inactive = (Date.now() - Date.parse(session.created_at)) / 86400_000 >= 3 && routine.inactivity_reminders_enabled;
      const window = routineWindow(routine);
      if (inactive || window.ready) {
        const weekly = !inactive && routine.weekly_reminder_enabled && window.weekday === Math.min(...routine.weekdays);
        const type: ReminderType = inactive ? 'inactivity_rescue' : weekly ? 'weekly_ready' : 'session_ready';
        sent += await deliver(routine, profile.email, type, `${type}:${session.id}:${dateKey}`, `/dashboard/session/${session.id}`, inactive ? 'Your unfinished session is still ready' : weekly ? 'Your weekly prospecting routine is ready' : 'Your prospecting session is ready', inactive ? 'A small batch is waiting where you left it.' : 'Three focused prospect decisions are ready when you are.');
      }
    }
  }
  return { sent };
}
async function deliver(routine: { user_id: string; workspace_id: string }, email: string, type: ReminderType, dedupeKey: string, path: string, subject: string, text: string) {
  const db = createAdminClient();
  const { data: claim } = await db.from('reminder_deliveries').insert({ workspace_id: routine.workspace_id, user_id: routine.user_id, reminder_type: type, dedupe_key: dedupeKey, destination_path: path }).select('id').maybeSingle();
  if (!claim) return 0;
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  const unsubscribe = `${appUrl}/api/reminders/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(routine.user_id))}`;
  const taskUrl = `${appUrl}${path}${path.includes('?') ? '&' : '?'}from=reminder`;
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: env.REMINDER_FROM_EMAIL, to: [email], subject, text: `${text}\n\nOpen the task: ${taskUrl}\n\nReminder preferences: ${appUrl}/dashboard/settings#reminders\nTurn off reminder emails: ${unsubscribe}` }) });
  if (!response.ok) { await db.from('reminder_deliveries').update({ status: 'failed', error_message: (await response.text()).slice(0, 1000) }).eq('id', claim.id); return 0; }
  const result = await response.json().catch(() => ({})) as { id?: string };
  await db.from('reminder_deliveries').update({ status: 'sent', provider_message_id: result.id || null, sent_at: new Date().toISOString() }).eq('id', claim.id);
  await productEvent(routine.workspace_id, routine.user_id, 'reminder_sent', { type, path });
  return 1;
}
async function productEvent(workspaceId: string, userId: string, operation: string, metadata: Record<string, unknown>) {
  await logApiUsage({ workspaceId, userId, provider: 'webvidence_event', operation, metadata }).catch(() => undefined);
}
function routineWindow(routine: { weekdays: number[]; preferred_time: string; timezone: string }) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: routine.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const weekdayLabel = parts.find((part) => part.type === 'weekday')?.value || '';
    const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(weekdayLabel);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
    const [targetHour, targetMinute] = routine.preferred_time.slice(0, 5).split(':').map(Number);
    const afterTime = hour * 60 + minute >= targetHour * 60 + targetMinute;
    return { ready: routine.weekdays.includes(weekday) && afterTime, weekday };
  } catch { return { ready: false, weekday: -1 }; }
}
