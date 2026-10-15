import { z } from 'zod';
import { Id } from '#shared/employee.ts';
import * as Visits from '../services/Visit.ts';
import { authedProcedure, router } from '../trpc.ts';

export default router({
  /**
   * Logs that the signed-in employee opened a task, or "My day" when
   * `taskId` is null. Repeats within 10 minutes are ignored. Call it when the
   * screen is opened.
   * @throws not_found — unknown task.
   */
  log: authedProcedure
    .input(z.object({ taskId: Id.nullable() }))
    .output(z.void())
    .mutation(({ input, ctx }) => Visits.log(ctx.employeeId, input.taskId)),
});
