import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { planFromPriceId, type PlanId } from '@/lib/plans';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe webhook is not configured.' }, { status: 500 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const raw = await req.text();
  const signature = req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error('Invalid Stripe webhook signature:', error);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: claim, error: claimError } = await db.rpc('claim_webhook_event', {
    p_event_id: event.id,
    p_event_type: event.type,
  });
  if (claimError) {
    console.error('Could not claim Stripe webhook event:', claimError.message);
    return NextResponse.json({ error: 'Webhook claim failed.' }, { status: 500 });
  }
  if (claim === 'processed') return NextResponse.json({ received: true, duplicate: true });
  if (claim !== 'claimed') {
    // Another request is processing this event. A non-2xx response asks Stripe to
    // retry instead of accepting an event that has not completed yet.
    return NextResponse.json({ error: 'Webhook is already processing.' }, { status: 409 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (typeof session.subscription !== 'string') {
        throw new Error(`Checkout session ${session.id} did not contain a subscription.`);
      }
      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      await syncSubscription(subscription);
    }

    if (event.type.startsWith('customer.subscription.')) {
      await syncSubscription(event.data.object as Stripe.Subscription);
    }

    await db.from('webhook_events').update({
      status: 'processed',
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_message: null,
      payload: { livemode: event.livemode, object: event.data.object.object },
    }).eq('id', event.id);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook processing failed:', error);
    await db.from('webhook_events').update({
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Webhook processing failed.',
      updated_at: new Date().toISOString(),
    }).eq('id', event.id);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Webhook processing failed.' }, { status: 500 });
  }

  async function syncSubscription(subscription: Stripe.Subscription) {
    const userId = subscription.metadata.user_id;
    if (!userId) throw new Error(`Subscription ${subscription.id} is missing user_id metadata.`);

    const currentPrice = subscription.items.data[0]?.price?.id;
    const detectedPlan = planFromPriceId(currentPrice);
    if (!detectedPlan) {
      throw new Error(`Subscription ${subscription.id} uses an unrecognized Stripe price.`);
    }

    // Hard lock paid access when payment is not active. Past-due, unpaid,
    // incomplete, paused, and canceled subscriptions fall back to Free.
    const grantsPaidAccess = ['active', 'trialing'].includes(subscription.status);
    const effectivePlan: PlanId = grantsPaidAccess ? detectedPlan : 'free';
    const periodStart = readUnixTimestamp(subscription, 'current_period_start');
    const periodEnd = readUnixTimestamp(subscription, 'current_period_end');

    const { error: subscriptionError } = await db.from('subscriptions').upsert({
      user_id: userId,
      stripe_customer_id: String(subscription.customer),
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      plan: detectedPlan,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: subscription.cancel_at_period_end,
      trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (subscriptionError) throw new Error(subscriptionError.message);

    const { error: profileError } = await db.from('profiles')
      .update({ plan: effectivePlan })
      .eq('id', userId)
      .eq('is_admin', false);
    if (profileError) throw new Error(profileError.message);
  }
}

function readUnixTimestamp(subscription: Stripe.Subscription, key: 'current_period_start' | 'current_period_end') {
  const value = (subscription as unknown as Record<string, unknown>)[key];
  return typeof value === 'number' ? new Date(value * 1000).toISOString() : null;
}
