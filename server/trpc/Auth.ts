import { z } from 'zod';
import { Email, Employee } from '#shared/employee.ts';
import * as Auth from '../services/Auth.ts';
import * as Employees from '../services/Employee.ts';
import { authedProcedure, procedure, router } from '../trpc.ts';

export default router({
  /**
   * Sends a one-time sign-in link (valid for 10 minutes) through the webhook.
   * Always succeeds, so it cannot be used to check whether an email exists.
   */
  requestLogin: procedure
    .input(z.object({ email: Email }))
    .output(z.void())
    .mutation(({ input }) => Auth.requestLogin(input.email)),

  /**
   * Redeems the token from the sign-in link and sets the session cookie.
   * @throws invalid_token — the token is unknown, used or older than 10 minutes.
   */
  login: procedure
    .input(z.object({ token: z.string().min(1).max(200) }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      ctx.setSessionCookie(await Auth.login(input.token));
    }),

  /** Ends the current session and clears the cookie. */
  logout: authedProcedure.output(z.void()).mutation(async ({ ctx }) => {
    if (ctx.sessionToken) await Auth.logout(ctx.sessionToken);
    ctx.clearSessionCookie();
  }),

  /** Ends all sessions of the signed-in employee on every device. */
  logoutEverywhere: authedProcedure.output(z.void()).mutation(async ({ ctx }) => {
    await Auth.logoutEverywhere(ctx.employeeId);
    ctx.clearSessionCookie();
  }),

  /** The signed-in employee, or null without a valid session. */
  me: procedure.output(Employee.nullable()).query(({ ctx }) => {
    return ctx.employeeId === null ? null : Employees.get(ctx.employeeId);
  }),
});
