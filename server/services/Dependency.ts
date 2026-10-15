import { z } from 'zod';
import type { SetDependencyInput } from '#shared/dependency.ts';
import { AppError } from '../errors.ts';
import { sql, type Sql } from '../pg.ts';

const Owner = z.object({ ownerId: z.number().nullable(), isNew: z.boolean() });

/**
 * The owner of a task makes it wait for another one, or changes the kind
 * and lag. Cycles are refused at once, broken hard dependencies at commit
 * (triggers). A new dependency is told to the owner of the task waited
 * for: a hard one ties their deadline.
 */
export async function set(actorId: number, input: SetDependencyInput): Promise<void> {
  await sql.begin(async (tx) => {
    const db = tx as unknown as Sql;
    await db`SELECT check_owner(${input.taskId}, ${actorId})`;
    if (input.value === input.taskId) throw new AppError('dependency_cycle');
    const [target] = Owner.array().parse(await db`
      SELECT owner_id,
             NOT EXISTS (SELECT 1 FROM dependency WHERE task_id = ${input.taskId} AND value = ${input.value}) AS is_new
        FROM task WHERE id = ${input.value}
    `);
    if (!target) throw new AppError('not_found');
    await db`
      INSERT INTO dependency (task_id, value, min_minutes_after)
      VALUES (${input.taskId}, ${input.value}, ${input.minMinutesAfter})
      ON CONFLICT (task_id, value) DO UPDATE SET min_minutes_after = EXCLUDED.min_minutes_after
    `;
    if (target.isNew && target.ownerId !== null && target.ownerId !== actorId) {
      await db`SELECT notify(${target.ownerId}, ${input.value}, ${db.json({
        kind: 'dependency_added', by: actorId, dependentId: input.taskId, hard: input.minMinutesAfter !== null,
      })})`;
    }
  });
}

/** The owner of a task stops it waiting for another one. */
export async function remove(actorId: number, taskId: number, value: number): Promise<void> {
  await sql.begin(async (tx) => {
    const db = tx as unknown as Sql;
    await db`SELECT check_owner(${taskId}, ${actorId})`;
    const rows = await db`DELETE FROM dependency WHERE task_id = ${taskId} AND value = ${value} RETURNING value`;
    if (rows.length === 0) throw new AppError('not_found');
  });
}
