import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';
import { logApiUsage } from '@/lib/data/api-usage';

const schema = z.object({
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  preferredTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().trim().min(1).max(100),
  sessionSize: z.number().int().min(1).max(10).default(3),
  reminderEmailsEnabled: z.boolean(),
});

export async function POST(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });
  try {
    assertTrustedMutation(req, { requireJson: true });
    await enforceRateLimit(req, user.id, RATE_LIMITS.mutation);
    const input = schema.parse(await req.json());
    const db = createAdminClient();
    const { data, error } = await db.from('prospecting_routines').upsert({
      workspace_id: user.workspaceId,
      user_id: user.id,
      weekdays: Array.from(new Set(input.weekdays)).sort(),
      preferred_time: input.preferredTime,
      timezone: input.timezone,
      session_size: input.sessionSize,
      reminder_emails_enabled: input.reminderEmailsEnabled,
      unsubscribed_at: input.reminderEmailsEnabled ? null : undefined,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }).select('id,weekdays,preferred_time,timezone,session_size,reminder_emails_enabled').single();
    if (error) throw error;
    await logApiUsage({
      workspaceId: user.workspaceId, userId: user.id, provider: 'webvidence_event',
      operation: 'routine_set', metadata: { weekdays: input.weekdays, sessionSize: input.sessionSize },
    }).catch(() => undefined);
    return NextResponse.json({ routine: data });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Choose at least one day and a valid time.' }, { status: 400 });
    return NextResponse.json({ error: 'Your routine could not be saved.' }, { status: 500 });
  }
}
