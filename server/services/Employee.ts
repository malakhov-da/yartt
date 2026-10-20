import { z } from 'zod';
import { Employee, type InviteInput, type ProfileInput, type SettingsInput } from '#shared/employee.ts';
import { AppError } from '../errors.ts';
import { sql } from '../pg.ts';

const COLUMNS = 'id, email, dismissed_at, full_name, about, manager_id, next_day, time_zone, locale, pronoun, keyboards::text[] AS keyboards, '
  + '(SELECT updated_at FROM avatar a WHERE a.employee_id = employee.id) AS avatar_at';
const Exists = z.object({ exists: z.boolean() });

export async function list(): Promise<Employee[]> {
  return Employee.array().parse(await sql`
    SELECT ${sql.unsafe(COLUMNS)} FROM employee ORDER BY full_name, id
  `);
}

export async function get(id: number): Promise<Employee | null> {
  const [row] = Employee.array().parse(await sql`
    SELECT ${sql.unsafe(COLUMNS)} FROM employee WHERE id = ${id}
  `);
  return row ?? null;
}

/** Locale and time zone default to the inviter's; the invitee is notified. */
export async function invite(inviterId: number, input: InviteInput): Promise<Employee> {
  return sql.begin(async (tx) => {
    const [employee] = Employee.array().parse(await tx`
      INSERT INTO employee (email, full_name, locale, time_zone)
      SELECT ${input.email}, ${input.fullName},
             COALESCE(${input.locale ?? null}, locale),
             COALESCE(${input.timeZone ?? null}, time_zone)
        FROM employee WHERE id = ${inviterId}
      RETURNING ${tx.unsafe(COLUMNS)}
    `);
    if (!employee) throw new AppError('not_found');
    await tx`SELECT notify(${employee.id}, NULL, ${tx.json({ kind: 'invite', by: inviterId })})`;
    return employee;
  });
}

export async function updateProfile(id: number, input: ProfileInput): Promise<Employee> {
  const [employee] = Employee.array().parse(await sql`
    UPDATE employee
       SET full_name = ${input.fullName},
           email = ${input.email},
           about = ${input.about}
     WHERE id = ${id} AND dismissed_at IS NULL
    RETURNING ${sql.unsafe(COLUMNS)}
  `);
  if (!employee) throw new AppError('not_found');
  return employee;
}

/** A field left out keeps its value. */
export async function updateSettings(id: number, input: SettingsInput): Promise<Employee> {
  const [employee] = Employee.array().parse(await sql`
    UPDATE employee
       SET next_day = ${input.nextDay === undefined ? sql`next_day` : input.nextDay},
           time_zone = COALESCE(${input.timeZone ?? null}, time_zone),
           locale = COALESCE(${input.locale ?? null}, locale),
           pronoun = ${input.pronoun === undefined ? sql`pronoun` : input.pronoun},
           -- An explicit text[] parameter: a one-element array is otherwise sent as a plain string.
           keyboards = ${input.keyboards === undefined ? sql`keyboards`
             : input.keyboards === null ? null : sql`${sql.array(input.keyboards)}::text[]::keyboard[]`}
     WHERE id = ${id}
    RETURNING ${sql.unsafe(COLUMNS)}
  `);
  if (!employee) throw new AppError('not_found');
  return employee;
}

async function isActive(id: number): Promise<boolean> {
  const [row] = Exists.array().parse(await sql`
    SELECT EXISTS (SELECT 1 FROM employee WHERE id = ${id} AND dismissed_at IS NULL)
  `);
  return row?.exists ?? false;
}

/**
 * The employee picks their own manager; cycles are rejected and the new
 * manager is notified (new_report) by the database.
 */
export async function setManager(id: number, managerId: number | null): Promise<void> {
  if (managerId !== null && !(await isActive(managerId))) throw new AppError('not_found');
  await sql`UPDATE employee SET manager_id = ${managerId} WHERE id = ${id}`;
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
