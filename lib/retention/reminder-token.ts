import crypto from 'node:crypto';
import { env } from '@/lib/env';

function signingSecret() {
  return env.CRON_SECRET || env.SUPABASE_SECRET_KEY || '';
}

export function makeReminderUnsubscribeToken(userId: string) {
  const secret = signingSecret();
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update(`unsubscribe:${userId}`).digest('hex');
}

export function verifyReminderUnsubscribeToken(userId: string, signature: string) {
  const expected = makeReminderUnsubscribeToken(userId);
  if (!expected || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(signature, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
