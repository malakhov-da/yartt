import { z } from 'zod';
import { Email, Employee, Me } from '#shared/employee.ts';
import env from '../env.ts';
import { AppError } from '../errors.ts';
import * as Auth from '../services/Auth.ts';
import { outsideDomains } from '../domains.ts';
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

  /**
   * Follows the link sent to a new address: it becomes the sign-in email of
   * whoever asked. Signs nobody in. Anyone may call it — the token is the proof.
   * @throws invalid_token — unknown, used or older than a day.
   * @throws email_taken — someone took the address since.
   */
  confirmEmail: procedure
    .input(z.object({ token: z.string().min(1).max(200) }))
    .output(z.void())
    .mutation(({ input }) => Employees.confirmEmailChange(input.token)),

  /** Ends the current session and clears the cookie. */
  logout: authedProcedure.meta({ outsideDomains: true }).output(z.void()).mutation(async ({ ctx }) => {
    if (ctx.sessionToken) await Auth.logout(ctx.sessionToken);
    ctx.clearSessionCookie();
  }),

  /** Ends all sessions of the signed-in employee on every device. */
  logoutEverywhere: authedProcedure.meta({ outsideDomains: true }).output(z.void()).mutation(async ({ ctx }) => {
    await Auth.logoutEverywhere(ctx.employeeId);
    ctx.clearSessionCookie();
  }),

  /**
   * The demo (DEMO_DATA): who can be picked to see the interface as —
   * everyone who can sign in. Null for a real installation. Anyone may call it.
   */
  demo: procedure.output(Employee.array().nullable()).query(() => {
    return env.DEMO_DATA ? Auth.demoPeople() : null;
  }),

  /**
   * The demo only: signs in as the picked employee without a link, ending
   * the current session if there is one. Anyone may call it.
   * @throws forbidden — not a demo.
   * @throws not_found — no such employee, or they cannot sign in (dismissed).
   */
  demoSignIn: procedure
    .input(z.object({ employeeId: z.number().int() }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      if (!env.DEMO_DATA) throw new AppError('forbidden');
      if (ctx.sessionToken) await Auth.logout(ctx.sessionToken);
      ctx.setSessionCookie(await Auth.demoSignIn(input.employeeId));
    }),

  /**
   * The signed-in employee, or null without a valid session; with whether
   * their email is outside the company's domains — then they may only
   * change it.
   */
  me: procedure.output(Me.nullable()).query(async ({ ctx }) => {
    const me = ctx.employeeId === null ? null : await Employees.get(ctx.employeeId);
    return me && { ...me, outsideDomains: ctx.bot === null && outsideDomains(me.email), domains: env.EMAIL_DOMAINS };
  }),
});
