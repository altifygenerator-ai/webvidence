import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

describe('product-ready prospecting flow', () => {
  it('makes Today, Find, Pipeline, and Settings the primary navigation', () => {
    const shell = source('components/app-shell.tsx');
    expect(shell).toContain("['Today', '/dashboard', '01']");
    expect(shell).toContain("['Find', '/dashboard/campaigns', '02']");
    expect(shell).toContain("['Pipeline', '/dashboard/leads', '03']");
    expect(shell).toContain("['Settings', '/dashboard/settings', '04']");
    expect(shell).not.toContain("['Overview'");
    expect(shell).toContain('Plan &amp; billing');
  });

  it('uses one focused three-prospect session surface with a real stopping point', () => {
    const today = source('components/today-session.tsx');
    const bar = source('components/lead-session-bar.tsx');
    expect(today).toContain('Start session');
    expect(today).toContain('You&apos;re done for today.');
    expect(today).toContain('Start another session');
    expect(today).toContain('SessionDots');
    expect(bar).toContain('Prospect {Math.min(props.position, props.targetSize)} of {props.targetSize}');
    expect(bar).toContain('Not a fit');
    expect(bar).toContain('pass-reason-chips');
    expect(bar).not.toContain('<select');
  });

  it('keeps the prospect decision simple and progressively discloses audit machinery', () => {
    const lead = source('app/dashboard/leads/[id]/page.tsx');
    expect(lead).toContain('lead-decision-card');
    expect(lead).toContain('Why this is worth a look');
    expect(lead).toContain('More about this business');
    expect(lead).toContain('prospect-more-disclosure');
    expect(lead.indexOf('<OutreachComposer')).toBeLessThan(lead.indexOf('prospect-more-disclosure'));
  });

  it('generates conversation-first outreach before exposing advanced draft options', () => {
    const composer = source('components/outreach-composer.tsx');
    expect(composer).toContain('Start conversation');
    expect(composer).toContain('Preparing your draft…');
    expect(composer).toContain('Ready to send');
    expect(composer).toContain('Change approach');
    expect(composer).toContain('Copy & open Facebook');
    expect(composer).toContain('Open email with draft');
    expect(composer).toContain('Did you send the message?');
  });

  it('collapses the full search result list behind the prepared session', () => {
    const find = source('app/dashboard/campaigns/page.tsx');
    expect(find).toContain('recommendations.length === 1');
    expect(find).toContain('Start ${recommendations.length}-prospect session');
    expect(find).toContain('all-results-disclosure');
    expect(find).toContain('Browse all {leads.length} results');
  });

  it('keeps post-success routine setup compact', () => {
    const routine = source('components/routine-settings-form.tsx');
    expect(routine).toContain('Want another batch ready later this week?');
    expect(routine).toContain('Save next routine');
    expect(routine).toContain('routine-customize');
  });

  it('keeps the reminder import paired with an exported session starter', () => {
    const session = source('lib/retention/session.ts');
    const reminders = source('lib/retention/reminders.ts');
    expect(session).toContain('export async function startProspectingSession');
    expect(reminders).toContain("import { startProspectingSession } from '@/lib/retention/session'");
  });

  it.each([760, 430, 390, 375, 320])('retains a responsive guard at %spx', (width) => {
    const css = source('app/application.css');
    expect(css).toContain(`@media(max-width:${width}px)`);
  });
});
