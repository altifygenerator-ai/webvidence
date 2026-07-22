import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/security/auth';
import { consumeMessage, refundUsage } from '@/lib/security/entitlements';
import { generateMessage } from '@/lib/providers/messages';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';
import { acquireOperationLock, releaseOperationLock, type OperationLock } from '@/lib/security/operation-lock';
import { logApiUsage } from '@/lib/data/api-usage';
import { OUTREACH_INTENTS } from '@/lib/outreach/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NON_OUTREACH_FINDING_CODES = new Set([
  'automated_check_blocked',
  'website_unreachable',
  'unsafe_or_invalid_url',
  'pagespeed_unavailable',
  'partial_crawl',
]);

const schema = z.object({
  leadId: z.string().uuid(),
  channel: z.enum(['email', 'facebook', 'text']),
  intent: z.enum(OUTREACH_INTENTS).default('conversation'),
  businessObservation: z.string().trim().max(1000).nullable().optional(),
});

export async function POST(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });

  let lock: OperationLock | null = null;
  let charged = false;

  try {
    assertTrustedMutation(req, { requireJson: true });
    await enforceRateLimit(req, user.id, RATE_LIMITS.generate);
    const input = schema.parse(await req.json());
    const db = createAdminClient();

    lock = await acquireOperationLock({
      userId: user.id,
      operation: `generate:${input.leadId}:${input.channel}:${input.intent}`,
      ttlSeconds: 90,
    });
    if (!lock) {
      return NextResponse.json({ error: 'A draft is already being generated for this lead and approach.' }, { status: 409 });
    }

    const { data: lead, error: leadError } = await db
      .from('leads')
      .select('id,workspace_id,name,category,city,state,website,status,manual_review_required,notes,business_observation,follow_up_step')
      .eq('id', input.leadId)
      .eq('workspace_id', user.workspaceId)
      .maybeSingle();
    if (leadError) return NextResponse.json({ error: 'The business could not be loaded.' }, { status: 400 });
    if (!lead) {
      const { data: existingLead } = user.isAdmin
        ? await db.from('leads').select('id').eq('id', input.leadId).maybeSingle()
        : { data: null };
      return NextResponse.json({
        error: existingLead
          ? 'That business belongs to a different workspace. Return to your pipeline and open a lead from this account.'
          : 'This business is no longer available. Return to your pipeline and open it again.',
      }, { status: existingLead ? 403 : 404 });
    }

    if (lead.status === 'do_not_contact') {
      return NextResponse.json({ error: 'This business is marked do not contact.' }, { status: 409 });
    }

    const observation = input.businessObservation === undefined
      ? lead.business_observation
      : input.businessObservation || null;
    if (input.businessObservation !== undefined && input.businessObservation !== lead.business_observation) {
      const { error: observationError } = await db.from('leads').update({
        business_observation: observation,
        updated_at: new Date().toISOString(),
      }).eq('id', lead.id).eq('workspace_id', user.workspaceId);
      if (observationError) return NextResponse.json({ error: 'The business observation could not be saved.' }, { status: 400 });
    }

    const { data: audit } = await db
      .from('audits')
      .select('id')
      .eq('lead_id', lead.id)
      .eq('workspace_id', user.workspaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (input.intent === 'website_finding' && lead.website && !audit) {
      return NextResponse.json({ error: 'Analyze this website before using a website finding so the draft is grounded in verified evidence.' }, { status: 409 });
    }

    const { data: findings } = audit
      ? await db.from('audit_findings').select('code,label,severity,evidence,source_url,metadata').eq('audit_id', audit.id)
      : { data: lead.website ? [] : [{
          code: 'no_site',
          label: 'No website found',
          severity: 'high',
          evidence: 'The Google business listing does not include a website.',
          source_url: null,
          metadata: {},
        }] };

    const rawFindings = findings || [];
    const outreachFindings = rawFindings.filter((finding) => !NON_OUTREACH_FINDING_CODES.has(finding.code));
    if (input.intent === 'website_finding' && lead.manual_review_required === true && !outreachFindings.some((finding) => finding.severity !== 'positive')) {
      return NextResponse.json({
        error: 'This website needs a manual review. Open it, then click “Mark as reviewed” before using a website finding.',
      }, { status: 409 });
    }
    if (input.intent === 'website_finding' && !outreachFindings.some((finding) => finding.severity !== 'positive')) {
      return NextResponse.json({ error: 'No verified website finding is available for this approach. Start a conversation instead.' }, { status: 409 });
    }

    const [{ data: outreachProfile }, { data: previous }, { data: latestReply }] = await Promise.all([
      db.from('outreach_profiles')
        .select('service_description,typical_project_range,target_customer,outreach_style,base_location,preferred_channels')
        .eq('workspace_id', user.workspaceId)
        .eq('is_default', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      input.intent === 'follow_up'
        ? db.from('messages')
            .select('body,sent_at,created_at,channel,contact_channel')
            .eq('lead_id', lead.id)
            .eq('workspace_id', user.workspaceId)
            .eq('direction', 'outbound')
            .eq('status', 'sent')
            .order('sent_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      input.intent === 'service_intro'
        ? db.from('messages')
            .select('body,recommended_action')
            .eq('lead_id', lead.id)
            .eq('workspace_id', user.workspaceId)
            .eq('direction', 'inbound')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (input.intent === 'follow_up' && !previous) {
      return NextResponse.json({ error: 'Confirm the first sent message before preparing a follow-up.' }, { status: 409 });
    }
    if (input.intent === 'service_intro' && !latestReply) {
      return NextResponse.json({ error: 'Record the prospect reply before preparing a service introduction.' }, { status: 409 });
    }
    if (
      input.intent === 'service_intro' &&
      latestReply?.recommended_action !== 'introduce_service' &&
      lead.status !== 'interested'
    ) {
      return NextResponse.json({
        error: 'The saved reply does not reveal a clear service need yet. Plan a response or ask one more question first.',
      }, { status: 409 });
    }

    await consumeMessage(user);
    charged = true;

    const generated = await generateMessage({
      name: lead.name,
      category: lead.category || 'local business',
      city: lead.city || '',
      state: lead.state || '',
      website: lead.website,
      channel: input.channel,
      intent: input.intent,
      findings: outreachFindings.map((finding) => ({
        code: finding.code,
        label: finding.label,
        severity: finding.severity,
        evidence: finding.evidence,
        sourceUrl: finding.source_url || undefined,
        metadata: finding.metadata || {},
      })),
      serviceDescription: outreachProfile?.service_description,
      typicalProjectRange: outreachProfile?.typical_project_range,
      targetCustomer: outreachProfile?.target_customer,
      outreachStyle: outreachProfile?.outreach_style,
      baseLocation: outreachProfile?.base_location,
      preferredChannels: outreachProfile?.preferred_channels,
      previousMessage: previous?.body,
      previousSentAt: previous?.sent_at || previous?.created_at,
      previousChannel: previous?.contact_channel || previous?.channel,
      followUpStep: Number(lead.follow_up_step || 0),
      privateNotes: lead.notes,
      businessObservation: observation,
      replyContext: latestReply?.body,
    });

    const storedChannel = input.intent === 'follow_up' ? 'follow_up' : input.channel;
    const { data: saved, error: saveError } = await db.from('messages').insert({
      workspace_id: user.workspaceId,
      lead_id: lead.id,
      user_id: user.id,
      channel: storedChannel,
      contact_channel: input.channel,
      direction: 'draft',
      subject: generated.subject,
      body: generated.body,
      status: 'draft',
      intent: input.intent,
    }).select('id,channel,contact_channel,subject,body,status,direction,intent,parent_message_id,created_at,copied_at,sent_at').single();
    if (saveError) throw new Error('Message could not be saved.');

    const eventName = input.intent === 'website_finding'
      ? 'website_finding_draft_generated'
      : input.intent === 'follow_up'
        ? 'follow_up_draft_generated'
        : input.intent === 'conversation'
          ? 'conversation_first_draft_generated'
          : null;

    const usageEvents = [
      logApiUsage({
        workspaceId: user.workspaceId,
        userId: user.id,
        provider: process.env.OPENAI_API_KEY ? 'openai' : 'local_fallback',
        operation: 'outreach_generation',
        units: 1,
        requestId: generated.requestId || null,
        metadata: {
          leadId: lead.id,
          channel: input.channel,
          intent: input.intent,
          model: process.env.OPENAI_MODEL || 'gpt-5-mini',
          inputTokens: generated.usage?.inputTokens || 0,
          outputTokens: generated.usage?.outputTokens || 0,
          totalTokens: generated.usage?.totalTokens || 0,
        },
      }),
    ];
    if (eventName) {
      usageEvents.push(logApiUsage({
        workspaceId: user.workspaceId,
        userId: user.id,
        provider: 'webvidence_event',
        operation: eventName,
        metadata: { leadId: lead.id, channel: input.channel, intent: input.intent },
      }));
    }
    await Promise.all(usageEvents);

    return NextResponse.json({ message: saved, observation });
  } catch (error) {
    if (charged) await refundUsage(user, 'message');
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: { 'retry-after': String(error.retryAfter) } });
    }
    if (error instanceof RequestSecurityError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === 'PLAN_LIMIT_REACHED') {
      return NextResponse.json({ error: 'Monthly outreach generation limit reached.' }, { status: 402 });
    }
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid outreach request.' }, { status: 400 });
    console.error('Outreach generation failed:', error);
    return NextResponse.json({ error: 'Webvidence could not prepare the draft. Try again.' }, { status: 500 });
  } finally {
    await releaseOperationLock(lock);
  }
}
