import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getViewer } from '@/lib/security/auth';
import { env, flags } from '@/lib/env';
import { isPaidPlan, planRank, priceId, type PaidPlanId } from '@/lib/plans';
import { assertTrustedMutation, RequestSecurityError } from '@/lib/security/request';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';

const schema = z.object({
  plan: z.enum(['starter', 'freelancer', 'studio']),
  trial: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Sign in before choosing a paid plan.' }, { status: 401 });
  if (user.isAdmin || user.plan === 'admin') {
    return NextResponse.json({ error: 'Your admin account already has unrestricted access.' }, { status: 409 });
  }
  if (!flags.billing) return NextResponse.json({ error: 'Billing is disabled in this environment.' }, { status: 409 });
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: 'Stripe secret key is not configured.' }, { status: 500 });

  try {
    assertTrustedMutation(req, { requireJson: true });
    await enforceRateLimit(req, user.id, RATE_LIMITS.checkout);
    const { plan, trial } = schema.parse(await req.json());
    if (!isPaidPlan(plan)) return NextResponse.json({ error: 'Invalid paid plan.' }, { status: 400 });
    if (trial && plan !== 'freelancer') {
      return NextResponse.json({ error: 'The 7-day trial is only available on the Freelancer plan.' }, { status: 400 });
    }

    const currentRank = planRank(user.plan);
    const targetRank = planRank(plan);
    if (user.plan === plan) {
      const message = plan === 'studio'
        ? 'You already have the maximum plan.'
        : `You already have the ${user.plan} plan. Choose a higher plan to upgrade.`;
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (targetRank < currentRank) {
      return NextResponse.json({ error: 'This screen only supports upgrades. Use Manage billing for plan reductions or cancellation.' }, { status: 409 });
    }

    const targetPrice = priceId(plan as PaidPlanId);
    if (!targetPrice) return NextResponse.json({ error: `Stripe price is not configured for ${plan}.` }, { status: 500 });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const db = createAdminClient();
    const { data: billing } = await db
      .from('subscriptions')
      .select('stripe_customer_id,stripe_subscription_id,status,plan,trial_end')
      .eq('user_id', user.id)
      .maybeSingle();

    const activeStatuses = new Set(['active', 'trialing']);
    const hasExistingPaidSubscription = Boolean(
      user.plan !== 'free' &&
      billing?.stripe_customer_id &&
      billing?.stripe_subscription_id &&
      activeStatuses.has(billing.status),
    );
    const wantsFreelancerTrial = trial && plan === 'freelancer';
    const freelancerTrialEligible = Boolean(
      wantsFreelancerTrial &&
      user.plan === 'free' &&
      !billing?.trial_end &&
      !billing?.stripe_subscription_id,
    );

    if (wantsFreelancerTrial && !freelancerTrialEligible) {
      return NextResponse.json({
        error: 'The 7-day Freelancer trial is only available before an account has started a paid subscription or trial.',
      }, { status: 409 });
    }

    if (hasExistingPaidSubscription) {
      const subscription = await stripe.subscriptions.retrieve(billing!.stripe_subscription_id!);
      const item = subscription.items.data[0];
      if (!item) return NextResponse.json({ error: 'Your Stripe subscription has no billable item.' }, { status: 500 });

      try {
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: billing!.stripe_customer_id!,
          return_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
          flow_data: {
            type: 'subscription_update_confirm',
            after_completion: {
              type: 'redirect',
              redirect: { return_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard/billing?updated=1` },
            },
            subscription_update_confirm: {
              subscription: subscription.id,
              items: [{ id: item.id, price: targetPrice, quantity: 1 }],
            },
          },
        }, { idempotencyKey: `upgrade:${user.id}:${plan}:${Math.floor(Date.now() / 300000)}` });
        return NextResponse.json({ url: portalSession.url, mode: 'upgrade' });
      } catch (portalError) {
        const detail = portalError instanceof Error ? portalError.message : 'Stripe could not open the upgrade screen.';
        return NextResponse.json({
          error: `${detail} Make sure Stripe Customer Portal plan switching includes the Starter, Freelancer, and Studio prices.`,
        }, { status: 500 });
      }
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_collection: 'always',
      line_items: [{ price: targetPrice, quantity: 1 }],
      success_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard/billing?success=1${freelancerTrialEligible ? '&trial=1' : ''}`,
      cancel_url: `${env.NEXT_PUBLIC_APP_URL}/pricing`,
      client_reference_id: user.id,
      ...(billing?.stripe_customer_id
        ? { customer: billing.stripe_customer_id }
        : { customer_email: user.email }),
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan,
          ...(freelancerTrialEligible ? { trial_offer: 'freelancer_7_day' } : {}),
        },
        ...(freelancerTrialEligible ? {
          trial_period_days: 7,
          trial_settings: { end_behavior: { missing_payment_method: 'cancel' as const } },
        } : {}),
      },
      metadata: {
        user_id: user.id,
        plan,
        ...(freelancerTrialEligible ? { trial_offer: 'freelancer_7_day' } : {}),
      },
    }, {
      idempotencyKey: freelancerTrialEligible
        ? `checkout:${user.id}:freelancer:trial-v1`
        : `checkout:${user.id}:${plan}:${Math.floor(Date.now() / 300000)}`,
    });

    if (!checkoutSession.url) return NextResponse.json({ error: 'Stripe did not return a checkout URL.' }, { status: 500 });
    return NextResponse.json({ url: checkoutSession.url, mode: 'checkout' });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { 'retry-after': String(error.retryAfter) } });
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid plan selection.' }, { status: 400 });
    console.error('Stripe checkout failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to start checkout.' }, { status: 500 });
  }
}
