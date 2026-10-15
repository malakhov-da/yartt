// The end-to-end database: a fresh one per run, next to the one vitest uses.
// TEST_DATABASE_URL is the admin connection (as for `npm test`).

const admin = process.env.TEST_DATABASE_URL;
if (!admin) throw new Error('Set TEST_DATABASE_URL (an admin connection, as for npm test) to run end-to-end tests');

export const ADMIN_URL = admin;
export const E2E_DATABASE = 'yartt_e2e';
export const E2E_PORT = 3100;
export const E2E_URL = `http://localhost:${E2E_PORT}`;

/** The admin URL pointed at the end-to-end database. */
export function databaseUrl(): string {
  const url = new URL(admin!);
  url.pathname = `/${E2E_DATABASE}`;
  return url.toString();
}
