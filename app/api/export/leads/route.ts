import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/security/auth';
import { PLANS } from '@/lib/plans';
import { createAdminClient } from '@/lib/supabase/admin';
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from '@/lib/security/rate-limit';

export async function GET(req: Request) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.workspaceId) return NextResponse.json({ error: 'Workspace missing.' }, { status: 400 });
  if (!user.isAdmin && !PLANS[user.plan].exports) {
    return NextResponse.json({ error: 'CSV export is available on paid plans.' }, { status: 402 });
  }

  try {
    await enforceRateLimit(req, user.id, RATE_LIMITS.export);
    const db = createAdminClient();
    const { data: leads, error } = await db.from('leads')
      .select('name,category,address,city,state,postal_code,website,phone,rating,reviews,status,opportunity_score,last_audited_at,first_contacted_at,last_contacted_at,next_follow_up_at,follow_up_step,lead_outcome,lead_outcome_updated_at,follow_up_stopped_at,notes')
      .eq('workspace_id', user.workspaceId)
      .order('opportunity_score', { ascending: false, nullsFirst: false })
      .limit(10000);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const headers = ['Business','Category','Address','City','State','ZIP','Website','Phone','Rating','Reviews','Status','Opportunity score','Last audited','First contacted','Last contacted','Next follow-up','Follow-up step','Outcome','Outcome updated','Follow-up stopped','Notes'];
    const rows = (leads || []).map((lead) => [
      lead.name, lead.category, lead.address, lead.city, lead.state, lead.postal_code, lead.website, lead.phone,
      lead.rating, lead.reviews, lead.status, lead.opportunity_score, lead.last_audited_at, lead.first_contacted_at, lead.last_contacted_at,
      lead.next_follow_up_at, lead.follow_up_step, lead.lead_outcome, lead.lead_outcome_updated_at, lead.follow_up_stopped_at, lead.notes,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="webvidence-leads-${stamp}.csv"`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { 'retry-after': String(error.retryAfter) } });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Export failed.' }, { status: 500 });
  }
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  // Prevent spreadsheet formula execution when a CSV is opened in Excel/Sheets.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
