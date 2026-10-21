import { z } from 'zod';
import { Id } from './employee.ts';
import { Tag, TagColor } from './task.ts';

// The Tags tab: the tags I meet, with my own color and weight (db.sql, user_tag).

/** The weight orders the tags of a task "title": heavier first (ordered_tags()). */
export const Weight = z.number().int().min(-99).max(99);

export const MyTag = z.object({
  id: Id,
  name: z.string(),
  color: TagColor.nullable(),
  weight: z.number().int(),
  /** Tasks I see that carry the tag. */
  tasks: z.number().int(),
  /** Of them, open (no deadline or one ahead). */
  open: z.number().int(),
});
export type MyTag = z.infer<typeof MyTag>;

export const MyTagsInput = z.object({
  /** Part of the name; empty — all. */
  query: z.string().trim().max(100),
  page: z.number().int().min(1),
});
export type MyTagsInput = z.infer<typeof MyTagsInput>;

export const MyTags = z.object({ items: MyTag.array(), total: z.number().int() });
export type MyTags = z.infer<typeof MyTags>;

export const SetTagInput = z.object({ tagId: Id, color: TagColor.nullable(), weight: Weight });
export type SetTagInput = z.infer<typeof SetTagInput>;

export const SuggestInput = z.object({
  /** What is typed: one tag or several words that may name several tags. */
  text: z.string().max(200),
});
export type SuggestInput = z.infer<typeof SuggestInput>;

/** Tags already in a title: what goes with them. */
export const RelatedInput = z.object({ tagIds: Id.array().min(1).max(20) });
export type RelatedInput = z.infer<typeof RelatedInput>;

/** A part of a variant: an existing tag or a new name. */
export const TagPart = z.union([z.object({ tag: Tag }), z.object({ name: z.string() })]);
export type TagPart = z.infer<typeof TagPart>;

export const Suggestions = z.object({
  /** Tags close to the whole text — typos, transliteration, the other layout forgiven. */
  tags: Tag.array(),
  /**
   * Ways to read the text as several tags: words matched to existing tags,
   * the words between them as new ones. Best first; empty for one word.
   */
  variants: TagPart.array().array(),
  /** A tag spelled exactly as typed exists: nothing to create. */
  exact: z.boolean(),
});
export type Suggestions = z.infer<typeof Suggestions>;

/**
 * A line of the tag summary (decision 58): one tag, or the picked tags
 * all together ('all' — tasks carrying every one) or any of them ('any').
 */
export const TagGroup = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('tag'), tagId: Id }),
  z.object({ kind: z.enum(['all', 'any']), tagIds: Id.array().min(2).max(20) }),
]);
export type TagGroup = z.infer<typeof TagGroup>;

/** The last N days, today included, in the viewer's time zone: the plans of now belong next to them. */
export const LastDays = z.number().int().min(1).max(366);

export const TagStatsInput = z.object({
  days: LastDays,
  /** Picked tags: only them, and the lines of them all together and any of them; empty — every tag. */
  tagIds: Id.array().max(20),
  page: z.number().int().min(1),
});
export type TagStatsInput = z.infer<typeof TagStatsInput>;

/** What happened under a tag (or a group of tags) over the last days, on the tasks the viewer sees. */
export const TagStatsRow = z.object({
  group: TagGroup,
  /** The tag, or the picked ones. */
  tags: Tag.array(),
  /** Tasks carrying it. */
  tasks: z.number().int(),
  /** Of them, open now. */
  open: z.number().int(),
  /** Of the open, at risk: a plan does not fit before the deadline. */
  atRisk: z.number().int(),
  /** Of the open, untouched in the range: no comment, no time logged. */
  stale: z.number().int(),
  /** Closed in the range by hand: "Finish", or a deadline moved to the past. */
  finished: z.number().int(),
  /** Closed in the range by a deadline set in advance. */
  expired: z.number().int(),
  /** Tasks with any activity in the range — comments, time, closing: what "popular" means here. */
  active: z.number().int(),
  comments: z.number().int(),
  /** People who commented or logged time in the range. */
  people: z.number().int(),
  /**
   * Of those who logged time under it, the average share of their own time
   * logged in the range that went here, 0..1 — an average over people,
   * never hours added up (decision 38); NULL — nobody logged time.
   */
  share: z.number().nullable(),
});
export type TagStatsRow = z.infer<typeof TagStatsRow>;

export const TagStats = z.object({
  rows: TagStatsRow.array(),
  /** Lines of single tags in all, for the pages. */
  total: z.number().int(),
});
export type TagStats = z.infer<typeof TagStats>;

export const TagDetailInput = z.object({ days: LastDays, group: TagGroup });
export type TagDetailInput = z.infer<typeof TagDetailInput>;

/** One person under a line: their own time, share and plan — never added up with anyone's (decision 38). */
export const TagPerson = z.object({
  employeeId: Id,
  /** Time they logged to the tasks under it in the range. */
  minutes: z.number().int(),
  /** Of all the time they logged in the range, the share that went here, 0..1; NULL — they logged none. */
  share: z.number().nullable(),
  /** Their "time left" now on its open tasks; NULL — no plan. */
  leftMinutes: z.number().int().nullable(),
  comments: z.number().int(),
  /** Their time on it, day by day, as `days`. */
  daily: z.number().int().array(),
});
export type TagPerson = z.infer<typeof TagPerson>;

/** A line unfolded: its activity day by day and its people, for the charts. */
export const TagDetail = z.object({
  /** The days of the range, oldest first. */
  days: z.iso.date().array(),
  /** Counts per day — counts may be added up. */
  comments: z.number().int().array(),
  closed: z.number().int().array(),
  /** People who commented or logged time that day. */
  people: z.number().int().array(),
  /** Most time first. */
  persons: TagPerson.array(),
});
export type TagDetail = z.infer<typeof TagDetail>;
