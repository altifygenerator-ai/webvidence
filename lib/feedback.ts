import { z } from 'zod';

const optionalText = (max: number) => z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().max(max).optional(),
);

export const feedbackSchema = z.object({
  name: optionalText(120),
  email: z.string().trim().email().max(254),
  businessName: optionalText(160),
  website: optionalText(240),
  usageFrequency: z.enum(['once', 'few_times', 'weekly', 'several_weekly', 'most_workdays']),
  featuresUsed: z.array(z.enum([
    'business_search',
    'online_presence',
    'website_audits',
    'best_places',
    'outreach_drafts',
    'channel_openers',
    'follow_up_tracking',
    'pipeline',
    'outreach_profile',
  ])).max(12).default([]),
  previousWorkflow: optionalText(1800),
  easeImpact: z.enum(['a_lot', 'somewhat', 'not_really', 'harder', 'too_early']),
  timeSavingDetail: optionalText(1800),
  contactedCount: z.enum(['none', 'one_to_five', 'six_to_fifteen', 'sixteen_to_thirty', 'over_thirty']),
  noContactReason: optionalText(500),
  repliesCount: z.enum(['not_applicable', 'none', 'one', 'a_few', 'several', 'not_checked']),
  replyTypes: z.array(z.enum([
    'normal_conversation',
    'more_information',
    'interested',
    'call_or_meeting',
    'pricing',
    'not_interested',
    'other',
  ])).max(10).default([]),
  outcome: z.enum(['not_yet', 'promising_conversation', 'call_or_meeting', 'quote_or_proposal', 'paid_project', 'referral', 'prefer_not']),
  projectRange: z.enum(['not_applicable', 'under_250', '250_500', '500_1000', '1000_2500', 'over_2500', 'prefer_not']),
  workflowMostHelpful: optionalText(2200),
  roughOrConfusing: optionalText(2200),
  wouldUseMore: optionalText(2200),
  usefulnessRating: z.coerce.number().int().min(1).max(10),
  testimonialText: optionalText(3000),
  additionalMessage: optionalText(3000),
  permissionLevel: z.enum(['private', 'anonymous', 'first_name', 'name_business', 'contact_first']),
  allowWrittenQuote: z.boolean().default(false),
  allowOutcomeDetails: z.boolean().default(false),
  allowBusinessIdentity: z.boolean().default(false),
  allowLightEditing: z.boolean().default(false),
  allowAnonymousStats: z.boolean().default(false),
  complimentaryAccess: z.boolean().default(false),
  contactPage: optionalText(200),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;

export const feedbackLabels = {
  usageFrequency: {
    once: 'Just once',
    few_times: 'A few times',
    weekly: 'About once a week',
    several_weekly: 'Several times a week',
    most_workdays: 'Most workdays',
  },
  featuresUsed: {
    business_search: 'Finding businesses',
    online_presence: 'Reviewing online presence',
    website_audits: 'Website audits',
    best_places: 'Best places to start',
    outreach_drafts: 'Drafting outreach',
    channel_openers: 'Opening messages in text or email',
    follow_up_tracking: 'Follow-up tracking',
    pipeline: 'Pipeline',
    outreach_profile: 'Outreach profile settings',
  },
  easeImpact: {
    a_lot: 'A lot',
    somewhat: 'Somewhat',
    not_really: 'Not really',
    harder: 'It made the process harder',
    too_early: 'Too early to tell',
  },
  contactedCount: {
    none: 'Not yet',
    one_to_five: '1–5',
    six_to_fifteen: '6–15',
    sixteen_to_thirty: '16–30',
    over_thirty: 'More than 30',
  },
  repliesCount: {
    not_applicable: 'Not applicable',
    none: 'No responses yet',
    one: 'One response',
    a_few: 'A few responses',
    several: 'Several responses',
    not_checked: 'I have not checked yet',
  },
  replyTypes: {
    normal_conversation: 'Normal conversation',
    more_information: 'Asked for more information',
    interested: 'Interested in services',
    call_or_meeting: 'Call or meeting',
    pricing: 'Requested pricing',
    not_interested: 'Not interested',
    other: 'Other',
  },
  outcome: {
    not_yet: 'Not yet',
    promising_conversation: 'A promising conversation',
    call_or_meeting: 'A call or meeting',
    quote_or_proposal: 'A quote or proposal',
    paid_project: 'A paid project',
    referral: 'A referral',
    prefer_not: 'Prefer not to say',
  },
  projectRange: {
    not_applicable: 'Not applicable',
    under_250: 'Under $250',
    '250_500': '$250–$500',
    '500_1000': '$500–$1,000',
    '1000_2500': '$1,000–$2,500',
    over_2500: 'More than $2,500',
    prefer_not: 'Prefer not to say',
  },
  permissionLevel: {
    private: 'Keep everything private',
    anonymous: 'May quote anonymously',
    first_name: 'May use first name',
    name_business: 'May use name and business',
    contact_first: 'Contact before public use',
  },
} as const;

function label<K extends keyof typeof feedbackLabels>(group: K, value: keyof (typeof feedbackLabels)[K]) {
  return feedbackLabels[group][value] as string;
}

function line(name: string, value?: string | number | null) {
  return `${name}: ${value === undefined || value === null || value === '' ? 'Not provided' : value}`;
}

export function buildFeedbackEmailText(input: FeedbackInput, meta: { submittedAt: string; userId?: string | null; workspaceId?: string | null }) {
  const features = input.featuresUsed.map((item) => label('featuresUsed', item)).join(', ') || 'None selected';
  const replyTypes = input.replyTypes.map((item) => label('replyTypes', item)).join(', ') || 'None selected';

  return [
    'NEW WEBVIDENCE FEEDBACK',
    '',
    'USER',
    line('Name', input.name),
    line('Email', input.email),
    line('Business', input.businessName),
    line('Website', input.website),
    line('Signed-in user ID', meta.userId),
    line('Workspace ID', meta.workspaceId),
    line('Submitted', meta.submittedAt),
    '',
    'USAGE',
    line('Frequency', label('usageFrequency', input.usageFrequency)),
    line('Features used', features),
    line('Previous workflow', input.previousWorkflow),
    line('Made the process easier', label('easeImpact', input.easeImpact)),
    line('Time-saving detail', input.timeSavingDetail),
    '',
    'OUTREACH RESULTS',
    line('Businesses contacted', label('contactedCount', input.contactedCount)),
    line('Reason not contacted', input.noContactReason),
    line('Replies', label('repliesCount', input.repliesCount)),
    line('Reply types', replyTypes),
    line('Best outcome', label('outcome', input.outcome)),
    line('Project range', label('projectRange', input.projectRange)),
    '',
    'WORKFLOW FEEDBACK',
    line('Most helpful', input.workflowMostHelpful),
    line('Rough or confusing', input.roughOrConfusing),
    line('Would make them use it more', input.wouldUseMore),
    line('Usefulness rating', `${input.usefulnessRating}/10`),
    '',
    'THEIR OWN WORDS',
    line('Message about Webvidence', input.testimonialText),
    line('Anything else', input.additionalMessage),
    '',
    'PUBLIC USE PERMISSION',
    line('Permission level', label('permissionLevel', input.permissionLevel)),
    line('Written quote allowed', input.allowWrittenQuote ? 'Yes' : 'No'),
    line('Outcome details allowed', input.allowOutcomeDetails ? 'Yes' : 'No'),
    line('Business identity allowed', input.allowBusinessIdentity ? 'Yes' : 'No'),
    line('Light editing allowed', input.allowLightEditing ? 'Yes' : 'No'),
    line('Anonymous combined statistics allowed', input.allowAnonymousStats ? 'Yes' : 'No'),
    line('Complimentary tester access disclosed', input.complimentaryAccess ? 'Yes' : 'No'),
  ].join('\n');
}

export function feedbackSubject(input: FeedbackInput) {
  const person = (input.name || input.email).replace(/[\r\n]+/g, ' ').slice(0, 80);
  return `New Webvidence feedback from ${person}`;
}
