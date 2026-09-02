import { refreshDueMarkets } from '@/lib/jobs/retention';

/**
 * Backward-compatible wrapper for the pre-consolidation retention module.
 * Watched markets are stored on campaigns by migration 009.
 */
export async function refreshDueWatchedMarkets(_now = new Date()) {
  return refreshDueMarkets();
}
