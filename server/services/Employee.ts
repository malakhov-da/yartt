import { z } from 'zod';
import { Employee, type InviteInput, type ProfileInput, type SettingsInput } from '#shared/employee.ts';
import { deliver } from '../delivery.ts';
import env from '../env.ts';
import { AppError } from '../errors.ts';
import { sql } from '../pg.ts';

// A person's own fields come from human; a bot has none there.
const COLUMNS = 'e.id, e.kind, e.email, e.dismissed_at, e.full_name, e.about, e.manager_id, h.next_day, e.time_zone, e.locale, '
  + 'e.pronoun, h.keyboards::text[] AS keyboards, (SELECT updated_at FROM avatar a WHERE a.employee_id = e.id) AS avatar_at';
const FROM = 'employee e LEFT JOIN human h ON h.employee_id = e.id';
const Exists = z.object({ exists: z.boolean() });

export async function list(): Promise<Employee[]> {
  return Employee.array().parse(await sql`
    SELECT ${sql.unsafe(COLUMNS)} FROM ${sql.unsafe(FROM)} ORDER BY e.full_name, e.id
  `);
}

export async function get(id: number): Promise<Employee | null> {
  const [row] = Employee.array().parse(await sql`
    SELECT ${sql.unsafe(COLUMNS)} FROM ${sql.unsafe(FROM)} WHERE e.id = ${id}
  `);
  return row ?? null;
}

const Created = z.object({ id: z.number() });

/** Locale and time zone default to the inviter's; the invitee is notified. */
export async function invite(inviterId: number, input: InviteInput): Promise<Employee> {
  const id = await sql.begin(async (tx) => {
    const [row] = Created.array().parse(await tx`
      INSERT INTO employee (email, full_name, locale, time_zone)
      SELECT ${input.email}, ${input.fullName},
             COALESCE(${input.locale ?? null}, locale),
             COALESCE(${input.timeZone ?? null}, time_zone)
        FROM employee WHERE id = ${inviterId}
      RETURNING id
    `);
    if (!row) throw new AppError('not_found');
    await tx`INSERT INTO human (employee_id) VALUES (${row.id})`;
    await tx`SELECT notify(${row.id}, NULL, ${tx.json({ kind: 'invite', by: inviterId })})`;
    return row.id;
  });
  return (await get(id))!;
}

export async function updateProfile(id: number, input: ProfileInput): Promise<Employee> {
  const [row] = Created.array().parse(await sql`
    UPDATE employee
       SET full_name = ${input.fullName},
           about = ${input.about}
     WHERE id = ${id} AND kind = 'human' AND dismissed_at IS NULL
    RETURNING id
  `);
  if (!row) throw new AppError('not_found');
  return (await get(id))!;
}

const Token = z.object({ token: z.string() });

/**
 * Sends a link to the new address (request_email_change()), by email only —
 * following it proves the mailbox is theirs; a word goes to the old
 * address too, in case it was not them. The email stays until then.
 */
export async function requestEmailChange(id: number, email: string): Promise<void> {
  const [row] = Token.array().parse(await sql`SELECT request_email_change(${id}, ${email}) AS token`);
  const me = (await get(id))!;
  const to = { employeeId: id, kind: 'human' as const, fullName: me.fullName, locale: me.locale, timeZone: me.timeZone };
  await deliver({ to: { ...to, email }, taskId: null, payload: { kind: 'email_confirm', url: `${env.PUBLIC_URL}/email/${row!.token}`, email } });
  if (me.email && me.email.toLowerCase() !== email.toLowerCase()) {
    await deliver({ to: { ...to, email: me.email }, taskId: null, payload: { kind: 'email_changing', email } });
  }
}

const Changed = z.object({ id: z.number() });

/** Follows the link from the new address (confirm_email_change()); signs nobody in. */
export async function confirmEmailChange(token: string): Promise<void> {
  Changed.array().parse(await sql`SELECT confirm_email_change(${token}) AS id`);
}

/** A field left out keeps its value. */
export async function updateSettings(id: number, input: SettingsInput): Promise<Employee> {
  await sql.begin(async (tx) => {
    const [row] = Created.array().parse(await tx`
      UPDATE employee
         SET time_zone = COALESCE(${input.timeZone ?? null}, time_zone),
             locale = COALESCE(${input.locale ?? null}, locale),
             pronoun = ${input.pronoun === undefined ? tx`pronoun` : input.pronoun}
       WHERE id = ${id} AND kind = 'human'
      RETURNING id
    `);
    if (!row) throw new AppError('not_found');
    await tx`
      UPDATE human
         SET next_day = ${input.nextDay === undefined ? tx`next_day` : input.nextDay},
             -- An explicit text[] parameter: a one-element array is otherwise sent as a plain string.
             keyboards = ${input.keyboards === undefined ? tx`keyboards`
               : input.keyboards === null ? null : tx`${tx.array(input.keyboards)}::text[]::keyboard[]`}
       WHERE employee_id = ${id}
    `;
  });
  return (await get(id))!;
}

/** A working person: only they manage. */
async function canManage(id: number): Promise<boolean> {
  const [row] = Exists.array().parse(await sql`
    SELECT EXISTS (SELECT 1 FROM employee WHERE id = ${id} AND kind = 'human' AND dismissed_at IS NULL)
  `);
  return row?.exists ?? false;
}

/**
 * A person picks their own manager; cycles are rejected and the new
 * manager is notified (new_report) by the database. A bot's manager hands
 * it over instead (Bot.transfer).
 */
export async function setManager(id: number, managerId: number | null): Promise<void> {
  if (managerId !== null && !(await canManage(managerId))) throw new AppError('not_found');
  await sql`UPDATE employee SET manager_id = ${managerId} WHERE id = ${id} AND kind = 'human'`;
}

/** See dismiss_employee() in db.sql: only the direct manager; tasks and reports go to them. */
export async function dismiss(id: number, actorId: number): Promise<void> {
  await sql`SELECT dismiss_employee(${id}, ${actorId})`;
}

/**
 * See restore_employee() in db.sql: only the direct manager, under
 * themselves; the email they had unless another one is given.
 */
export async function restore(id: number, actorId: number, email: string | null): Promise<Employee> {
  await sql`SELECT restore_employee(${id}, ${actorId}, ${email})`;
  const employee = await get(id);
  if (!employee) throw new AppError('not_found');
  return employee;
}
