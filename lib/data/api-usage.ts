import { createAdminClient } from '@/lib/supabase/admin';

type UsageLogInput = {
  workspaceId: string | null;
  userId: string | null;
  provider: string;
  operation: string;
  units?: number;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
  estimatedCost?: number | null;
};

export async function logApiUsage(input: UsageLogInput) {
  const db = createAdminClient();
  const estimatedCost = input.estimatedCost ?? estimateProviderCost(input.provider, input.operation, input.units || 1, input.metadata);
  const { error } = await db.from('api_usage_log').insert({
    workspace_id: input.workspaceId,
    user_id: input.userId,
    provider: input.provider,
    operation: input.operation,
    units: input.units || 1,
    estimated_cost: estimatedCost,
    request_id: input.requestId || null,
    metadata: input.metadata || {},
  });
  if (error) console.error('Could not log provider usage:', error.message);
}

export function estimateProviderCost(
  provider: string,
  operation: string,
  units: number,
  metadata?: Record<string, unknown>,
) {
  if (provider === 'google_geocoding') {
    return roundCost(units * numberEnv('GOOGLE_GEOCODING_COST_PER_1000', 5) / 1000);
  }
  if (provider === 'google_places' && operation === 'text_search') {
    return roundCost(units * numberEnv('GOOGLE_PLACES_TEXT_SEARCH_COST_PER_1000', 32) / 1000);
  }
  if (provider === 'google_pagespeed') {
    return roundCost(units * numberEnv('PAGESPEED_COST_PER_1000', 0) / 1000);
  }
  if (provider === 'openai') {
    const inputTokens = Number(metadata?.inputTokens || 0);
    const outputTokens = Number(metadata?.outputTokens || 0);
    const inputRate = numberEnv('OPENAI_INPUT_COST_PER_1M', 0);
    const outputRate = numberEnv('OPENAI_OUTPUT_COST_PER_1M', 0);
    return roundCost((inputTokens * inputRate + outputTokens * outputRate) / 1_000_000);
  }
  return 0;
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function roundCost(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
