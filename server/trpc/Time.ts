import { z } from 'zod';
import { Day, Id } from '#shared/employee.ts';
import { Minutes, MyTime } from '#shared/observer.ts';
import * as Times from '../services/Time.ts';
import { authedProcedure, router } from '../trpc.ts';

export default router({
  /**
   * The signed-in employee's time on a task: logged in total and left.
   * @throws no_access
   */
  mine: authedProcedure
    .input(z.object({ taskId: Id }))
    .output(MyTime)
    .query(({ input, ctx }) => Times.myTime(ctx.employeeId, input.taskId)),

  /**
   * Logs the signed-in employee's own time to a task for a day.
   * @throws no_access
   * @throws spent_in_future
   * @throws day_scored
   */
  log: authedProcedure
    .input(z.object({ taskId: Id, day: Day, minutes: Minutes }))
    .output(z.void())
    .mutation(({ input, ctx }) => Times.logTime(ctx.employeeId, input.taskId, input.day, input.minutes)),

  /**
   * Deletes the signed-in employee's own time entry. An entry is never
   * changed: delete it and log again.
   * @throws not_found — no such entry of theirs.
   * @throws day_scored
   */
  remove: authedProcedure
    .input(z.object({ id: Id }))
    .output(z.void())
    .mutation(({ input, ctx }) => Times.removeEntry(ctx.employeeId, input.id)),

  /**
   * Sets how much more time the signed-in employee plans to spend on the
   * task (decision 17); null clears it.
   * @throws no_access
   */
  setLeft: authedProcedure
    .input(z.object({ taskId: Id, minutes: Minutes.nullable() }))
    .output(z.void())
    .mutation(({ input, ctx }) => Times.setLeft(ctx.employeeId, input.taskId, input.minutes)),
});
