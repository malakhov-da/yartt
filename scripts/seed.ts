// Fills a development database with the demo data (server/demo.ts).
//
//   npm run seed                      — into a database with no data but the first employee
//   npm run seed -- --reset           — drops everything in the database first
//   npm run seed -- --lang en         — the demo in English (Russian by default)
//
// In the image the same data comes on start with DEMO_DATA=ru|en.
import { DEMO_LANGUAGES, type DemoLanguage } from '../server/demoTexts.ts';
import { printDemoSummary, seedDemo } from '../server/demo.ts';
import { migrate } from '../server/migrate.ts';
import { sql } from '../server/pg.ts';

const langAt = process.argv.indexOf('--lang');
const lang = langAt === -1 ? 'ru' : process.argv[langAt + 1];
if (!DEMO_LANGUAGES.includes(lang as DemoLanguage)) {
  console.error(`--lang: one of ${DEMO_LANGUAGES.join(', ')}`);
  process.exit(1);
}

if (process.argv.includes('--reset')) {
  await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  console.log('Dropped everything in the database');
}
await migrate(sql);

try {
  await seedDemo(lang as DemoLanguage);
} catch (error) {
  if (!(error instanceof Error && error.message === 'The database already has data')) throw error;
  console.error('The database already has data. Run `npm run seed -- --reset` to start over.');
  await sql.end();
  process.exit(1);
}
await printDemoSummary();
await sql.end();
