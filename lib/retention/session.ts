import { createAdminClient } from '@/lib/supabase/admin';
import { logApiUsage } from '@/lib/data/api-usage';
import type { Viewer } from '@/lib/security/auth';

export const PASS_REASONS = [
  'strong_existing_site',
  'wrong_business_type',
  'no_contact_path',
  'business_inactive',
  'not_enough_opportunity',
  'other',
] as const;

export type PassReason = (typeof PASS_REASONS)[number];
export type SessionItemOutcome = 'contacted' | 'passed' | 'follow_up_cleared' | 'reply_recorded';

export type ActionableLeadRankInput = {
  opportunityScore?: number | null;
  opportunity_score?: number | null;
  reviews?: number | null;
  rating?: number | null;
  website?: string | null;
  phone?: string | null;
  businessStatus?: string | null;
  business_status?: string | null;
};

/**
 * Rank a lead for a prepared prospecting session.
 *
 * The session API receives Supabase rows in snake_case while a few callers use
 * camelCase objects. Supporting both shapes keeps the ranking helper safe at
 * the server boundary and prevents the session route from silently ignoring
 * opportunity score or business status.
 */
export function rankActionableLead(input: ActionableLeadRankInput) {
  let score = Number(input.opportunityScore ?? input.opportunity_score ?? 0);
  if ((input.reviews || 0) >= 10) score += 12;
  if ((input.rating || 0) >= 3.5) score += 6;
  if (input.website) score += 5;
  if (input.phone) score += 4;
  if ((input.businessStatus ?? input.business_status) === 'OPERATIONAL') score += 8;
  return score;
}

const CLOSED_STATUSES = new Set([
  'won', 'lost', 'not_interested', 'do_not_contact', 'archived',
]);

export async function startProspectingSession(
  user: Viewer & { workspaceId: string },
  source: 'today' | 'search' | 'watched_market' | 'reminder' | 'manual' = 'today',
) {
  const db = createAdminClient();
  const existing = await getActiveSession(user.id, user.workspaceId);
  if (existing) return existing;

  const { data: routine } = await db.from('prospecting_routines')
    .select('session_size')
    .eq('user_id', user.id)
    .eq('workspace_id', user.workspaceId)
    .maybeSingle();
  const targetSize = clampSessionSize(routine?.session_size);

  const { data: leads, error: leadError } = await db.from('leads')
    .select('id,name,status,opportunity_score,created_at,first_contacted_at,next_follow_up_at,follow_up_step,lead_outcome,manual_review_required,passed_at')
    .eq('workspace_id', user.workspaceId)
    .is('passed_at', null)
    .order('created_at', { ascending: false })
    .limit(300);
  if (leadError) throw new Error(`Could not prepare a session: ${leadError.message}`);

  const candidates = (leads || [])
    .filter((lead) => isActionableLead(lead))
    .sort((a, b) => candidateRank(b) - candidateRank(a))
    .slice(0, targetSize);

  if (!candidates.length) return null;

  const { data: session, error: sessionError } = await db.from('prospecting_sessions')
    .insert({
      workspace_id: user.workspaceId,
      user_id: user.id,
      status: 'active',
      source,
      target_size: candidates.length,
    })
    .select('id,status,target_size,started_at')
    .single();
  if (sessionError) {
    // A concurrent start may have won the one-active-session index race.
    const raced = await getActiveSession(user.id, user.workspaceId);
    if (raced) return raced;
    throw new Error(`Could not start the session: ${sessionError.message}`);
  }

  const { error: itemError } = await db.from('prospecting_session_items').insert(
    candidates.map((lead, index) => ({
      session_id: session.id,
      workspace_id: user.workspaceId,
      user_id: user.id,
      lead_id: lead.id,
      position: index + 1,
      status: 'pending',
    })),
  );
  if (itemError) {
    await db.from('prospecting_sessions').update({ status: 'abandoned', updated_at: new Date().toISOString() }).eq('id', session.id);
    throw new Error(`Could not prepare session prospects: ${itemError.message}`);
  }

  await logApiUsage({
    workspaceId: user.workspaceId,
    userId: user.id,
    provider: 'webvidence_event',
    operation: 'session_started',
    metadata: { sessionId: session.id, source, requestedSize: targetSize, preparedCount: candidates.length },
  });

  return getActiveSession(user.id, user.workspaceId);
}

export async function getActiveSession(userId: string, workspaceId: string) {
  const db = createAdminClient();
  const { data: session } = await db.from('prospecting_sessions')
    .select('id,status,source,target_size,started_at,completed_at')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!session) return null;

  const { data: items, error } = await db.from('prospecting_session_items')
    .select('id,lead_id,position,status,started_at,completed_at,pass_reason,leads(id,name,city,state,status,opportunity_score,next_follow_up_at,first_contacted_at,manual_review_required)')
    .eq('session_id', session.id)
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true });
  if (error) throw new Error(`Could not load the active session: ${error.message}`);

  return { ...session, items: items || [] };
}

