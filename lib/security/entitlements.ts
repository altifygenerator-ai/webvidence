import { PLANS, type PlanId } from '@/lib/plans';
import { createAdminClient } from '@/lib/supabase/admin';
import { flags } from '@/lib/env';

type MeteredUser = { id: string; plan: PlanId; isAdmin: boolean };

export type UsageMetric = 'search' | 'audit' | 'message';

export async function consumeUsage(user: MeteredUser, metric: UsageMetric, amount = 1) {
  if (user.isAdmin || user.plan === 'admin') return;
  if (flags.demo && !process.env.NEXT_PUBLIC_SUPABASE_URL) return;

  const limit = limitFor(user.plan, metric);
  const db = createAdminClient();
  const period = new Date().toISOString().slice(0, 7);
  const { data, error } = await db.rpc('consume_usage', {
    p_user_id: user.id,
    p_metric: metric,
    p_period: period,
    p_amount: amount,
    p_limit: limit,
  });
  if (error) throw new Error(`Usage enforcement failed: ${error.message}`);
  if (data !== true) throw new Error('PLAN_LIMIT_REACHED');
}

export async function refundUsage(user: MeteredUser, metric: UsageMetric, amount = 1) {
  if (user.isAdmin || user.plan === 'admin') return;
  if (flags.demo && !process.env.NEXT_PUBLIC_SUPABASE_URL) return;

  const db = createAdminClient();
  const period = new Date().toISOString().slice(0, 7);
  const { error } = await db.rpc('refund_usage', {
    p_user_id: user.id,
    p_metric: metric,
    p_period: period,
    p_amount: amount,
  });
  if (error) console.error(`Could not refund ${metric} usage:`, error.message);
}

export async function consumeSearch(user: MeteredUser, amount = 1) {
  return consumeUsage(user, 'search', amount);
}

export async function consumeAudit(user: MeteredUser, amount = 1) {
  return consumeUsage(user, 'audit', amount);
}

export async function consumeMessage(user: MeteredUser, amount = 1) {
  return consumeUsage(user, 'message', amount);
}

function limitFor(plan: PlanId, metric: UsageMetric) {
  if (metric === 'search') return PLANS[plan].searches;
  if (metric === 'audit') return PLANS[plan].audits;
  return PLANS[plan].messages;
}
