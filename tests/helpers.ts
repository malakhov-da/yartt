import { randomUUID } from 'node:crypto';
import { sql } from '../server/pg.ts';
import trpc from '../server/trpc/index.ts';
import type { Context } from '../server/ctx.ts';
import { createCallerFactory } from '../server/trpc.ts';

const createCaller = createCallerFactory(trpc);

export type TestClient = ReturnType<typeof createCaller> & {
  cookie: { value: string | null };
};

// Client with a "browser" cookie: login() sets it, logout() clears it.
export async function client(employeeId: number | null = null, sessionToken: string | null = null, bot: Context['bot'] = null): Promise<TestClient> {
  const cookie = { value: sessionToken };
  const ctx: Context = {
    employeeId,
    bot,
    sessionToken,
    setSessionCookie: (token) => { cookie.value = token; },
    clearSessionCookie: () => { cookie.value = null; },
    ssoPending: null,
    setSsoPendingCookie: () => {},
    clearSsoPendingCookie: () => {},
  };
  // The caller is a Proxy where any property is a procedure path; expose cookie ourselves.
  return new Proxy(createCaller(ctx), {
    get: (target, prop, receiver) => (prop === 'cookie' ? cookie : Reflect.get(target, prop, receiver)),
  }) as TestClient;
}

// Client authenticated by a session token, the way ctx.ts does it.
export async function clientBySession(sessionToken: string): Promise<TestClient> {
  const [row] = await sql<{ id: number | null }[]>`SELECT authenticate(${sessionToken}) AS id`;
  return client(row?.id ?? null, sessionToken);
}

export async function createEmployee(fields: { managerId?: number } = {}) {
  const email = `${randomUUID()}@yartt.test`;
  const [row] = await sql<{ id: number }[]>`
    WITH e AS (
      INSERT INTO employee (email, full_name, manager_id)
      VALUES (${email}, ${'Test ' + email.slice(0, 8)}, ${fields.managerId ?? null})
      RETURNING id
    )
    INSERT INTO human (employee_id) SELECT id FROM e RETURNING employee_id AS id
  `;
  return { id: row!.id, email };
}
