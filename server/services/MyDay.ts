import { z } from 'zod';
import type { Current, CurrentTab, DayHistory, History, TodoItem, WaitingItem } from '#shared/myDay.ts';
import { plainText } from '../html.ts';
import { sql } from '../pg.ts';
import { mentionReplies, replyKey } from './Comment.ts';
import { headers } from './Task.ts';

export const PAGE_SIZE = 20;
/** Days with activity per page of History. */

const EXCERPT = 140;

const MentionRow = z.object({
  taskId: z.number(),
  commentId: z.number(),
  createdBy: z.number(),
  createdAt: z.date(),
  value: z.string(),
});
const ReviewRow = z.object({
  taskId: z.number(),
  at: z.date(),
  n: z.number(),
  authorIds: z.number().array(),
  pending: z.number(),
});
const RequestRow = z.object({ taskId: z.number(), employeeId: z.number() });
const RemindRow = z.object({ taskId: z.number(), at: z.date(), text: z.string().nullable() });
const DeadlineRow = z.object({ taskId: z.number(), at: z.date(), closed: z.boolean() });
const DoneRow = z.object({ taskId: z.number(), value: z.number(), at: z.date() });

/**
 * What waits for my reaction: access requests to my tasks first (they have
 * no time and block "No intervention needed"), then open mentions of me, my
 * tasks with new comments by others, my reminders that came due, my tasks
 * closing by their deadline within a day or closed by it and not confirmed,
 * and tasks mine wait for that are done, newest first.
 */
export async function todo(me: number): Promise<TodoItem[]> {
  const requests = RequestRow.array().parse(await sql`
    SELECT o.task_id, o.value AS employee_id
      FROM observer o JOIN task k ON k.id = o.task_id
     WHERE k.owner_id = ${me} AND o.added_at IS NULL AND o.deleted_at IS NULL
     ORDER BY o.id DESC
  `);
  // A mention in a task I no longer see cannot be answered: it is not shown.
  const mentions = MentionRow.array().parse(await sql`
    SELECT m.task_id, m.comment_id, c.created_by, c.created_at, c.value
      FROM mention m
      JOIN comment c ON c.task_id = m.task_id AND c.id = m.comment_id
     WHERE m.value = ${me} AND m.closed_at IS NULL AND can_see(m.task_id, ${me})
  `);
  const answers = await mentionReplies(mentions.map((m) => ({ taskId: m.taskId, commentId: m.commentId, employeeId: me })));
  const reviews = ReviewRow.array().parse(await sql`
    SELECT k.id AS task_id, max(c.created_at) AS at, count(*)::int AS n,
           array_agg(c.created_by ORDER BY c.created_at) AS author_ids,
           (SELECT count(*)::int FROM observer o
             WHERE o.task_id = k.id AND o.added_at IS NULL AND o.deleted_at IS NULL) AS pending
      FROM task k JOIN comment c ON c.task_id = k.id
     WHERE k.owner_id = ${me} AND c.created_by <> ${me}
       AND (k.reviewed_at IS NULL OR c.created_at > k.reviewed_at)
     GROUP BY k.id
  `);

  // Leaving a task deletes its reminders: a due one is on a task I see.
  const reminds = RemindRow.array().parse(await sql`
    SELECT task_id, at, value AS text FROM remind WHERE employee_id = ${me} AND sent_at IS NOT NULL
  `);

  // A passed deadline closes the task by itself: a day of warning, then a confirmation.
  const deadlines = DeadlineRow.array().parse(await sql`
    SELECT f.task_id, f.value AS at, f.value <= NOW() AS closed
      FROM task k JOIN finished_at f ON f.task_id = k.id AND f.expired_at IS NULL
     WHERE k.owner_id = ${me}
       AND ((f.value > NOW() AND f.value <= NOW() + INTERVAL '1 day' AND f.value - f.entered_at > INTERVAL '1 minute')
            OR (f.closed_told_at IS NOT NULL AND f.confirmed_at IS NULL AND f.value <= NOW()))
  `);
  // Done by someone else: what I closed myself I know of.
  const done = DoneRow.array().parse(await sql`
    SELECT d.task_id, d.value, d.done_at AS at
      FROM dependency d JOIN task k ON k.id = d.task_id JOIN task v ON v.id = d.value
     WHERE k.owner_id = ${me} AND d.done_at IS NOT NULL AND v.owner_id IS DISTINCT FROM ${me}
  `);

  const ids = [...new Set([
    ...[...requests, ...mentions, ...reviews, ...reminds, ...deadlines, ...done].map((r) => r.taskId),
    ...done.map((d) => d.value),
  ])];
  const tasks = new Map((await headers(me, ids)).map((h) => [h.id, h]));

  const timed: (TodoItem & { at: Date })[] = [
    ...mentions.flatMap((m) => {
      const task = tasks.get(m.taskId);
      return task
        ? [{
            kind: 'mention' as const, task, commentId: m.commentId, authorId: m.createdBy, at: m.createdAt,
            excerpt: plainText(m.value).slice(0, EXCERPT),
            replies: answers.get(replyKey(m.taskId, m.commentId, me)) ?? [],
          }]
        : [];
    }),
    ...reviews.flatMap((r) => {
      const task = tasks.get(r.taskId);
      return task
        ? [{
            kind: 'review' as const, task, at: r.at, count: r.n, authorIds: [...new Set(r.authorIds)],
            pendingRequests: r.pending,
          }]
        : [];
    }),
    ...reminds.flatMap((r) => {
      const task = tasks.get(r.taskId);
      return task ? [{ kind: 'remind' as const, task, at: r.at, text: r.text }] : [];
    }),
    ...deadlines.flatMap((r) => {
      const task = tasks.get(r.taskId);
      return task ? [{ kind: r.closed ? 'closed' as const : 'closing' as const, task, at: r.at }] : [];
    }),
    ...done.flatMap((r) => {
      const task = tasks.get(r.taskId);
      const dependency = tasks.get(r.value);
      return task && dependency ? [{ kind: 'done' as const, task, dependency, at: r.at }] : [];
    }),
  ];
  timed.sort((a, b) => b.at.getTime() - a.at.getTime());

  return [
    ...requests.flatMap((r) => {
      const task = tasks.get(r.taskId);
      return task ? [{ kind: 'request' as const, task, employeeId: r.employeeId }] : [];
    }),
    ...timed,
  ];
}

