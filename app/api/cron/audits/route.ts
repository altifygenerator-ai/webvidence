import { NextResponse } from 'next/server';
import { processQueuedAuditJobs } from '@/lib/jobs/audits';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.get('authorization');
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = await processQueuedAuditJobs(10);
  return NextResponse.json({ processed: results.length, results });
}
