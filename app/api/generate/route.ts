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

const NON_OUTREACH_FINDING_CODES = new Set([
  'automated_check_blocked',
  'website_unreachable',
  'unsafe_or_invalid_url',
  'pagespeed_unavailable',
  'partial_crawl',
]);

const schema = z.object({
  leadId: z.string().uuid(),
  channel: z.enum(['email', 'facebook', 'text', 'follow_up']),
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
      operation: `generate:${input.leadId}:${input.channel}`,
      ttlSeconds: 90,
    });
    if (!lock) {
      return NextResponse.json({ error: 'A draft is already being generated for this lead and channel.' }, { status: 409 });
    }

    const { data: lead, error: leadError } = await db
      .from('leads')
      .select('id,name,category,city,state,website,status')
      .eq('id', input.leadId)
      .eq('workspace_id', user.workspaceId)
      .single();
    if (leadError || !lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });

    if (lead.status === 'do_not_contact') {
      return NextResponse.json({ error: 'This business is marked do not contact.' }, { status: 409 });
    }

    const { data: audit } = await db
      .from('audits')
      .select('id')
      .eq('lead_id', lead.id)
      .eq('workspace_id', user.workspaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lead.website && !audit) {
      return NextResponse.json({ error: 'Analyze this website before generating outreach so the message has verified evidence.' }, { status: 409 });
    }

    const { data: findings } = audit
      ? await db.from('audit_findings').select('code,label,severity,evidence,source_url,metadata').eq('audit_id', audit.id)
      : { data: [{
          code: 'no_site',
          label: 'No website found',
          severity: 'high',
          evidence: 'The Google business listing does not include a website.',
          source_url: null,
          metadata: {},
        }] };

    const rawFindings = findings || [];
    const manualReviewRequired = rawFindings.some((finding) => ['automated_check_blocked', 'website_unreachable', 'unsafe_or_invalid_url'].includes(finding.code));
    const outreachFindings = rawFindings.filter((finding) => !NON_OUTREACH_FINDING_CODES.has(finding.code));
    if (input.channel !== 'follow_up' && manualReviewRequired && !outreachFindings.some((finding) => finding.severity !== 'positive')) {
      return NextResponse.json({
        error: 'Webvidence could not fully inspect this website. Open it manually before creating website-specific outreach.',
      }, { status: 409 });
    }

    await consumeMessage(user);
    charged = true;

    const { data: outreachProfile } = await db
      .from('outreach_profiles')
      .select('service_description,typical_project_range,target_customer,outreach_style')
      .eq('workspace_id', user.workspaceId)
      .eq('is_default', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: previous } = input.channel === 'follow_up'
      ? await db.from('messages').select('body').eq('lead_id', lead.id).eq('workspace_id', user.workspaceId).eq('direction', 'outbound').order('created_at', { ascending: false }).limit(1).maybeSingle()
      : { data: null };

    const generated = await generateMessage({
      name: lead.name,
      category: lead.category || 'local business',
      city: lead.city || '',
      state: lead.state || '',
      website: lead.website,
      channel: input.channel,
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
      previousMessage: previous?.body,
    });

    const storedChannel = input.channel === 'follow_up' ? 'follow_up' : input.channel;
    const { data: saved, error: saveError } = await db.from('messages').insert({
      workspace_id: user.workspaceId,
      lead_id: lead.id,
      user_id: user.id,
      channel: storedChannel,
      direction: 'draft',
      subject: generated.subject,
      body: generated.body,
      status: 'draft',
    }).select('id,channel,subject,body,status,created_at').single();
    if (saveError) throw new Error(`Message could not be saved: ${saveError.message}`);

    await logApiUsage({
      workspaceId: user.workspaceId,
      userId: user.id,
      provider: process.env.OPENAI_API_KEY ? 'openai' : 'local_fallback',
      operation: 'outreach_generation',
      units: 1,
      requestId: generated.requestId || null,
      metadata: {
        leadId: lead.id,
        channel: input.channel,
        model: process.env.OPENAI_MODEL || 'gpt-5-mini',
        inputTokens: generated.usage?.inputTokens || 0,
        outputTokens: generated.usage?.outputTokens || 0,
        totalTokens: generated.usage?.totalTokens || 0,
      },
    });

    return NextResponse.json({ message: saved });
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
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Generation failed.' }, { status: 500 });
  } finally {
    await releaseOperationLock(lock);
  }
}