const MyMentionRow = z.object({
  taskId: z.number(),
  commentId: z.number(),
  employeeId: z.number(),
  createdAt: z.date(),
  value: z.string(),
});

/**
 * What I wait for from others (decision 67): my access requests not
 * answered yet, then my open mentions of people — the longest waiting
 * first, with whether they have answered. A mention in a task I no longer
 * see is not shown.
 */
export async function waiting(me: number): Promise<WaitingItem[]> {
  const requests = z.object({ taskId: z.number() }).array().parse(await sql`
    SELECT task_id FROM observer
     WHERE value = ${me} AND added_at IS NULL AND deleted_at IS NULL
     ORDER BY id
  `);
  const mentions = MyMentionRow.array().parse(await sql`
    SELECT m.task_id, m.comment_id, m.value AS employee_id, c.created_at, c.value
      FROM mention m
      JOIN comment c ON c.task_id = m.task_id AND c.id = m.comment_id
     WHERE c.created_by = ${me} AND m.closed_at IS NULL AND can_see(m.task_id, ${me})
     ORDER BY c.created_at, m.value
  `);
  const answers = await mentionReplies(mentions.map((m) => ({ taskId: m.taskId, commentId: m.commentId, employeeId: m.employeeId })));
  const tasks = new Map((await headers(me, [...new Set([...requests, ...mentions].map((r) => r.taskId))])).map((h) => [h.id, h]));
  return [
    ...requests.flatMap((r) => {
      const task = tasks.get(r.taskId);
      return task ? [{ kind: 'request' as const, task }] : [];
    }),
    ...mentions.flatMap((m) => {
      const task = tasks.get(m.taskId);
      return task
        ? [{
            kind: 'mention' as const, task, commentId: m.commentId, employeeId: m.employeeId, at: m.createdAt,
            excerpt: plainText(m.value).slice(0, EXCERPT),
            replies: answers.get(replyKey(m.taskId, m.commentId, m.employeeId)) ?? [],
          }]
        : [];
    }),
  ];
}

