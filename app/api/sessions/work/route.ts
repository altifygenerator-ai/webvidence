import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';
import { markSessionWork, PASS_REASONS } from '@/lib/retention/session';

const schema = z.object({
  sessionId: z.string().uuid(),
  leadId: z.string().uuid(),
  action: z.enum(['start', 'contacted', 'passed', 'follow_up_cleared', 'reply_recorded']),
  passReason: z.enum(PASS_REASONS).nullable().optional(),
});

export async function POST(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });
  try {
    assertTrustedMutation(req, { requireJson: true });
    await enforceRateLimit(req, user.id, RATE_LIMITS.mutation);
    const input = schema.parse(await req.json());
    const state = await markSessionWork({
      user: { ...user, workspaceId: user.workspaceId },
      sessionId: input.sessionId,
      leadId: input.leadId,
      action: input.action,
      passReason: input.passReason,
    });
    return NextResponse.json(state);
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || 'Invalid session update.' }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update session.' }, { status: 500 });
  }
}
