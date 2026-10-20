import { z } from 'zod';
import { FullName, Id, Pronoun } from './employee.ts';

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

/** A key: shown once, never again. */
export const BotKey = z.object({ id: Id, key: z.string() });
export type BotKey = z.infer<typeof BotKey>;
