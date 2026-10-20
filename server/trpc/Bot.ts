import { z } from 'zod';
import { Bot, BotInput, BotKey, BotTransferInput, BotUpdateInput } from '#shared/bot.ts';
import { Id } from '#shared/employee.ts';
import * as Bots from '../services/Bot.ts';
import { authedProcedure, router } from '../trpc.ts';

export default router({
  /**
   * Bots the signed-in person answers for: their own and those of everyone
   * under them, dismissed ones included. The webhook secret only of their own.
   */
  list: authedProcedure.output(Bot.array()).query(({ ctx }) => Bots.list(ctx.employeeId)),

  /**
   * Creates a bot under the signed-in person; its key is returned only now.
   * @throws forbidden — a bot cannot create bots.
   */
  create: authedProcedure
    .input(BotInput)
    .output(BotKey)
    .mutation(({ input, ctx }) => Bots.create(ctx.employeeId, input)),

  /**
   * Changes a bot: name, pronoun, about, permissions, webhook.
   * @throws not_manager — only its direct manager.
   * @throws not_found — unknown or dismissed.
   */
  update: authedProcedure
    .input(BotUpdateInput)
    .output(Bot)
    .mutation(({ input: { id, ...input }, ctx }) => Bots.update(ctx.employeeId, id, input)),

  /**
   * Replaces a bot's key: the old one stops at once, the new one is returned
   * only now.
   * @throws not_manager — only its direct manager.
   * @throws not_found — unknown or dismissed.
   */
  resetKey: authedProcedure
    .input(z.object({ id: Id }))
    .output(BotKey)
    .mutation(({ input, ctx }) => Bots.resetKey(ctx.employeeId, input.id)),

  /**
   * Replaces the secret its webhook bodies are signed with.
   * @throws not_manager — only its direct manager.
   * @throws not_found — unknown or dismissed.
   */
  resetWebhookSecret: authedProcedure
    .input(z.object({ id: Id }))
    .output(Bot)
    .mutation(({ input, ctx }) => Bots.resetWebhookSecret(ctx.employeeId, input.id)),

  /**
   * Hands a bot to another person at once; they are notified and issue its
   * next key — the current one stops.
   * @throws not_manager — only its direct manager.
   * @throws not_found — the bot or the person is unknown or dismissed, or a bot.
   */
  transfer: authedProcedure
    .input(BotTransferInput)
    .output(z.void())
    .mutation(({ input, ctx }) => Bots.transfer(ctx.employeeId, input.id, input.toId)),
});
