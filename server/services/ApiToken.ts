import { z } from 'zod';
import { ApiToken } from '#shared/apiToken.ts';
import { AppError } from '../errors.ts';
import { sql } from '../pg.ts';

const Token = z.object({ token: z.string() });
const EmployeeRow = z.object({ id: z.number().nullable() });

/** Tokens of an employee, newest first: seen by the employee and their direct manager. */
export async function list(viewerId: number, employeeId: number): Promise<ApiToken[]> {
  const [allowed] = z.object({ value: z.boolean() }).array().parse(await sql`
    SELECT ${viewerId} = ${employeeId} OR EXISTS (
      SELECT 1 FROM employee WHERE id = ${employeeId} AND manager_id = ${viewerId}) AS value
  `);
  if (!allowed?.value) throw new AppError('forbidden');
  return ApiToken.array().parse(await sql`
    SELECT id, name, created_by, created_at, last_used_at, revoked_at
      FROM api_token WHERE employee_id = ${employeeId}
     ORDER BY revoked_at IS NOT NULL, created_at DESC
  `);
}

/** Issues a token (the rules are in issue_api_token); the only time it is seen. */
export async function issue(actorId: number, employeeId: number, name: string): Promise<string> {
  const [row] = Token.array().parse(await sql`SELECT issue_api_token(${employeeId}, ${actorId}, ${name}) AS token`);
  return row!.token;
}

export async function revoke(actorId: number, tokenId: number): Promise<void> {
  await sql`SELECT revoke_api_token(${tokenId}, ${actorId})`;
}

/** The employee an API token acts as, or null. */
export async function authenticate(token: string): Promise<number | null> {
  const [row] = EmployeeRow.array().parse(await sql`SELECT authenticate_token(${token}) AS id`);
  return row?.id ?? null;
}
