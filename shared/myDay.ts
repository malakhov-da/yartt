import { z } from 'zod';
import { Day, Id } from './employee.ts';
import { MentionReply } from './comment.ts';
import { TaskHeader } from './task.ts';

// My day (docs/product/interface.md, 1): TODO, current tasks, history of my days.

/** An open mention of me: closed only by "Done". */
export const TodoMention = z.object({
  kind: z.literal('mention'),
  task: TaskHeader,
  commentId: Id,
  authorId: Id,
  at: z.date(),
  /** The beginning of the comment as plain text. */
  excerpt: z.string(),
  /** My answers, oldest first; empty — none yet. With one "Done" is allowed. */
  replies: MentionReply.array(),
});
export type TodoMention = z.infer<typeof TodoMention>;

/** My task with comments by others since my last "No intervention needed" (decision 16). */
export const TodoReview = z.object({
  kind: z.literal('review'),
  task: TaskHeader,
  /** The latest of those comments. */
  at: z.date(),
  count: z.number().int(),
  /** Authors in the order they first wrote. */
  authorIds: Id.array(),
  /** "No intervention needed" waits for these to be answered. */
  pendingRequests: z.number().int(),
});
export type TodoReview = z.infer<typeof TodoReview>;

/** An access request to my task. */
export const TodoRequest = z.object({
  kind: z.literal('request'),
  task: TaskHeader,
  employeeId: Id,
});
export type TodoRequest = z.infer<typeof TodoRequest>;

export const TodoItem = z.discriminatedUnion('kind', [TodoMention, TodoReview, TodoRequest]);
export type TodoItem = z.infer<typeof TodoItem>;

/** 'mine' — open tasks I own; 'others' — every other open task I see; 'closed' — the closed ones I see. */
export const CurrentTab = z.enum(['mine', 'others', 'closed']);
export type CurrentTab = z.infer<typeof CurrentTab>;

export const CurrentInput = z.object({
  tab: CurrentTab,
  page: z.number().int().min(1),
});
export type CurrentInput = z.infer<typeof CurrentInput>;

export const Current = z.object({
  items: TaskHeader.array(),
  /** Tasks in each tab, for the tab labels. */
  counts: z.object({ mine: z.number().int(), others: z.number().int(), closed: z.number().int() }),
});
export type Current = z.infer<typeof Current>;

/** A shift of the timesheet. */
export const Shift = z.object({
  startedAt: z.date(),
  /** NULL — the shift is open. */
  spentMinutes: z.number().int().nullable(),
  about: z.string().nullable(),
});
export type Shift = z.infer<typeof Shift>;

/** Time logged to a task (spent_minutes). */
export const Entry = z.object({
  id: Id,
  taskId: Id,
  minutes: z.number().int(),
  /** When its value was last set. */
  updatedAt: z.date(),
});
export type Entry = z.infer<typeof Entry>;

/** Opening a task, or My day when taskId is NULL. */
export const Visit = z.object({
  taskId: Id.nullable(),
  at: z.date(),
});
export type Visit = z.infer<typeof Visit>;

/** Something done, not only looked at: a comment written, time logged. */
export const Action = z.object({
  kind: z.enum(['comment', 'time']),
  taskId: Id,
  at: z.date(),
});
export type Action = z.infer<typeof Action>;

export const DayHistory = z.object({
  day: Day,
  shifts: Shift.array(),
  entries: Entry.array(),
  /** Oldest first. */
  visits: Visit.array(),
  /** Oldest first: what was done, for the day's ribbon next to the visits. */
  actions: Action.array(),
  /** The first and last thing I did that day: visits, comments, time logged. */
  firstActivity: z.date().nullable(),
  lastActivity: z.date().nullable(),
  /** NULL — never scored; `value` NULL — the score was withdrawn (its reason stays): the day is open again. */
  score: z.object({ value: z.number().int().nullable(), reason: z.string().nullable() }).nullable(),
});
export type DayHistory = z.infer<typeof DayHistory>;

export const HistoryInput = z.object({
  /** 1 — starting from today. */
  page: z.number().int().min(1),
  /** Days with activity per page: 2 in My day (today and the last day before), more on the employee page. */
  size: z.number().int().min(1).max(31).default(7),
});
export type HistoryInput = z.infer<typeof HistoryInput>;

export const History = z.object({
  /** Today in my time zone. */
  today: Day,
  /** Newest first; days without any activity are skipped (except today). */
  days: DayHistory.array(),
  /** Headers of the tasks the days refer to. */
  tasks: TaskHeader.array(),
  /** When the open shift started, maybe on another page: no shift can begin after it. */
  openShiftFrom: z.date().nullable(),
  /** Days with activity in all (today included), for the pages. */
  total: z.number().int(),
});
export type History = z.infer<typeof History>;

export const About = z.string().trim().max(2000).nullable();

/** My open shift, or none. */
export const OpenShift = z.object({ startedAt: z.date() }).nullable();
export type OpenShift = z.infer<typeof OpenShift>;

export const StartShiftInput = z.object({ startedAt: z.date() });
export type StartShiftInput = z.infer<typeof StartShiftInput>;

/** Closing the open shift; its start may be corrected at the same time. */
export const CloseShiftInput = z.object({ startedAt: z.date(), endedAt: z.date(), about: About });
export type CloseShiftInput = z.infer<typeof CloseShiftInput>;

/** A closed shift added at once, e.g. a suggestion for a past day confirmed. */
export const AddShiftInput = CloseShiftInput;
export type AddShiftInput = z.infer<typeof AddShiftInput>;

/** A closed shift corrected: found by its start, given a new start, end and what was done. */
export const UpdateShiftInput = z.object({ startedAt: z.date(), newStartedAt: z.date(), endedAt: z.date(), about: About });
export type UpdateShiftInput = z.infer<typeof UpdateShiftInput>;

/** A shift, open or closed, by its start. */
export const ShiftKey = z.object({ startedAt: z.date() });
export type ShiftKey = z.infer<typeof ShiftKey>;