export async function markSessionWork(options: {
  user: Viewer & { workspaceId: string };
  sessionId: string;
  leadId: string;
  action: 'start' | SessionItemOutcome;
  passReason?: PassReason | null;
}) {
  const db = createAdminClient();
  const { user, sessionId, leadId, action } = options;

  const { data: session } = await db.from('prospecting_sessions')
    .select('id,status')
    .eq('id', sessionId)
    .eq('workspace_id', user.workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!session) throw new Error('Session not found.');
  if (session.status !== 'active') return { completed: true, nextLeadId: null };

  const { data: item } = await db.from('prospecting_session_items')
    .select('id,status,started_at,completed_at')
    .eq('session_id', sessionId)
    .eq('lead_id', leadId)
    .eq('workspace_id', user.workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!item) throw new Error('This prospect is not part of the active session.');

  const now = new Date().toISOString();
  if (action === 'start') {
    if (!item.started_at) {
      await Promise.all([
        db.from('prospecting_session_items').update({ status: 'working', started_at: now, updated_at: now }).eq('id', item.id),
        db.from('leads').update({ last_reviewed_at: now, last_worked_at: now, updated_at: now }).eq('id', leadId).eq('workspace_id', user.workspaceId),
        logApiUsage({
          workspaceId: user.workspaceId,
          userId: user.id,
          provider: 'webvidence_event',
          operation: 'lead_work_started',
          metadata: { sessionId, leadId },
        }),
      ]);
    }
    return nextSessionState(sessionId, user.workspaceId, leadId);
  }

  if (item.completed_at) return nextSessionState(sessionId, user.workspaceId, leadId);

  const status = action;
  const passReason = action === 'passed' ? options.passReason || null : null;
  await db.from('prospecting_session_items').update({
    status,
    started_at: item.started_at || now,
    completed_at: now,
    pass_reason: passReason,
    updated_at: now,
  }).eq('id', item.id);

  const leadPatch: Record<string, unknown> = { last_worked_at: now, updated_at: now };
  if (action === 'passed') {
    leadPatch.last_reviewed_at = now;
    leadPatch.passed_at = now;
    leadPatch.pass_reason = passReason;
  }
  await db.from('leads').update(leadPatch).eq('id', leadId).eq('workspace_id', user.workspaceId);

  const event = action === 'passed' ? 'lead_passed' : action === 'reply_recorded' ? 'reply_recorded' : action === 'follow_up_cleared' ? 'follow_up_cleared' : 'lead_contacted';
  await logApiUsage({
    workspaceId: user.workspaceId,
    userId: user.id,
    provider: 'webvidence_event',
    operation: event,
    metadata: { sessionId, leadId, ...(passReason ? { passReason } : {}) },
  });

  return nextSessionState(sessionId, user.workspaceId, leadId, user.id);
}

async function nextSessionState(sessionId: string, workspaceId: string, currentLeadId: string, userId?: string) {
  const db = createAdminClient();
  const { data: items } = await db.from('prospecting_session_items')
    .select('lead_id,position,status,started_at,completed_at')
    .eq('session_id', sessionId)
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true });

  const all = items || [];
  const remaining = all.filter((item) => ['pending', 'working'].includes(item.status));
  const next = remaining.find((item) => item.lead_id !== currentLeadId) || remaining[0] || null;
  const completed = all.length > 0 && remaining.length === 0;

  if (completed) {
    const now = new Date().toISOString();
    const { data: closed } = await db.from('prospecting_sessions').update({
      status: 'completed', completed_at: now, updated_at: now,
    }).eq('id', sessionId).eq('status', 'active').select('id').maybeSingle();
    if (closed && userId) {
      await logApiUsage({
        workspaceId,
        userId,
        provider: 'webvidence_event',
        operation: 'session_completed',
        metadata: { sessionId, prospectsWorked: all.length },
      });
    }
  }

  return { completed, nextLeadId: next?.lead_id || null, items: all };
}

function clampSessionSize(value: unknown) {
  const size = Number(value || 3);
  return Number.isFinite(size) ? Math.max(1, Math.min(20, Math.round(size))) : 3;
}

function isActionableLead(lead: Record<string, unknown>) {
  const status = String(lead.status || 'new');
  if (CLOSED_STATUSES.has(status)) return false;
  if (lead.lead_outcome && ['closed_won', 'closed_lost', 'no_response'].includes(String(lead.lead_outcome))) return false;
  if (status === 'replied' || status === 'interested') return true;
  const due = lead.next_follow_up_at ? Date.parse(String(lead.next_follow_up_at)) <= Date.now() : false;
  if (due) return true;
  return !lead.first_contacted_at;
}

function candidateRank(lead: Record<string, unknown>) {
  const status = String(lead.status || 'new');
  if (status === 'replied') return 10000;
  if (status === 'interested') return 9000;
  if (lead.next_follow_up_at && Date.parse(String(lead.next_follow_up_at)) <= Date.now()) return 8000 - Number(lead.follow_up_step || 0) * 10;
  let rank = 5000 + Number(lead.opportunity_score || 0);
  if (lead.manual_review_required) rank -= 250;
  return rank;
}
