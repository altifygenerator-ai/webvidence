import { z } from 'zod';

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-5-mini'),
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  GOOGLE_GEOCODING_API_KEY: z.string().optional(),
  PAGESPEED_API_KEY: z.string().optional(),
  ADMIN_EMAIL: z.string().email().default('jlccustoms@gmail.com'),
  DEMO_MODE: z.string().default('false'),
  BILLING_ENABLED: z.string().default('false'),
  RATE_LIMIT_SALT: z.preprocess((value) => value === '' ? undefined : value, z.string().min(16).optional()),
  CRON_SECRET: z.string().min(16).optional(),
  NEXT_PUBLIC_SUPPORT_EMAIL: z.string().email().default('support@webvidence.app'),
  RESEND_API_KEY: z.string().optional(),
  FEEDBACK_TO_EMAIL: z.preprocess((value) => value === '' ? undefined : value, z.string().email().optional()),
  FEEDBACK_FROM_EMAIL: z.string().min(3).default('Webvidence Feedback <feedback@webvidence.app>'),
  GOOGLE_GEOCODING_COST_PER_1000: z.coerce.number().nonnegative().default(5),
  GOOGLE_PLACES_TEXT_SEARCH_COST_PER_1000: z.coerce.number().nonnegative().default(32),
  PAGESPEED_COST_PER_1000: z.coerce.number().nonnegative().default(0),
  OPENAI_INPUT_COST_PER_1M: z.coerce.number().nonnegative().default(0),
  OPENAI_OUTPUT_COST_PER_1M: z.coerce.number().nonnegative().default(0),
});

export const env = schema.parse(process.env);
export const flags = {
  demo: env.DEMO_MODE.trim().toLowerCase() === 'true',
  billing: env.BILLING_ENABLED.trim().toLowerCase() === 'true',
};
