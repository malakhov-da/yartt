import { z } from 'zod';
import { Locale } from '#shared/employee.ts';

// Node reads .env itself (--env-file-if-exists in package.json scripts);
// in Docker variables come from the environment.
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PUBLIC_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3000),
  ROLE: z.enum(['all', 'api', 'worker']).default('all'),
  // Email: smtp://user:password@host:587 or smtps://user:password@host:465.
  SMTP_URL: z.url().optional().or(z.literal('').transform(() => undefined)),
  MAIL_FROM: z.string().optional(),
  // Optional extra channel for other messengers.
  WEBHOOK_URL: z.url().optional().or(z.literal('').transform(() => undefined)),
  WEBHOOK_SECRET: z.string().optional(),
  COOKIE_SECURE: z.stringbool().default(true),
  CLIENT_DIST: z.string().optional(),
  FIRST_EMPLOYEE_EMAIL: z.email().optional(),
  FIRST_EMPLOYEE_NAME: z.string().min(1).optional(),
  FIRST_EMPLOYEE_LOCALE: Locale.default('ru'),
  FIRST_EMPLOYEE_TIME_ZONE: z.string().default('UTC'),
});

const result = EnvSchema.safeParse(process.env);
if (!result.success) {
  console.error(`Invalid configuration:\n${z.prettifyError(result.error)}`);
  process.exit(1);
}
if (result.data.SMTP_URL && !result.data.MAIL_FROM) {
  console.error('Invalid configuration: MAIL_FROM is required with SMTP_URL');
  process.exit(1);
}
if (result.data.WEBHOOK_URL && !result.data.WEBHOOK_SECRET) {
  console.error('Invalid configuration: WEBHOOK_SECRET is required with WEBHOOK_URL');
  process.exit(1);
}

export default result.data;
