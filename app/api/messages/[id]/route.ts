import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';
import { buildSentMessageLeadUpdate, type LeadOutcome } from '@/lib/leads/priority';
import { acquireOperationLock, releaseOperationLock, type OperationLock } from '@/lib/security/operation-lock';

const schema = z.object({
  subject: z.string().max(200).nullable().optional(),
  body: z.string().min(1).max(10000).optional(),
  status: z.enum(['draft', 'approved', 'sent', 'received', 'failed']).optional(),
  copied: z.boolean().optional(),
});

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });

  let lock: OperationLock | null = null;
  try {
    assertTrustedMutation(req, { requireJson: true });
    await enforceRateLimit(req, user.id, RATE_LIMITS.mutation);
    const { id } = await context.params;
    lock = await acquireOperationLock({ userId: user.id, operation: `message-update:${id}`, ttlSeconds: 30 });
    if (!lock) return NextResponse.json({ error: 'This message is already being updated.' }, { status: 409 });
    const input = schema.parse(await req.json());
    const db = createAdminClient();

    const { data: current, error: currentError } = await db.from('messages')
      .select('id,lead_id,channel,status,sent_at')
      .eq('id', id)
      .eq('workspace_id', user.workspaceId)
      .maybeSingle();
    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 400 });
    if (!current) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });

    const changedAt = new Date().toISOString();
    const transitionToSent = input.status === 'sent' && current.status !== 'sent';
    const { copied, ...messagePatch } = input;
    const update: Record<string, unknown> = { ...messagePatch, updated_at: changedAt };
    if (copied) update.copied_at = changedAt;
    if (input.status === 'approved') update.approved_at = changedAt;
    if (transitionToSent) {
      update.sent_at = changedAt;
      update.direction = 'outbound';
    } else if (input.status === 'sent') {
      update.sent_at = current.sent_at || changedAt;
      update.direction = 'outbound';
    }

    const { data, error } = await db.from('messages')
      .update(update)
      .eq('id', id)
      .eq('workspace_id', user.workspaceId)
      .select('id,lead_id,channel,contact_channel,subject,body,status,direction,intent,parent_message_id,created_at,updated_at,sent_at,copied_at')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    let leadActivity = null;
    let leadWarning: string | null = null;
    if (transitionToSent) {
      const { data: lead, error: leadError } = await db.from('leads')
        .select('id,status,first_contacted_at,last_contacted_at,follow_up_step,follow_up_stopped_at,lead_outcome')
        .eq('id', data.lead_id)
        .eq('workspace_id', user.workspaceId)
        .maybeSingle();

      if (leadError || !lead) {
        leadWarning = leadError?.message || 'The lead activity record could not be loaded.';
      } else {
        const leadUpdate = buildSentMessageLeadUpdate({
          status: lead.status,
          channel: data.channel,
          sentAt: data.sent_at || changedAt,
          firstContactedAt: lead.first_contacted_at,
          lastContactedAt: lead.last_contacted_at,
          followUpStep: lead.follow_up_step,
          followUpStoppedAt: lead.follow_up_stopped_at,
          leadOutcome: lead.lead_outcome as LeadOutcome | null,
        });
        const { data: updatedLead, error: updateError } = await db.from('leads')
          .update(leadUpdate)
          .eq('id', lead.id)
          .eq('workspace_id', user.workspaceId)
          .select('id,status,first_contacted_at,last_contacted_at,next_follow_up_at,follow_up_step,follow_up_stopped_at,lead_outcome')
          .single();
        if (updateError) leadWarning = updateError.message;
        else leadActivity = updatedLead;
      }
    }

    return NextResponse.json({ message: data, lead: leadActivity, warning: leadWarning });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { 'retry-after': String(error.retryAfter) } });
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid message update.' }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Update failed.' }, { status: 500 });
  } finally {
    await releaseOperationLock(lock);
  }
}
