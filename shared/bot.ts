import { z } from 'zod';
import { As, FullName, Id, Pronoun } from './employee.ts';

// Bots: programs acting through the API with a key (db.sql, bot).

/** What a bot may change on top of reading what its relationships show it (db.sql, bot_permission). */
export const BOT_PERMISSIONS = ['task', 'task.transfer', 'comment', 'observers'] as const;
export const BotPermission = z.enum(BOT_PERMISSIONS);
export type BotPermission = z.infer<typeof BotPermission>;

export const Bot = z.object({
  id: Id,
  fullName: z.string(),
  about: z.string().nullable(),
  pronoun: Pronoun.nullable(),
  managerId: Id,
  permissions: BotPermission.array(),
  /** Where its notifications go, as signed JSON; NULL — only its bell. */
  webhookUrl: z.string().nullable(),
  /** The HMAC-SHA256 key of its webhook; only for its direct manager, NULL for the managers above. */
  webhookSecret: z.string().nullable(),
  keyIssuedAt: z.date(),
  /** When dismissed; NULL — working. */
  dismissedAt: z.date().nullable(),
  /** Stopped: the identity provider no longer lets its manager in (db.sql, authenticate_bot). */
  stopped: z.boolean(),
});
export type Bot = z.infer<typeof Bot>;

/** What its manager sets; the whole set is saved at once. */
export const BotInput = z.object({
  fullName: FullName,
  pronoun: Pronoun.nullable(),
  /** What it does and whom to ask about it. */
  about: z.string().max(10_000).nullable(),
  permissions: BotPermission.array().max(BOT_PERMISSIONS.length),
  webhookUrl: z.url({ protocol: /^https?$/ }).max(2000).nullable(),
});
export type BotInput = z.infer<typeof BotInput>;

export const BotUpdateInput = BotInput.extend({ id: Id });
export type BotUpdateInput = z.infer<typeof BotUpdateInput>;

export const BotTransferInput = z.object({ id: Id, toId: Id });
export type BotTransferInput = z.infer<typeof BotTransferInput>;

/** A bot's activity over a range (bot_usage) and its tasks now. */
export const BotStats = z.object({
  id: Id,
  /** Open tasks it owns now. */
  openTasks: z.number(),
  /** Open tasks it observes and does not own. */
  observedTasks: z.number(),
  /** Of its tasks, closed within the range. */
  closedTasks: z.number(),
  comments: z.number(),
  /** People it mentioned. */
  mentions: z.number(),
  requests: z.number(),
  /** Refused for lack of permission or access. */
  refused: z.number(),
  deliveries: z.number(),
  failedDeliveries: z.number(),
  /** Its last API call ever; NULL — never. */
  lastRequestAt: z.date().nullable(),
  /** Calls and refusals day by day over the range, oldest first. */
  daily: z.object({ day: z.iso.date(), requests: z.number().int(), refused: z.number().int() }).array(),
});
export type BotStats = z.infer<typeof BotStats>;

/** From a day to today, as in the Tags summary. */
export const BotStatsInput = z.object({ since: z.iso.date(), as: As });
export type BotStatsInput = z.infer<typeof BotStatsInput>;

/** A key: shown once, never again. */
export const BotKey = z.object({ id: Id, key: z.string() });
export type BotKey = z.infer<typeof BotKey>;
