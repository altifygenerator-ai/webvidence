import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  leadFromMarketHref,
  marketResultsHref,
  sessionCompleteHref,
  sessionLeadHref,
} from '../lib/navigation/prospect-flow';

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const LEAD_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';

describe('Find -> prospect -> market routing', () => {
  it('gives every saved market a stable URL that can be reopened after navigation', () => {
    expect(marketResultsHref(CAMPAIGN_ID)).toBe(`/dashboard/campaigns?campaign=${CAMPAIGN_ID}#campaign-results`);
    const page = source('app/dashboard/campaigns/page.tsx');
    expect(page).toContain("new URLSearchParams(window.location.search).get('campaign')");
    expect(page).toContain('void openCampaign(campaign, false)');
    expect(page).toContain('window.history.pushState');
    expect(page).toContain('window.history.replaceState');
  });

  it('preserves the originating market and remaining queue on a lead link', () => {
    const href = leadFromMarketHref({ leadId: LEAD_ID, campaignId: CAMPAIGN_ID, queue: ['a', 'b'] });
    expect(href).toContain(`/dashboard/leads/${LEAD_ID}?`);
    expect(href).toContain('source=search');
    expect(href).toContain(`campaign=${CAMPAIGN_ID}`);
    expect(href).toContain('queue=a%2Cb');
    expect(href).toEndWith('#outreach');
  });

  it('returns a manually worked Find prospect to the exact saved market', () => {
    const lead = source('app/dashboard/leads/[id]/page.tsx');
    const composer = source('components/outreach-composer.tsx');
    expect(lead).toContain('const marketReturnHref = originCampaignId ? marketResultsHref(originCampaignId) : null');
    expect(lead).toContain('returnHref={marketReturnHref}');
    expect(lead).toContain('returnLabel={marketReturnHref ? "Back to market" : null}');
    expect(composer).toContain('returnHref && !sessionId && (leadStage === "waiting" || leadStage === "closed")');
    expect(composer).toContain('{returnLabel || "Back to market"}');
  });

  it('keeps the market context through a prepared session and its completion screen', () => {
    expect(sessionLeadHref({ leadId: LEAD_ID, sessionId: SESSION_ID, campaignId: CAMPAIGN_ID }))
      .toContain(`campaign=${CAMPAIGN_ID}`);
    expect(sessionCompleteHref(CAMPAIGN_ID)).toBe(`/dashboard?session=complete&campaign=${CAMPAIGN_ID}`);
    const bar = source('components/lead-session-bar.tsx');
    const today = source('components/today-session.tsx');
    expect(bar).toContain('sessionCompleteHref(props.campaignId)');
    expect(today).toContain('Back to market');
  });

  it('does not claim one market as the return target for a mixed Today session', () => {
    const route = source('app/api/sessions/route.ts');
    expect(route).toContain('const selectedCampaignIds = new Set');
    expect(route).toContain('selectedCampaignIds.size === 1');
    expect(route).toContain('campaign_id: sessionCampaignId');
    expect(route).toContain('campaignId: session.campaign_id');
  });
});

describe('saved-market resume state', () => {
  it('makes the market itself the primary tap target and exposes unfinished prospects first', () => {
    const page = source('app/dashboard/campaigns/page.tsx');
    expect(page).toContain('className="campaign-market-open"');
    expect(page).toContain('still to work');
    expect(page).toContain("resultFilter === 'unworked'");
    expect(page).toContain('Still to work');
    expect(page).toContain('All saved');
    expect(page).toContain('total_count: loadedLeads.length');
    expect(page).toContain('unworked_count: unworkedCount');
    const css = source('app/application.css');
    expect(css).toContain('.app-frame .campaign-market-open{');
    expect(css).toContain('.app-frame .campaign-actions .btn{width:100%;min-width:0;min-height:44px');
  });


  it('does not silently move a previously saved business into a newer overlapping market', () => {
    const route = source('app/api/search/route.ts');
    expect(route).toContain('priorWorkspaceLeads');
    expect(route).toContain("existing?.campaign_id && existing.campaign_id !== options.campaignId");
    expect(route).toContain('continue;');
  });

  it('defines unworked consistently from both contact timestamp and terminal states', () => {
    const route = source('app/api/campaigns/route.ts');
    const page = source('app/dashboard/campaigns/page.tsx');
    expect(route).toContain('first_contacted_at');
    expect(route).toContain("!lead.passed_at && !lead.first_contacted_at");
    expect(page).toContain('!lead.passedAt && !lead.firstContactedAt && !isContactedLead(lead.status)');
  });
});

describe('retention state compatibility', () => {
  it('uses the post-010 ready/working session states throughout the session helper', () => {
    const session = source('lib/retention/session.ts');
    expect(session).toContain(".in('status', ['ready', 'active'])");
    expect(session).toContain("['ready', 'working'].includes(item.status)");
    expect(session).not.toContain("['pending', 'working'].includes(item.status)");
  });

  it('uses the canonical inactive pass reason expected by migration 010', () => {
    const session = source('lib/retention/session.ts');
    const bar = source('components/lead-session-bar.tsx');
    expect(session).toContain("'inactive_business'");
    expect(bar).toContain("['inactive_business', 'Looks inactive']");
  });
});
