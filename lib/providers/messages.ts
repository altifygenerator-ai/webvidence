import OpenAI from 'openai';
import { flags } from '@/lib/env';
import type { Finding } from './audit';
import type { OutreachIntent } from '@/lib/outreach/types';

export type OutreachChannel = 'email' | 'facebook' | 'text';

export type OutreachInput = {
  name: string;
  category: string;
  city: string;
  state?: string;
  website?: string | null;
  channel: OutreachChannel;
  intent: OutreachIntent;
  findings: Finding[];
  serviceDescription?: string | null;
  typicalProjectRange?: string | null;
  targetCustomer?: string | null;
  outreachStyle?: string | null;
  baseLocation?: string | null;
  preferredChannels?: string | null;
  previousMessage?: string | null;
  previousSentAt?: string | null;
  previousChannel?: string | null;
  followUpStep?: number;
  privateNotes?: string | null;
  businessObservation?: string | null;
  replyContext?: string | null;
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

  const generated = input.channel !== 'email'
    ? {
        subject: null,
        body: stripMessageEnvelope(text),
        usage,
        requestId,
      }
    : {
        subject: text.match(/SUBJECT:\s*(.+)/i)?.[1]?.trim().slice(0, 120) || 'Quick question',
        body: text.match(/BODY:\s*([\s\S]+)/i)?.[1]?.trim() || stripMessageEnvelope(text),
        usage,
        requestId,
      };

  if (isSafeGeneratedMessage(input, generated)) return generated;
  return { ...fallbackMessage(input, place), usage, requestId };
}

export function isSafeGeneratedMessage(
  input: OutreachInput,
  generated: Pick<GeneratedOutreach, 'subject' | 'body'>,
) {
  const body = generated.body.trim();
  if (!body) return false;
  if ((body.match(/\?/g) || []).length > 1) return false;
  if (/—/.test(body)) return false;
  if (/\b(guaranteed|definitely|losing money|costing (?:you|your business) customers)\b/i.test(body)) return false;

  const wordLimit = input.channel === 'email' ? 110 : input.intent === 'follow_up' ? 55 : 75;
  if (body.split(/\s+/).filter(Boolean).length > wordLimit) return false;

  if (input.intent === 'conversation') {
    return !/\b(web\s*site|website|seo|audit|pagespeed|redesign|web designer|i build websites|my service|our service)\b/i.test(body);
  }

  if (input.intent === 'website_finding') {
    return !/\b(dom|viewport|pagespeed|largest contentful paint|cumulative layout shift|first contentful paint|lcp|cls|fcp|technical audit|raw score)\b/i.test(body);
  }

  return true;
}

export function buildOutreachInstructions(input: OutreachInput, place?: string) {
  const resolvedPlace = place || [input.city, input.state].filter(Boolean).join(', ') || 'the area';
  const common = buildCommonInstructions(input, resolvedPlace);

  if (input.intent === 'website_finding') {
    return [common, buildWebsiteFindingInstructions(input)].filter(Boolean).join('\n');
  }
  if (input.intent === 'follow_up') {
    return [common, buildFollowUpInstructions(input)].filter(Boolean).join('\n');
  }
  if (input.intent === 'service_intro') {
    return [common, buildServiceIntroductionInstructions(input)].filter(Boolean).join('\n');
  }
  return [common, buildConversationFirstInstructions(input, resolvedPlace)].filter(Boolean).join('\n');
}

function buildCommonInstructions(input: OutreachInput, place: string) {
  return [
    'Write one editable outreach message for an independent web professional contacting a local business.',
    'The freelancer remains in control. Do not imply that anything will be sent automatically.',
    'Sound like a real person: brief, plainspoken, specific, and natural. Do not use em dashes, agency jargon, hype, fake friendliness, or AI-style structure.',
    'Never invent a post, service, location, owner name, website problem, customer demand, relationship, compliment, or business result.',
    'Never claim the prospect is losing money, needs a website, or is interested unless the supplied context directly says so.',
    'Ask no more than one question unless the instruction for this exact message type says to ask none.',
    input.channel === 'email'
      ? 'Return a short normal subject as SUBJECT: on the first line and the body after BODY:.'
      : 'Return only the message body.',
    input.channel === 'email' ? 'Keep the body under 100 words.' : 'Keep the message under 65 words and use short paragraphs.',
    input.serviceDescription ? `Sender service context: ${input.serviceDescription}` : '',
    input.typicalProjectRange ? `Approximate project range: ${input.typicalProjectRange}. Do not mention price unless the prospect asked or it is essential.` : '',
    input.targetCustomer ? `Best-fit customer: ${input.targetCustomer}` : '',
    input.baseLocation ? `Sender location: ${input.baseLocation}. Never pretend the sender is local to the prospect when this does not support it.` : '',
    input.preferredChannels ? `Sender preferred contact channels: ${input.preferredChannels}` : '',
    input.outreachStyle ? `Sender writing rules:\n${input.outreachStyle}` : '',
    `Business category: ${input.category || 'local business'}`,
    `Business location: ${place}`,
    `Business name, only when natural or necessary: ${input.name}`,
  ].filter(Boolean).join('\n');
}

function buildConversationFirstInstructions(input: OutreachInput, place: string) {
  return [
    'MESSAGE TYPE: Start a conversation.',
    'The message must not pitch a service or introduce the sender as a web designer.',
    'Do not mention the website, a website review, SEO, an audit, a score, pricing, a demo, or an offer to help.',
    'Use one real business detail only when it is supplied. Otherwise use the category and location as a neutral reason the page was noticed.',
    'Ask exactly one natural question about the business, where work comes from, current demand, or whether a specific service is something they want more of.',
    'Avoid unnecessary use of the business name and avoid pretending to be a buyer.',
    input.businessObservation
      ? `User-entered observation. Treat it as user-supplied context, not independently verified: ${input.businessObservation}`
      : `No specific observation was supplied. Use a safe fallback based on ${input.category || 'the category'} around ${place}.`,
  ].filter(Boolean).join('\n');
}

