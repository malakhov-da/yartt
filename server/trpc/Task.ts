import { z } from 'zod';
import { Id } from '#shared/employee.ts';
import { CreateInput, SearchInput, SearchResult, TaskPage, TitleInput, TitleTaken, TransferInput, UpdateInput } from '#shared/task.ts';
import * as Tasks from '../services/Task.ts';
import { authedProcedure, router } from '../trpc.ts';

export default router({
  /**
   * Tasks carrying all the given tags — any task, since tags are visible to
   * everyone (`canSee` says whether it opens). One tab — mine, the others or
   * all — per call, with counts for mine and the others; open tasks first, by
   * deadline; 20 per page.
   */
  search: authedProcedure
    .input(SearchInput)
    .output(SearchResult)
    .query(({ input, ctx }) => Tasks.search(ctx.employeeId, input)),

  /**
   * The task that already has exactly this title (these tags), so a title
   * that is taken is told before saving; NULL — it is free.
   */
  byTags: authedProcedure
    .input(TitleInput)
    .output(TitleTaken)
    .query(({ input }) => Tasks.byTags(input.tags)),

  /**
   * The task page. The header (tags, priority, deadline, owner, public or
   * not) is for everyone; `details` only for someone who sees the task.
   * @throws not_found
   */
  get: authedProcedure
    .input(z.object({ id: Id }))
    .output(TaskPage)
    .query(({ input, ctx }) => Tasks.get(ctx.employeeId, input.id)),

  /**
   * Creates a private task owned by the signed-in employee; new tags are
   * created. Priority, deadline, context and a soft dependency — the new
   * task waits for `waitsFor`, or `waitedOnBy` (the creator's own task)
   * waits for it — may come at once. Returns its id.
   * @throws tag_set_taken — a task with this set of tags exists.
   * @throws forbidden — `waitedOnBy` is not the creator's task.
   * @throws not_found — an unknown task to depend on.
   * @throws unknown_attachment — an image the creator may not read.
   */
  create: authedProcedure
    .meta({ bot: 'task' })
    .input(CreateInput)
    .output(Id)
    .mutation(({ input, ctx }) => Tasks.create(ctx.employeeId, input)),

  /**
   * The owner changes tags, priority or context (rich text, sanitized);
   * fields left out stay.
   * @throws forbidden — not the owner.
   * @throws tag_set_taken
   * @throws unknown_attachment — an image the owner may not read.
   */
  update: authedProcedure
    .meta({ bot: 'task' })
    .input(UpdateInput)
    .output(z.void())
    .mutation(({ input, ctx }) => Tasks.update(ctx.employeeId, input)),

  /**
   * The owner sets, moves or clears (null) the deadline. A deadline in the
   * past closes the task; "Finish" is setting it to now.
   * @throws forbidden — not the owner.
   * @throws hard_dependency_violated
   */
  setDeadline: authedProcedure
    .meta({ bot: 'task' })
    .input(z.object({ id: Id, deadline: z.date().nullable() }))
    .output(z.void())
    .mutation(({ input, ctx }) => Tasks.setDeadline(ctx.employeeId, input.id, input.deadline)),

  /**
   * Hands the task over to another employee. The owner or the owner's
   * direct manager may; the new owner is notified, and the previous one
   * too when the manager acts. The previous owner stays an observer.
   * @throws forbidden — neither the owner nor their manager, or the task has no owner.
   * @throws not_found — unknown task, or the new owner is unknown or dismissed.
   */
  transfer: authedProcedure
    .meta({ bot: 'task.transfer' })
    .input(TransferInput)
    .output(z.void())
    .mutation(({ input, ctx }) => Tasks.transfer(ctx.employeeId, input.id, input.ownerId)),

  /**
   * The signed-in employee takes an ownerless task they see.
   * @throws forbidden — the task has an owner.
   * @throws no_access
   */
  take: authedProcedure
    .input(z.object({ id: Id }))
    .output(z.void())
    .mutation(({ input, ctx }) => Tasks.take(ctx.employeeId, input.id)),

  /**
   * "No intervention needed": the owner confirms nothing in the task waits
   * for their decision.
   * @throws forbidden — not the owner.
   * @throws pending_requests — answer the access requests first.
   */
  markReviewed: authedProcedure
    .meta({ bot: 'task' })
    .input(z.object({ id: Id }))
    .output(z.void())
    .mutation(({ input, ctx }) => Tasks.markReviewed(ctx.employeeId, input.id)),

  /**
   * The owner makes the task public: every observer row closes, everyone
   * sees it, waiting requesters are told it is open.
   * @throws forbidden — not the owner.
   */
  makePublic: authedProcedure
    .meta({ bot: 'task' })
    .input(z.object({ id: Id }))
    .output(z.void())
    .mutation(({ input, ctx }) => Tasks.makePublic(ctx.employeeId, input.id)),

  /**
   * The owner makes a public task private. Stay: the owner, their managers,
   * everyone with an open mention. Returns the others who commented — they
   * are told access is closed and may be brought back (Observer.add).
   * @throws forbidden — not the owner.
   */
  makePrivate: authedProcedure
    .meta({ bot: 'task' })
    .input(z.object({ id: Id }))
    .output(Id.array())
    .mutation(({ input, ctx }) => Tasks.makePrivate(ctx.employeeId, input.id)),
});
