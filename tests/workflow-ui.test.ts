import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const source = (file: string) => readFileSync(join(root, file), 'utf8');

describe('focused lead workflow', () => {
  it('shows one status-aware next-step area and explicit intent choices', () => {
    const composer = source('components/outreach-composer.tsx');
    expect(composer).toContain('Next step');
    expect(composer).toContain('Start a conversation');
    expect(composer).toContain('Use a website finding');
    expect(composer).toContain('Follow up');
    expect(composer).toContain('useState<OutreachIntent>("conversation")');
    expect(composer).toContain('Noticed something about this business? Add it');
  });

  it('does not expose reply planning until the prospect replied', () => {
    const composer = source('components/outreach-composer.tsx');
    expect(composer).toContain('They replied');
    expect(composer).toContain('What did they say?');
    expect(composer).toContain('Why Webvidence suggested this');
    expect(composer).not.toContain('floating-chat');
  });

  it('keeps evidence and history behind progressive disclosure', () => {
    const leadPage = source('app/dashboard/leads/[id]/page.tsx');
    const composer = source('components/outreach-composer.tsx');
    expect(leadPage).toContain('<details className="evidence-file-section evidence-disclosure">');
    expect(composer).toContain('<details className="message-history-disclosure">');
    expect(composer).toContain('<details className="lead-tracking-details">');
  });
});

describe('campaign and pipeline focus', () => {
  it('presents recommendations as businesses to review, not guaranteed buyers', () => {
    const page = source('app/dashboard/campaigns/page.tsx');
    expect(page).toContain('Best places to review first');
    expect(page).toContain('Based on the available business details');
    expect(page).toContain("item.signals.slice(0, 2)");
    expect(page).toContain('Review business');
    expect(page).not.toContain('Best places to start');
  });

  it('keeps the pipeline compact and subordinates bulk actions', () => {
    const table = source('components/leads-table.tsx');
    expect(table).toContain('Bulk actions');
    expect(table).toContain('<span>Last contact</span>');
    expect(table).toContain('<span>Next action</span>');
    expect(table).toContain('<span>Due</span>');
    expect(table).toContain('>Open</Link>');
    expect(table).not.toContain('Full findings');
    expect(table).not.toContain('LeadAnalysisButton');
  });
});

describe('mobile workflow', () => {
  it('renders one sticky primary action and safe mobile sheets', () => {
    const composer = source('components/outreach-composer.tsx');
    const css = source('app/globals.css');
    expect(composer).toContain('mobile-outreach-dock');
    expect(composer).toContain('buildMobileAction');
    expect(css).toContain('safe-area-inset-bottom');
    expect(css).toContain('max-height:88dvh');
    expect(css).toContain('font-size:16px');
    expect(css).toContain('@media(max-width:390px)');
  });

  it('preserves direct email and text handoff without automatic sending', () => {
    const composer = source('components/outreach-composer.tsx');
    expect(composer).toContain('Open email app');
    expect(composer).toContain('Open text app');
    expect(composer).toContain('Did you send the message?');
    expect(composer).toContain('Webvidence never sends automatically');
  });
});

describe('persistence and failure safety', () => {
  it('uses an additive migration and existing message directions', () => {
    const migration = source('supabase/007_conversation_workflow.sql').toLowerCase();
    expect(migration).toContain('add column if not exists business_observation');
    expect(migration).toContain('parent_message_id');
    expect(migration).toContain('row-level security');
    expect(migration).not.toContain('drop table');
    expect(migration).not.toContain('truncate ');
  });

  it('preserves an inbound reply when response generation fails', () => {
    const route = source('app/api/replies/route.ts');
    const saveIndex = route.indexOf("direction: 'inbound'");
    const analyzeIndex = route.indexOf('const result = await analyzeReply');
    expect(saveIndex).toBeGreaterThan(-1);
    expect(analyzeIndex).toBeGreaterThan(saveIndex);
    expect(route).toContain('The reply was saved, but Webvidence could not prepare a response');
  });

  it('requires a clear saved need before server-side service-introduction generation', () => {
    const generate = source('app/api/generate/route.ts');
    expect(generate).toContain("latestReply?.recommended_action !== 'introduce_service'");
    expect(generate).toContain("lead.status !== 'interested'");
  });

  it('uses operation locks and workspace scopes for duplicate and cross-workspace protection', () => {
    const generate = source('app/api/generate/route.ts');
    const replies = source('app/api/replies/route.ts');
    expect(generate).toContain('acquireOperationLock');
    expect(replies).toContain('acquireOperationLock');
    expect(generate).toContain(".eq('workspace_id', user.workspaceId)");
    expect(replies).toContain(".eq('workspace_id', user.workspaceId)");
  });
});
