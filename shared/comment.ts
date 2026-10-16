import { z } from 'zod';
import { Day, Id } from './employee.ts';
import { Html, TaskHeader } from './task.ts';

// The feed of a task: comments and deadline moves, newest first.

export const FileRef = z.object({
  id: Id,
  name: z.string(),
  size: z.number().int(),
  mime: z.string(),
});
export type FileRef = z.infer<typeof FileRef>;

export const Mention = z.object({
  employeeId: Id,
  /** NULL — open. */
  closedAt: z.date().nullable(),
  /** The mentioned employee commented after it: "Done" is allowed. */
  replied: z.boolean(),
});
export type Mention = z.infer<typeof Mention>;

export const Comment = z.object({
  kind: z.literal('comment'),
  id: Id,
  authorId: Id,
  at: z.date(),
  /** Sanitized HTML. */
  html: z.string(),
  replyTo: z.object({ id: Id, authorId: Id, excerpt: z.string() }).nullable(),
  files: FileRef.array(),
  mentions: Mention.array(),
  tasks: TaskHeader.array(),
  /** Written by someone else after the owner's last "No intervention needed"; only for the owner. */
  isNew: z.boolean(),
});
export type Comment = z.infer<typeof Comment>;

/** A deadline set, moved or cleared. */
export const DeadlineEvent = z.object({
  kind: z.literal('deadline'),
  at: z.date(),
  from: z.date().nullable(),
  to: z.date().nullable(),
});
export type DeadlineEvent = z.infer<typeof DeadlineEvent>;

/** A comment of another task attached this one. */
export const MentionedInEvent = z.object({
  kind: z.literal('mentioned_in'),
  at: z.date(),
  /** The header only: the other task may be one the viewer does not see. */
  task: TaskHeader,
});
export type MentionedInEvent = z.infer<typeof MentionedInEvent>;

/**
 * Someone logged time to the task (spent_minutes). Entries of one person in
 * a row — nothing else between them in the feed — come as one event.
 */
export const SpentEvent = z.object({
  kind: z.literal('spent'),
  /** The latest entry. */
  at: z.date(),
  employeeId: Id,
  /** The sum. */
  minutes: z.number().int(),
  /** Each entry, the latest day first: one for a single entry. */
  entries: z.object({ day: Day, minutes: z.number().int() }).array().min(1),
});
export type SpentEvent = z.infer<typeof SpentEvent>;

/** Someone set or cleared their time left (estimate_minutes). */
export const PlanEvent = z.object({
  kind: z.literal('plan'),
  at: z.date(),
  employeeId: Id,
  /** NULL — cleared. */
  minutes: z.number().int().nullable(),
});
export type PlanEvent = z.infer<typeof PlanEvent>;

export const FeedItem = z.discriminatedUnion('kind', [Comment, DeadlineEvent, MentionedInEvent, SpentEvent, PlanEvent]);
export type FeedItem = z.infer<typeof FeedItem>;

/**
 * 'mentions' — only comments with open mentions; 'all' — every comment and
 * event: deadline moves, mentions in other tasks, time logged and planned.
 */
export const FeedFilter = z.enum(['mentions', 'all']);
export type FeedFilter = z.infer<typeof FeedFilter>;

export const Feed = z.object({
  items: FeedItem.array(),
  /** Items under the current filter. */
  total: z.number().int(),
  openMentions: z.number().int(),
  /** Comments and events together. */
  all: z.number().int(),
});
export type Feed = z.infer<typeof Feed>;

export const CreateCommentInput = z.object({
  taskId: Id,
  html: Html.min(1),
  replyToId: Id.nullable(),
  files: z.object({ id: Id, name: z.string().trim().min(1).max(255) }).array().max(50),
  mentionIds: Id.array().max(50),
  taskIds: Id.array().max(50),
});
export type CreateCommentInput = z.infer<typeof CreateCommentInput>;
