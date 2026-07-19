import { getLocalDayBounds, normalizeTimezoneOffset } from '@/lib/leads/timezone';

export const LEAD_OUTCOMES = [
  'no_response',
  'replied',
  'interested',
  'meeting_booked',
  'proposal_sent',
  'closed_won',
  'closed_lost',
] as const;

export type LeadOutcome = (typeof LEAD_OUTCOMES)[number];

export const LEAD_OUTCOME_LABELS: Record<LeadOutcome, string> = {
  no_response: 'No response',
  replied: 'Replied',
  interested: 'Interested',
  meeting_booked: 'Meeting booked',
  proposal_sent: 'Proposal sent',
  closed_won: 'Closed won',
  closed_lost: 'Closed lost',
};

export const FOLLOW_UP_DAY_OFFSETS = [3, 7, 14] as const;

const INACTIVE_STATUSES = new Set([
  'archived',
  'do_not_contact',
  'not_interested',
  'won',
  'lost',
]);

const FIRST_CONTACT_STATUSES = new Set(['new', 'reviewing', 'ready_to_contact']);
const WAITING_STATUSES = new Set(['contacted', 'follow_up']);
const TERMINAL_OUTCOMES = new Set<LeadOutcome>(['no_response', 'closed_won', 'closed_lost']);

export type PriorityLead = {
  status: string;
  opportunity_score: number | null;
  created_at: string;
  first_contacted_at?: string | null;
  last_contacted_at?: string | null;
  next_follow_up_at?: string | null;
  follow_up_step?: number | null;
  follow_up_stopped_at?: string | null;
  lead_outcome?: LeadOutcome | null;
};

export type PriorityAction = {
  rank: number;
  kind: 'overdue' | 'due_today' | 'never_contacted' | 'aging' | 'waiting' | 'complete';
  label: string;
  detail: string;
};

export function getPriorityAction(lead: PriorityLead, now = new Date(), timezoneOffsetMinutes = 0): PriorityAction | null {
  if (INACTIVE_STATUSES.has(lead.status)) return null;
  if (lead.lead_outcome || lead.follow_up_stopped_at) {
    return {
      rank: -1,
      kind: 'complete',
      label: lead.lead_outcome ? LEAD_OUTCOME_LABELS[lead.lead_outcome] : 'Sequence complete',
      detail: 'No follow-up is currently due.',
    };
  }

  const score = Number(lead.opportunity_score || 0);
  const nextFollowUp = parseDate(lead.next_follow_up_at);
  const { start: startToday, end: endToday } = getLocalDayBounds(now, timezoneOffsetMinutes);

  if (nextFollowUp && nextFollowUp < startToday) {
    const days = Math.max(1, Math.ceil((startToday.getTime() - nextFollowUp.getTime()) / 86_400_000));
    return {
      rank: 1200 + Math.min(days, 30) * 5 + score,
      kind: 'overdue',
      label: `${days} day${days === 1 ? '' : 's'} overdue`,
      detail: `Follow-up ${Math.min(Number(lead.follow_up_step || 0) + 1, 3)} of 3 needs attention.`,
    };
  }

  if (nextFollowUp && nextFollowUp >= startToday && nextFollowUp <= endToday) {
    return {
      rank: 1100 + score,
      kind: 'due_today',
      label: 'Due today',
      detail: `Follow-up ${Math.min(Number(lead.follow_up_step || 0) + 1, 3)} of 3 is due.`,
    };
  }

  if (!lead.first_contacted_at && FIRST_CONTACT_STATUSES.has(lead.status)) {
    const ageDays = ageInDays(lead.created_at, now);
    return {
      rank: 800 + score + Math.min(ageDays, 30),
      kind: 'never_contacted',
      label: 'Never contacted',
      detail: score >= 70 ? 'Strong lead ready for a first message.' : 'Review the evidence and decide whether to reach out.',
    };
  }

  if (!lead.first_contacted_at && ageInDays(lead.created_at, now) >= 7) {
    const ageDays = ageInDays(lead.created_at, now);
    return {
      rank: 650 + score + Math.min(ageDays, 30),
      kind: 'aging',
      label: `${ageDays} days untouched`,
      detail: 'This saved lead has been sitting without a first contact.',
    };
  }

  if (lead.first_contacted_at && WAITING_STATUSES.has(lead.status)) {
    return {
      rank: 300 + score,
      kind: 'waiting',
      label: 'Waiting on reply',
      detail: nextFollowUp ? `Next follow-up is ${formatRelativeDay(nextFollowUp, now, timezoneOffsetMinutes)}.` : 'No follow-up date is set.',
    };
  }

  return null;
}

