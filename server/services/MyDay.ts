import { z } from 'zod';
import type { Current, CurrentTab, DayHistory, History, TodoItem } from '#shared/myDay.ts';
import { plainText } from '../html.ts';
import { sql } from '../pg.ts';
import { headers } from './Task.ts';

export const PAGE_SIZE = 20;
/** Days with activity per page of History. */
export const DAYS_PER_PAGE = 7;
const EXCERPT = 140;

const MentionRow = z.object({
  taskId: z.number(),
  commentId: z.number(),
  createdBy: z.number(),
  createdAt: z.date(),
  value: z.string(),
  replyId: z.number().nullable(),
  replyAt: z.date().nullable(),
  replyValue: z.string().nullable(),
});
const ReviewRow = z.object({
  taskId: z.number(),
  at: z.date(),
  n: z.number(),
  authorIds: z.number().array(),
  pending: z.number(),
});
const RequestRow = z.object({ taskId: z.number(), employeeId: z.number() });

/**
 * What waits for my reaction: access requests to my tasks first (they have
 * no time and block "No intervention needed"), then open mentions of me and
 * my tasks with new comments by others, newest first.
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
    SELECT m.task_id, m.comment_id, c.created_by, c.created_at, c.value,
           r.id AS reply_id, r.created_at AS reply_at, r.value AS reply_value
      FROM mention m
      JOIN comment c ON c.task_id = m.task_id AND c.id = m.comment_id
      -- The answer: their first comment after it, a direct reply to it first.
      LEFT JOIN LATERAL (
        SELECT r.id, r.created_at, r.value FROM comment r
         WHERE r.task_id = m.task_id AND r.id > m.comment_id AND r.created_by = m.value
         ORDER BY r.reply_to_id IS NOT DISTINCT FROM m.comment_id DESC, r.id
         LIMIT 1
      ) r ON TRUE
     WHERE m.value = ${me} AND m.closed_at IS NULL AND can_see(m.task_id, ${me})
  `);
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

  const ids = [...new Set([...requests, ...mentions, ...reviews].map((r) => r.taskId))];
  const tasks = new Map((await headers(me, ids)).map((h) => [h.id, h]));

  const timed: (TodoItem & { at: Date })[] = [
    ...mentions.flatMap((m) => {
      const task = tasks.get(m.taskId);
      return task
        ? [{
            kind: 'mention' as const, task, commentId: m.commentId, authorId: m.createdBy, at: m.createdAt,
            excerpt: plainText(m.value).slice(0, EXCERPT),
            reply: m.replyId === null ? null : { id: m.replyId, at: m.replyAt!, excerpt: plainText(m.replyValue ?? '').slice(0, EXCERPT) },
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

/**
 * Open tasks I see (no deadline or a deadline ahead): the ones I own, or all
 * the others — public ones included (decision 14). By deadline, nearest
 * first; no deadline at the end.
 */
export async function current(me: number, tab: CurrentTab, page: number): Promise<Current> {
  const open = sql`
    SELECT k.id, k.owner_id, k.priority, f.value AS deadline
      FROM task k
      LEFT JOIN finished_at f ON f.task_id = k.id AND f.expired_at IS NULL
     WHERE (f.value IS NULL OR f.value > NOW()) AND can_see(k.id, ${me})
  `;
  const ids = z.object({ id: z.number() }).array().parse(await sql`
    SELECT id FROM (${open}) t
     WHERE (owner_id IS NOT DISTINCT FROM ${me}) = ${tab === 'mine'}
     ORDER BY deadline NULLS LAST, priority DESC, id DESC
     LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
  `).map((r) => r.id);
  const [counts] = z.object({ mine: z.number(), others: z.number() }).array().parse(await sql`
    SELECT count(*) FILTER (WHERE owner_id = ${me})::int AS mine,
           count(*) FILTER (WHERE owner_id IS DISTINCT FROM ${me})::int AS others
      FROM (${open}) t
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
const EntryRow = z.object({ day: z.string(), id: z.number(), taskId: z.number(), minutes: z.number() });
const VisitRow = z.object({ day: z.string(), taskId: z.number().nullable(), at: z.date() });
const ActivityRow = z.object({ day: z.string(), first: z.date(), last: z.date() });
const ScoreRow = z.object({ day: z.string(), value: z.number().nullable(), reason: z.string().nullable() });

/**
 * My days, newest first, DAYS_PER_PAGE days with any activity per page:
 * shifts, time logged to tasks, visits and the score. Today is always
 * there — it is where a shift is started. Days are in my time zone.
 */
export async function history(me: number, page: number): Promise<History> {
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
     LIMIT ${DAYS_PER_PAGE} OFFSET ${(page - 1) * DAYS_PER_PAGE}
  `).map((r) => r.day);
  const [count] = z.object({ n: z.number(), open: z.boolean() }).array().parse(await sql`
    SELECT count(*)::int AS n,
           EXISTS (SELECT 1 FROM work WHERE employee_id = ${me} AND spent_minutes IS NULL) AS open
      FROM (${all}) d
  `);

  const shifts = ShiftRow.array().parse(await sql`
    SELECT (started_at AT TIME ZONE ${tz})::date::text AS day, started_at, spent_minutes, about
      FROM work
     WHERE employee_id = ${me} AND (started_at AT TIME ZONE ${tz})::date = ANY(${days}::date[])
     ORDER BY started_at
  `);
  const entries = EntryRow.array().parse(await sql`
    SELECT day::text, id, task_id, value AS minutes
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
      firstActivity: a?.first ?? null,
      lastActivity: a?.last ?? null,
      score: s ? { value: s.value, reason: s.reason } : null,
    };
  });

  const taskIds = [...new Set([
    ...entries.map((e) => e.taskId),
    ...visits.flatMap((v) => (v.taskId === null ? [] : [v.taskId])),
  ])];
  return { today, days: result, tasks: await headers(me, taskIds), hasOpenShift: count?.open ?? false, total: count?.n ?? 1 };
}
