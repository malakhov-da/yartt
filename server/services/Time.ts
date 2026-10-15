import { z } from 'zod';
import type { MyTime } from '#shared/observer.ts';
import { AppError } from '../errors.ts';
import { sql, type Sql } from '../pg.ts';
import { assertCanSee } from './Task.ts';

const MyTimeRow = z.object({ spentMinutes: z.number(), leftMinutes: z.number().nullable() });

export async function myTime(employeeId: number, taskId: number): Promise<MyTime> {
  await assertCanSee(taskId, employeeId);
  const [row] = MyTimeRow.array().parse(await sql`
    SELECT (SELECT COALESCE(sum(value), 0)::int FROM spent_minutes
             WHERE task_id = ${taskId} AND "by" = ${employeeId}) AS spent_minutes,
           (SELECT value FROM estimate_minutes
             WHERE task_id = ${taskId} AND "by" = ${employeeId} AND expired_at IS NULL) AS left_minutes
  `);
  return row!;
}

/** Logs own time for a day (the trigger checks access, the day and scores). */
export async function logTime(employeeId: number, taskId: number, day: string, minutes: number): Promise<void> {
  await sql`INSERT INTO spent_minutes (task_id, "by", day, value) VALUES (${taskId}, ${employeeId}, ${day}, ${minutes})`;
}

/** Deletes an own time entry (the trigger forbids it on a scored day). */
export async function removeEntry(employeeId: number, id: number): Promise<void> {
  const rows = await sql`DELETE FROM spent_minutes WHERE id = ${id} AND "by" = ${employeeId} RETURNING id`;
  if (rows.length === 0) throw new AppError('not_found');
}

/** Sets own time left; NULL clears it. History is kept: the old value expires. */
export async function setLeft(employeeId: number, taskId: number, minutes: number | null): Promise<void> {
  await sql.begin(async (tx) => {
    const db = tx as unknown as Sql;
    await assertCanSee(taskId, employeeId, db);
    await db`
      UPDATE estimate_minutes SET expired_at = NOW()
       WHERE task_id = ${taskId} AND "by" = ${employeeId} AND expired_at IS NULL
    `;
    if (minutes !== null) {
      await db`INSERT INTO estimate_minutes (task_id, "by", value) VALUES (${taskId}, ${employeeId}, ${minutes})`;
    }
  });
}
