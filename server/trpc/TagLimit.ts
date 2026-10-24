import { z } from 'zod';
import { As, AsInput, Id } from '#shared/employee.ts';
import { TagLimit, TagLimitInput, TagLimits, TagLimitVersion } from '#shared/tagLimit.ts';
import * as TagLimitService from '../services/TagLimit.ts';
import { viewAs } from '../services/Team.ts';
import { authedProcedure, router } from '../trpc.ts';

export default router({
  /**
   * The limits of hours on tag combinations the signed-in employee sees —
   * theirs, those of everyone under them, and those of their managers,
   * which count their hours too — the current ones with spent, planned,
   * forecast and the spending day by day, and the removed ones.
   */
  list: authedProcedure
    .input(AsInput.optional())
    .output(TagLimits)
    .query(async ({ input, ctx }) => TagLimitService.list(await viewAs(ctx.employeeId, input?.as))),

  /**
   * The current limits a task falls under (it carries all their tags) that
   * the signed-in employee sees: what to keep in mind when planning it.
   */
  forTask: authedProcedure
    .input(z.object({ taskId: Id }))
    .output(TagLimit.array())
    .query(({ input, ctx }) => TagLimitService.forTask(ctx.employeeId, input.taskId)),

  /**
   * Every version of a limit, the latest first.
   * @throws not_found — unknown, or not seen by the signed-in employee.
   */
  history: authedProcedure
    .input(z.object({ id: Id, as: As }))
    .output(TagLimitVersion.array())
    .query(async ({ input, ctx }) => TagLimitService.history(await viewAs(ctx.employeeId, input.as), input.id)),

  /**
   * Sets a limit for the signed-in employee and everyone under them; with
   * `replaces`, changes one of theirs: a new version, the old one closed.
   * @throws forbidden — `replaces` is someone else's.
   * @throws not_found — `replaces` is not a current limit, or a tag is unknown.
   */
  set: authedProcedure
    .input(TagLimitInput)
    .output(Id)
    .mutation(({ input, ctx }) => TagLimitService.set(ctx.employeeId, input)),

  /**
   * Removes a limit of the signed-in employee: it is closed, its history kept.
   * @throws forbidden — someone else's.
   * @throws not_found
   */
  remove: authedProcedure
    .input(z.object({ id: Id }))
    .output(z.void())
    .mutation(({ input, ctx }) => TagLimitService.remove(ctx.employeeId, input.id)),
});
