import postgres from 'postgres';
import type { TestProject } from 'vitest/node';

// TEST_DATABASE_URL: a server where databases can be created (usually .../postgres).
// A separate database is created for the run and dropped afterwards.
const adminUrl = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5432/postgres';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    adminUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const admin = postgres(adminUrl, { onnotice: () => {} });
  const name = `yartt_test_${process.pid}`;
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${name}`);

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  project.provide('databaseUrl', url.toString());
  project.provide('adminUrl', adminUrl);

  return async () => {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
  };
}
