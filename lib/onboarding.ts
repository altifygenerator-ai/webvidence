export type OnboardingStage =
  | 'first_search'
  | 'review'
  | 'draft'
  | 'send'
  | 'repeat'
  | 'active';

export function getOnboardingStage(input: {
  searches: number;
  reviews: number;
  messages: number;
  sentMessages: number;
  repeatEstablished: boolean;
}): OnboardingStage {
  if (input.searches <= 0) return 'first_search';
  if (input.reviews <= 0) return 'review';
  if (input.messages <= 0) return 'draft';
  if (input.sentMessages <= 0) return 'send';
  if (!input.repeatEstablished) return 'repeat';
  return 'active';
}

export function onboardingStep(stage: OnboardingStage) {
  if (stage === 'first_search') return 0;
  if (stage === 'review') return 1;
  if (stage === 'draft') return 2;
  if (stage === 'send') return 3;
  if (stage === 'repeat') return 4;
  return 5;
}
