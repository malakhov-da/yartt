import { AsInput } from '#shared/employee.ts';
import { Current, CurrentInput, History, HistoryInput, TodoInput, TodoItem, WaitingItem } from '#shared/myDay.ts';
import * as MyDay from '../services/MyDay.ts';
import { viewAs } from '../services/Team.ts';
import { authedProcedure, router } from '../trpc.ts';

export default router({
  /**
   * What waits for the signed-in employee (decision 94): tasks by deadline,
   * the overdue and nearest first, each with its groups — access requests,
   * the review of their own task (comments by others, dependencies added by
   * others, tasks it waits for done, a handover, the deadline), mentions,
   * reminders, plans left on overdue tasks. Empty is the goal. `as` — a
   * report's, for a manager above (decision 83): without their reminders,
   * theirs alone. `taskId` — that task's only.
   * @throws forbidden — `as` is not under the signed-in employee.
   */
  todo: authedProcedure
    .input(TodoInput.optional())
    .output(TodoItem.array())
    .query(async ({ input, ctx }) => MyDay.todo(await viewAs(ctx.employeeId, input?.as), ctx.employeeId, input?.taskId)),

  /**
   * What the signed-in employee waits for from others: their access
   * requests not answered yet, then their open mentions of people, the
   * longest waiting first, with the answers so far. `as` — a report's.
   * @throws forbidden — `as` is not under the signed-in employee.
   */
  waiting: authedProcedure
    .input(AsInput.optional())
    .output(WaitingItem.array())
    .query(async ({ input, ctx }) => MyDay.waiting(await viewAs(ctx.employeeId, input?.as), ctx.employeeId)),

  /**
   * Open tasks the signed-in employee sees (no deadline or one ahead):
   * owned by them ('mine') or all the others, public ones included.
   * By deadline, nearest first, no deadline last; 20 per page. `as` — a report's.
   * @throws forbidden — `as` is not under the signed-in employee.
   */
  current: authedProcedure
    .input(CurrentInput)
    .output(Current)
    .query(async ({ input, ctx }) => MyDay.current(await viewAs(ctx.employeeId, input.as), input.tab, input.page)),

  /**
   * The signed-in employee's days, newest first, `size` days with activity
   * per page (today always first): shifts, time logged, visits, what was
   * done (comments, time logged), score.
   */
  history: authedProcedure
    .input(HistoryInput)
    .output(History)
    .query(({ input, ctx }) => MyDay.history(ctx.employeeId, input.page, input.size)),
});

