import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { consumeAudit, refundUsage } from '@/lib/security/entitlements';
import { auditWebsite } from '@/lib/providers/audit';
import { saveLeadAudit } from '@/lib/data/audits';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';
import { acquireOperationLock, releaseOperationLock, type OperationLock } from '@/lib/security/operation-lock';

export const runtime = 'nodejs';
export const maxDuration = 120;

const schema = z.object({
  leadId: z.string().uuid().optional(),
  url: z.string().url().nullable().optional(),
}).refine((value) => Boolean(value.leadId) || value.url !== undefined, {
  message: 'A leadId or URL is required.',
});

export async function POST(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let lock: OperationLock | null = null;
  let charged = false;

  try {
    assertTrustedMutation(req, { requireJson: true });
    await enforceRateLimit(req, user.id, RATE_LIMITS.audit);
    const input = schema.parse(await req.json());

    // Normal accounts can only analyze websites attached to saved leads. This
    // prevents the audit service from becoming an arbitrary URL fetch endpoint.
    if (!input.leadId && !user.isAdmin) {
      return NextResponse.json({ error: 'Choose a saved business before running an analysis.' }, { status: 403 });
    }

    if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });

    const lockTarget = input.leadId || createHash('sha256').update(input.url || '').digest('hex');
    lock = await acquireOperationLock({
      userId: user.id,
      operation: `audit:${lockTarget}`,
      ttlSeconds: 180,
    });
    if (!lock) {
      return NextResponse.json({ error: 'This website is already being analyzed. Wait for it to finish.' }, { status: 409 });
    }

    if (input.leadId) {
      const db = createAdminClient();
      const { data: lead, error } = await db
        .from('leads')
        .select('id,website,reviews')
        .eq('id', input.leadId)
        .eq('workspace_id', user.workspaceId)
        .single();
      if (error || !lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });

      await consumeAudit(user);
      charged = true;
      const audit = await auditWebsite(lead.website, { runPageSpeed: true });
      const saved = await saveLeadAudit({
        workspaceId: user.workspaceId,
        userId: user.id,
        leadId: lead.id,
        audit,
        reviews: lead.reviews,
      });
      return NextResponse.json(saved);
    }

    await consumeAudit(user);
    charged = true;
    return NextResponse.json(await auditWebsite(input.url || null, { runPageSpeed: true }));
  } catch (error) {
    if (charged) await refundUsage(user, 'audit');
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: { 'retry-after': String(error.retryAfter) } });
    }
    if (error instanceof RequestSecurityError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === 'PLAN_LIMIT_REACHED') {
      return NextResponse.json({ error: 'Monthly analysis limit reached.' }, { status: 402 });
    }
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || 'Invalid audit request.' }, { status: 400 });
    console.error('Audit failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Audit failed.' }, { status: 500 });
  } finally {
    await releaseOperationLock(lock);
  }
}