function buildWebsiteFindingInstructions(input: OutreachInput) {
  const usableFinding = input.findings.find((finding) => finding.severity !== 'positive');
  return [
    'MESSAGE TYPE: Use a website finding.',
    'Use one verified finding only. Translate it into ordinary language and do not dump multiple problems.',
    'Do not expose PageSpeed terminology, DOM language, viewport jargon, raw scores, or technical audit data.',
    'Do not exaggerate the impact, claim lost revenue, or say the website is costing customers.',
    'State what was observed personally and ask one natural question. Keep it editable and low-pressure.',
    usableFinding
      ? `Verified finding to use: ${plainFinding(usableFinding)}`
      : 'No usable verified finding is available. Do not invent one. Write a brief note saying there was not enough verified evidence to prepare this approach.',
    input.businessObservation
      ? `Optional user-entered context, only if it fits naturally: ${input.businessObservation}`
      : '',
  ].filter(Boolean).join('\n');
}

function buildFollowUpInstructions(input: OutreachInput) {
  return [
    'MESSAGE TYPE: Follow up after no reply.',
    'Do not repeat the original pitch, add guilt, or imply urgency that was not supplied.',
    'Refer naturally to the earlier message or question and keep the follow-up low-pressure.',
    'Do not introduce a new service pitch merely because the prospect did not answer.',
    input.previousMessage ? `Previous sent message:\n${input.previousMessage}` : 'No previous sent message was found. Use a neutral, very short check-in.',
    input.previousSentAt ? `Previous send date: ${input.previousSentAt}` : '',
    input.previousChannel ? `Previous contact channel: ${input.previousChannel}` : '',
    `Current follow-up stage: ${Math.max(1, Number(input.followUpStep || 0) + 1)} of 3`,
    input.privateNotes ? `Private lead notes, use only when relevant and never quote sensitive details unnecessarily: ${input.privateNotes}` : '',
    input.businessObservation ? `User-entered business observation: ${input.businessObservation}` : '',
    'Keep the follow-up under 45 words.',
  ].filter(Boolean).join('\n');
}

function buildServiceIntroductionInstructions(input: OutreachInput) {
  return [
    'MESSAGE TYPE: Introduce the service after a relevant need was identified.',
    'Connect the service to what the prospect actually said. Do not invent a need or restart the conversation with a generic pitch.',
    'Answer any direct question first. Then make one concise, practical connection to the sender’s service.',
    'Do not over-explain, pressure for a call, or list every service.',
    input.replyContext ? `Prospect reply or recorded need:\n${input.replyContext}` : 'No reply context was supplied. Do not claim a need is clear; ask one more question instead.',
    input.businessObservation ? `User-entered business observation, only if relevant: ${input.businessObservation}` : '',
  ].filter(Boolean).join('\n');
}

export function plainFinding(finding: Pick<Finding, 'code' | 'label' | 'evidence'>) {
  const exact: Record<string, string> = {
    low_mobile_performance: 'The site loaded pretty slowly on my phone.',
    slow_mobile: 'The site loaded pretty slowly on my phone.',
    missing_click_to_call: 'The phone number did not open the call screen on my phone.',
    broken_link: 'One of the links went to a page that was not there.',
    missing_mobile_viewport: 'The site was difficult to use on my phone.',
    no_site: 'A website was not listed on the business profile.',
  };
  return exact[finding.code] || `${finding.label}: ${finding.evidence}`;
}

function fallbackMessage(input: OutreachInput, place: string): GeneratedOutreach {
  if (input.intent === 'follow_up') {
    return formatFallback(input.channel, 'Checking back on my earlier question in case it got buried. No pressure either way.');
  }

  if (input.intent === 'website_finding') {
    const finding = input.findings.find((item) => item.severity !== 'positive');
    const body = finding
      ? `Hey, I was looking through the site and noticed this on my phone: ${plainFinding(finding)}\n\nIs that something you have already been meaning to fix?`
      : 'I did not have enough verified website information to write a specific message yet.';
    return formatFallback(input.channel, body);
  }

  if (input.intent === 'service_intro') {
    const body = input.replyContext
      ? 'That makes sense. Based on what you said, a simpler website setup could help with that. Would it be useful if I showed you what I would change first?'
      : 'That makes sense. How are you handling that part of the business right now?';
    return formatFallback(input.channel, body);
  }

  const observation = input.businessObservation?.trim();
  const category = input.category?.trim().toLowerCase() || 'local businesses';
  const body = observation
    ? `Hey, I noticed ${lowercaseOpening(observation)}\n\nIs that something you are trying to do more of, or are you already staying pretty full with it?`
    : `Hey, I came across your page while looking at ${category} around ${place}.\n\nAre most of your new customers coming through referrals right now?`;
  return formatFallback(input.channel, body);
}

function formatFallback(channel: OutreachChannel, body: string): GeneratedOutreach {
  return {
    subject: channel === 'email' ? 'Quick question' : null,
    body,
  };
}

function lowercaseOpening(value: string) {
  const trimmed = value.trim().replace(/[.!?]+$/, '');
  return trimmed ? `${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}.` : 'something about the business.';
}

function stripMessageEnvelope(text: string) {
  return text
    .replace(/SUBJECT:.*\n?/i, '')
    .replace(/^BODY:\s*/i, '')
    .trim();
}
