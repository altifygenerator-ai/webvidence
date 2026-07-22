import { describe, expect, it } from 'vitest';
import { buildReplyInstructions, enforceReplyAnalysisSafety, fallbackReplyAnalysis } from '@/lib/providers/replies';

const base = {
  businessName: 'Sample Roofing',
  category: 'Roofing contractor',
  location: 'Conway, Arkansas',
  previousMessages: [{ direction: 'outbound', body: 'Where does most of your work come from?', channel: 'facebook' }],
};

describe('reply planning', () => {
  it('respects not-a-fit replies', () => {
    const result = fallbackReplyAnalysis({ ...base, prospectReply: 'No thanks, we already have someone.' });
    expect(result.needStatus).toBe('not_a_fit');
    expect(result.recommendedAction).toBe('mark_not_fit');
    expect(result.suggestedResponse).not.toMatch(/website|call|help/i);
  });

  it('does not pitch when no need is clear', () => {
    const result = fallbackReplyAnalysis({ ...base, prospectReply: 'Thanks for reaching out.' });
    expect(result.needStatus).toBe('not_clear');
    expect(result.recommendedAction).toBe('do_not_pitch');
  });

  it('asks another question for a possible growth need', () => {
    const result = fallbackReplyAnalysis({ ...base, prospectReply: 'Most work is from Facebook but we want more commercial jobs.' });
    expect(result.needStatus).toBe('possible_need');
    expect(result.recommendedAction).toBe('ask_question');
  });

  it('can recommend a service introduction after a clear need', () => {
    const result = fallbackReplyAnalysis({ ...base, prospectReply: 'We need a new website. How much does that cost?' });
    expect(result.needStatus).toBe('clear_need');
    expect(result.recommendedAction).toBe('introduce_service');
  });

  it('ignores an unsafe service-introduction override when the need is unclear', () => {
    const result = fallbackReplyAnalysis({
      ...base,
      prospectReply: 'Thanks for reaching out.',
      preferredAction: 'introduce_service',
    });
    expect(result.recommendedAction).toBe('do_not_pitch');
  });

  it('blocks inconsistent AI output from introducing a service without a clear need', () => {
    const result = enforceReplyAnalysisSafety(
      { ...base, prospectReply: 'Most work is from Facebook but we want more commercial jobs.' },
      {
        summary: 'They may want to grow.',
        needStatus: 'possible_need',
        recommendedAction: 'introduce_service',
        suggestedResponse: 'I can build you a better website.',
        reasoning: 'Pitch now.',
      },
    );
    expect(result.recommendedAction).toBe('ask_question');
    expect(result.suggestedResponse).not.toMatch(/build you|website/i);
  });

  it('uses an obvious editable placeholder when a direct answer cannot be inferred safely', () => {
    const result = fallbackReplyAnalysis({ ...base, prospectReply: 'What exactly do you mean?' });
    expect(result.recommendedAction).toBe('answer_directly');
    expect(result.suggestedResponse).toContain('[Add your direct answer here before sending.]');
  });

  it('requires structured output and hides reasoning by default in the UI', () => {
    const prompt = buildReplyInstructions({ ...base, prospectReply: 'We want more commercial work.' });
    expect(prompt).toContain('Return valid JSON only');
    expect(prompt).toContain('Choose one recommended action only');
  });
});
