// Installation administrator commands, run in the image next to the server:
//   node server/admin.ts dismiss <email> --heir <email>
// Not in the API on purpose: there are no admins in the product (AGENTS.md);
// whoever runs the installation already holds its database. See docs/admin/install.md.
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { sql } from './pg.ts';

const Row = z.object({ id: z.number(), fullName: z.string() });

async function byEmail(email: string) {
  const [row] = Row.array().parse(await sql`SELECT id, full_name FROM employee WHERE email = ${email}`);
  if (!row) throw new Error(`No active employee with email ${email}`);
  return row;
}

const usage = 'Usage: node server/admin.ts dismiss <email> --heir <email>';
const { positionals, values } = parseArgs({ allowPositionals: true, options: { heir: { type: 'string' } } });
let code = 0;
try {
  const [command, email] = positionals;
  if (command !== 'dismiss' || !email || !values.heir) throw new Error(usage);
  const employee = await byEmail(email);
  const heir = await byEmail(values.heir);
  await sql`SELECT dismiss_with_heir(${employee.id}, ${heir.id})`;
  console.log(`Dismissed ${employee.fullName}; their tasks and team went to ${heir.fullName}, who can bring them back.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  code = 1;
}
await sql.end({ timeout: 5 });
process.exit(code);
