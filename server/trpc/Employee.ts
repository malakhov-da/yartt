import { z } from 'zod';
import { Email, Employee, Id, InviteInput, ProfileInput, SettingsInput } from '#shared/employee.ts';
import * as Employees from '../services/Employee.ts';
import { authedProcedure, router } from '../trpc.ts';

export default router({
  /** All employees, dismissed included (`email` is null), ordered by name. */
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

  /**
   * Updates the signed-in employee's name, sign-in email and "about".
   * Current sessions stay; the next sign-in link goes to the new email.
   * @throws email_taken
   */
  updateProfile: authedProcedure
    .input(ProfileInput)
    .output(Employee)
    .mutation(({ input, ctx }) => Employees.updateProfile(ctx.employeeId, input)),

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
   * @throws not_found — the manager is unknown or dismissed.
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
   * Brings a dismissed direct report back with the given email, under the
   * signed-in manager or, when `managerId` is given, under another active
   * employee (who is notified).
   * @throws not_manager — the signed-in employee is not their direct manager.
   * @throws not_found — unknown or not dismissed, or the manager is unknown or dismissed.
   * @throws email_taken
   * @throws manager_cycle
   */
  restore: authedProcedure
    .input(z.object({ id: Id, email: Email, managerId: Id.optional() }))
    .output(Employee)
    .mutation(({ input, ctx }) => Employees.restore(input.id, input.email, ctx.employeeId, input.managerId ?? ctx.employeeId)),

  /**
   * Hands the signed-in employee's team to one of their active direct
   * reports: the successor takes their place, gets their other reports
   * (dismissed ones too) and becomes their manager — who may then dismiss
   * them. The way out for someone at the top.
   * @throws not_direct_report
   */
  handOver: authedProcedure
    .input(z.object({ successorId: Id }))
    .output(z.void())
    .mutation(({ input, ctx }) => Employees.handOver(ctx.employeeId, input.successorId)),
});
