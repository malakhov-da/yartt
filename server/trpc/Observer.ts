import { z } from 'zod';
import { Id } from '#shared/employee.ts';
import { Mentionable, People } from '#shared/observer.ts';
import * as Observers from '../services/Observer.ts';
import { authedProcedure, router } from '../trpc.ts';

const TaskEmployee = z.object({ taskId: Id, employeeId: Id });

export default router({
  /**
   * People of a task with their time and observation periods, 10 per page,
   * and everyone's time on it together — logged and left (decision 68),
   * by last visit; access requests on top. A private task lists everyone
   * who ever observed it, a public one everyone who opened it or logged time.
   * @throws no_access
   */
  list: authedProcedure
    .input(z.object({ taskId: Id, page: z.number().int().min(1) }))
    .output(People)
    .query(({ input, ctx }) => Observers.list(ctx.employeeId, input.taskId, input.page)),

  /**
   * Whom a comment on the task may mention: in a private task only its
   * participants (active observers), in a public one anyone working.
   * @throws no_access
   */
  mentionable: authedProcedure
    .input(z.object({ taskId: Id }))
    .output(Mentionable)
    .query(({ input, ctx }) => Observers.mentionable(ctx.employeeId, input.taskId)),

  /**
   * A participant (the owner among them) adds an observer to a private task
   * or brings a former one back, like a copy in an email; they are notified.
   * Removing stays the owner's.
   * @throws forbidden — not a participant.
   * @throws task_public — make the task private first.
   * @throws not_found — unknown or dismissed employee.
   */
  add: authedProcedure
    .meta({ bot: 'observers' })
    .input(TaskEmployee)
    .output(z.void())
    .mutation(({ input, ctx }) => Observers.add(ctx.employeeId, input.taskId, input.employeeId)),

  /**
   * The owner hides an observer; they are notified.
   * @throws forbidden — not the owner.
   * @throws not_observer
   * @throws owner_cannot_leave
   * @throws manager_cannot_leave — a report of theirs observes the task.
   */
  remove: authedProcedure
    .meta({ bot: 'observers' })
    .input(TaskEmployee)
    .output(z.void())
    .mutation(({ input, ctx }) => Observers.remove(ctx.employeeId, input.taskId, input.employeeId)),

  /**
   * The signed-in observer leaves the task.
   * @throws not_observer
   * @throws owner_cannot_leave
   * @throws manager_cannot_leave
   */
  leave: authedProcedure
    .meta({ bot: 'observers' })
    .input(z.object({ taskId: Id }))
    .output(z.void())
    .mutation(({ input, ctx }) => Observers.leave(ctx.employeeId, input.taskId)),

  /**
   * The signed-in employee asks for access to a private task; the owner is
   * notified, the answer comes as a notification.
   * @throws task_public
   * @throws already_observer
   */
  request: authedProcedure
    .meta({ bot: 'observers' })
    .input(z.object({ taskId: Id }))
    .output(z.void())
    .mutation(({ input, ctx }) => Observers.request(ctx.employeeId, input.taskId)),

  /**
   * The signed-in employee withdraws their own request.
   * @throws no_pending_request
   */
  withdraw: authedProcedure
    .meta({ bot: 'observers' })
    .input(z.object({ taskId: Id }))
    .output(z.void())
    .mutation(({ input, ctx }) => Observers.withdraw(ctx.employeeId, input.taskId)),

  /**
   * The owner approves a request; the requester is notified.
   * @throws forbidden — not the owner.
   * @throws no_pending_request
   */
  approve: authedProcedure
    .meta({ bot: 'observers' })
    .input(TaskEmployee)
    .output(z.void())
    .mutation(({ input, ctx }) => Observers.approve(ctx.employeeId, input.taskId, input.employeeId)),

  /**
   * The owner rejects a request; the requester is notified.
   * @throws forbidden — not the owner.
   * @throws no_pending_request
   */
  reject: authedProcedure
    .meta({ bot: 'observers' })
    .input(TaskEmployee)
    .output(z.void())
    .mutation(({ input, ctx }) => Observers.reject(ctx.employeeId, input.taskId, input.employeeId)),
});
