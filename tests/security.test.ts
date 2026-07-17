import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertTrustedMutation, RequestSecurityError } from '../lib/security/request';
import { getClientIp, hashRateLimitKey } from '../lib/security/rate-limit';
import { isPrivateOrReservedIp } from '../lib/providers/audit';

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('request security', () => {
  it('accepts same-origin JSON mutations', () => {
    const request = new Request('http://localhost:3000/api/search', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
    });
    expect(() => assertTrustedMutation(request, { requireJson: true })).not.toThrow();
  });

  it('rejects cross-site mutations', () => {
    const request = new Request('http://localhost:3000/api/search', {
      method: 'POST',
      headers: { origin: 'https://attacker.example', 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
    });
    expect(() => assertTrustedMutation(request, { requireJson: true })).toThrow(RequestSecurityError);
  });

  it('extracts forwarded IPs without storing raw values in rate-limit keys', () => {
    const request = new Request('http://localhost:3000/api/search', {
      headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.2' },
    });
    expect(getClientIp(request)).toBe('203.0.113.10');
    expect(hashRateLimitKey('ip:203.0.113.10')).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('website audit network safety', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '192.0.2.10',
    '198.51.100.10',
    '203.0.113.10',
    '::1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
  ])('blocks private or reserved address %s', (address) => {
    expect(isPrivateOrReservedIp(address)).toBe(true);
  });

  it('allows ordinary public addresses', () => {
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIp('2606:4700:4700::1111')).toBe(false);
  });
});

describe('paid-wall bypass guards', () => {
  it('meters and locks the expensive endpoints', () => {
    const searchRoute = source('app/api/search/route.ts');
    const auditRoute = source('app/api/audit/route.ts');
    const generateRoute = source('app/api/generate/route.ts');
    const auditQueue = source('lib/jobs/audits.ts');
    expect(searchRoute).toContain('consumeSearch(user)');
    expect(searchRoute).toContain('RATE_LIMITS.search');
    expect(searchRoute).toContain("operation: 'business-search'");
    expect(auditRoute).toContain('queueLeadAudits');
    expect(auditQueue).toContain('await consumeAudit(user)');
    expect(auditQueue).toContain("status: 'queued'");
    expect(auditQueue).toContain('A stale third attempt is closed');
    expect(auditQueue).toContain("credit_refunded: true");
    expect(generateRoute).toContain('consumeMessage(user)');
    expect(generateRoute).toContain('RATE_LIMITS.generate');
  });

  it('removes direct authenticated database writes and quota RPC access', () => {
    const migration = source('supabase/002_launch_security.sql');
    expect(migration).toContain('revoke insert, update, delete on public.campaigns from authenticated');
    expect(migration).toContain('revoke insert, update, delete on public.leads from authenticated');
    expect(migration).toContain('revoke insert, update, delete on public.messages from authenticated');
    expect(migration).toContain('revoke all on function public.consume_usage');
  });

  it('only grants paid access for active or trialing Stripe subscriptions', () => {
    const webhook = source('app/api/stripe/webhook/route.ts');
    expect(webhook).toContain("['active', 'trialing'].includes(subscription.status)");
    expect(webhook).toContain('uses an unrecognized Stripe price');
  });


  it('offers a card-required seven-day trial only on the Freelancer plan', () => {
    const checkout = source('app/api/stripe/checkout/route.ts');
    const pricing = source('components/plan-action.tsx');
    expect(checkout).toContain("plan !== 'freelancer'");
    expect(checkout).toContain("payment_method_collection: 'always'");
    expect(checkout).toContain('trial_period_days: 7');
    expect(checkout).toContain("missing_payment_method: 'cancel'");
    expect(checkout).toContain('!billing?.trial_end');
    expect(checkout).toContain('!billing?.stripe_subscription_id');
    expect(checkout).toContain('freelancer:trial-v1');
    expect(pricing).toContain('Start 7-day free trial');
    expect(pricing).toContain('$39/month after 7 days unless canceled');
  });
});


describe('launch functionality guards', () => {
  it('keeps free searches usable and caps each free result set server-side', () => {
    const searchRoute = source('app/api/search/route.ts');
    expect(searchRoute).toContain("user.plan === 'free'");
    expect(searchRoute).toContain('Math.min(input.maxResults, 10)');
    expect(searchRoute).toContain('Free searches return up to 10 businesses');
  });

  it('does not charge an analysis credit when Google has no website URL', () => {
    const queue = source('lib/jobs/audits.ts');
    const noWebsiteBranch = queue.indexOf('if (!lead.website)');
    const consumption = queue.indexOf('await consumeAudit(user)');
    expect(noWebsiteBranch).toBeGreaterThan(-1);
    expect(consumption).toBeGreaterThan(noWebsiteBranch);
  });

  it('uses a multi-page crawl and a recoverable database audit queue', () => {
    const audit = source('lib/providers/audit.ts');
    const queue = source('lib/jobs/audits.ts');
    const migration = source('supabase/004_functionality_upgrade.sql');
    expect(audit).toContain('const MAX_PAGES = 6');
    expect(audit).toContain('prioritizeInternalLinks');
    expect(queue).toContain('processQueuedAuditJobs');
    expect(queue).toContain('credit_refunded: true');
    expect(migration).toContain('audit_jobs_one_open_per_lead_uidx');
  });

  it('includes password recovery and confirmation resend flows', () => {
    expect(source('app/forgot-password/page.tsx')).toContain('resetPasswordForEmail');
    expect(source('app/reset-password/page.tsx')).toContain('updateUser({ password })');
    expect(source('app/resend-confirmation/page.tsx')).toContain("type: 'signup'");
  });

  it('limits permanent bulk deletion to archived leads in the same workspace', () => {
    const bulk = source('app/api/leads/bulk/route.ts');
    expect(bulk).toContain("lead.status === 'archived'");
    expect(bulk).toContain(".eq('workspace_id', user.workspaceId)");
  });
});

describe('broader market discovery', () => {
  it('caps Google request coverage by plan and keeps mixed search as the backward-compatible default', () => {
    const route = source('app/api/search/route.ts');
    const provider = source('lib/providers/google-places.ts');
    const campaignPage = source('app/dashboard/campaigns/page.tsx');
    expect(route).toContain("resultMode: z.enum(['mixed', 'best_match', 'hidden', 'closest']).default('mixed')");
    expect(route).toContain('free: { requestBudget: 2, poolSize: 30 }');
    expect(route).toContain('freelancer: { requestBudget: 5, poolSize: 80 }');
    expect(route).toContain('studio: { requestBudget: 8, poolSize: 120 }');
    expect(provider).toContain('buildSearchAreas');
    expect(provider).toContain('excludePlaceIds');
    expect(campaignPage).toContain('Mixed opportunities');
    expect(campaignPage).toContain('Hidden opportunities');
  });
});

describe('worldwide market search', () => {
  it('removes the hardcoded U.S. restriction while keeping country-aware searches', () => {
    const provider = source('lib/providers/google-places.ts');
    const route = source('app/api/search/route.ts');
    expect(provider).not.toContain("country:US");
    expect(provider).not.toContain("regionCode: 'US'");
    expect(provider).toContain('countryCode?: string');
    expect(provider).toContain('placeCountryCode !== countryCode.toUpperCase()');
    expect(route).toContain('city: optionalText');
    expect(route).toContain('region: optionalText');
    expect(route).toContain('countryCode: optionalText');
    expect(route).toContain('// `location` remains supported for older clients');
  });
});
