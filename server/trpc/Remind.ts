import { z } from 'zod';
import { Id } from '#shared/employee.ts';
import { AddRemindInput, MoveRemindInput, Remind } from '#shared/remind.ts';
import * as Reminds from '../services/Remind.ts';
import { authedProcedure, router } from '../trpc.ts';

export default router({
  /**
   * The signed-in employee's reminders on a task, soonest first; the due ones
   * among them wait to be removed or moved.
   * @throws no_access
   */
  list: authedProcedure
    .input(z.object({ taskId: Id }))
    .output(Remind.array())
    .query(({ input, ctx }) => Reminds.list(ctx.employeeId, input.taskId)),

  /**
   * Sets a reminder for the signed-in employee on a task they see. It comes
   * as a notification at `at` (checked every minute) and then waits in
   * "Waiting for me" until removed or moved.
   * @throws no_access
   * @throws remind_in_past
   */
  add: authedProcedure
    .input(AddRemindInput)
    .output(z.void())
    .mutation(({ input, ctx }) => Reminds.add(ctx.employeeId, input)),

  /**
   * Puts one of the signed-in employee's reminders off to a later moment,
   * due or not: it comes again then.
   * @throws not_found
   * @throws remind_in_past
   */
  move: authedProcedure
    .input(MoveRemindInput)
    .output(z.void())
    .mutation(({ input, ctx }) => Reminds.move(ctx.employeeId, input)),

  /**
   * Deletes one of the signed-in employee's reminders.
   * @throws not_found
   */
  remove: authedProcedure
    .input(z.object({ taskId: Id, at: z.date() }))
    .output(z.void())
    .mutation(({ input, ctx }) => Reminds.remove(ctx.employeeId, input.taskId, input.at)),
});
