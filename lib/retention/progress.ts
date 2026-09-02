import { createAdminClient } from '@/lib/supabase/admin';
import { logApiUsage } from '@/lib/data/api-usage';

export async function completeSessionIfDone(
  db: ReturnType<typeof createAdminClient>,
  sessionId: string,
  user: { id: string; workspaceId: string },
) {
  const { data: remaining } = await db.from('prospecting_session_items').select('id')
    .eq('session_id', sessionId).in('status', ['ready', 'working']).limit(1);
  if ((remaining || []).length) return false;
  const now = new Date().toISOString();
  const { data: updated } = await db.from('prospecting_sessions').update({
    status: 'completed', completed_at: now, updated_at: now,
  }).eq('id', sessionId).neq('status', 'completed').select('id').maybeSingle();
  if (updated) {
    await logApiUsage({
      workspaceId: user.workspaceId,
      userId: user.id,
      provider: 'webvidence_event',
      operation: 'session_completed',
      metadata: { sessionId },
    }).catch(() => undefined);
  }
  return true;
}
