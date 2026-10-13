import { z } from 'zod';
import { Employee, Locale } from '#shared/employee.ts';
import { deliver } from '../delivery.ts';
import { AppError } from '../errors.ts';
import env from '../env.ts';
import { sql } from '../pg.ts';

const Token = z.object({ token: z.string().nullable() });
const Session = z.object({ session: z.string().nullable() });
const EmployeeId = z.object({ id: z.number().nullable() });
const Recipient = Employee.pick({ id: true, fullName: true })
  .extend({ email: z.string(), locale: Locale.catch('ru') });

/**
 * Sends a sign-in link (email and/or webhook) right away, not through the
 * notification queue: the token must not lie in the database in plain text.
 * Does nothing for unknown or dismissed emails, so the caller cannot tell
 * whether the email exists.
 */
export async function requestLogin(email: string): Promise<void> {
  const [token] = Token.array().parse(await sql`SELECT issue_token(${email}) AS token`);
  if (!token?.token) return;

  const [employee] = Recipient.array().parse(await sql`
    SELECT id, email, full_name, locale FROM employee WHERE email = ${email}
  `);
  if (!employee) return;

  await deliver({
    to: { employeeId: employee.id, email: employee.email, fullName: employee.fullName, locale: employee.locale },
    taskId: null,
    payload: { kind: 'login', url: `${env.PUBLIC_URL}/login/${token.token}` },
  });
}

/** Redeems a sign-in token and returns a new session token. */
export async function login(token: string): Promise<string> {
  const [row] = Session.array().parse(await sql`SELECT login(${token}) AS session`);
  if (!row?.session) throw new AppError('invalid_token');
  return row.session;
}

/** Employee id for a session token, or null; extends the session. */
export async function authenticate(sessionToken: string): Promise<number | null> {
  const [row] = EmployeeId.array().parse(await sql`SELECT authenticate(${sessionToken}) AS id`);
  return row?.id ?? null;
}

export async function logout(sessionToken: string): Promise<void> {
  await sql`DELETE FROM session WHERE hash = digest(${sessionToken}, 'sha256')`;
}

export async function logoutEverywhere(employeeId: number): Promise<void> {
  await sql`DELETE FROM session WHERE employee_id = ${employeeId}`;
}
