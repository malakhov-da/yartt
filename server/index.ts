import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import api from './api.ts';
import { bootstrap } from './bootstrap.ts';
import env from './env.ts';
import { migrate } from './migrate.ts';
import { sql } from './pg.ts';
import { startWorker } from './worker.ts';

try {
  const migration = await migrate(sql);
  if (migration.action === 'installed') console.log(`Installed schema ${migration.version}`);
  if (migration.action === 'migrated') console.log(`Migrated schema to ${migration.version}: ${migration.files.join(', ')}`);
  await bootstrap(sql);
} catch (error) {
  console.error(`Startup failed: ${error instanceof Error ? error.message : String(error)}`);
  await sql.end({ timeout: 5 });
  process.exit(1);
}

const stops: (() => void)[] = [];

if (env.ROLE === 'all' || env.ROLE === 'api') {
  const app = express().disable('x-powered-by').use('/api', api);

  // Built client: static files + SPA fallback.
  const clientDist = env.CLIENT_DIST ?? join(import.meta.dirname, '..', 'client', 'dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false }));
    app.get('/{*path}', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
  }

  const server = app.listen(env.PORT, () => console.log(`API listening on :${env.PORT}`));
  stops.push(() => server.close());
}

if (env.ROLE === 'all' || env.ROLE === 'worker') {
  stops.push(startWorker(sql));
  console.log('Worker started');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    stops.forEach((stop) => stop());
    await sql.end({ timeout: 5 });
    process.exit(0);
  });
}
