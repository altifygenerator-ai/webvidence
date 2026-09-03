import { refreshDueMarkets } from '@/lib/jobs/retention';

/**
 * Backward-compatible wrapper for the consolidated retention job.
 * watched_markets remains the source of truth used by the UI, API, and cron.
 */
export async function refreshDueWatchedMarkets(_now = new Date()) {
  return refreshDueMarkets();
}
