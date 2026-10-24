import { z } from 'zod';
import { Day, Id } from '#shared/employee.ts';
import { DayMinutes, Minutes, MyTime } from '#shared/observer.ts';
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
   * Sets the signed-in employee's own time on a task for a day: the day's
   * whole time, replacing what was there — one entry per task and day; 0
   * removes it.
   * @throws no_access
   * @throws spent_in_future
   * @throws spent_over_day — the day's tasks together would have more than 24 hours.
   * @throws day_scored
   */
  set: authedProcedure
    .input(z.object({ taskId: Id, day: Day, minutes: DayMinutes }))
    .output(z.void())
    .mutation(({ input, ctx }) => Times.setDay(ctx.employeeId, input.taskId, input.day, input.minutes)),

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
