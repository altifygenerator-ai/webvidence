import { ZodError } from 'zod';
import { env } from '@/lib/env';
import { buildFeedbackEmailText, feedbackSchema, feedbackSubject } from '@/lib/feedback';
import { getViewer } from '@/lib/security/auth';
import { enforceRateLimit, getClientIp, hashRateLimitKey, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function sendNotification(input: ReturnType<typeof feedbackSchema.parse>, text: string) {
  if (!env.RESEND_API_KEY) {
    return { sent: false, error: 'RESEND_API_KEY is not configured.' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.FEEDBACK_FROM_EMAIL,
      to: [env.FEEDBACK_TO_EMAIL || env.ADMIN_EMAIL],
      reply_to: input.email,
      subject: feedbackSubject(input),
      text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => 'Unknown email provider error');
    return { sent: false, error: detail.slice(0, 1000) };
  }

  const result = await response.json().catch(() => ({})) as { id?: string };
  return { sent: true, providerId: result.id || null };
}

export async function POST(request: Request) {
  try {
    assertTrustedMutation(request, { requireJson: true });
    const raw = await request.json();

    // Silent success for the hidden bot field so automated submissions do not
    // learn that they were rejected.
    if (typeof raw?.contactPage === 'string' && raw.contactPage.trim()) {
      return Response.json({ ok: true }, { status: 201 });
    }

    const input = feedbackSchema.parse(raw);
    const viewer = await getViewer().catch(() => null);
    const clientKey = viewer?.id || hashRateLimitKey(`${getClientIp(request) || 'unknown'}:${input.email.toLowerCase()}`);
    await enforceRateLimit(request, `feedback:${clientKey}`, RATE_LIMITS.feedback);

    const submittedAt = new Date().toISOString();
    const normalizedInput = input.permissionLevel === 'private'
      ? { ...input, allowWrittenQuote: false, allowOutcomeDetails: false, allowBusinessIdentity: false, allowLightEditing: false, allowAnonymousStats: false }
      : input.permissionLevel === 'anonymous' || input.permissionLevel === 'first_name'
        ? { ...input, allowBusinessIdentity: false }
        : input;
    const db = createAdminClient();
    const { data: submission, error: insertError } = await db
      .from('feedback_submissions')
      .insert({
        user_id: viewer?.id || null,
        workspace_id: viewer?.workspaceId || null,
        name: input.name || null,
        email: input.email.toLowerCase(),
        business_name: input.businessName || null,
        website: input.website || null,
        usage_frequency: input.usageFrequency,
        features_used: input.featuresUsed,
        previous_workflow: input.previousWorkflow || null,
        ease_impact: input.easeImpact,
        time_saving_detail: input.timeSavingDetail || null,
        contacted_count: input.contactedCount,
        no_contact_reason: input.noContactReason || null,
        replies_count: input.repliesCount,
        reply_types: input.replyTypes,
        outcome: input.outcome,
        project_range: input.projectRange,
        workflow_most_helpful: input.workflowMostHelpful || null,
        rough_or_confusing: input.roughOrConfusing || null,
        would_use_more: input.wouldUseMore || null,
        usefulness_rating: input.usefulnessRating,
        testimonial_text: input.testimonialText || null,
        additional_message: input.additionalMessage || null,
        permission_level: input.permissionLevel,
        allow_written_quote: normalizedInput.allowWrittenQuote,
        allow_outcome_details: normalizedInput.allowOutcomeDetails,
        allow_business_identity: normalizedInput.allowBusinessIdentity,
        allow_light_editing: normalizedInput.allowLightEditing,
        allow_anonymous_stats: normalizedInput.allowAnonymousStats,
        complimentary_access: input.complimentaryAccess,
        submitted_at: submittedAt,
      })
      .select('id')
      .single();

    if (insertError || !submission) {
      throw new Error(`Could not save feedback: ${insertError?.message || 'No submission returned.'}`);
    }

    const text = buildFeedbackEmailText(normalizedInput, {
      submittedAt,
      userId: viewer?.id,
      workspaceId: viewer?.workspaceId,
    });
    const notification = await sendNotification(normalizedInput, text);

    await db
      .from('feedback_submissions')
      .update({
        email_notification_sent: notification.sent,
        email_notification_id: 'providerId' in notification ? notification.providerId : null,
        email_notification_error: notification.sent ? null : notification.error,
      })
      .eq('id', submission.id);

    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: 'Check the required fields and try again.' }, { status: 400 });
    }
    if (error instanceof RateLimitError) {
      return Response.json({ error: error.message }, { status: 429, headers: { 'Retry-After': String(error.retryAfter) } });
    }
    if (error instanceof RequestSecurityError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error('Feedback submission failed', error);
    return Response.json({ error: 'The feedback could not be submitted right now. Please try again.' }, { status: 500 });
  }
}