/**
 * Tasks I see — public ones included (decision 14): the open ones (no
 * deadline or one ahead) I own, those my people own (down the chain), or
 * all the other open ones, by deadline, nearest first, the same moment and
 * no deadline by priority; or the closed ones, the most recently closed
 * first (decision 57).
 */
export async function current(me: number, tab: CurrentTab, page: number): Promise<Current> {
  const seen = sql`
    SELECT k.id, k.owner_id, k.priority, f.value AS deadline, f.value IS NOT NULL AND f.value <= NOW() AS closed,
           CASE WHEN k.owner_id = ${me} THEN 'mine'
                WHEN k.owner_id IN (SELECT subordinates(${me})) THEN 'team'
                ELSE 'others' END AS whose
      FROM task k
      LEFT JOIN finished_at f ON f.task_id = k.id AND f.expired_at IS NULL
     WHERE can_see(k.id, ${me})
  `;
  const ids = z.object({ id: z.number() }).array().parse(await sql`
    SELECT id FROM (${seen}) t
     WHERE ${tab === 'closed' ? sql`closed` : sql`NOT closed AND whose = ${tab}`}
     ORDER BY ${tab === 'closed' ? sql`deadline DESC, priority DESC, id DESC` : sql`deadline NULLS LAST, priority DESC, id DESC`}
     LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
  `).map((r) => r.id);
  const [counts] = z.object({ mine: z.number(), team: z.number(), others: z.number(), closed: z.number() }).array().parse(await sql`
    SELECT count(*) FILTER (WHERE NOT closed AND whose = 'mine')::int AS mine,
           count(*) FILTER (WHERE NOT closed AND whose = 'team')::int AS team,
           count(*) FILTER (WHERE NOT closed AND whose = 'others')::int AS others,
           count(*) FILTER (WHERE closed)::int AS closed
      FROM (${seen}) t
  `);
  return { items: await headers(me, ids), counts: counts! };
}

const DayRow = z.object({ day: z.string() });
const TodayRow = z.object({ today: z.string() });
const ShiftRow = z.object({
  day: z.string(),
  startedAt: z.date(),
  spentMinutes: z.number().nullable(),
  about: z.string().nullable(),
});
const EntryRow = z.object({ day: z.string(), id: z.number(), taskId: z.number(), minutes: z.number(), updatedAt: z.date() });
const VisitRow = z.object({ day: z.string(), taskId: z.number().nullable(), at: z.date() });
const ActivityRow = z.object({ day: z.string(), first: z.date(), last: z.date() });
const ActionRow = z.object({ day: z.string(), kind: z.enum(['comment', 'time']), taskId: z.number(), at: z.date() });
const ScoreRow = z.object({ day: z.string(), value: z.number().nullable(), reason: z.string().nullable() });

/**
 * My days, newest first, `size` days with any activity per page: shifts,
 * time logged to tasks, visits, what was done and the score. Today is
 * always there — it is where a shift is started. Days are in my time zone.
 */
