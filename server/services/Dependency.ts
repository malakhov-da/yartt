import { z } from 'zod';
import type { SetDependencyInput } from '#shared/dependency.ts';
import { AppError } from '../errors.ts';
import { sql, type Sql } from '../pg.ts';

const Owner = z.object({ ownerId: z.number().nullable(), isNew: z.boolean() });

/**
 * The owner of a task makes it wait for another one, or changes the
 * latest deadline of it this one can live with. Cycles are refused
 * (trigger); a latest deadline forbids nothing — broken, it puts both
 * tasks at risk. A new dependency is told to the owner of the task waited
 * for, with whether it has a latest deadline.
 */
export async function set(actorId: number, input: SetDependencyInput): Promise<void> {
  await sql.begin((tx) => setIn(tx as unknown as Sql, actorId, input));
}

/** `set` inside the caller's transaction (a task created together with its dependency). */
export async function setIn(db: Sql, actorId: number, input: SetDependencyInput): Promise<void> {
  await db`SELECT check_owner(${input.taskId}, ${actorId})`;
  if (input.value === input.taskId) throw new AppError('dependency_cycle');
  const [target] = Owner.array().parse(await db`
    SELECT owner_id,
           NOT EXISTS (SELECT 1 FROM dependency WHERE task_id = ${input.taskId} AND value = ${input.value}) AS is_new
      FROM task WHERE id = ${input.value}
  `);
  if (!target) throw new AppError('not_found');
  await db`
    INSERT INTO dependency (task_id, value, latest_at)
    VALUES (${input.taskId}, ${input.value}, ${input.latestAt})
    ON CONFLICT (task_id, value) DO UPDATE SET latest_at = EXCLUDED.latest_at
  `;
  if (target.isNew && target.ownerId !== null && target.ownerId !== actorId) {
    await db`SELECT notify(${target.ownerId}, ${input.value}, ${db.json({
      kind: 'dependency_added', by: actorId, dependentId: input.taskId, hard: input.latestAt !== null,
    })})`;
  }
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

/** The owner of a task takes note that a task it waits for is done: it leaves their Waiting for me. */
export async function noted(actorId: number, taskId: number, value: number): Promise<void> {
  await sql.begin(async (tx) => {
    const db = tx as unknown as Sql;
    await db`SELECT check_owner(${taskId}, ${actorId})`;
    const rows = await db`
      UPDATE dependency SET done_at = NULL WHERE task_id = ${taskId} AND value = ${value} AND done_at IS NOT NULL RETURNING value
    `;
    if (rows.length === 0) throw new AppError('not_found');
  });
}
