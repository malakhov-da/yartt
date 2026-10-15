import { z } from 'zod';
import { Id } from '#shared/employee.ts';
import { CreateInput, SearchInput, SearchResult, TaskPage, TransferInput, UpdateInput } from '#shared/task.ts';
import * as Tasks from '../services/Task.ts';
import { authedProcedure, router } from '../trpc.ts';

export default router({
  /**
   * Tasks carrying all the given tags — any task, since tags are visible to
   * everyone (`canSee` says whether it opens). With `text`, the tasks with a
   * tag containing it, and the ones the signed-in employee sees whose context
   * or comments contain it. One tab — mine or the others — per call, with
   * counts for both; open tasks first, by deadline; 20 per page.
   */
  search: authedProcedure
    .input(SearchInput)
    .output(SearchResult)
    .query(({ input, ctx }) => Tasks.search(ctx.employeeId, input)),

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
    .input(z.object({ id: Id }))
    .output(z.void())
    .mutation(({ input, ctx }) => Tasks.markReviewed(ctx.employeeId, input.id)),

  /**
   * The owner makes the task public: every observer row closes, everyone
   * sees it, waiting requesters are told it is open.
   * @throws forbidden — not the owner.
   */
  makePublic: authedProcedure
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
    .input(z.object({ id: Id }))
    .output(Id.array())
    .mutation(({ input, ctx }) => Tasks.makePrivate(ctx.employeeId, input.id)),
});
