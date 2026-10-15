import { z } from 'zod';
import { Id } from './employee.ts';
import { TagColor } from './task.ts';

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
