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
});

export const env = schema.parse(process.env);
export const flags = {
  demo: env.DEMO_MODE.trim().toLowerCase() === 'true',
  billing: env.BILLING_ENABLED.trim().toLowerCase() === 'true',
};
