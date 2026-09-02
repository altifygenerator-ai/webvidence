import { createHmac, timingSafeEqual } from 'node:crypto';

function secret() {
  const value = process.env.CRON_SECRET;
  if (!value || value.length < 16) throw new Error('CRON_SECRET is required for reminder preference links.');
  return value;
}

export function createUnsubscribeToken(userId: string) {
  const expires = Math.floor(Date.now() / 1000) + 90 * 86400;
  const payload = `${userId}.${expires}`;
  const signature = createHmac('sha256', secret()).update(payload).digest('base64url');
  return Buffer.from(`${payload}.${signature}`).toString('base64url');
}

export function verifyUnsubscribeToken(token: string) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [userId, rawExpires, signature] = decoded.split('.');
    if (!userId || !rawExpires || !signature || Number(rawExpires) < Date.now() / 1000) return null;
    const expected = createHmac('sha256', secret()).update(`${userId}.${rawExpires}`).digest('base64url');
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
    return userId;
  } catch { return null; }
}