export async function history(me: number, page: number, size: number): Promise<History> {
  const [row] = TodayRow.array().parse(await sql`SELECT local_today(${me})::text AS today`);
  const today = row!.today;
  const tz = sql`(SELECT time_zone FROM employee WHERE id = ${me})`;

  const all = sql`
    SELECT ${today}::date AS day
    UNION SELECT (started_at AT TIME ZONE ${tz})::date FROM work WHERE employee_id = ${me}
    UNION SELECT day FROM spent_minutes WHERE "by" = ${me}
    UNION SELECT (at AT TIME ZONE ${tz})::date FROM visit WHERE employee_id = ${me}
    UNION SELECT (created_at AT TIME ZONE ${tz})::date FROM comment WHERE created_by = ${me}
  `;
  const days = DayRow.array().parse(await sql`
    SELECT day::text FROM (${all}) d
     ORDER BY day DESC
     LIMIT ${size} OFFSET ${(page - 1) * size}
  `).map((r) => r.day);
  const [count] = z.object({ n: z.number(), open: z.date().nullable() }).array().parse(await sql`
    SELECT count(*)::int AS n,
           (SELECT started_at FROM work WHERE employee_id = ${me} AND spent_minutes IS NULL) AS open
      FROM (${all}) d
  `);

  const shifts = ShiftRow.array().parse(await sql`
    SELECT (started_at AT TIME ZONE ${tz})::date::text AS day, started_at, spent_minutes, about
      FROM work
     WHERE employee_id = ${me} AND (started_at AT TIME ZONE ${tz})::date = ANY(${days}::date[])
     ORDER BY started_at
  `);
  const entries = EntryRow.array().parse(await sql`
    SELECT day::text, id, task_id, value AS minutes, updated_at
      FROM spent_minutes
     WHERE "by" = ${me} AND day = ANY(${days}::date[])
     ORDER BY id
  `);
  const visits = VisitRow.array().parse(await sql`
    SELECT (at AT TIME ZONE ${tz})::date::text AS day, task_id, at
      FROM visit
     WHERE employee_id = ${me} AND (at AT TIME ZONE ${tz})::date = ANY(${days}::date[])
     ORDER BY at
  `);
  const activity = ActivityRow.array().parse(await sql`
    SELECT day::text, min(at) AS first, max(at) AS last FROM (
      SELECT (at AT TIME ZONE ${tz})::date AS day, at FROM visit WHERE employee_id = ${me}
      UNION ALL
      SELECT (created_at AT TIME ZONE ${tz})::date, created_at FROM comment WHERE created_by = ${me}
      UNION ALL
      SELECT (added_at AT TIME ZONE ${tz})::date, added_at FROM spent_minutes WHERE "by" = ${me}
    ) a
     WHERE day = ANY(${days}::date[])
     GROUP BY day
  `);
  const actions = ActionRow.array().parse(await sql`
    SELECT day::text, kind, task_id, at FROM (
      SELECT (created_at AT TIME ZONE ${tz})::date AS day, 'comment' AS kind, task_id, created_at AS at
        FROM comment WHERE created_by = ${me}
      UNION ALL
      SELECT (added_at AT TIME ZONE ${tz})::date, 'time', task_id, added_at
        FROM spent_minutes WHERE "by" = ${me}
    ) a
     WHERE day = ANY(${days}::date[])
     ORDER BY at
  `);
  const scores = ScoreRow.array().parse(await sql`
    SELECT day::text, value, reason FROM score WHERE employee_id = ${me} AND day = ANY(${days}::date[])
  `);

  const result: DayHistory[] = days.map((day) => {
    const a = activity.find((r) => r.day === day);
    const s = scores.find((r) => r.day === day);
    return {
      day,
      shifts: shifts.filter((r) => r.day === day).map(({ day: _, ...shift }) => shift),
      entries: entries.filter((r) => r.day === day).map(({ day: _, ...entry }) => entry),
      visits: visits.filter((r) => r.day === day).map(({ day: _, ...visit }) => visit),
      actions: actions.filter((r) => r.day === day).map(({ day: _, ...action }) => action),
      firstActivity: a?.first ?? null,
      lastActivity: a?.last ?? null,
      score: s ? { value: s.value, reason: s.reason } : null,
    };
  });

  const taskIds = [...new Set([
    ...entries.map((e) => e.taskId),
    ...visits.flatMap((v) => (v.taskId === null ? [] : [v.taskId])),
    ...actions.map((a) => a.taskId),
  ])];
  return { today, days: result, tasks: await headers(me, taskIds), openShiftFrom: count?.open ?? null, total: count?.n ?? 1 };
}
