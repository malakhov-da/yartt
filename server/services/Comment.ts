import { z } from 'zod';
import type { Comment, CreateCommentInput, Feed, FeedFilter, FeedItem } from '#shared/comment.ts';
import { AppError } from '../errors.ts';
import { cleanHtml, plainText } from '../html.ts';
import { sql, type Sql } from '../pg.ts';
import { assertCanSee, assertReadable, headers } from './Task.ts';

export const PAGE_SIZE = 20;
const EXCERPT = 140;

const FeedRow = z.object({
  kind: z.enum(['comment', 'deadline', 'mentioned_in', 'spent', 'plan']),
  at: z.date(),
  commentId: z.number().nullable(),
  from: z.date().nullable(),
  to: z.date().nullable(),
  employeeId: z.number().nullable(),
  minutes: z.number().nullable(),
  day: z.string().nullable(),
  sourceTaskId: z.number().nullable(),
});
const CommentRow = z.object({
  id: z.number(),
  createdBy: z.number(),
  createdAt: z.date(),
  value: z.string(),
  attachmentIds: z.number().array(),
  attachmentNames: z.string().array(),
  replyToId: z.number().nullable(),
  replyAuthor: z.number().nullable(),
  replyValue: z.string().nullable(),
  isNew: z.boolean(),
});
const FileRow = z.object({ id: z.number(), size: z.number(), mime: z.string() });
const MentionRow = z.object({ commentId: z.number(), value: z.number(), closedAt: z.date().nullable() });
const TaskMentionRow = z.object({ commentId: z.number(), value: z.number() });
const Id = z.object({ id: z.number() });

/**
 * Every event of a task: comments, deadline moves (a row of finished_at; a
 * clear is a row closed without a successor), comments of other tasks that
 * attach this one, time logged, and time left set or cleared (a row of
 * estimate_minutes; a clear is a row closed without a successor).
 * 'mentions' keeps only the comments with open mentions.
 */
function events(taskId: number, filter: FeedFilter) {
  const all = filter === 'all';
  const none = sql`NULL::timestamptz AS "from", NULL::timestamptz AS "to", NULL::int AS employee_id,
                   NULL::int AS minutes, NULL::text AS day, NULL::int AS source_task_id`;
  return sql`
    SELECT 'comment' AS kind, c.created_at AS at, c.id AS comment_id, ${none}
      FROM comment c
     WHERE c.task_id = ${taskId}
       AND (${all}
            OR EXISTS (SELECT 1 FROM mention m
                        WHERE m.task_id = c.task_id AND m.comment_id = c.id AND m.closed_at IS NULL))
    UNION ALL
    SELECT 'deadline', f.entered_at, NULL, prev.value, f.value, NULL, NULL, NULL, NULL
      FROM finished_at f
      LEFT JOIN finished_at prev ON prev.task_id = f.task_id AND prev.expired_at = f.entered_at
     WHERE f.task_id = ${taskId} AND ${all}
    UNION ALL
    SELECT 'deadline', f.expired_at, NULL, f.value, NULL, NULL, NULL, NULL, NULL
      FROM finished_at f
     WHERE f.task_id = ${taskId} AND ${all} AND f.expired_at IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM finished_at n WHERE n.task_id = f.task_id AND n.entered_at = f.expired_at)
    UNION ALL
    SELECT 'mentioned_in', c.created_at, NULL, NULL, NULL, NULL, NULL, NULL, tm.task_id
      FROM task_mention tm JOIN comment c ON c.task_id = tm.task_id AND c.id = tm.comment_id
     WHERE tm.value = ${taskId} AND ${all}
    UNION ALL
    SELECT 'spent', s.added_at, NULL, NULL, NULL, s."by", s.value, s.day::text, NULL
      FROM spent_minutes s
     WHERE s.task_id = ${taskId} AND ${all}
    UNION ALL
    SELECT 'plan', e.entered_at, NULL, NULL, NULL, e."by", e.value, NULL, NULL
      FROM estimate_minutes e
     WHERE e.task_id = ${taskId} AND ${all}
    UNION ALL
    SELECT 'plan', e.expired_at, NULL, NULL, NULL, e."by", NULL, NULL, NULL
      FROM estimate_minutes e
     WHERE e.task_id = ${taskId} AND ${all} AND e.expired_at IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM estimate_minutes n
                        WHERE n.task_id = e.task_id AND n."by" = e."by" AND n.entered_at = e.expired_at)
  `;
}

