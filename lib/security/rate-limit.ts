import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export type RateLimitPolicy = {
  route: string;
  user: { limit: number; windowSeconds: number };
  ip?: { limit: number; windowSeconds: number };
};

export class RateLimitError extends Error {
  retryAfter: number;

  constructor(message: string, retryAfter: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = Math.max(1, Math.ceil(retryAfter));
  }
}

type RateLimitResult = {
  allowed?: boolean;
  remaining?: number;
  reset_at?: string;
};

export const RATE_LIMITS = {
  search: {
    route: 'search',
    user: { limit: 6, windowSeconds: 600 },
    ip: { limit: 24, windowSeconds: 600 },
  },
  audit: {
    route: 'audit',
    user: { limit: 20, windowSeconds: 300 },
    ip: { limit: 60, windowSeconds: 300 },
  },
  generate: {
    route: 'generate',
    user: { limit: 30, windowSeconds: 300 },
    ip: { limit: 90, windowSeconds: 300 },
  },
  checkout: {
    route: 'stripe_checkout',
    user: { limit: 5, windowSeconds: 900 },
    ip: { limit: 20, windowSeconds: 900 },
  },
  portal: {
    route: 'stripe_portal',
    user: { limit: 10, windowSeconds: 600 },
    ip: { limit: 30, windowSeconds: 600 },
  },
  mutation: {
    route: 'workspace_mutation',
    user: { limit: 60, windowSeconds: 60 },
    ip: { limit: 180, windowSeconds: 60 },
  },
  export: {
    route: 'lead_export',
    user: { limit: 10, windowSeconds: 600 },
    ip: { limit: 30, windowSeconds: 600 },
  },
  admin: {
    route: 'admin_mutation',
    user: { limit: 30, windowSeconds: 600 },
    ip: { limit: 60, windowSeconds: 600 },
  },
} satisfies Record<string, RateLimitPolicy>;

export async function enforceRateLimit(req: Request, userId: string, policy: RateLimitPolicy) {
  await checkBucket(`user:${userId}`, policy.route, policy.user);

  const ip = getClientIp(req);
  if (policy.ip && ip) {
    await checkBucket(`ip:${ip}`, policy.route, policy.ip);
  }
}

async function checkBucket(rawKey: string, route: string, rule: { limit: number; windowSeconds: number }) {
  const db = createAdminClient();
  const { data, error } = await db.rpc('check_rate_limit', {
    p_key_hash: hashRateLimitKey(rawKey),
    p_route: route,
    p_window_seconds: rule.windowSeconds,
    p_limit: rule.limit,
  });

  if (error) {
    // Fail closed for expensive or state-changing routes. A missing migration must
    // not silently expose unlimited provider usage.
    throw new Error(`Rate limiting is unavailable: ${error.message}`);
  }

  const result = (data || {}) as RateLimitResult;
  if (result.allowed === false) {
    const resetAt = result.reset_at ? Date.parse(result.reset_at) : Date.now() + rule.windowSeconds * 1000;
    const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    throw new RateLimitError('Too many requests. Wait a moment and try again.', retryAfter);
  }
}

export function getClientIp(req: Request) {
  const candidates = [
    req.headers.get('cf-connecting-ip'),
    req.headers.get('x-real-ip'),
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
  ];
  return candidates.find((value) => Boolean(value)) || null;
}

export function hashRateLimitKey(value: string) {
  const salt = process.env.RATE_LIMIT_SALT || process.env.SUPABASE_SECRET_KEY || 'webvidence-local-rate-limit';
  return createHash('sha256').update(`${salt}:${value}`).digest('hex');
}
