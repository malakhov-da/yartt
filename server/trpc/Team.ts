import { z } from 'zod';
import { History } from '#shared/myDay.ts';
import { Id } from '#shared/employee.ts';
import { Attention, EmployeeHistoryInput, Member, PeriodStats, ScoreInput, StatsInput, SummaryInput, UnscoreInput } from '#shared/team.ts';
import * as Team from '../services/Team.ts';
import { authedProcedure, router } from '../trpc.ts';

export default router({
  /**
   * The team summary for a range of days (up to a year): the whole subtree
   * of the signed-in employee's reports, direct ones first — workload and
   * weighted score, days waiting for a score, tasks closed by hand and
   * automatically, open tasks. Empty for someone without reports.
   */
  summary: authedProcedure
    .input(SummaryInput)
    .output(Member.array())
    .query(({ input, ctx }) => Team.summary(ctx.employeeId, input.from, input.to)),

  /**
   * An employee's workload and weighted score for a range of their days
   * (from and to included, up to a year), and every day of it for a chart.
   * Seen by the employee and every manager above them.
   * @throws forbidden
   */
  stats: authedProcedure
    .input(StatsInput)
    .output(PeriodStats)
    .query(({ input, ctx }) => Team.employeeStats(ctx.employeeId, input.employeeId, input.from, input.to)),

  /**
   * What waits for a report's attention (decision 78): their Waiting for me
   * without their reminders, and the open tasks they own. For every manager
   * above them; not for the employee — that is their My day.
   * @throws forbidden
   */
  attention: authedProcedure
    .input(z.object({ employeeId: Id }))
    .output(Attention)
    .query(({ input, ctx }) => Team.attention(ctx.employeeId, input.employeeId)),

  /**
   * An employee's days, as in their My day (decision 12), `size` per page.
   * Seen by the employee and every manager above them.
   * @throws forbidden
   */
  history: authedProcedure
    .input(EmployeeHistoryInput)
    .output(History)
    .query(({ input, ctx }) => Team.history(ctx.employeeId, input.employeeId, input.page, input.size)),

  /**
   * The direct manager scores a past day of a report, 0–100, with an
   * optional reason, or corrects the score. Every version is mailed to the
   * report with its time and the previous value. A standing score freezes
   * the day's timesheet and time entries; scoring a withdrawn day again
   * checks the day anew.
   * @throws not_manager
   * @throws score_day_not_past
   * @throws no_work_for_day
   * @throws shift_open
   */
  score: authedProcedure
    .input(ScoreInput)
    .output(z.void())
    .mutation(({ input, ctx }) => Team.score(ctx.employeeId, input)),

  /**
   * The direct manager withdraws a score, keeping its reason: the report
   * may correct that day's timesheet and time entries, then the day is
   * scored again. Mailed to the report like every version.
   * @throws not_manager
   */
  unscore: authedProcedure
    .input(UnscoreInput)
    .output(z.void())
    .mutation(({ input, ctx }) => Team.unscore(ctx.employeeId, input.employeeId, input.day)),
});