/** The feed of a task, newest first, with the counts for both filters. */
export async function list(viewerId: number, taskId: number, filter: FeedFilter, page: number): Promise<Feed> {
  await assertCanSee(taskId, viewerId);

  const rows = FeedRow.array().parse(await sql`
    SELECT * FROM (${events(taskId, filter)}) e
     ORDER BY at DESC, comment_id DESC NULLS LAST, kind
     LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
  `);
  const Count = z.object({ n: z.number() });
  const [total] = Count.array().parse(await sql`SELECT count(*)::int AS n FROM (${events(taskId, filter)}) e`);
  const [all] = Count.array().parse(await sql`SELECT count(*)::int AS n FROM (${events(taskId, 'all')}) e`);
  const [mentions] = Count.array().parse(await sql`
    SELECT count(DISTINCT comment_id)::int AS n FROM mention WHERE task_id = ${taskId} AND closed_at IS NULL
  `);

  const comments = await load(viewerId, taskId, rows.flatMap((r) => (r.commentId === null ? [] : [r.commentId])));
  const sources = new Map((await headers(viewerId, [...new Set(rows.flatMap((r) => r.sourceTaskId ?? []))])).map((h) => [h.id, h]));
  const items: FeedItem[] = rows.flatMap((r): FeedItem[] => {
    switch (r.kind) {
      case 'comment': {
        const comment = comments.get(r.commentId!);
        return comment ? [comment] : [];
      }
      case 'deadline':
        return [{ kind: 'deadline', at: r.at, from: r.from, to: r.to }];
      case 'mentioned_in': {
        const task = sources.get(r.sourceTaskId!);
        return task ? [{ kind: 'mentioned_in', at: r.at, task }] : [];
      }
      case 'spent':
        return [{ kind: 'spent', at: r.at, employeeId: r.employeeId!, minutes: r.minutes!, day: r.day! }];
      case 'plan':
        return [{ kind: 'plan', at: r.at, employeeId: r.employeeId!, minutes: r.minutes }];
    }
  });
  return { items, total: total?.n ?? 0, openMentions: mentions?.n ?? 0, all: all?.n ?? 0 };
}

