import { z } from 'zod';
import { SetDependencyInput } from '#shared/dependency.ts';
import { Id } from '#shared/employee.ts';
import * as Dependencies from '../services/Dependency.ts';
import { authedProcedure, router } from '../trpc.ts';

export default router({
  /**
   * Makes `taskId` wait for `value`: anyone who sees both tasks (decision
   * 94). The latest deadline of `value` it can live with is set or changed
   * by the owner of `taskId` only; for anyone else it is NULL, and a
   * dependency already there is left as it is. A latest deadline forbids
   * nothing: a later deadline of `value`, or none, puts both tasks at risk.
   * The owners of both tasks, other than the caller, are notified of a new one.
   * @throws no_access — does not see one of them (`taskId` names it).
   * @throws forbidden — a latest deadline from someone not the owner of `taskId`.
   * @throws not_found — unknown task.
   * @throws dependency_cycle — `value` already waits for `taskId`, or is it.
   */
  set: authedProcedure
    .meta({ bot: 'task' })
    .input(SetDependencyInput)
    .output(z.void())
    .mutation(({ input, ctx }) => Dependencies.set(ctx.employeeId, input)),

  /**
   * Removes the dependency of `taskId` on `value`: the owner of `taskId`
   * or whoever added it.
   * @throws forbidden — neither of them.
   * @throws not_found — no such dependency.
   */
  remove: authedProcedure
    .meta({ bot: 'task' })
    .input(z.object({ taskId: Id, value: Id }))
    .output(z.void())
    .mutation(({ input, ctx }) => Dependencies.remove(ctx.employeeId, input.taskId, input.value)),
});
