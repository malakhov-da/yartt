import { z } from 'zod';
import { MyTags, MyTagsInput, SetTagInput, Suggestions, SuggestInput } from '#shared/tags.ts';
import * as Tags from '../services/Tags.ts';
import { authedProcedure, router } from '../trpc.ts';

export default router({
  /**
   * Tags for what is typed, forgiving typos, transliteration ("sklad") and
   * the other keyboard layout ("crkfl"): the closest to the whole text, and
   * ways to read it as several tags, existing and new. Anyone signed in.
   */
  suggest: authedProcedure
    .input(SuggestInput)
    .output(Suggestions)
    .query(({ input, ctx }) => Tags.suggest(ctx.employeeId, input.text)),

  /**
   * The tags of the tasks the signed-in employee sees, with task counts and
   * their own color and weight; 50 per page, filtered by part of the name.
   */
  mine: authedProcedure
    .input(MyTagsInput)
    .output(MyTags)
    .query(({ input, ctx }) => Tags.mine(ctx.employeeId, input.query, input.page)),

  /**
   * Sets the signed-in employee's own color and weight of a tag. Nobody else
   * sees them; the weight orders the tags of every task "title" for them.
   * @throws not_found — unknown tag.
   */
  set: authedProcedure
    .input(SetTagInput)
    .output(z.void())
    .mutation(({ input, ctx }) => Tags.set(ctx.employeeId, input)),
});
