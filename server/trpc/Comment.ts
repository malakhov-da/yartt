import { z } from 'zod';
import { CreateCommentInput, Feed, FeedFilter } from '#shared/comment.ts';
import { Id } from '#shared/employee.ts';
import * as Comments from '../services/Comment.ts';
import { authedProcedure, router } from '../trpc.ts';

export default router({
  /**
   * The feed of a task, newest first, 20 per page: only comments with open
   * mentions ('mentions') or every event ('all'): comments, deadline moves,
   * comments of other tasks attaching this one, time logged and planned.
   * @throws no_access
   */
  list: authedProcedure
    .input(z.object({ taskId: Id, filter: FeedFilter, page: z.number().int().min(1) }))
    .output(Feed)
    .query(({ input, ctx }) => Comments.list(ctx.employeeId, input.taskId, input.filter, input.page)),

  /**
   * Leaves a comment (rich text, sanitized) with files, mentions and
   * attached tasks; returns its id. In a private task only its observers
   * can be mentioned (Observer.mentionable). Comments are never edited: the client holds a sent
   * comment back for a few seconds before calling this.
   * @throws no_access
   * @throws self_mention
   * @throws mention_not_participant — a private task, and they do not take part.
   * @throws unknown_attachment — a file the author may not read.
   * @throws not_found — unknown task, employee or reply.
   */
  create: authedProcedure
    .meta({ bot: 'comment' })
    .input(CreateCommentInput)
    .output(Id)
    .mutation(({ input, ctx }) => Comments.create(ctx.employeeId, input)),

  /**
   * "Done": the signed-in employee closes their mention in a comment.
   * @throws not_found — no open mention of them there.
   * @throws mention_needs_reply — they have not commented in the task since.
   */
  closeMention: authedProcedure
    .meta({ bot: 'comment' })
    .input(z.object({ taskId: Id, commentId: Id }))
    .output(z.void())
    .mutation(({ input, ctx }) => Comments.closeMention(ctx.employeeId, input.taskId, input.commentId)),
});
