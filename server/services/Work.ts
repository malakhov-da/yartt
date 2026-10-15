import { z } from 'zod';
import type { AddShiftInput, CloseShiftInput } from '#shared/myDay.ts';
import { AppError } from '../errors.ts';
import { sql, type Sql } from '../pg.ts';

// The timesheet only moves forward: the triggers forbid changing a closed
// shift, a shift in the future and anything on a scored day. Moments are
// cut to the minute and never later than now, so a clock a few seconds
// ahead in the browser does not make a shift "future".
const at = (db: Sql, value: Date) => db`LEAST(date_trunc('minute', ${value}::timestamptz), date_trunc('minute', NOW()))`;

const Minutes = z.object({ minutes: z.number() });

async function minutesBetween(from: Date, to: Date, db: Sql): Promise<number> {
  const [row] = Minutes.array().parse(await db`
    SELECT (extract(epoch FROM ${at(db, to)} - ${at(db, from)}) / 60)::int AS minutes
  `);
  if (!row || row.minutes <= 0) throw new AppError('invalid_data');
  return row.minutes;
}

/** Opens a shift; there is at most one open shift (EXCLUDE: shift_overlap). */
export async function start(employeeId: number, startedAt: Date): Promise<void> {
  await sql`INSERT INTO work (employee_id, started_at) VALUES (${employeeId}, ${at(sql, startedAt)})`;
}

/** Closes the open shift with what was done; its start may be corrected. */
export async function close(employeeId: number, input: CloseShiftInput): Promise<void> {
  await sql.begin(async (tx) => {
    const db = tx as unknown as Sql;
    const minutes = await minutesBetween(input.startedAt, input.endedAt, db);
    const rows = await db`
      UPDATE work SET started_at = ${at(db, input.startedAt)}, spent_minutes = ${minutes}, about = ${input.about || null}
       WHERE employee_id = ${employeeId} AND spent_minutes IS NULL
      RETURNING employee_id
    `;
    if (rows.length === 0) throw new AppError('not_found');
  });
}

/** Adds a closed shift at once: a suggestion for a past day confirmed. */
export async function add(employeeId: number, input: AddShiftInput): Promise<void> {
  await sql.begin(async (tx) => {
    const db = tx as unknown as Sql;
    const minutes = await minutesBetween(input.startedAt, input.endedAt, db);
    await db`
      INSERT INTO work (employee_id, started_at, spent_minutes, about)
      VALUES (${employeeId}, ${at(db, input.startedAt)}, ${minutes}, ${input.about || null})
    `;
  });
}

/** Deletes the open shift (a closed one cannot be deleted). */
export async function remove(employeeId: number): Promise<void> {
  const rows = await sql`
    DELETE FROM work WHERE employee_id = ${employeeId} AND spent_minutes IS NULL RETURNING employee_id
  `;
  if (rows.length === 0) throw new AppError('not_found');
}
