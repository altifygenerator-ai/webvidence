import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';
import { logApiUsage } from '@/lib/data/api-usage';
import { PRODUCT_EVENTS } from '@/lib/outreach/events';

const schema = z.object({
  event: z.enum(PRODUCT_EVENTS),
  leadId: z.string().uuid().optional(),
  intent: z.string().trim().max(40).optional(),
  channel: z.string().trim().max(40).optional(),
  outcome: z.string().trim().max(60).optional(),
  surface: z.string().trim().max(60).optional(),
});

export async function POST(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });

  try {
    assertTrustedMutation(req, { requireJson: true });
    await enforceRateLimit(req, user.id, RATE_LIMITS.mutation);
    const input = schema.parse(await req.json());
    await logApiUsage({
      workspaceId: user.workspaceId,
      userId: user.id,
      provider: 'webvidence_event',
      operation: input.event,
      units: 1,
      metadata: {
        ...(input.leadId ? { leadId: input.leadId } : {}),
        ...(input.intent ? { intent: input.intent } : {}),
        ...(input.channel ? { channel: input.channel } : {}),
        ...(input.outcome ? { outcome: input.outcome } : {}),
        ...(input.surface ? { surface: input.surface } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid product event.' }, { status: 400 });
    return NextResponse.json({ error: 'Could not record event.' }, { status: 500 });
  }
}
