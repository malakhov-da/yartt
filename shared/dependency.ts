import { z } from 'zod';
import { Id } from './employee.ts';

// The dependency graph: a task waits for another (db.sql, dependency).

/** The longest lag of a hard dependency: a year, in minutes. */
export const MAX_LAG_MINUTES = 366 * 24 * 60;

export const SetDependencyInput = z.object({
  /** The task that waits; its owner sets the dependency. */
  taskId: Id,
  /** The task it waits for. */
  value: Id,
  /** NULL — soft (deadlines are not tied); a number — hard, with this lag in minutes. */
  minMinutesAfter: z.number().int().min(0).max(MAX_LAG_MINUTES).nullable(),
});
export type SetDependencyInput = z.infer<typeof SetDependencyInput>;
