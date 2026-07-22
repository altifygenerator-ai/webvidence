import OpenAI from 'openai';
import { z } from 'zod';
import { flags } from '@/lib/env';
import { REPLY_ACTIONS, type ReplyAction } from '@/lib/outreach/types';

const replyAnalysisSchema = z.object({
  summary: z.string().trim().min(1).max(1200),
  needStatus: z.enum(['not_clear', 'possible_need', 'clear_need', 'not_a_fit']),
  recommendedAction: z.enum(REPLY_ACTIONS),
  suggestedResponse: z.string().trim().min(1).max(3000),
  reasoning: z.string().trim().min(1).max(2000),
});

export type ReplyAnalysis = z.infer<typeof replyAnalysisSchema>;

export type ReplyAnalysisInput = {
  businessName: string;
  category: string;
  location: string;
  prospectReply: string;
  previousMessages: Array<{ direction: string; body: string; sentAt?: string | null; channel?: string | null }>;
  businessObservation?: string | null;
  privateNotes?: string | null;
  serviceDescription?: string | null;
  targetCustomer?: string | null;
  typicalProjectRange?: string | null;
  outreachStyle?: string | null;
  baseLocation?: string | null;
  preferredAction?: ReplyAction | null;
};

export type ReplyAnalysisResult = {
  analysis: ReplyAnalysis;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  requestId?: string | null;
};

export async function analyzeReply(input: ReplyAnalysisInput): Promise<ReplyAnalysisResult> {
  if (flags.demo || !process.env.OPENAI_API_KEY) {
    return { analysis: fallbackReplyAnalysis(input) };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5-mini',
    input: buildReplyInstructions(input),
  });

  const raw = extractJson(response.output_text);
  const parsed = replyAnalysisSchema.safeParse(raw);
  const analysis = parsed.success
    ? enforceReplyAnalysisSafety(input, parsed.data)
    : fallbackReplyAnalysis(input);
  const usage = response.usage ? {
    inputTokens: response.usage.input_tokens || 0,
    outputTokens: response.usage.output_tokens || 0,
    totalTokens: response.usage.total_tokens || 0,
  } : undefined;

  return {
    analysis,
    usage,
    requestId: response._request_id || null,
  };
}

export function buildReplyInstructions(input: ReplyAnalysisInput) {
  const history = input.previousMessages.slice(-8).map((message) => {
    const channel = message.channel ? ` via ${message.channel}` : '';
    const sentAt = message.sentAt ? ` on ${message.sentAt}` : '';
    return `${message.direction}${channel}${sentAt}: ${message.body}`;
  }).join('\n');

  return [
    'Analyze a prospect reply for an independent web professional. Return valid JSON only.',
    'Use this exact shape:',
    '{"summary":"string","needStatus":"not_clear|possible_need|clear_need|not_a_fit","recommendedAction":"ask_question|introduce_service|answer_directly|suggest_call|follow_up_later|do_not_pitch|mark_not_fit","suggestedResponse":"string","reasoning":"string"}',
    'The summary must explain what the reply likely means in plain language without claiming certainty.',
    'Choose one recommended action only.',
    'Respond to what the owner actually said. Do not ignore the reply and jump into a pitch.',
    'Do not invent a need, assume interest, or treat a polite reply as a sales opportunity.',
    'When the need is unclear, recommend one natural question. When there is no fit or a rejection, recommend not pitching or marking not fit.',
    'Only recommend introduce_service when the reply clearly reveals a need that the sender’s service can address.',
    'Keep the suggested response short, natural, editable, and free of agency language, hype, manipulation, fake friendliness, and em dashes.',
    'Never turn a rejection into another sales attempt.',
    input.preferredAction ? `The user requested a different approach: ${input.preferredAction}. Use it only if it is safe and consistent with the reply; otherwise choose the safer action.` : '',
    `Business: ${input.businessName}`,
    `Category: ${input.category || 'local business'}`,
    `Location: ${input.location || 'unknown'}`,
    input.baseLocation ? `Sender location: ${input.baseLocation}` : '',
    input.serviceDescription ? `Sender service: ${input.serviceDescription}` : '',
    input.targetCustomer ? `Best-fit customer: ${input.targetCustomer}` : '',
    input.typicalProjectRange ? `Approximate pricing: ${input.typicalProjectRange}. Do not mention unless asked.` : '',
    input.outreachStyle ? `Sender writing rules: ${input.outreachStyle}` : '',
    input.businessObservation ? `User-entered business observation: ${input.businessObservation}` : '',
    input.privateNotes ? `Private notes, use only when relevant: ${input.privateNotes}` : '',
    history ? `Previous conversation history:\n${history}` : 'No prior message history was supplied.',
    `Prospect reply:\n${input.prospectReply}`,
  ].filter(Boolean).join('\n');
}

