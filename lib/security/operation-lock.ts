import { createHash, randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export type OperationLock = {
  key: string;
  token: string;
};

export async function acquireOperationLock(options: {
  userId: string;
  operation: string;
  ttlSeconds: number;
}): Promise<OperationLock | null> {
  const token = randomUUID();
  const key = createHash('sha256')
    .update(`${options.userId}:${options.operation}`)
    .digest('hex');
  const db = createAdminClient();
  const { data, error } = await db.rpc('acquire_operation_lock', {
    p_lock_key: key,
    p_user_id: options.userId,
    p_token: token,
    p_ttl_seconds: options.ttlSeconds,
  });
  if (error) throw new Error(`Operation locking is unavailable: ${error.message}`);
  return data === true ? { key, token } : null;
}

export async function releaseOperationLock(lock: OperationLock | null) {
  if (!lock) return;
  const db = createAdminClient();
  const { error } = await db.rpc('release_operation_lock', {
    p_lock_key: lock.key,
    p_token: lock.token,
  });
  if (error) console.error('Could not release operation lock:', error.message);
}
