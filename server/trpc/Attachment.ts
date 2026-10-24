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
   * Deletes the content of a file the signed-in employee uploaded, to free
   * their quota. The comments keep the link, which says the file is gone;
   * the same file uploaded again brings it back.
   * @throws not_found — not their file, or already deleted.
   */
  purge: authedProcedure
    .input(z.object({ id: Id }))
    .output(z.void())
    .mutation(({ input, ctx }) => Attachments.purge(ctx.employeeId, input.id)),
});
