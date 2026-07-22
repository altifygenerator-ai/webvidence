export const PRODUCT_EVENTS = [
  'recommended_prospect_opened',
  'outreach_composer_opened',
  'outreach_intent_selected',
  'conversation_first_draft_generated',
  'website_finding_draft_generated',
  'follow_up_draft_generated',
  'business_observation_added',
  'message_copied',
  'contact_application_opened',
  'send_confirmed',
  'prospect_marked_replied',
  'reply_assistant_used',
  'suggested_response_copied',
  'suggested_response_marked_sent',
  'follow_up_completed',
  'interested_outcome_selected',
  'proposal_recorded',
  'won_outcome_selected',
  'not_a_fit_outcome_selected',
] as const;

export type ProductEvent = (typeof PRODUCT_EVENTS)[number];
