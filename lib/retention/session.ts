import { createAdminClient } from '@/lib/supabase/admin';
import { logApiUsage } from '@/lib/data/api-usage';
import type { Viewer } from '@/lib/security/auth';

export const PASS_REASONS = [
  'strong_existing_site',
  'wrong_business_type',
  'no_contact_path',
  'inactive_business',
  'not_enough_opportunity',
  'other',
] as const;

export type PassReason = (typeof PASS_REASONS)[number];
export const PASS_REASON_LABELS: Record<PassReason, string> = {
  strong_existing_site: 'Strong existing website',
  wrong_business_type: 'Wrong type of business',
  no_contact_path: 'No usable contact path',
  inactive_business: 'Business appears inactive',
  not_enough_opportunity: 'Not enough opportunity',
  other: 'Other',
};
export type SessionItemOutcome = 'contacted' | 'passed' | 'follow_up_cleared' | 'reply_recorded';

export function getSessionSummary(items: Array<{ status: string }>) {
  const contacted = items.filter((item) => item.status === 'contacted').length;
  const passed = items.filter((item) => item.status === 'passed').length;
  return { reviewed: contacted + passed, contacted, passed };
}

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

export async function getActiveSession(userId: string, workspaceId: string) {
  const db = createAdminClient();
  const { data: session } = await db.from('prospecting_sessions')
    .select('id,status,source,campaign_id,target_size,started_at,completed_at,created_at')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .in('status', ['ready', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!session) return null;

  const { data: items, error } = await db.from('prospecting_session_items')
    .select('id,lead_id,position,status,started_at,completed_at,pass_reason,leads(id,name,city,state,status,opportunity_score,next_follow_up_at,first_contacted_at,manual_review_required,latitude,longitude)')
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
  if (!['ready', 'active'].includes(session.status)) return { completed: true, nextLeadId: null };

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
        db.from('prospecting_sessions').update({ status: 'active', started_at: now, updated_at: now }).eq('id', sessionId).eq('workspace_id', user.workspaceId).eq('user_id', user.id).in('status', ['ready', 'active']),
        db.from('prospecting_session_items').update({ status: 'working', started_at: now, opened_at: now, updated_at: now }).eq('id', item.id),
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

  const itemStatus = action === 'passed' ? 'passed' : 'contacted';
  const passReason = action === 'passed' ? options.passReason || null : null;
  await db.from('prospecting_session_items').update({
    status: itemStatus,
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
  const remaining = all.filter((item) => ['ready', 'working'].includes(item.status));
  const next = remaining.find((item) => item.lead_id !== currentLeadId) || remaining[0] || null;
  const completed = all.length > 0 && remaining.length === 0;

  if (completed) {
    const now = new Date().toISOString();
    const { data: closed } = await db.from('prospecting_sessions').update({
      status: 'completed', completed_at: now, updated_at: now,
    }).eq('id', sessionId).in('status', ['ready', 'active']).select('id').maybeSingle();
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
