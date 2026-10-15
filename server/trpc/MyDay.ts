import { Current, CurrentInput, History, HistoryInput, TodoItem } from '#shared/myDay.ts';
import * as MyDay from '../services/MyDay.ts';
import { authedProcedure, router } from '../trpc.ts';

export default router({
  /**
   * What waits for the signed-in employee: access requests to their tasks,
   * then open mentions of them and their tasks with comments by others
   * since "No intervention needed", newest first. Empty is the goal.
   */
  todo: authedProcedure
    .output(TodoItem.array())
    .query(({ ctx }) => MyDay.todo(ctx.employeeId)),

  /**
   * Open tasks the signed-in employee sees (no deadline or one ahead):
   * owned by them ('mine') or all the others, public ones included.
   * By deadline, nearest first, no deadline last; 20 per page.
   */
  current: authedProcedure
    .input(CurrentInput)
    .output(Current)
    .query(({ input, ctx }) => MyDay.current(ctx.employeeId, input.tab, input.page)),

  /**
   * The signed-in employee's days, newest first, 7 days with activity per
   * page (today always first): shifts, time logged, visits, score.
   */
  history: authedProcedure
    .input(HistoryInput)
    .output(History)
    .query(({ input, ctx }) => MyDay.history(ctx.employeeId, input.page)),
});

