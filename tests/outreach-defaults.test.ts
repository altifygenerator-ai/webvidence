import { describe, expect, it } from 'vitest';
import { buildOutreachInstructions, isSafeGeneratedMessage, plainFinding } from '@/lib/providers/messages';

const verifiedFinding = {
  code: 'missing_click_to_call',
  label: 'Phone number is not clickable',
  severity: 'medium' as const,
  evidence: 'The phone number is plain text on the mobile page.',
  metadata: {},
};

function baseInput() {
  return {
    name: 'Sample Roofing',
    category: 'Roofing contractor',
    city: 'Conway',
    state: 'Arkansas',
    website: 'https://example.com',
    channel: 'facebook' as const,
    findings: [verifiedFinding],
  };
}

describe('intent-aware outreach prompts', () => {
  it('keeps conversation-first as the explicit default without a profile', () => {
    const prompt = buildOutreachInstructions({ ...baseInput(), intent: 'conversation' });
    expect(prompt).toContain('MESSAGE TYPE: Start a conversation');
    expect(prompt).toContain('Ask exactly one natural question');
    expect(prompt).toContain('Business category: Roofing contractor');
    expect(prompt).not.toContain(verifiedFinding.evidence);
    expect(prompt).toContain('Do not mention the website, a website review, SEO, an audit');
  });

  it('keeps conversation-first with a completed profile', () => {
    const prompt = buildOutreachInstructions({
      ...baseInput(),
      intent: 'conversation',
      serviceDescription: 'Websites for local service businesses',
      targetCustomer: 'Active contractors',
      typicalProjectRange: '$500 to $2,000',
      baseLocation: 'Amity, Arkansas',
      outreachStyle: 'Plainspoken and short.',
    });
    expect(prompt).toContain('MESSAGE TYPE: Start a conversation');
    expect(prompt).toContain('Sender service context: Websites for local service businesses');
    expect(prompt).not.toContain(verifiedFinding.evidence);
  });

  it('rejects AI output that violates the selected conversation-first intent', () => {
    expect(isSafeGeneratedMessage(
      { ...baseInput(), intent: 'conversation' },
      { subject: null, body: 'I reviewed your website and found an SEO problem. Want me to fix it?' },
    )).toBe(false);
    expect(isSafeGeneratedMessage(
      { ...baseInput(), intent: 'conversation' },
      { subject: null, body: 'Hey, are most of your new jobs still coming through referrals?' },
    )).toBe(true);
  });

  it('uses only a verified finding in website-finding mode', () => {
    const prompt = buildOutreachInstructions({ ...baseInput(), intent: 'website_finding' });
    expect(prompt).toContain('MESSAGE TYPE: Use a website finding');
    expect(prompt).toContain('The phone number did not open the call screen on my phone.');
    expect(prompt).toContain('Use one verified finding only');
    expect(plainFinding(verifiedFinding)).not.toMatch(/viewport|DOM|PageSpeed/i);
  });

  it('uses the previous sent message for follow-up mode', () => {
    const prompt = buildOutreachInstructions({
      ...baseInput(),
      intent: 'follow_up',
      previousMessage: 'Are most of your jobs still coming through referrals?',
      previousSentAt: '2026-07-21T12:00:00.000Z',
      previousChannel: 'facebook',
      followUpStep: 1,
    });
    expect(prompt).toContain('MESSAGE TYPE: Follow up after no reply');
    expect(prompt).toContain('Are most of your jobs still coming through referrals?');
    expect(prompt).toContain('Current follow-up stage: 2 of 3');
    expect(prompt).toContain('Do not repeat the original pitch');
  });

  it('treats a business observation as optional user-supplied context', () => {
    const withoutObservation = buildOutreachInstructions({ ...baseInput(), intent: 'conversation' });
    const withObservation = buildOutreachInstructions({
      ...baseInput(),
      intent: 'conversation',
      businessObservation: 'They posted a new deck project yesterday.',
    });
    expect(withoutObservation).toContain('No specific observation was supplied');
    expect(withObservation).toContain('User-entered observation');
    expect(withObservation).toContain('They posted a new deck project yesterday.');
  });
});
