import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { refreshDueWatchedMarkets } from '@/lib/retention/markets';
import { processRetentionReminders } from '@/lib/retention/reminders';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const markets = await refreshDueWatchedMarkets();
    const reminders = await processRetentionReminders();
    return NextResponse.json({ ok: true, markets, reminders });
  } catch (error) {
    console.error('Retention cron failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Retention cron failed.' }, { status: 500 });
  }
}
