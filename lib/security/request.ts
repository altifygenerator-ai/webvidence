import { env } from '@/lib/env';

export class RequestSecurityError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = 'RequestSecurityError';
    this.status = status;
  }
}

/**
 * Reject cross-site mutations that could otherwise ride an authenticated cookie.
 * This is intentionally checked on every state-changing app route. Stripe webhooks
 * are excluded because their signature is the authentication mechanism.
 */
export function assertTrustedMutation(req: Request, options?: { requireJson?: boolean }) {
  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site') {
    throw new RequestSecurityError('Cross-site requests are not allowed.');
  }

  const origin = req.headers.get('origin');
  if (origin) {
    const allowed = new Set<string>();
    try {
      allowed.add(new URL(req.url).origin);
    } catch {
      // Ignore malformed request URL; the framework will reject it separately.
    }
    try {
      allowed.add(new URL(env.NEXT_PUBLIC_APP_URL).origin);
    } catch {
      // env is schema validated, but keep this guard defensive.
    }

    if (!allowed.has(origin)) {
      throw new RequestSecurityError('Request origin is not allowed.');
    }
  }

  if (options?.requireJson) {
    const contentType = req.headers.get('content-type')?.toLowerCase() || '';
    if (!contentType.startsWith('application/json')) {
      throw new RequestSecurityError('This endpoint requires JSON.', 415);
    }
  }
}
