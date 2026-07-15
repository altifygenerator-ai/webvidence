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
};

export async function generateMessage(input: OutreachInput): Promise<GeneratedOutreach> {
  const primary = input.findings.find((finding) => finding.severity === 'high')
    || input.findings.find((finding) => finding.severity === 'medium')
    || input.findings[0];
  const fact = primary?.label || (input.website ? 'the current website setup' : 'that no website was listed');
  const place = [input.city, input.state].filter(Boolean).join(', ') || 'your area';

  if (flags.demo || !process.env.OPENAI_API_KEY) {
    return fallbackMessage(input, fact, place);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const findings = input.findings.slice(0, 8).map((finding) => `${finding.label}: ${finding.evidence}`).join('\n');
  const instructions = [
    'Write outreach for a freelance web developer contacting a local business.',
    'Use only the verified evidence supplied. Never invent a compliment, result, relationship, or problem.',
    'Sound like a real person, plainspoken and brief. Do not use em dashes, agency jargon, hype, or AI-style polish.',
    'Do not insult the current website. Mention one useful observation and ask one natural question.',
    input.channel === 'email' ? 'Return a short email subject on the first line as SUBJECT: and the email body after BODY:.' : 'Return only the message body.',
    input.channel === 'follow_up' ? 'This is a polite follow-up. Do not repeat the full first message and do not guilt the prospect.' : '',
    input.channel === 'text' || input.channel === 'facebook' ? 'Keep it conversational and under 65 words.' : 'Keep it under 110 words.',
    input.serviceDescription ? `The freelancer offers: ${input.serviceDescription}.` : '',
    input.typicalProjectRange ? `Typical project range: ${input.typicalProjectRange}. Do not mention price unless it naturally answers a question.` : '',
    input.targetCustomer ? `Ideal customer: ${input.targetCustomer}.` : '',
    input.outreachStyle ? `Preferred voice: ${input.outreachStyle}.` : '',
    input.previousMessage ? `Previous message for follow-up context: ${input.previousMessage}` : '',
    `Business: ${input.name}`,
    `Category: ${input.category}`,
    `Location: ${place}`,
    `Verified findings:\n${findings || 'No website was listed on the business profile.'}`,
  ].filter(Boolean).join('\n');

  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5-mini',
    input: instructions,
  });
  const text = response.output_text.trim();
  if (!text) return fallbackMessage(input, fact, place);

  if (input.channel !== 'email') return { subject: null, body: text.replace(/^BODY:\s*/i, '').trim() };
  const subjectMatch = text.match(/SUBJECT:\s*(.+)/i);
  const bodyMatch = text.match(/BODY:\s*([\s\S]+)/i);
  return {
    subject: subjectMatch?.[1]?.trim().slice(0, 120) || `Quick question about ${input.name}`,
    body: bodyMatch?.[1]?.trim() || text.replace(/SUBJECT:.*\n?/i, '').replace(/^BODY:\s*/i, '').trim(),
  };
}

function fallbackMessage(input: OutreachInput, fact: string, place: string): GeneratedOutreach {
  if (input.channel === 'follow_up') {
    return {
      subject: null,
      body: `Hey, just wanted to circle back in case my last message got buried. I was mainly curious whether most of ${input.name}'s new business comes from Google, referrals, or somewhere else.`,
    };
  }

  const body = `Hey, I came across ${input.name} while looking at ${input.category.toLowerCase()} businesses around ${place}. I noticed ${fact.toLowerCase()}. Are most of your new calls coming through Google right now or mainly referrals?`;
  return {
    subject: input.channel === 'email' ? `Quick question about ${input.name}` : null,
    body,
  };
}
