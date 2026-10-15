import { z } from 'zod';
import { Id } from './employee.ts';

// Personal reminders on a task (db.sql, remind): whom — always oneself.

export const Remind = z.object({
  at: z.date(),
  /** What exactly to remind about; NULL — just the task. */
  text: z.string().nullable(),
});
export type Remind = z.infer<typeof Remind>;

export const AddRemindInput = z.object({
  taskId: Id,
  at: z.date(),
  text: z.string().trim().max(500).nullable(),
});
export type AddRemindInput = z.infer<typeof AddRemindInput>;
