import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';

const schema = z.object({
  userId: z.string().uuid(),
  plan: z.enum(['free', 'starter', 'freelancer', 'studio', 'admin']),
});

export async function POST(req: Request) {
  const admin = await requireAdmin();
  try {
    assertTrustedMutation(req, { requireJson: true });
    await enforceRateLimit(req, admin.id, RATE_LIMITS.admin);
    const body = schema.parse(await req.json());
    const db = createAdminClient();
    const { data: target, error: targetError } = await db.from('profiles')
      .select('id,email,is_admin,plan')
      .eq('id', body.userId)
      .single();
    if (targetError || !target) return NextResponse.json({ error: 'Target account was not found.' }, { status: 404 });
    if (target.is_admin && body.plan !== 'admin') {
      return NextResponse.json({ error: 'Admin access cannot be removed through a plan override.' }, { status: 409 });
    }

    const { error } = await db.from('profiles').update({ plan: body.plan }).eq('id', body.userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await db.from('admin_audit_log').insert({
      admin_id: admin.id,
      action: 'plan_override',
      target_id: body.userId,
      details: { email: target.email, from: target.plan, to: body.plan },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { 'retry-after': String(error.retryAfter) } });
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid admin override.' }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Admin update failed.' }, { status: 500 });
  }
}
