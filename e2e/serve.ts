// Starts the application for end-to-end tests (playwright.config.ts,
// webServer): a fresh database filled with the demo data (scripts/seed.ts),
// then the real server with the built client, like in production.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import postgres from 'postgres';
import { ADMIN_URL, databaseUrl, E2E_DATABASE, E2E_PORT, E2E_URL } from './db.ts';

const root = join(import.meta.dirname, '..');
const admin = postgres(ADMIN_URL, { onnotice: () => {} });
await admin.unsafe(`DROP DATABASE IF EXISTS ${E2E_DATABASE} WITH (FORCE)`);
await admin.unsafe(`CREATE DATABASE ${E2E_DATABASE}`);
await admin.end();

const env = {
  ...process.env,
  DATABASE_URL: databaseUrl(),
  PUBLIC_URL: E2E_URL,
  PORT: String(E2E_PORT),
  ROLE: 'all',
  COOKIE_SECURE: 'false',
  SMTP_URL: '',
  WEBHOOK_URL: '',
  FIRST_EMPLOYEE_EMAIL: 'first@example.com',
  FIRST_EMPLOYEE_NAME: 'First Employee',
  FIRST_EMPLOYEE_LOCALE: 'ru',
  FIRST_EMPLOYEE_TIME_ZONE: 'Europe/Moscow',
};
const seed = spawnSync(process.execPath, [join(root, 'scripts', 'seed.ts')], { env, stdio: 'inherit' });
if (seed.status !== 0) process.exit(seed.status ?? 1);

Object.assign(process.env, env);
await import('../server/index.ts');
