import { z } from 'zod';
import { Id } from './employee.ts';

// People of a task and their time (docs/product/interface.md, side panel).

/** One stretch of time someone observed the task. */
export const Period = z.object({
  from: z.date(),
  /** NULL — still observes. */
  to: z.date().nullable(),
  /** NULL — added by the system (owner, manager) or by their own request. */
  addedBy: Id.nullable(),
  /** NULL — still observes, or left by themselves. */
  removedBy: Id.nullable(),
});
export type Period = z.infer<typeof Period>;

export const Person = z.object({
  employeeId: Id,
  lastVisit: z.date().nullable(),
  /** Everything they logged to the task. */
  spentMinutes: z.number().int(),
  /** Their current time left; NULL — not given. */
  leftMinutes: z.number().int().nullable(),
  /** Observes the task now (always false for a public task). */
  active: z.boolean(),
  /**
   * Why they cannot be hidden: 'owner', or the id of their report who
   * observes the task. NULL — can be hidden.
   */
  lockedBy: z.union([z.literal('owner'), Id]).nullable(),
  /**
   * They have an open mention here: in a private task it is what brought
   * them in, and it keeps them when the task is made private again.
   */
  openMention: z.boolean(),
  /** Observation periods, oldest first; empty for a public task. */
  periods: Period.array(),
});
export type Person = z.infer<typeof Person>;

export const Request = z.object({ employeeId: Id });
export type Request = z.infer<typeof Request>;

export const People = z.object({
  /** Waiting access requests, oldest first (shown to everyone who sees the task). */
  requests: Request.array(),
  /**
   * A private task: everyone who ever observed it. A public task: everyone
   * who opened it or logged time. By last visit, newest first.
   */
  items: Person.array(),
  total: z.number().int(),
});
export type People = z.infer<typeof People>;

export const MyTime = z.object({
  spentMinutes: z.number().int(),
  leftMinutes: z.number().int().nullable(),
});
export type MyTime = z.infer<typeof MyTime>;

export const Minutes = z.number().int().min(1).max(100_000);
