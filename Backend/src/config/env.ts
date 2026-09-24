import { z } from 'zod';

const csv = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  APP_NAME: z.string().default('CommUniti'),
  API_URL: z.url(),
  WEB_URL: z.url(),
  ADMIN_URL: z.url(),
  MOBILE_DEEP_LINK: z.string().default('communiti://'),
  CORS_ORIGINS: csv,

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().optional(),
  /** Connections per instance. Keep 1 on Vercel (each function instance is single-flight). */
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).optional(),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SAMESITE: z.enum(['auto', 'lax', 'none', 'strict']).default('auto'),
  COOKIE_DOMAIN: z.string().optional().transform((v) => v || undefined),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URI: z.string().default(''),
  GOOGLE_MOBILE_CLIENT_IDS: csv,

  SMTP_HOST: z.string().default('smtp.resend.com'),
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_SECURE: z
    .enum(['true', 'false', '1', '0'])
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
  SMTP_USER: z.string().default('resend'),
  /** Resend API key (re_...). Used as the SMTP password. Empty = emails are logged, not sent. */
  SMTP_PASS: z.string().default(''),
  MAIL_REPLY_TO: z.string().default(''),
  /** Testing: deliver every email to this address instead (required with Resend's onboarding@resend.dev sender). */
  MAIL_REDIRECT_TO: z.string().default(''),
  /** Set by the deploy pipeline; shown in /health. */
  APP_VERSION: z.string().default('dev'),
  APP_COMMIT: z.string().default(process.env.VERCEL_GIT_COMMIT_SHA ?? 'local'),
  MAIL_FROM: z.string().default('CommUniti <no-reply@communiti.app>'),

  SUPABASE_URL: z.string().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
  STORAGE_PUBLIC_BUCKET: z.string().default('public-media'),
  STORAGE_PRIVATE_BUCKET: z.string().default('private-files'),

  CRON_SECRET: z.string().default(''),
  EXPO_ACCESS_TOKEN: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  googleEnabled: Boolean(parsed.data.GOOGLE_CLIENT_ID && parsed.data.GOOGLE_CLIENT_SECRET),
  /** Resend's shared test sender only delivers to the Resend account owner's address. */
  mailTestSender: parsed.data.MAIL_FROM.includes('@resend.dev'),
  mailEnabled: Boolean(parsed.data.SMTP_HOST && parsed.data.SMTP_PASS),
  storageEnabled: Boolean(parsed.data.SUPABASE_URL && parsed.data.SUPABASE_SERVICE_ROLE_KEY),
};

export type Env = typeof env;
