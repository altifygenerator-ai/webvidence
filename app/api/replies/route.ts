import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { consumeMessage, refundUsage } from '@/lib/security/entitlements';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';
import { acquireOperationLock, releaseOperationLock, type OperationLock } from '@/lib/security/operation-lock';
import { analyzeReply } from '@/lib/providers/replies';
import { REPLY_ACTIONS } from '@/lib/outreach/types';
import { logApiUsage } from '@/lib/data/api-usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const schema = z.object({
  leadId: z.string().uuid(),
  reply: z.string().trim().min(1).max(5000).optional(),
  channel: z.enum(['email', 'facebook', 'text', 'phone', 'other']).default('other'),
  isSummary: z.boolean().default(false),
  replyMessageId: z.string().uuid().optional(),
  preferredAction: z.enum(REPLY_ACTIONS).optional(),
}).superRefine((value, ctx) => {
  if (!value.reply && !value.replyMessageId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reply'], message: 'Add the prospect reply.' });
  }
});

export async function POST(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });

  let lock: OperationLock | null = null;
  let charged = false;
  let inboundMessageId: string | null = null;

  try {
    assertTrustedMutation(req, { requireJson: true });
    await enforceRateLimit(req, user.id, RATE_LIMITS.generate);
    const input = schema.parse(await req.json());
    lock = await acquireOperationLock({
      userId: user.id,
      operation: `reply-analysis:${input.replyMessageId || input.leadId}`,
      ttlSeconds: 90,
    });
    if (!lock) return NextResponse.json({ error: 'This reply is already being reviewed.' }, { status: 409 });

    const db = createAdminClient();
    const { data: lead, error: leadError } = await db
      .from('leads')
      .select('id,workspace_id,name,category,city,state,notes,business_observation,status')
      .eq('id', input.leadId)
      .eq('workspace_id', user.workspaceId)
      .maybeSingle();
    if (leadError) return NextResponse.json({ error: 'The prospect could not be loaded.' }, { status: 400 });
    if (!lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });

    let prospectReply = input.reply || '';
    let inboundMessage: Record<string, unknown> | null = null;

    if (input.replyMessageId) {
      const { data: existingInbound } = await db
        .from('messages')
        .select('id,channel,contact_channel,subject,body,status,direction,intent,parent_message_id,reply_summary,recommended_action,analysis_reasoning,copied_at,sent_at,created_at')
        .eq('id', input.replyMessageId)
        .eq('lead_id', lead.id)
        .eq('workspace_id', user.workspaceId)
        .eq('direction', 'inbound')
        .maybeSingle();
      if (!existingInbound) return NextResponse.json({ error: 'Saved prospect reply not found.' }, { status: 404 });
      prospectReply = existingInbound.body;
      inboundMessageId = existingInbound.id;
      inboundMessage = existingInbound;
    } else {
      const { data: savedInbound, error: inboundError } = await db
        .from('messages')
        .insert({
          workspace_id: user.workspaceId,
          lead_id: lead.id,
          user_id: user.id,
          channel: input.channel,
          contact_channel: input.channel,
          direction: 'inbound',
          body: prospectReply,
          status: 'received',
          intent: null,
          reply_summary: input.isSummary ? prospectReply : null,
        })
        .select('id,channel,contact_channel,subject,body,status,direction,intent,parent_message_id,reply_summary,recommended_action,analysis_reasoning,copied_at,sent_at,created_at')
        .single();
      if (inboundError) return NextResponse.json({ error: 'The reply could not be saved.' }, { status: 400 });
      inboundMessageId = savedInbound.id;
      inboundMessage = savedInbound;

    }

    const protectedLeadStatuses = new Set(['interested', 'quote_sent', 'won', 'lost', 'not_interested', 'do_not_contact', 'archived']);
    if (!protectedLeadStatuses.has(lead.status)) {
      const receivedAt = new Date().toISOString();
      const { error: leadUpdateError } = await db.from('leads').update({
        status: 'replied',
        lead_outcome: 'replied',
        lead_outcome_updated_at: receivedAt,
        next_follow_up_at: null,
        follow_up_stopped_at: receivedAt,
        updated_at: receivedAt,
      }).eq('id', lead.id).eq('workspace_id', user.workspaceId);
      if (leadUpdateError) throw new Error('Reply was saved, but the prospect status could not be updated.');
    }

    const [{ data: history }, { data: profile }] = await Promise.all([
      db.from('messages')
        .select('id,direction,body,sent_at,created_at,channel,contact_channel')
        .eq('lead_id', lead.id)
        .eq('workspace_id', user.workspaceId)
        .neq('id', inboundMessageId || '')
        .order('created_at', { ascending: true })
        .limit(20),
      db.from('outreach_profiles')
        .select('service_description,typical_project_range,target_customer,outreach_style,base_location')
        .eq('workspace_id', user.workspaceId)
        .eq('is_default', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    try {
      await consumeMessage(user);
      charged = true;
    } catch (error) {
      if (error instanceof Error && error.message === 'PLAN_LIMIT_REACHED') {
        return NextResponse.json({
          reply: inboundMessage,
          analysis: null,
          warning: 'Reply saved, but the monthly outreach generation limit has been reached.',
        });
      }
      throw error;
    }

    const result = await analyzeReply({
      businessName: lead.name,
      category: lead.category || 'local business',
      location: [lead.city, lead.state].filter(Boolean).join(', '),
      prospectReply,
      previousMessages: (history || []).map((message) => ({
        direction: message.direction,
        body: message.body,
        sentAt: message.sent_at || message.created_at,
        channel: message.contact_channel || message.channel,
      })),
      businessObservation: lead.business_observation,
      privateNotes: lead.notes,
      serviceDescription: profile?.service_description,
      targetCustomer: profile?.target_customer,
      typicalProjectRange: profile?.typical_project_range,
      outreachStyle: profile?.outreach_style,
      baseLocation: profile?.base_location,
      preferredAction: input.preferredAction || null,
    });

    const analysis = result.analysis;
    const { error: analysisSaveError } = await db.from('messages').update({
      reply_summary: analysis.summary,
      recommended_action: analysis.recommendedAction,
      analysis_reasoning: analysis.reasoning,
      updated_at: new Date().toISOString(),
    }).eq('id', inboundMessageId).eq('workspace_id', user.workspaceId);
    if (analysisSaveError) throw new Error('Reply analysis could not be saved.');

    const { data: existingDraft } = await db
      .from('messages')
      .select('id')
      .eq('parent_message_id', inboundMessageId)
      .eq('workspace_id', user.workspaceId)
      .eq('direction', 'draft')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const draftPayload = {
      workspace_id: user.workspaceId,
      lead_id: lead.id,
      user_id: user.id,
      channel: input.channel,
      contact_channel: input.channel,
      direction: 'draft',
      subject: input.channel === 'email' ? 'Re: Quick question' : null,
      body: analysis.suggestedResponse,
      status: 'draft',
      intent: analysis.recommendedAction === 'introduce_service' ? 'service_intro' : 'reply_response',
      parent_message_id: inboundMessageId,
      updated_at: new Date().toISOString(),
    };

    const draftResult = existingDraft
      ? await db.from('messages').update(draftPayload).eq('id', existingDraft.id).eq('workspace_id', user.workspaceId)
          .select('id,channel,contact_channel,subject,body,status,direction,intent,parent_message_id,created_at,copied_at').single()
      : await db.from('messages').insert(draftPayload)
          .select('id,channel,contact_channel,subject,body,status,direction,intent,parent_message_id,created_at,copied_at').single();
    if (draftResult.error) throw new Error('Suggested response could not be saved.');

    await Promise.all([
      logApiUsage({
        workspaceId: user.workspaceId,
        userId: user.id,
        provider: process.env.OPENAI_API_KEY ? 'openai' : 'local_fallback',
        operation: 'reply_analysis',
        units: 1,
        requestId: result.requestId || null,
        metadata: {
          leadId: lead.id,
          recommendedAction: analysis.recommendedAction,
          needStatus: analysis.needStatus,
          inputTokens: result.usage?.inputTokens || 0,
          outputTokens: result.usage?.outputTokens || 0,
          totalTokens: result.usage?.totalTokens || 0,
        },
      }),
      logApiUsage({
        workspaceId: user.workspaceId,
        userId: user.id,
        provider: 'webvidence_event',
        operation: 'reply_assistant_used',
        metadata: { leadId: lead.id, recommendedAction: analysis.recommendedAction },
      }),
    ]);

    return NextResponse.json({
      reply: { ...inboundMessage, reply_summary: analysis.summary, recommended_action: analysis.recommendedAction, analysis_reasoning: analysis.reasoning },
      analysis,
      draft: draftResult.data,
    });
  } catch (error) {
    if (charged) await refundUsage(user, 'message');
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { 'retry-after': String(error.retryAfter) } });
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Add the reply and try again.' }, { status: 400 });
    console.error('Reply analysis failed:', error);
    if (inboundMessageId) {
      return NextResponse.json({
        replySaved: true,
        replyMessageId: inboundMessageId,
        error: 'The reply was saved, but Webvidence could not prepare a response. Try again without re-entering it.',
      }, { status: 500 });
    }
    return NextResponse.json({ error: 'The reply could not be saved.' }, { status: 500 });
  } finally {
    await releaseOperationLock(lock);
  }
}
