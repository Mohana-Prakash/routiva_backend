import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

  REFRESH_COOKIE_NAME: z.string().default('myday_refresh'),
  REFRESH_COOKIE_DOMAIN: z.string().optional(),
  REFRESH_COOKIE_SECURE: z.coerce.boolean().default(false),
  REFRESH_COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  ACCESS_COOKIE_NAME: z.string().default('myday_access'),

  CORS_ALLOWED_ORIGINS: z.string().default(''),

  VAPID_PUBLIC_KEY: z.string().optional().default(''),
  VAPID_PRIVATE_KEY: z.string().optional().default(''),
  VAPID_SUBJECT: z.string().optional().default('mailto:admin@example.com'),

  // QStash (Upstash) - schedules and delivers every reminder via an HTTP callback instead of
  // an always-on worker. All optional so the app still boots without them (e.g. local dev,
  // or before Render env vars are set); reminder scheduling itself just no-ops without them
  // (see notification-scheduler.ts) and the QStash routes refuse to operate without the
  // signing keys.
  QSTASH_URL: z.string().optional().default(''),
  QSTASH_TOKEN: z.string().optional().default(''),
  QSTASH_CURRENT_SIGNING_KEY: z.string().optional().default(''),
  QSTASH_NEXT_SIGNING_KEY: z.string().optional().default(''),
  // Public HTTPS base URL QStash should call back into (e.g. https://routiva.onrender.com).
  // Only needed to originate new QStash schedules/messages, not to verify inbound ones.
  API_BASE_URL: z.string().optional().default(''),

  RATE_LIMIT_GENERAL_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_GENERAL_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_AUTH_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(10),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  RETENTION_AUDIT_LOG_DAYS: z.coerce.number().int().positive().default(365),
  RETENTION_NOTIFICATION_JOB_DAYS: z.coerce.number().int().positive().default(90),
  RETENTION_EXPIRED_SESSION_DAYS: z.coerce.number().int().positive().default(30),
  RETENTION_EXPIRED_RESET_TOKEN_DAYS: z.coerce.number().int().positive().default(7),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();

export const corsAllowedOrigins = env.CORS_ALLOWED_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
