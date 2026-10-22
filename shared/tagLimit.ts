import { z } from 'zod';
import { Day, Id } from './employee.ts';
import { Tag } from './task.ts';

// Limits of hours on a combination of tags for a fixed period (decision 69; db.sql, tag_limit).

/** The longest period: two years. */
export const MAX_LIMIT_DAYS = 731;

export const TagLimitInput = z.object({
  /** The limit this one replaces — a change is a new row; NULL — a new limit. */
  replaces: Id.nullable(),
  /** The combination: a task counts when it carries all of them. */
  tagIds: Id.array().min(1).max(20),
  startsOn: Day,
  endsOn: Day,
  minutes: z.number().int().min(1).max(100_000_000),
}).refine((x) => x.startsOn <= x.endsOn, { path: ['endsOn'] })
  .refine((x) => (Date.parse(x.endsOn) - Date.parse(x.startsOn)) / 86_400_000 <= MAX_LIMIT_DAYS, { path: ['endsOn'] });
export type TagLimitInput = z.infer<typeof TagLimitInput>;

/** A current limit with where it stands: spent, planned, forecast and the spending day by day. */
export const TagLimit = z.object({
  id: Id,
  /** Who set it: their hours and their people's count against it. */
  employeeId: Id,
  tags: Tag.array(),
  startsOn: Day,
  endsOn: Day,
  minutes: z.number().int(),
  createdAt: z.date(),
  /** Logged in the period on the tasks carrying all its tags, by its people. */
  spentMinutes: z.number().int(),
  /** Left in their plans on those tasks still open. */
  leftMinutes: z.number().int(),
  /** What it will come to: spent and planned; once the period is over, what was spent. */
  forecastMinutes: z.number().int(),
  /** The days from its start to today or its end, and what had been spent by each of them. */
  days: Day.array(),
  cumulative: z.number().int().array(),
  /** Whether it has earlier versions. */
  changed: z.boolean(),
  /** Whether the viewer's own hours count against it: they set it, or it is a manager's of theirs. */
  includesMe: z.boolean(),
});
export type TagLimit = z.infer<typeof TagLimit>;

/** A version of a limit: what it was and when it stopped being so. */
export const TagLimitVersion = z.object({
  id: Id,
  employeeId: Id,
  tags: Tag.array(),
  startsOn: Day,
  endsOn: Day,
  minutes: z.number().int(),
  createdAt: z.date(),
  /** NULL — current. */
  expiredAt: z.date().nullable(),
});
export type TagLimitVersion = z.infer<typeof TagLimitVersion>;

export const TagLimits = z.object({
  current: TagLimit.array(),
  /** Removed ones, not replaced: their last version, the latest first. */
  removed: TagLimitVersion.array(),
});
export type TagLimits = z.infer<typeof TagLimits>;
