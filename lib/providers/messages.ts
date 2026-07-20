import OpenAI from 'openai';
import { flags } from '@/lib/env';
import type { Finding } from './audit';

export type OutreachChannel = 'email' | 'facebook' | 'text' | 'follow_up';

export type OutreachInput = {
  name: string;
  category: string;
  city: string;
  state?: string;
  website?: string | null;
  channel: OutreachChannel;
  findings: Finding[];
  serviceDescription?: string | null;
  typicalProjectRange?: string | null;
  targetCustomer?: string | null;
  outreachStyle?: string | null;
  previousMessage?: string | null;
};

export type GeneratedOutreach = {
  subject: string | null;
  body: string;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  requestId?: string | null;
};

export async function generateMessage(input: OutreachInput): Promise<GeneratedOutreach> {
  const place = [input.city, input.state].filter(Boolean).join(', ') || 'the area';

  if (flags.demo || !process.env.OPENAI_API_KEY) {
    return fallbackMessage(input, place);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const instructions = buildOutreachInstructions(input, place);

  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5-mini',
    input: instructions,
  });
  const text = response.output_text.trim();
  if (!text) return fallbackMessage(input, place);

  const usage = response.usage ? {
    inputTokens: response.usage.input_tokens || 0,
    outputTokens: response.usage.output_tokens || 0,
    totalTokens: response.usage.total_tokens || 0,
  } : undefined;
  const requestId = response._request_id || null;

  if (input.channel !== 'email') return { subject: null, body: text.replace(/^BODY:\s*/i, '').trim(), usage, requestId };
  const subjectMatch = text.match(/SUBJECT:\s*(.+)/i);
  const bodyMatch = text.match(/BODY:\s*([\s\S]+)/i);
  return {
    subject: subjectMatch?.[1]?.trim().slice(0, 120) || 'Quick question',
    body: bodyMatch?.[1]?.trim() || text.replace(/SUBJECT:.*\n?/i, '').replace(/^BODY:\s*/i, '').trim(),
    usage,
    requestId,
  };
}

export function buildOutreachInstructions(input: OutreachInput, place?: string) {
  const resolvedPlace = place || [input.city, input.state].filter(Boolean).join(', ') || 'the area';
  const hasCustomProfile = [
    input.serviceDescription,
    input.typicalProjectRange,
    input.targetCustomer,
    input.outreachStyle,
  ].some((value) => Boolean(value?.trim()));

  if (!hasCustomProfile) {
    return buildConversationFirstInstructions(input, resolvedPlace);
  }

  const findings = input.findings
    .slice(0, 8)
    .map((finding) => `${finding.label}: ${finding.evidence}`)
    .join('\n');
  const findingsContext = findings || (input.website
    ? 'No usable website findings are available. Do not claim the business has no website and do not invent a website problem.'
    : 'No website was listed on the business profile.');

  return [
    'Write outreach for a freelance web developer contacting a local business.',
    'Use only the verified evidence supplied. Never invent a compliment, result, relationship, or problem.',
    'Sound like a real person, plainspoken and brief. Do not use em dashes, agency jargon, hype, or AI-style polish.',
    'Do not insult the current website. Mention one useful observation and ask one natural question.',
    'The saved outreach profile below contains the user’s own rules. Follow it exactly when it is more specific than these general instructions.',
    input.channel === 'email' ? 'Return a short email subject on the first line as SUBJECT: and the email body after BODY:.' : 'Return only the message body.',
    input.channel === 'follow_up' ? 'This is a polite follow-up. Do not repeat the full first message and do not guilt the prospect.' : '',
    input.channel === 'text' || input.channel === 'facebook' ? 'Keep it conversational and under 65 words.' : 'Keep it under 110 words.',
    input.serviceDescription ? `The freelancer offers: ${input.serviceDescription}.` : '',
    input.typicalProjectRange ? `Typical project range: ${input.typicalProjectRange}. Do not mention price unless it naturally answers a question.` : '',
    input.targetCustomer ? `Ideal customer: ${input.targetCustomer}.` : '',
    input.outreachStyle ? `Preferred voice and outreach rules:\n${input.outreachStyle}` : '',
    input.previousMessage ? `Previous message for follow-up context: ${input.previousMessage}` : '',
    `Business: ${input.name}`,
    `Category: ${input.category}`,
    `Location: ${resolvedPlace}`,
    `Verified findings:\n${findingsContext}`,
  ].filter(Boolean).join('\n');
}

function buildConversationFirstInstructions(input: OutreachInput, place: string) {
  const isFollowUp = input.channel === 'follow_up';

  return [
    'You are writing outreach for an independent web professional contacting a small local business.',
    'The first message is never a sales pitch. Its only job is to start a real conversation and get a reply.',
    'Sound friendly, curious, observant, relaxed, plainspoken, and down to earth.',
    'The message should feel like one small business owner casually messaging another.',
    'Never sound like marketing, an agency, a sales script, AI-generated copy, or a LinkedIn post.',
    'Use only the verified business details supplied below. Never invent a post, project, photo, piece of equipment, review, relationship, compliment, or business result.',
    isFollowUp
      ? 'This is a brief no-reply follow-up. Refer naturally to the earlier question without repeating the full message, adding guilt, or introducing a pitch.'
      : 'Mention one honest non-website detail when one is available, then ask one easy and genuine question. If no specific detail is available, use a neutral opener based on the business category and location.',
    'Do not mention websites, website problems, SEO, Google, audits, scores, pricing, demos, services being sold, calls, meetings, or an offer to help.',
    'Do not introduce the sender as a web designer.',
    'Avoid repeating the business name unless it is necessary for clarity.',
    'Ask exactly one question. Never combine multiple questions.',
    input.channel === 'email'
      ? 'Return a short, normal email subject on the first line as SUBJECT: and the body after BODY:. Keep the body under 85 words and do not use the extra space for a pitch.'
      : 'Return only the message body.',
    input.channel === 'text' || input.channel === 'facebook'
      ? 'Keep it conversational and under 55 words. Use short paragraphs.'
      : '',
    isFollowUp ? 'Keep the follow-up under 45 words.' : '',
    input.previousMessage ? `Previous message for context:\n${input.previousMessage}` : '',
    `Business category: ${input.category || 'local business'}`,
    `Location: ${place}`,
    `Business name, only if truly needed: ${input.name}`,
  ].filter(Boolean).join('\n');
}

function fallbackMessage(input: OutreachInput, place: string): GeneratedOutreach {
  if (input.channel === 'follow_up') {
    return {
      subject: null,
      body: 'Hey, just checking back in case this got buried. I was mainly curious what has been working best for bringing in new customers lately.',
    };
  }

  const category = input.category?.trim().toLowerCase() || 'local businesses';
  const body = `Hey, I came across your page while looking at ${category} around ${place}.\n\nAre most of your new customers coming through referrals right now?`;
  return {
    subject: input.channel === 'email' ? 'Quick question' : null,
    body,
  };
}
