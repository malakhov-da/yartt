import type { AddRemindInput, Remind as RemindType } from '#shared/remind.ts';
import { Remind } from '#shared/remind.ts';
import { AppError } from '../errors.ts';
import { sql } from '../pg.ts';
import { assertCanSee } from './Task.ts';

/** My reminders on a task, soonest first. */
export async function list(employeeId: number, taskId: number): Promise<RemindType[]> {
  await assertCanSee(taskId, employeeId);
  return Remind.array().parse(await sql`
    SELECT at, value AS text FROM remind
     WHERE employee_id = ${employeeId} AND task_id = ${taskId}
     ORDER BY at
  `);
}

/**
 * A reminder for oneself on a task one sees, in the future. The worker
 * delivers it as a notification and deletes it (send_due_reminds); leaving
 * the task deletes it too. The same moment twice keeps the latest text.
 */
export async function add(employeeId: number, input: AddRemindInput): Promise<void> {
  await assertCanSee(input.taskId, employeeId);
  if (input.at.getTime() <= Date.now()) throw new AppError('remind_in_past');
  await sql`
    INSERT INTO remind (employee_id, task_id, at, value)
    VALUES (${employeeId}, ${input.taskId}, ${input.at}, ${input.text || null})
    ON CONFLICT (employee_id, task_id, at) DO UPDATE SET value = EXCLUDED.value
  `;
}

export async function remove(employeeId: number, taskId: number, at: Date): Promise<void> {
  const rows = await sql`
    DELETE FROM remind WHERE employee_id = ${employeeId} AND task_id = ${taskId} AND at = ${at} RETURNING at
  `;
  if (rows.length === 0) throw new AppError('not_found');
}
