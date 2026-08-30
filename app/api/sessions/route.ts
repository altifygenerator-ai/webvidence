import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';
import { getActiveSession, startProspectingSession } from '@/lib/retention/session';

const schema = z.object({
  source: z.enum(['today', 'search', 'watched_market', 'reminder', 'manual']).default('today'),
});

export async function GET() {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });
  try {
    const session = await getActiveSession(user.id, user.workspaceId);
    return NextResponse.json({ session }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load session.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });
  try {
    assertTrustedMutation(req, { requireJson: true });
    await enforceRateLimit(req, user.id, RATE_LIMITS.mutation);
    const input = schema.parse(await req.json());
    const session = await startProspectingSession({ ...user, workspaceId: user.workspaceId }, input.source);
    const firstItem = session?.items?.find((item) => ['pending', 'working'].includes(item.status));
    return NextResponse.json({
      session,
      href: session && firstItem ? `/dashboard/leads/${firstItem.lead_id}?session=${session.id}#outreach` : null,
    });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid session request.' }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not start session.' }, { status: 500 });
  }
}
