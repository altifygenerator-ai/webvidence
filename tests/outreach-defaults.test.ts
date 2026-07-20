import { describe, expect, it } from 'vitest';
import { buildOutreachInstructions } from '@/lib/providers/messages';

const blockedFinding = {
  code: 'automated_check_blocked',
  label: 'Automated review was blocked',
  severity: 'high' as const,
  evidence: 'The website blocked the automated request.',
  metadata: {},
};

describe('conversation-first default outreach', () => {
  it('uses the neutral no-pitch profile when settings are empty', () => {
    const prompt = buildOutreachInstructions({
      name: 'Sample Roofing',
      category: 'Roofing contractor',
      city: 'Conway',
      state: 'Arkansas',
      website: 'https://example.com',
      channel: 'facebook',
      findings: [blockedFinding],
    });

    expect(prompt).toContain('The first message is never a sales pitch');
    expect(prompt).toContain('Ask exactly one question');
    expect(prompt).toContain('Business category: Roofing contractor');
    expect(prompt).toContain('Location: Conway, Arkansas');
    expect(prompt).not.toContain(blockedFinding.label);
    expect(prompt).not.toContain(blockedFinding.evidence);
  });

  it('keeps a saved user profile and verified findings in the custom-profile path', () => {
    const prompt = buildOutreachInstructions({
      name: 'Sample Roofing',
      category: 'Roofing contractor',
      city: 'Conway',
      state: 'Arkansas',
      website: 'https://example.com',
      channel: 'facebook',
      findings: [{
        code: 'missing_contact',
        label: 'Contact path is hard to find',
        severity: 'medium',
        evidence: 'No clear contact link was found.',
        metadata: {},
      }],
      outreachStyle: 'Keep the first message conversational and do not pitch.',
    });

    expect(prompt).toContain('Preferred voice and outreach rules');
    expect(prompt).toContain('Keep the first message conversational and do not pitch.');
    expect(prompt).toContain('Contact path is hard to find');
  });

  it('does not falsely call a blocked website a no-website lead after review', () => {
    const prompt = buildOutreachInstructions({
      name: 'Sample Roofing',
      category: 'Roofing contractor',
      city: 'Conway',
      state: 'Arkansas',
      website: 'https://example.com',
      channel: 'email',
      findings: [],
      outreachStyle: 'Keep it plain.',
    });

    expect(prompt).toContain('No usable website findings are available');
    expect(prompt).not.toContain('No website was listed on the business profile');
  });
});
