import { inject } from 'vitest';

// Before server modules are imported: env.ts reads the environment on load.
process.env.DATABASE_URL = inject('databaseUrl');

const { sql } = await import('../server/pg.ts');
const { migrate } = await import('../server/migrate.ts');
await migrate(sql);
