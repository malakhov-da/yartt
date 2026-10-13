import { z } from 'zod';
import { Locale } from '#shared/employee.ts';

// Node reads .env itself (--env-file-if-exists in package.json scripts);
// in Docker variables come from the environment.
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PUBLIC_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3000),
  ROLE: z.enum(['all', 'api', 'worker']).default('all'),
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
if (result.data.WEBHOOK_URL && !result.data.WEBHOOK_SECRET) {
  console.error('Invalid configuration: WEBHOOK_SECRET is required with WEBHOOK_URL');
  process.exit(1);
}

export default result.data;
