import { z } from 'zod';
import { Email, EmailChangeInput, Employee, Id, InviteInput, ProfileInput, SettingsInput } from '#shared/employee.ts';
import * as Employees from '../services/Employee.ts';
import { authedProcedure, router } from '../trpc.ts';

export default router({
  /** All employees, dismissed included (`dismissedAt` is set), ordered by name. */
  list: authedProcedure.output(Employee.array()).query(() => Employees.list()),

  /**
   * Creates an employee and notifies them. Any employee can invite.
   * Locale and time zone default to the inviter's.
   * @throws email_taken
   */
  invite: authedProcedure
    .input(InviteInput)
    .output(Employee)
    .mutation(({ input, ctx }) => Employees.invite(ctx.employeeId, input)),

  /** Updates the signed-in employee's name and "about". */
  updateProfile: authedProcedure
    .input(ProfileInput)
    .output(Employee)
    .mutation(({ input, ctx }) => Employees.updateProfile(ctx.employeeId, input)),

  /**
   * Sends a link to a new sign-in address; the email changes only when it
   * is followed (Auth.confirmEmail), within a day. The old address is told.
   * @throws email_taken
   * @throws too_many_requests — five emails in 15 minutes.
   */
  requestEmailChange: authedProcedure
    .input(EmailChangeInput)
    .output(z.void())
    .mutation(({ input, ctx }) => Employees.requestEmailChange(ctx.employeeId, input.email)),

  /**
   * Changes the signed-in employee's own settings; fields left out stay.
   * While `nextDay` is in the future, notifications are copied to the manager.
   * @throws invalid_time_zone
   */
  updateSettings: authedProcedure
    .input(SettingsInput)
    .output(Employee)
    .mutation(({ input, ctx }) => Employees.updateSettings(ctx.employeeId, input)),

  /**
   * Sets the signed-in employee's own manager (null — none). The new manager
   * is notified, then scores the employee's days and sees their tasks.
   * @throws not_found — the manager is unknown, dismissed or a bot.
   * @throws manager_cycle
   */
  setManager: authedProcedure
    .input(z.object({ managerId: Id.nullable() }))
    .output(z.void())
    .mutation(({ input, ctx }) => Employees.setManager(ctx.employeeId, input.managerId)),

  /**
   * Dismisses a direct report: sign-in is blocked, sessions end, their tasks
   * and reports move to the signed-in manager. History is kept.
   * @throws not_manager — the signed-in employee is not the direct manager.
   * @throws not_found — unknown or already dismissed.
   */
  dismiss: authedProcedure
    .input(z.object({ id: Id }))
    .output(z.void())
    .mutation(({ input, ctx }) => Employees.dismiss(input.id, ctx.employeeId)),

  /**
   * Brings a dismissed direct report back under the signed-in manager, with
   * the email they had or a new one; moving to another manager is then
   * their own choice.
   * @throws not_manager — the signed-in employee is not their direct manager.
   * @throws not_found — unknown or not dismissed.
   * @throws email_taken
   */
  restore: authedProcedure
    .input(z.object({ id: Id, email: Email.optional() }))
    .output(Employee)
    .mutation(({ input, ctx }) => Employees.restore(input.id, ctx.employeeId, input.email ?? null)),

});