export function buildSentMessageLeadUpdate(input: {
  status: string;
  channel: string;
  sentAt: string;
  firstContactedAt?: string | null;
  lastContactedAt?: string | null;
  followUpStep?: number | null;
  followUpStoppedAt?: string | null;
  leadOutcome?: LeadOutcome | null;
}) {
  const firstContactedAt = input.firstContactedAt || input.lastContactedAt || input.sentAt;
  const isFollowUp = input.channel === 'follow_up';
  const currentStep = clampFollowUpStep(input.followUpStep);
  const nextStep = isFollowUp ? Math.min(3, currentStep + 1) : currentStep;
  const sequenceShouldStop = Boolean(input.leadOutcome) || nextStep >= 3;

  let status = input.status;
  if (!isFollowUp && FIRST_CONTACT_STATUSES.has(status)) status = 'contacted';
  if (isFollowUp && WAITING_STATUSES.has(status)) status = 'follow_up';

  return {
    status,
    first_contacted_at: firstContactedAt,
    last_contacted_at: input.sentAt,
    follow_up_step: nextStep,
    next_follow_up_at: sequenceShouldStop
      ? null
      : addDays(firstContactedAt, FOLLOW_UP_DAY_OFFSETS[nextStep]).toISOString(),
    follow_up_stopped_at: sequenceShouldStop
      ? (input.followUpStoppedAt || input.sentAt)
      : null,
    updated_at: input.sentAt,
  };
}

export function buildOutcomeLeadUpdate(status: string, outcome: LeadOutcome, changedAt: string) {
  const statusForOutcome: Partial<Record<LeadOutcome, string>> = {
    replied: 'replied',
    interested: 'interested',
    meeting_booked: 'interested',
    proposal_sent: 'quote_sent',
    closed_won: 'won',
    closed_lost: 'lost',
  };

  return {
    status: statusForOutcome[outcome] || status,
    lead_outcome: outcome,
    lead_outcome_updated_at: changedAt,
    next_follow_up_at: null,
    follow_up_stopped_at: changedAt,
    updated_at: changedAt,
  };
}

export function isTerminalOutcome(outcome: LeadOutcome | null | undefined) {
  return Boolean(outcome && TERMINAL_OUTCOMES.has(outcome));
}

export function isManualReviewFinding(code: string) {
  return ['automated_check_blocked', 'website_unreachable', 'unsafe_or_invalid_url'].includes(code);
}

function addDays(value: string, days: number) {
  const date = parseDate(value) || new Date();
  return new Date(date.getTime() + days * 86_400_000);
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ageInDays(value: string, now: Date) {
  const created = parseDate(value);
  if (!created) return 0;
  return Math.max(0, Math.floor((now.getTime() - created.getTime()) / 86_400_000));
}

function clampFollowUpStep(value: number | null | undefined) {
  return Math.max(0, Math.min(3, Number(value || 0)));
}

function formatRelativeDay(value: Date, now: Date, timezoneOffsetMinutes: number) {
  const offset = normalizeTimezoneOffset(timezoneOffsetMinutes);
  const valueDay = getLocalDayBounds(value, offset).start;
  const nowDay = getLocalDayBounds(now, offset).start;
  const difference = Math.ceil((valueDay.getTime() - nowDay.getTime()) / 86_400_000);
  if (difference === 0) return 'today';
  if (difference === 1) return 'tomorrow';
  if (difference > 1) return `in ${difference} days`;
  return `${Math.abs(difference)} days overdue`;
}
