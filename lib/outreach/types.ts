export const OUTREACH_INTENTS = [
  'conversation',
  'website_finding',
  'follow_up',
  'service_intro',
] as const;

export type OutreachIntent = (typeof OUTREACH_INTENTS)[number];

export const REPLY_ACTIONS = [
  'ask_question',
  'introduce_service',
  'answer_directly',
  'suggest_call',
  'follow_up_later',
  'do_not_pitch',
  'mark_not_fit',
] as const;

export type ReplyAction = (typeof REPLY_ACTIONS)[number];

export const REPLY_ACTION_LABELS: Record<ReplyAction, string> = {
  ask_question: 'Ask one more question',
  introduce_service: 'Introduce the service',
  answer_directly: 'Answer their question directly',
  suggest_call: 'Suggest a call',
  follow_up_later: 'Follow up later',
  do_not_pitch: 'Do not pitch',
  mark_not_fit: 'Mark as not a fit',
};
