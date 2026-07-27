import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';
import { normalizeWebsiteInput } from '@/lib/leads/website';
import { validatePublicUrl } from '@/lib/providers/audit';
import { logApiUsage } from '@/lib/data/api-usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  leadId: z.string().uuid(),
  website: z.string().trim().min(3).max(2048),
});

const EARLY_STATUSES = new Set(['new', 'reviewing', 'ready_to_contact']);

export async function PATCH(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });

  try {
    assertTrustedMutation(req, { requireJson: true });
    await enforceRateLimit(req, user.id, RATE_LIMITS.mutation);
    const input = schema.parse(await req.json());
    const normalizedWebsite = normalizeWebsiteInput(input.website);

    const db = createAdminClient();
    const [{ data: lead, error: leadError }, { data: openJob, error: openJobError }] = await Promise.all([
      db.from('leads')
        .select('id,name,website,status,website_source,website_verification_status')
        .eq('id', input.leadId)
        .eq('workspace_id', user.workspaceId)
        .maybeSingle(),
      db.from('audit_jobs')
        .select('id,status')
        .eq('lead_id', input.leadId)
        .eq('workspace_id', user.workspaceId)
        .in('status', ['queued', 'running'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (leadError) return NextResponse.json({ error: 'The business could not be loaded.' }, { status: 400 });
    if (!lead) return NextResponse.json({ error: 'Business not found.' }, { status: 404 });
    if (openJobError) return NextResponse.json({ error: 'The analysis status could not be checked.' }, { status: 400 });
    if (openJob) {
      return NextResponse.json({
        error: 'A website analysis is already running for this business. Wait for it to finish before changing the address.',
      }, { status: 409 });
    }

    await validatePublicUrl(normalizedWebsite);

    const now = new Date().toISOString();
    const nextStatus = EARLY_STATUSES.has(lead.status) ? 'reviewing' : lead.status;
    const { data: updated, error: updateError } = await db.from('leads')
      .update({
        website: normalizedWebsite,
        website_source: 'user',
        website_verification_status: 'user_confirmed',
        website_updated_by_user_at: now,
        opportunity_score: null,
        last_audited_at: null,
        manual_review_required: false,
        manual_review_reason: null,
        status: nextStatus,
        updated_at: now,
      })
      .eq('id', lead.id)
      .eq('workspace_id', user.workspaceId)
      .select('id,website,website_source,website_verification_status,website_updated_by_user_at,status')
      .single();

    if (updateError) {
      return NextResponse.json({ error: 'The website address could not be saved.' }, { status: 400 });
    }

    await logApiUsage({
      workspaceId: user.workspaceId,
      userId: user.id,
      provider: 'webvidence_event',
      operation: lead.website ? 'website_corrected_by_user' : 'website_added_by_user',
      units: 1,
      metadata: {
        leadId: lead.id,
        previousSource: lead.website_source || null,
        previousVerificationStatus: lead.website_verification_status || null,
      },
    }).catch(() => undefined);

    return NextResponse.json({
      ok: true,
      lead: updated,
      message: lead.website
        ? 'Website address updated. Run a fresh analysis before using the old findings.'
        : 'Website address added. Run an analysis to replace the Google-listing-only result.',
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: { 'retry-after': String(error.retryAfter) } });
    }
    if (error instanceof RequestSecurityError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Enter a valid website address.' }, { status: 400 });
    }
    const rawMessage = error instanceof Error ? error.message : '';
    const normalizedMessage = rawMessage.toLowerCase();
    const message = normalizedMessage.includes('enotfound')
      || normalizedMessage.includes('getaddrinfo')
      || normalizedMessage.includes('could not resolve')
      ? 'That website could not be found. Check the address and try again.'
      : rawMessage || 'The website address could not be saved.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
