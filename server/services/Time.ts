import { z } from 'zod';
import type { MyTime } from '#shared/observer.ts';
import { AppError } from '../errors.ts';
import { sql, type Sql } from '../pg.ts';
import { assertCanSee } from './Task.ts';

const MyTimeRow = z.object({ spentMinutes: z.number(), leftMinutes: z.number().nullable() });
const DayRow = z.object({ day: z.string(), minutes: z.number(), updatedAt: z.date() });

export async function myTime(employeeId: number, taskId: number): Promise<MyTime> {
  await assertCanSee(taskId, employeeId);
  const [row] = MyTimeRow.array().parse(await sql`
    SELECT (SELECT COALESCE(sum(value), 0)::int FROM spent_minutes
             WHERE task_id = ${taskId} AND "by" = ${employeeId}) AS spent_minutes,
           (SELECT value FROM estimate_minutes
             WHERE task_id = ${taskId} AND "by" = ${employeeId} AND expired_at IS NULL) AS left_minutes
  `);
  const days = DayRow.array().parse(await sql`
    SELECT day::text, value AS minutes, updated_at FROM spent_minutes
     WHERE task_id = ${taskId} AND "by" = ${employeeId}
     ORDER BY day DESC
  `);
  return { ...row!, days };
}

/**
 * Sets own time on a task for a day — the day's whole time, replacing what
 * was there; 0 removes the entry. The trigger checks access, the day and
 * scores.
 */
export async function setDay(employeeId: number, taskId: number, day: string, minutes: number): Promise<void> {
  if (minutes === 0) {
    await sql`DELETE FROM spent_minutes WHERE task_id = ${taskId} AND "by" = ${employeeId} AND day = ${day}`;
    return;
  }
  await sql`
    INSERT INTO spent_minutes (task_id, "by", day, value) VALUES (${taskId}, ${employeeId}, ${day}, ${minutes})
    ON CONFLICT (task_id, "by", day) DO UPDATE SET value = EXCLUDED.value
  `;
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
