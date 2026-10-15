import { z } from 'zod';
import { AddShiftInput, CloseShiftInput, StartShiftInput } from '#shared/myDay.ts';
import * as Work from '../services/Work.ts';
import { authedProcedure, router } from '../trpc.ts';

// The signed-in employee's own timesheet. It only moves forward: a closed
// shift is never changed or deleted.
export default router({
  /**
   * Opens a shift at the given moment (cut to the minute, not later than now).
   * @throws shift_overlap — a shift is already open or covers the moment.
   * @throws day_scored
   */
  start: authedProcedure
    .input(StartShiftInput)
    .output(z.void())
    .mutation(({ input, ctx }) => Work.start(ctx.employeeId, input.startedAt)),

  /**
   * Closes the open shift: its start (may be corrected), its end and what was done.
   * @throws not_found — no open shift.
   * @throws invalid_data — the end is not after the start.
   * @throws shift_overlap
   * @throws day_scored
   */
  close: authedProcedure
    .input(CloseShiftInput)
    .output(z.void())
    .mutation(({ input, ctx }) => Work.close(ctx.employeeId, input)),

  /**
   * Adds a closed shift at once, e.g. the suggestion for a past day confirmed.
   * @throws invalid_data — the end is not after the start.
   * @throws shift_overlap
   * @throws day_scored
   */
  add: authedProcedure
    .input(AddShiftInput)
    .output(z.void())
    .mutation(({ input, ctx }) => Work.add(ctx.employeeId, input)),

  /**
   * Deletes the open shift.
   * @throws not_found — no open shift.
   */
  remove: authedProcedure
    .output(z.void())
    .mutation(({ ctx }) => Work.remove(ctx.employeeId)),
});
