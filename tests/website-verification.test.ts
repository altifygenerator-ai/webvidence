import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  auditIsCurrentForWebsite,
  normalizeWebsiteInput,
  websiteStatusDescription,
  websiteStatusLabel,
} from '@/lib/leads/website';
import { auditWebsite } from '@/lib/providers/audit';
import { getContactRecommendation } from '@/lib/leads/recommendation';

const source = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

describe('website provenance wording', () => {
  it('does not claim a missing Google website field proves no website exists', () => {
    expect(websiteStatusLabel({ website: null })).toBe('Not linked on Google');
    expect(websiteStatusDescription({ website: null })).toContain('does not prove');
  });

  it('distinguishes Google-linked and user-confirmed websites', () => {
    expect(websiteStatusLabel({
      website: 'https://example.com/',
      source: 'google_places',
      verificationStatus: 'google_linked',
    })).toBe('Linked on Google');
    expect(websiteStatusLabel({
      website: 'https://example.com/',
      source: 'user',
      verificationStatus: 'user_confirmed',
    })).toBe('Added and confirmed by you');
  });
});

describe('website correction safety', () => {
  it('normalizes a plain domain and rejects non-web protocols', () => {
    expect(normalizeWebsiteInput('example.com')).toBe('https://example.com/');
    expect(() => normalizeWebsiteInput('ftp://example.com')).toThrow(/HTTP or HTTPS/);
  });

  it('treats audits created before a website correction as stale', () => {
    expect(auditIsCurrentForWebsite('2026-07-20T12:00:00.000Z', '2026-07-21T12:00:00.000Z')).toBe(false);
    expect(auditIsCurrentForWebsite('2026-07-22T12:00:00.000Z', '2026-07-21T12:00:00.000Z')).toBe(true);
  });

  it('uses a protected workspace-scoped update route and additive migration', () => {
    const route = source('app/api/leads/website/route.ts');
    const migration = source('supabase/008_website_verification.sql').toLowerCase();
    expect(route).toContain('assertTrustedMutation');
    expect(route).toContain('validatePublicUrl');
    expect(route).toContain(".eq('workspace_id', user.workspaceId)");
    expect(route).toContain("website_source: 'user'");
    expect(migration).toContain('add column if not exists website_source');
    expect(migration).toContain("where code = 'no_site'");
    expect(migration).toContain('58 + case');
    expect(migration).not.toContain('drop table');
    expect(migration).not.toContain('truncate ');
  });
});

describe('missing Google website evidence', () => {
  it('uses cautious wording and a moderate score', async () => {
    const audit = await auditWebsite(null, { runPageSpeed: false, maxPages: 1 });
    expect(audit.findings[0].label).toBe('No website linked on the Google listing');
    expect(audit.findings[0].evidence).toContain('may still have a website elsewhere');
    expect(audit.score).toBe(58);
  });

  it('does not let a missing Google link dominate recommendations by itself', () => {
    const recommendation = getContactRecommendation({
      id: 'lead-no-google-site',
      name: 'Example Service',
      website: null,
      phone: '555-0100',
      googleMapsUrl: 'https://maps.example.com',
      reviews: 12,
      rating: 4.7,
      opportunityScore: 59,
      status: 'reviewing',
      auditStatus: 'completed',
      audit: {
        status: 'completed',
        findings: [{
          code: 'no_site',
          label: 'No website linked on the Google listing',
          severity: 'medium',
        }],
      },
    });
    const verifiedWebsiteRecommendation = getContactRecommendation({
      id: 'lead-verified-site',
      name: 'Verified Service',
      website: 'https://example.com/',
      phone: '555-0101',
      googleMapsUrl: 'https://maps.example.com/verified',
      reviews: 25,
      rating: 4.8,
      opportunityScore: 75,
      status: 'reviewing',
      auditStatus: 'completed',
      audit: {
        status: 'completed',
        findings: [{
          code: 'performance',
          label: 'Mobile performance has room to improve',
          severity: 'high',
        }],
      },
    });

    expect(recommendation?.reason).toContain('before assuming');
    expect(recommendation?.signals).toContain('No website linked on Google');
    expect(verifiedWebsiteRecommendation?.rank).toBeGreaterThan(recommendation?.rank || 0);
  });
});
