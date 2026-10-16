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
