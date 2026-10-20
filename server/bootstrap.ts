import { z } from 'zod';
import env from './env.ts';
import type { Sql } from './pg.ts';

const Exists = z.object({ exists: z.boolean() });

// Creates the first employee from .env if there are no employees yet.
export async function bootstrap(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('yartt.bootstrap'))`;
    const [row] = Exists.array().parse(await tx`SELECT EXISTS (SELECT 1 FROM employee)`);
    if (row?.exists) return;
    // With the identity provider the first one to sign in through it is the first employee.
    if (env.OIDC_ISSUER) return;

    if (!env.FIRST_EMPLOYEE_EMAIL || !env.FIRST_EMPLOYEE_NAME) {
      throw new Error('No employees yet: set FIRST_EMPLOYEE_EMAIL and FIRST_EMPLOYEE_NAME to create the first one');
    }
    await tx`
      WITH e AS (
        INSERT INTO employee (email, full_name, locale, time_zone)
        VALUES (${env.FIRST_EMPLOYEE_EMAIL}, ${env.FIRST_EMPLOYEE_NAME}, ${env.FIRST_EMPLOYEE_LOCALE}, ${env.FIRST_EMPLOYEE_TIME_ZONE})
        RETURNING id
      )
      INSERT INTO human (employee_id) SELECT id FROM e
    `;
    console.log(`Created first employee ${env.FIRST_EMPLOYEE_EMAIL}`);
  });
}
