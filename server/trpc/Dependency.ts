import { z } from 'zod';
import { SetDependencyInput } from '#shared/dependency.ts';
import { Id } from '#shared/employee.ts';
import * as Dependencies from '../services/Dependency.ts';
import { authedProcedure, router } from '../trpc.ts';

export default router({
  /**
   * The owner of `taskId` makes it wait for `value` — with or without the
   * latest deadline of `value` it can live with — or changes an existing
   * dependency. A latest deadline forbids nothing: a later deadline of
   * `value`, or none, puts both tasks at risk. The owner of
   * `value` is notified of a new one.
   * @throws forbidden — not the owner of `taskId`.
   * @throws not_found — unknown task.
   * @throws dependency_cycle — `value` already waits for `taskId`, or is it.
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
