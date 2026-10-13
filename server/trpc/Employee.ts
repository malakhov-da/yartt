import { z } from 'zod';
import { Email, Employee, Id, InviteInput, ProfileInput } from '#shared/employee.ts';
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
   * Updates the signed-in employee's own profile.
   * While `nextDay` is in the future, notifications are copied to the manager.
   * @throws invalid_time_zone
   */
  updateProfile: authedProcedure
    .input(ProfileInput)
    .output(Employee)
    .mutation(({ input, ctx }) => Employees.updateProfile(ctx.employeeId, input)),

  /**
   * Sets the signed-in employee's own manager (null — none).
   * The manager then scores the employee's days and sees their tasks.
   * @throws not_found — the manager is unknown or dismissed.
   * @throws manager_cycle
   */
  setManager: authedProcedure
    .input(z.object({ managerId: Id.nullable() }))
    .output(z.void())
    .mutation(({ input, ctx }) => Employees.setManager(ctx.employeeId, input.managerId)),

  /**
   * Dismisses an employee: sign-in is blocked, sessions end, tasks and
   * reports go to the nearest active manager. History is kept.
   * @throws not_found — unknown or already dismissed.
   */
  dismiss: authedProcedure
    .input(z.object({ id: Id }))
    .output(z.void())
    .mutation(({ input }) => Employees.dismiss(input.id)),

  /**
   * Brings a dismissed employee back with the given email.
   * @throws not_found — unknown or not dismissed.
   * @throws email_taken
   */
  restore: authedProcedure
    .input(z.object({ id: Id, email: Email }))
    .output(Employee)
    .mutation(({ input }) => Employees.restore(input.id, input.email)),
});
