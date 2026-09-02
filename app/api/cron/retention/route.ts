import { NextResponse } from 'next/server';
import { runRetentionJobs } from '@/lib/jobs/retention';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await runRetentionJobs());
}
