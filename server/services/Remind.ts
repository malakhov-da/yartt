import { z } from 'zod';
import type { AddRemindInput, MoveRemindInput, Remind as RemindType } from '#shared/remind.ts';
import { Remind } from '#shared/remind.ts';
import { AppError } from '../errors.ts';
import { sql } from '../pg.ts';
import { assertCanSee } from './Task.ts';

/** My reminders on a task, soonest first. */
export async function list(employeeId: number, taskId: number): Promise<RemindType[]> {
  await assertCanSee(taskId, employeeId);
  return Remind.array().parse(await sql`
    SELECT at, value AS text, sent_at IS NOT NULL AS due FROM remind
     WHERE employee_id = ${employeeId} AND task_id = ${taskId}
     ORDER BY at
  `);
}

/**
 * A reminder for oneself on a task one sees, in the future. The worker
 * delivers it as a notification once due (send_due_reminds); it then waits
 * in "Waiting for me" until removed or moved. Leaving the task deletes it.
 * The same moment twice keeps the latest text.
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

/**
 * Puts a reminder off to a later moment: it is due again then. Onto a
 * moment another reminder of mine on the task has, the two become one,
 * keeping the moved one's text.
 */
export async function move(employeeId: number, input: MoveRemindInput): Promise<void> {
  if (input.to.getTime() <= Date.now()) throw new AppError('remind_in_past');
  await sql.begin(async (tx) => {
    const [row] = z.object({ text: z.string().nullable() }).array().parse(await tx`
      DELETE FROM remind WHERE employee_id = ${employeeId} AND task_id = ${input.taskId} AND at = ${input.at}
      RETURNING value AS text
    `);
    if (!row) throw new AppError('not_found');
    await tx`
      INSERT INTO remind (employee_id, task_id, at, value)
      VALUES (${employeeId}, ${input.taskId}, ${input.to}, ${row.text})
      ON CONFLICT (employee_id, task_id, at) DO UPDATE SET value = EXCLUDED.value, sent_at = NULL
    `;
  });
}
