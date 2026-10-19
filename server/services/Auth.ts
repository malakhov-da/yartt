import { z } from 'zod';
import { Employee, Locale } from '#shared/employee.ts';
import { deliver } from '../delivery.ts';
import { AppError } from '../errors.ts';
import env from '../env.ts';
import { sql } from '../pg.ts';
import * as Employees from './Employee.ts';

const Token = z.object({ token: z.string().nullable() });
const Session = z.object({ session: z.string().nullable() });
const EmployeeId = z.object({ id: z.number().nullable() });
const Recipient = Employee.pick({ id: true, fullName: true, timeZone: true })
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
    SELECT id, email, full_name, locale, time_zone FROM employee WHERE email = ${email}
  `);
  if (!employee) return;

  await deliver({
    to: { employeeId: employee.id, email: employee.email, fullName: employee.fullName, locale: employee.locale, timeZone: employee.timeZone },
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

/** The demo: everyone who can sign in, in the order they joined. */
export async function demoPeople(): Promise<Employee[]> {
  return (await Employees.list()).filter((e) => e.email !== null).sort((a, b) => a.id - b.id);
}

/**
 * The demo: a session for the employee, through the same one-time token a
 * link carries — issued and redeemed at once.
 */
export async function demoSignIn(employeeId: number): Promise<string> {
  const [token] = Token.array().parse(await sql`
    SELECT issue_token(email) AS token FROM employee WHERE id = ${employeeId} AND email IS NOT NULL
  `);
  if (!token?.token) throw new AppError('not_found');
  return login(token.token);
}

export async function logout(sessionToken: string): Promise<void> {
  await sql`DELETE FROM session WHERE hash = digest(${sessionToken}, 'sha256')`;
}

export async function logoutEverywhere(employeeId: number): Promise<void> {
  await sql`DELETE FROM session WHERE employee_id = ${employeeId}`;
}
