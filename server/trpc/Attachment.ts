import { z } from 'zod';
import { MyFiles } from '#shared/comment.ts';
import { AsInput, Id } from '#shared/employee.ts';
import * as Attachments from '../services/Attachment.ts';
import { viewAs } from '../services/Team.ts';
import { authedProcedure, router } from '../trpc.ts';

// A person's uploaded files and the space they take (decision 84).
export default router({
  /**
   * The files the signed-in employee uploaded — or `as`, a report's, for a
   * manager above — the newest first, deleted ones too, with the quota used.
   * @throws forbidden — `as` is not under the signed-in employee.
   */
  mine: authedProcedure
    .input(AsInput.optional())
    .output(MyFiles)
    .query(async ({ input, ctx }) => Attachments.mine(await viewAs(ctx.employeeId, input?.as))),

  /**
   * Keeps a file the signed-in employee sees in a task in their files: it
   * counts in their quota and stays theirs whoever else lets it go.
   * @throws unknown_attachment — they do not see it.
   * @throws file_purged — its content is gone.
   * @throws file_quota — it does not fit.
   */
  keep: authedProcedure
    .input(z.object({ id: Id }))
    .output(z.void())
    .mutation(({ input, ctx }) => Attachments.keep(ctx.employeeId, input.id)),

  /**
   * Lets a file the signed-in employee keeps go, to free their quota. Kept
   * by someone else, it stays; let go by the last one, its content is
   * deleted — the comments keep the link, which says so, and the same file
   * uploaded again brings it back.
   * @throws not_found — they do not keep it.
   */
  release: authedProcedure
    .input(z.object({ id: Id }))
    .output(z.void())
    .mutation(({ input, ctx }) => Attachments.release(ctx.employeeId, input.id)),
});
