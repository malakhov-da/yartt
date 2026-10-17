import { z } from 'zod';
import { ApiToken, EmployeeTokensInput, IssuedToken, IssueTokenInput } from '#shared/apiToken.ts';
import { Id } from '#shared/employee.ts';
import * as Tokens from '../services/ApiToken.ts';
import { authedProcedure, router } from '../trpc.ts';

export default router({
  /**
   * API tokens of an employee, working ones first. Seen by the employee and
   * their direct manager.
   * @throws forbidden
   */
  list: authedProcedure
    .input(EmployeeTokensInput)
    .output(ApiToken.array())
    .query(({ input, ctx }) => Tokens.list(ctx.employeeId, input.employeeId)),

  /**
   * Issues a token that acts as the employee through the API (a bot: CI,
   * monitoring). By the employee or their direct manager; the token is
   * returned only now.
   * @throws forbidden
   * @throws not_found — unknown or dismissed employee.
   */
  issue: authedProcedure
    .input(IssueTokenInput)
    .output(IssuedToken)
    .mutation(async ({ input, ctx }) => ({ token: await Tokens.issue(ctx.employeeId, input.employeeId, input.name) })),

  /**
   * Revokes a token: by the employee it acts as or their direct manager.
   * @throws not_found — no working token they may revoke.
   */
  revoke: authedProcedure
    .input(z.object({ id: Id }))
    .output(z.void())
    .mutation(({ input, ctx }) => Tokens.revoke(ctx.employeeId, input.id)),
});
