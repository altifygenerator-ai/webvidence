import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';
import { logApiUsage } from '@/lib/data/api-usage';

const schema = z.object({
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  preferredTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezoneOffsetMinutes: z.number().int().min(-840).max(840),
  sessionSize: z.number().int().min(1).max(20).default(3),
  reminderEmailEnabled: z.boolean().default(false),
  weeklyRoutineEnabled: z.boolean().default(true),
});

export async function GET() {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });
  const db = createAdminClient();
  const { data, error } = await db.from('prospecting_routines')
    .select('days_of_week,preferred_time,timezone_offset_minutes,session_size,reminder_email_enabled,weekly_routine_enabled')
    .eq('user_id', user.id)
    .eq('workspace_id', user.workspaceId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ routine: data }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });
  try {
    assertTrustedMutation(req, { requireJson: true });
    await enforceRateLimit(req, user.id, RATE_LIMITS.mutation);
    const input = schema.parse(await req.json());
    const db = createAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await db.from('prospecting_routines').upsert({
      user_id: user.id,
      workspace_id: user.workspaceId,
      days_of_week: Array.from(new Set(input.daysOfWeek)).sort(),
      preferred_time: input.preferredTime,
      timezone_offset_minutes: input.timezoneOffsetMinutes,
      session_size: input.sessionSize,
      reminder_email_enabled: input.reminderEmailEnabled,
      weekly_routine_enabled: input.weeklyRoutineEnabled,
      updated_at: now,
    }, { onConflict: 'user_id' }).select('days_of_week,preferred_time,timezone_offset_minutes,session_size,reminder_email_enabled,weekly_routine_enabled').single();
    if (error) throw new Error(error.message);
    await logApiUsage({ workspaceId: user.workspaceId, userId: user.id, provider: 'webvidence_event', operation: 'routine_set', metadata: { sessionSize: input.sessionSize, reminders: input.reminderEmailEnabled } });
    return NextResponse.json({ routine: data });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid routine settings.' }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save routine.' }, { status: 500 });
  }
}
