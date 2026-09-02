import { sendUsefulReminders } from '@/lib/jobs/retention';

/**
 * Backward-compatible wrapper for the pre-consolidation retention module.
 * The active implementation lives in lib/jobs/retention.ts.
 */
export async function processRetentionReminders(_now = new Date()) {
  return sendUsefulReminders();
}
