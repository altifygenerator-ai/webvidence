import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { env, flags } from '@/lib/env';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';

export async function POST(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!flags.billing) return NextResponse.json({ error: 'Billing disabled' }, { status: 409 });
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: 'Stripe secret key is not configured.' }, { status: 500 });

  try {
    assertTrustedMutation(req);
    await enforceRateLimit(req, user.id, RATE_LIMITS.portal);
    const db = createAdminClient();
    const { data } = await db.from('subscriptions').select('stripe_customer_id').eq('user_id', user.id).single();
    if (!data?.stripe_customer_id) return NextResponse.json({ error: 'No billing account' }, { status: 404 });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { 'retry-after': String(error.retryAfter) } });
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not open billing portal.' }, { status: 500 });
  }
}
