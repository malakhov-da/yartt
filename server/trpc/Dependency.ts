import { z } from 'zod';
import { SetDependencyInput } from '#shared/dependency.ts';
import { Id } from '#shared/employee.ts';
import * as Dependencies from '../services/Dependency.ts';
import { authedProcedure, router } from '../trpc.ts';

export default router({
  /**
   * The owner of `taskId` makes it wait for `value` — soft, or hard with a
   * lag in minutes — or changes an existing dependency. The owner of
   * `value` is notified of a new one.
   * @throws forbidden — not the owner of `taskId`.
   * @throws not_found — unknown task.
   * @throws dependency_cycle — `value` already waits for `taskId`, or is it.
   * @throws hard_dependency_violated — the deadlines do not fit the lag.
   */
  set: authedProcedure
    .meta({ bot: 'task' })
    .input(SetDependencyInput)
    .output(z.void())
    .mutation(({ input, ctx }) => Dependencies.set(ctx.employeeId, input)),

  /**
   * The owner of `taskId` removes its dependency on `value`.
   * @throws forbidden — not the owner of `taskId`.
   * @throws not_found — no such dependency.
   */
  remove: authedProcedure
    .meta({ bot: 'task' })
    .input(z.object({ taskId: Id, value: Id }))
    .output(z.void())
    .mutation(({ input, ctx }) => Dependencies.remove(ctx.employeeId, input.taskId, input.value)),
});
