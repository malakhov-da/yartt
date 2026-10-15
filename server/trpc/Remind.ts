import { z } from 'zod';
import { Id } from '#shared/employee.ts';
import { AddRemindInput, Remind } from '#shared/remind.ts';
import * as Reminds from '../services/Remind.ts';
import { authedProcedure, router } from '../trpc.ts';

export default router({
  /**
   * The signed-in employee's reminders on a task, soonest first.
   * @throws no_access
   */
  list: authedProcedure
    .input(z.object({ taskId: Id }))
    .output(Remind.array())
    .query(({ input, ctx }) => Reminds.list(ctx.employeeId, input.taskId)),

  /**
   * Sets a reminder for the signed-in employee on a task they see. It comes
   * as a notification at `at` (checked every minute) and is then deleted.
   * @throws no_access
   * @throws remind_in_past
   */
  add: authedProcedure
    .input(AddRemindInput)
    .output(z.void())
    .mutation(({ input, ctx }) => Reminds.add(ctx.employeeId, input)),

  /**
   * Deletes one of the signed-in employee's reminders.
   * @throws not_found
   */
  remove: authedProcedure
    .input(z.object({ taskId: Id, at: z.date() }))
    .output(z.void())
    .mutation(({ input, ctx }) => Reminds.remove(ctx.employeeId, input.taskId, input.at)),
});