async function load(viewerId: number, taskId: number, ids: number[]): Promise<Map<number, Comment>> {
  if (ids.length === 0) return new Map();
  const rows = CommentRow.array().parse(await sql`
    SELECT c.id, c.created_by, c.created_at, c.value, c.attachment_ids, c.attachment_names, c.reply_to_id,
           r.created_by AS reply_author, r.value AS reply_value,
           (k.owner_id = ${viewerId} AND c.created_by <> k.owner_id
            AND (k.reviewed_at IS NULL OR c.created_at > k.reviewed_at)) IS TRUE AS is_new
      FROM comment c
      JOIN task k ON k.id = c.task_id
      LEFT JOIN comment r ON r.task_id = c.task_id AND r.id = c.reply_to_id
     WHERE c.task_id = ${taskId} AND c.id = ANY(${ids})
  `);
  const fileIds = [...new Set(rows.flatMap((r) => r.attachmentIds))];
  const files = new Map(
    FileRow.array().parse(await sql`SELECT id, size, mime FROM attachment WHERE id = ANY(${fileIds})`).map((f) => [f.id, f]),
  );
  const mentions = MentionRow.array().parse(await sql`
    SELECT comment_id, value, closed_at FROM mention
     WHERE task_id = ${taskId} AND comment_id = ANY(${ids}) ORDER BY value
  `);
  const taskMentions = TaskMentionRow.array().parse(await sql`
    SELECT comment_id, value FROM task_mention WHERE task_id = ${taskId} AND comment_id = ANY(${ids})
  `);
  const tasks = new Map((await headers(viewerId, [...new Set(taskMentions.map((m) => m.value))])).map((h) => [h.id, h]));

  return new Map(rows.map((r) => [r.id, {
    kind: 'comment',
    id: r.id,
    authorId: r.createdBy,
    at: r.createdAt,
    html: r.value,
    replyTo: r.replyToId === null
      ? null
      : { id: r.replyToId, authorId: r.replyAuthor!, excerpt: plainText(r.replyValue ?? '').slice(0, EXCERPT) },
    files: r.attachmentIds.flatMap((id, i) => {
      const f = files.get(id);
      return f ? [{ id, name: r.attachmentNames[i] ?? '', size: f.size, mime: f.mime }] : [];
    }),
    mentions: mentions.filter((m) => m.commentId === r.id).map((m) => ({ employeeId: m.value, closedAt: m.closedAt })),
    tasks: taskMentions.filter((m) => m.commentId === r.id).flatMap((m) => tasks.get(m.value) ?? []),
    isNew: r.isNew,
  } satisfies Comment]));
}

/**
 * Leaves a comment. Mentions in a private task make the mentioned employees
 * observers (trigger). Notifies the owner, the mentioned employees and the
 * owners of attached tasks — never the author.
 */
export async function create(authorId: number, input: CreateCommentInput): Promise<number> {
  const clean = cleanHtml(input.html);
  if (clean.html === null) throw new AppError('invalid_data');

  return sql.begin(async (tx) => {
    const db = tx as unknown as Sql;
    await assertCanSee(input.taskId, authorId, db);
    await assertReadable([...input.files.map((f) => f.id), ...clean.imageIds], authorId, db);

    const [row] = Id.array().parse(await db`
      INSERT INTO comment (task_id, created_by, value, attachment_ids, attachment_names, image_ids, reply_to_id)
      VALUES (${input.taskId}, ${authorId}, ${clean.html},
              ${input.files.map((f) => f.id)}, ${input.files.map((f) => f.name)},
              ${clean.imageIds}, ${input.replyToId})
      RETURNING id
    `);
    const commentId = row!.id;

    const mentionIds = [...new Set(input.mentionIds)];
    for (const employeeId of mentionIds) {
      await db`INSERT INTO mention (task_id, comment_id, value) VALUES (${input.taskId}, ${commentId}, ${employeeId})`;
      await db`SELECT notify(${employeeId}, ${input.taskId}, ${db.json({ kind: 'mention', by: authorId, commentId })})`;
    }

    for (const taskId of new Set(input.taskIds)) {
      await db`INSERT INTO task_mention (task_id, comment_id, value) VALUES (${input.taskId}, ${commentId}, ${taskId})`;
      await db`
        SELECT notify(owner_id, id, ${db.json({ kind: 'task_mention', by: authorId, commentId })})
          FROM task WHERE id = ${taskId} AND owner_id IS NOT NULL AND owner_id <> ${authorId}
      `;
    }

    await db`
      SELECT notify(owner_id, id, ${db.json({ kind: 'comment', by: authorId, commentId })})
        FROM task WHERE id = ${input.taskId} AND owner_id IS NOT NULL AND owner_id <> ${authorId}
    `;
    return commentId;
  });
}

/** "Done": the mentioned employee closes their own mention. */
export async function closeMention(employeeId: number, taskId: number, commentId: number): Promise<void> {
  const rows = await sql`
    UPDATE mention SET closed_at = NOW()
     WHERE task_id = ${taskId} AND comment_id = ${commentId} AND value = ${employeeId} AND closed_at IS NULL
    RETURNING value
  `;
  if (rows.length === 0) throw new AppError('not_found');
}