export function enforceReplyAnalysisSafety(
  input: ReplyAnalysisInput,
  candidate: ReplyAnalysis,
): ReplyAnalysis {
  const deterministic = fallbackReplyAnalysis(input);

  if (deterministic.needStatus === 'not_a_fit') return deterministic;

  if (candidate.needStatus === 'not_a_fit') {
    return {
      ...candidate,
      recommendedAction: 'mark_not_fit',
      suggestedResponse: 'Understood. Thanks for letting me know.',
    };
  }

  if (candidate.recommendedAction === 'introduce_service' && candidate.needStatus !== 'clear_need') {
    return {
      ...candidate,
      recommendedAction: candidate.needStatus === 'possible_need' ? 'ask_question' : 'do_not_pitch',
      suggestedResponse: candidate.needStatus === 'possible_need'
        ? 'That makes sense. What are you doing now to reach more of the customers you want?'
        : 'Thanks for getting back to me. I appreciate it.',
      reasoning: 'A service introduction is not appropriate until the reply reveals a clear need.',
    };
  }

  return candidate;
}

export function fallbackReplyAnalysis(input: ReplyAnalysisInput): ReplyAnalysis {
  const reply = input.prospectReply.trim();
  const lower = reply.toLowerCase();
  const rejected = /\b(no thanks|not interested|stop|remove me|do not contact|don't contact|already have someone|we are good|we're good)\b/i.test(reply);
  if (rejected) {
    return {
      summary: 'They are declining or asking not to continue the sales conversation.',
      needStatus: 'not_a_fit',
      recommendedAction: 'mark_not_fit',
      suggestedResponse: 'Understood. Thanks for letting me know.',
      reasoning: 'The reply is a rejection, so another pitch would ignore what they said.',
    };
  }

  const clearNeed = /\b(quote|price|cost|redesign|new website|website help|fix our site|help with our site|can you build|how much)\b/i.test(reply)
    || /\b(need|want|looking for)\b.{0,40}\b(website|web site|site redesign|web design|online booking|contact form)\b/i.test(reply);
  if (clearNeed) {
    return {
      summary: 'They appear to have a specific need or are asking about help that may fit the sender’s service.',
      needStatus: 'clear_need',
      recommendedAction: safePreferredAction(input.preferredAction, ['introduce_service', 'answer_directly', 'suggest_call', 'ask_question', 'follow_up_later', 'do_not_pitch', 'mark_not_fit'], 'introduce_service'),
      suggestedResponse: lower.includes('how much') || lower.includes('price') || lower.includes('cost')
        ? 'Absolutely. Pricing depends on the size of the site and what you need it to do. What are you hoping to change or add first?'
        : 'That sounds like something I may be able to help with. What is the main thing you want the new setup to do better than what you have now?',
      reasoning: 'The reply reveals a concrete need, but the response should still stay focused on the prospect’s actual goal.',
    };
  }

  const possibleNeed = /\b(grow|more work|commercial|property managers|new customers|leads|bookings|referrals|facebook|google)\b/i.test(reply);
  if (possibleNeed) {
    return {
      summary: 'They shared a growth goal or current source of work, but they have not said they need website or marketing help yet.',
      needStatus: 'possible_need',
      recommendedAction: safePreferredAction(input.preferredAction, ['ask_question', 'answer_directly', 'follow_up_later', 'do_not_pitch', 'mark_not_fit'], 'ask_question'),
      suggestedResponse: 'That makes sense. What are you doing now to reach more of the customers you want?',
      reasoning: 'One more question can clarify the need without forcing the conversation into a pitch.',
    };
  }

  if (/\?/.test(reply)) {
    return {
      summary: 'They asked a direct question and are expecting a straightforward answer.',
      needStatus: 'not_clear',
      recommendedAction: safePreferredAction(input.preferredAction, ['answer_directly', 'ask_question', 'do_not_pitch', 'mark_not_fit'], 'answer_directly'),
      suggestedResponse: 'Thanks for asking. [Add your direct answer here before sending.]',
      reasoning: 'Answering their question is more useful than redirecting immediately into a sales pitch.',
    };
  }

  return {
    summary: 'They replied, but the message does not reveal a clear need yet.',
    needStatus: 'not_clear',
    recommendedAction: safePreferredAction(input.preferredAction, ['ask_question', 'follow_up_later', 'do_not_pitch', 'mark_not_fit'], 'do_not_pitch'),
    suggestedResponse: 'Thanks for getting back to me. I appreciate it.',
    reasoning: 'A polite or unclear reply is not enough evidence to introduce a service.',
  };
}

function safePreferredAction(
  preferred: ReplyAction | null | undefined,
  allowed: ReplyAction[],
  fallback: ReplyAction,
) {
  return preferred && allowed.includes(preferred) ? preferred : fallback;
}

function extractJson(value: string) {
  const cleaned = value.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
