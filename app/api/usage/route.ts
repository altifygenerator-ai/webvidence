import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/security/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PLANS } from '@/lib/plans';

export async function GET() {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const period = new Date().toISOString().slice(0, 7);
  const db = createAdminClient();
  const { data, error } = await db.from('usage_counters')
    .select('metric,used')
    .eq('user_id', user.id)
    .eq('period', period);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const used = Object.fromEntries((data || []).map((item) => [item.metric, item.used])) as Record<string, number>;
  return NextResponse.json({
    plan: user.plan,
    period,
    usage: {
      search: used.search || 0,
      audit: used.audit || 0,
      message: used.message || 0,
    },
    limits: {
      search: PLANS[user.plan].searches,
      audit: PLANS[user.plan].audits,
      message: PLANS[user.plan].messages,
    },
  }, { headers: { 'cache-control': 'no-store' } });
}
