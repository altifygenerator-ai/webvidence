import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';
import { queueLeadAudits, processAuditJobs } from '@/lib/jobs/audits';

export const runtime = 'nodejs';
export const maxDuration = 120;

const schema = z.object({
  leadId: z.string().uuid(),
});

export async function POST(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });

  try {
    assertTrustedMutation(req, { requireJson: true });
    await enforceRateLimit(req, user.id, RATE_LIMITS.audit);
    const input = schema.parse(await req.json());
    const db = createAdminClient();

    const { data: lead, error } = await db
      .from('leads')
      .select('id,website,reviews,name')
      .eq('id', input.leadId)
      .eq('workspace_id', user.workspaceId)
      .single();
    if (error || !lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });

    const queued = await queueLeadAudits({
      id: user.id,
      workspaceId: user.workspaceId,
      plan: user.plan,
      isAdmin: user.isAdmin,
    }, [lead]);
    const item = queued.results[0];

    if (!item) return NextResponse.json({ error: 'Analysis could not be queued.' }, { status: 500 });
    if (item.status === 'limit_reached') {
      return NextResponse.json({ error: 'Monthly analysis limit reached.' }, { status: 402 });
    }
    if (item.status === 'completed' && item.audit) {
      return NextResponse.json({ status: 'completed', audit: item.audit });
    }

    if (queued.jobIds.length) {
      after(async () => {
        await processAuditJobs(queued.jobIds, 1);
      });
    }

    return NextResponse.json({
      status: 'queued',
      jobId: item.jobId,
      leadId: lead.id,
      message: item.status === 'already_queued'
        ? 'This website is already being analyzed.'
        : 'Analysis started. It will keep running if you leave this page.',
    }, { status: 202 });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: { 'retry-after': String(error.retryAfter) } });
    }
    if (error instanceof RequestSecurityError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid audit request.' }, { status: 400 });
    console.error('Audit queue failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Analysis could not be started.' }, { status: 500 });
  }
}
