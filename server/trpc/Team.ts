import { z } from 'zod';
import { History } from '#shared/myDay.ts';
import { EmployeeHistoryInput, Member, PeriodStats, ScoreInput, StatsInput, SummaryInput } from '#shared/team.ts';
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
   * An employee's days, as in their My day (decision 12), 7 per page.
   * Seen by the employee and every manager above them.
   * @throws forbidden
   */
  history: authedProcedure
    .input(EmployeeHistoryInput)
    .output(History)
    .query(({ input, ctx }) => Team.history(ctx.employeeId, input.employeeId, input.page)),

  /**
   * The direct manager scores a past day of a report, 0–100, with an
   * optional reason, or corrects the score. Every version is mailed to the
   * report with its time and the previous value. The first score freezes
   * the day's timesheet and time entries.
   * @throws not_manager
   * @throws score_day_not_past
   * @throws no_work_for_day
   * @throws shift_open
   */
  score: authedProcedure
    .input(ScoreInput)
    .output(z.void())
    .mutation(({ input, ctx }) => Team.score(ctx.employeeId, input)),
});
