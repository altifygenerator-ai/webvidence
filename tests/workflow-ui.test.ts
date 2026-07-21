import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const source = (file: string) => readFileSync(join(root, file), 'utf8');

describe('mobile workspace navigation', () => {
  it('uses a numbered 1 through 4 quick bar and avoids refresh races', () => {
    const shell = source('components/app-shell.tsx');
    expect(shell).toContain('["Settings", "/dashboard/settings", "04"]');
    expect(shell).toContain('controller.abort()');
    expect(shell).not.toContain('router.refresh()');
  });

  it('pins the quick bar to the physical viewport bottom', () => {
    const css = source('app/globals.css');
    expect(css).toContain('inset-block-end: 0 !important');
    expect(css).toContain('translate3d(0, 0, 0)');
  });
});

describe('direct outreach handoff', () => {
  it('opens email and text apps without automatically sending', () => {
    const composer = source('components/outreach-composer.tsx');
    const links = source('lib/outreach/links.ts');
    expect(links).toContain('mailto:');
    expect(links).toContain('sms:');
    expect(composer).toContain('Open email app');
    expect(composer).toContain('Open text app');
    expect(composer).toContain('buildMailtoHref');
    expect(composer).toContain('buildSmsHref');
    expect(composer).not.toContain('new URLSearchParams');
    expect(composer).toMatch(/does not\s+send it/);
    expect(composer).toMatch(/mark it sent automatically/);
  });
});

describe('contact history and pipeline controls', () => {
  it('returns lead status with both fresh and reopened campaign results', () => {
    expect(source('app/api/search/route.ts')).toContain('status,\n      audit: null');
    expect(source('app/api/campaigns/route.ts')).toContain('status: lead.status');
    expect(source('app/dashboard/campaigns/page.tsx')).toContain('Open contacted lead');
  });

  it('supports the requested pipeline sorting and compact score treatment', () => {
    const page = source('app/dashboard/leads/page.tsx');
    const table = source('components/leads-table.tsx');
    expect(page).toContain('["score_desc", "Highest score"]');
    expect(page).toContain('["score_asc", "Lowest score"]');
    expect(page).toContain('["recent", "Most recently searched"]');
    expect(page).toContain('["no_website", "No website first"]');
    expect(page).toContain('active leads saved');
    expect(table).toContain('lead-score-inline');
    expect(table).not.toContain('<span>Score</span>');
  });
});


describe('manual website review acknowledgement', () => {
  it('lets the user clear the manual-review gate without changing audit evidence', () => {
    const notice = source('components/manual-review-notice.tsx');
    const leadRoute = source('app/api/leads/[id]/route.ts');
    const generateRoute = source('app/api/generate/route.ts');

    expect(notice).toContain('Mark as reviewed');
    expect(notice).toContain('manualReviewCompleted: true');
    expect(leadRoute).toContain('manualReviewCompleted: z.literal(true).optional()');
    expect(leadRoute).toContain('update.manual_review_required = false');
    expect(generateRoute).toContain('lead.manual_review_required === true');
    expect(generateRoute).toContain('click “Mark as reviewed”');
  });
});


describe('smart outreach momentum', () => {
  it('highlights recommended leads without adding database fields', () => {
    const searchPage = source('app/dashboard/campaigns/page.tsx');
    const recommendation = source('lib/leads/recommendation.ts');
    expect(searchPage).toContain('Best places to start');
    expect(searchPage).toContain('getTopContactRecommendations');
    expect(searchPage).toContain('Add 3 more');
    expect(recommendation).toContain('Phone available');
  });

  it('asks for one send confirmation and keeps bookkeeping automatic', () => {
    const composer = source('components/outreach-composer.tsx');
    expect(composer).toContain('Did you send the message?');
    expect(composer).toContain('Yes, mark sent');
    expect(composer).toContain('Review next lead');
    expect(composer).toContain('Lead tracking and notes');
  });
});
