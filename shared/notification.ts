import { z } from 'zod';
import { Day, Id } from './employee.ts';

// Payloads of notification.payload (JSONB), by kind. Written by the database
// functions and the application, parsed on the way out.
// `for` is set on a copy sent to the manager of an absent recipient.

const Copy = { for: Id.optional() };

export const NotificationPayload = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('invite'), by: Id, ...Copy }),
  z.object({ kind: z.literal('comment'), by: Id, commentId: Id, ...Copy }),
  z.object({ kind: z.literal('mention'), by: Id, commentId: Id, ...Copy }),
  z.object({ kind: z.literal('task_mention'), by: Id, commentId: Id, ...Copy }),
  z.object({ kind: z.literal('remind'), text: z.string().nullable(), ...Copy }),
  z.object({ kind: z.literal('access_request'), employeeId: Id, ...Copy }),
  z.object({ kind: z.literal('access_opened'), by: Id, ...Copy }),
  z.object({ kind: z.literal('access_closed'), by: Id, ...Copy }),
  z.object({ kind: z.literal('finished_at_change'), dependencyId: Id, ...Copy }),
  /** Someone's task now waits for mine; a hard dependency ties my deadline. */
  z.object({ kind: z.literal('dependency_added'), by: Id, dependentId: Id, hard: z.boolean(), ...Copy }),
  z.object({ kind: z.literal('owner_change'), from: Id, ...Copy }),
  z.object({ kind: z.literal('owner_handed'), by: Id, employeeId: Id, ...Copy }),
  // Every version of a score is mailed: the employee's mail is its history.
  z.object({
    kind: z.literal('score'),
    by: Id,
    day: Day,
    /** NULL — the score was withdrawn: the day's timesheet can be corrected. */
    value: z.number().int().nullable(),
    reason: z.string().nullable(),
    /** When this version was given, ISO. */
    at: z.string(),
    /** The value it replaced; NULL — the first score of the day (a withdrawn one has value NULL). */
    previous: z.object({ value: z.number().int().nullable(), reason: z.string().nullable() }).nullable(),
    ...Copy,
  }),
  z.object({ kind: z.literal('new_report'), employeeId: Id, ...Copy }),
  // Monday morning for a manager: what waits for them in their team.
  z.object({
    kind: z.literal('weekly_digest'),
    /** Days of direct reports waiting for a score. */
    unscored: z.number().int(),
    /** Tasks of the subtree closed automatically last week. */
    expired: z.number().int(),
    /** Tasks of the subtree at risk now. */
    atRisk: z.number().int(),
    ...Copy,
  }),
  // Once a year of a bot's key's age, to its manager: the key keeps working.
  z.object({ kind: z.literal('bot_key_old'), employeeId: Id, /** When the key was issued, ISO. */ issuedAt: z.string(), ...Copy }),
]);
export type NotificationPayload = z.infer<typeof NotificationPayload>;
export type NotificationKind = NotificationPayload['kind'];
