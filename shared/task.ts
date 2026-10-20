import { z } from 'zod';
import { Id } from './employee.ts';

// Tasks: the header everyone sees, the page of someone who sees the task,
// search and the owner's changes. A schema and its type share a name.

export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const;
export const Priority = z.enum(PRIORITIES);
export type Priority = z.infer<typeof Priority>;

/** Lower case only (db.sql, tag.name), inner spaces collapsed. */
export const TagName = z.string().trim().toLowerCase().overwrite((s) => s.replace(/\s+/g, ' ')).min(1).max(100);

/** #RRGGBB. */
export const TagColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** A tag as the viewer sees it: with their own color (NULL — the default). */
export const Tag = z.object({
  id: Id,
  name: z.string(),
  color: TagColor.nullable(),
  /**
   * In a task's title only: no other task carries the tag — it is the
   * phrase that says what this task is, shown as text, not as a tag to
   * group by (decision 56).
   */
  phrase: z.boolean().optional(),
});
export type Tag = z.infer<typeof Tag>;

/** Rich text from the editor; the server sanitizes it. */
export const Html = z.string().max(200_000);

/**
 * A task as everyone sees it (decision 19): tags in the viewer's own order,
 * priority, deadline and owner. Context, comments and people are not here.
 */
export const TaskHeader = z.object({
  id: Id,
  tags: Tag.array(),
  priority: Priority,
  /** NULL — no deadline. A deadline in the past means the task is closed. */
  deadline: z.date().nullable(),
  /** NULL — an ownerless task (its owner was dismissed without a manager). */
  ownerId: Id.nullable(),
  isPublic: z.boolean(),
  /**
   * The deadline will not be met by plans (db.sql, deadline_risk): the person
   * whose time left exceeds most their working time until the deadline;
   * NULL — it fits, or nothing to measure.
   */
  risk: z.object({ employeeId: Id, plannedMinutes: z.number().int(), capacityMinutes: z.number().int() }).nullable(),
});
export type TaskHeader = z.infer<typeof TaskHeader>;

/** A line in "Waits for" / "Waited on by". */
export const Dependency = TaskHeader.extend({
  /** NULL — a soft dependency; a number — hard, with this lag in minutes. */
  minMinutesAfter: z.number().int().nullable(),
});
export type Dependency = z.infer<typeof Dependency>;

/** What the viewer is to the task. */
export const Access = z.enum(['owner', 'observer', 'public', 'requested', 'none']);
export type Access = z.infer<typeof Access>;

/** The part of a task only someone who sees it gets. */
export const TaskDetails = z.object({
  /** Sanitized HTML. */
  context: z.string().nullable(),
  /** The owner's last "No intervention needed". */
  reviewedAt: z.date().nullable(),
  /** Comments by others since reviewedAt: how many and who wrote them. */
  newComments: z.object({ count: z.number().int(), authorIds: Id.array() }),
  /** Access requests waiting for the owner. */
  pendingRequests: z.number().int(),
  waitsFor: Dependency.array(),
  waitedOnBy: Dependency.array(),
});
export type TaskDetails = z.infer<typeof TaskDetails>;

export const TaskPage = TaskHeader.extend({
  access: Access,
  /** NULL when the viewer does not see the task. */
  details: TaskDetails.nullable(),
});
export type TaskPage = z.infer<typeof TaskPage>;

export const SearchInput = z.object({
  tagIds: Id.array().min(1).max(20),
  /**
   * 'mine' — open tasks I own; 'others' — the other open ones; 'closed' —
   * the closed ones (as in Current tasks); 'all' — any, to pick one.
   */
  tab: z.enum(['mine', 'others', 'closed', 'all']),
  page: z.number().int().min(1),
});
export type SearchInput = z.infer<typeof SearchInput>;

/** A title — its tags by name — to tell whether a task already has it. */
export const TitleInput = z.object({ tags: TagName.array().min(1).max(20) });
export type TitleInput = z.infer<typeof TitleInput>;

/** The task with exactly these tags; NULL — none: the title is free. */
export const TitleTaken = z.object({ id: Id }).nullable();
export type TitleTaken = z.infer<typeof TitleTaken>;

export const SearchResult = z.object({
  items: TaskHeader.extend({ canSee: z.boolean() }).array(),
  /** Found tasks in each tab. */
  counts: z.object({ mine: z.number().int(), others: z.number().int(), closed: z.number().int() }),
});
export type SearchResult = z.infer<typeof SearchResult>;

export const CreateInput = z.object({
  /** Existing or new tag names; new ones are created. */
  tags: TagName.array().min(1).max(20),
  priority: Priority.optional(),
  /** NULL or left out — no deadline. */
  deadline: z.date().nullable().optional(),
  context: Html.nullable().optional(),
  /** The new task waits for this one (soft). */
  waitsFor: Id.optional(),
  /** This task waits for the new one (soft); the creator must own it. */
  waitedOnBy: Id.optional(),
});
export type CreateInput = z.infer<typeof CreateInput>;

/** The owner's changes; fields left out stay. */
export const UpdateInput = z.object({
  id: Id,
  tags: TagName.array().min(1).max(20).optional(),
  priority: Priority.optional(),
  context: Html.nullable().optional(),
});
export type UpdateInput = z.infer<typeof UpdateInput>;

/** Hand a task over: the owner or the owner's direct manager picks the new owner. */
export const TransferInput = z.object({ id: Id, ownerId: Id });
export type TransferInput = z.infer<typeof TransferInput>;
