import { z } from 'zod';
import type { History } from '#shared/myDay.ts';
import type { DayStats, Member, PeriodStats, ScoreInput, Stats } from '#shared/team.ts';
import { AppError } from '../errors.ts';
import { sql, type Sql } from '../pg.ts';
import * as MyDay from './MyDay.ts';

const Bool = z.object({ value: z.boolean() });
const StatsRow = z.object({
  employeeId: z.number(),
  workMinutes: z.number(),
  workDays: z.number(),
  spentMinutes: z.number(),
  scoredDays: z.number(),
  weightedScore: z.number().nullable(),
});
const MemberRow = z.object({ id: z.number(), direct: z.boolean(), self: z.boolean() });
const ExtraRow = z.object({
  employeeId: z.number(),
  unscoredDays: z.number(),
  finished: z.number(),
  expired: z.number(),
  openTasks: z.number(),
  atRisk: z.number(),
  recordDelayMinutes: z.number().nullable(),
  replyMinutes: z.number().nullable(),
  unanswered: z.number(),
  scoreWaitMinutes: z.number().nullable(),
  backlogMinutes: z.number(),
  backlogGrowthMinutes: z.number(),
});
const MemberDayRow = z.object({
  employeeId: z.number(),
  day: z.string(),
  workMinutes: z.number(),
  spentMinutes: z.number(),
  score: z.number().nullable(),
  backlogMinutes: z.number(),
});

/** An employee's days are seen by themselves and every manager above them (decision 12). */
export async function assertCanView(viewerId: number, employeeId: number): Promise<void> {
  if (viewerId === employeeId) return;
  const [row] = Bool.array().parse(await sql`
    SELECT ${employeeId} IN (SELECT subordinates(${viewerId})) AS value
  `);
  if (!row?.value) throw new AppError('forbidden');
}

/** The last N days (today included) in each employee's own time zone, or fixed days. */
export type Range = { days: number } | { from: string; to: string };

/**
 * Metrics of a range. Workload and quality stay apart; the score is weighted
 * by the timesheet hours of the scored days.
 */
export async function stats(ids: number[], range: Range, db: Sql = sql): Promise<Map<number, Stats>> {
  if (ids.length === 0) return new Map();
  const bounds = 'days' in range
    ? db`local_today(id) - ${range.days - 1}::int AS since, local_today(id) AS until`
    : db`${range.from}::date AS since, ${range.to}::date AS until`;
  const rows = StatsRow.array().parse(await db`
    WITH e AS (
      SELECT id, time_zone, ${bounds}
        FROM employee WHERE id = ANY(${ids})
    ),
    -- Each person's closed shifts by day, within the range only.
    w AS (
      SELECT e.id AS employee_id, (w.started_at AT TIME ZONE e.time_zone)::date AS day, sum(w.spent_minutes) AS minutes
        FROM work w JOIN e ON e.id = w.employee_id
       WHERE w.spent_minutes IS NOT NULL
         -- Two days of margin for time zones; the exact days are cut below.
         AND w.started_at >= (e.since - 2)::timestamptz AND w.started_at < (e.until + 2)::timestamptz
       GROUP BY 1, 2
    ),
    wr AS (SELECT w.* FROM w JOIN e ON e.id = w.employee_id WHERE w.day BETWEEN e.since AND e.until),
    -- Grouped once per person, not a subquery per person: the summary has hundreds.
    wa AS (SELECT employee_id, sum(minutes)::int AS minutes, count(*)::int AS days FROM wr GROUP BY 1),
    sa AS (
      SELECT s."by" AS employee_id, sum(s.value)::int AS minutes
        FROM spent_minutes s JOIN e ON e.id = s."by"
       WHERE s.day BETWEEN e.since AND e.until
       GROUP BY 1
    ),
    sc AS (
      SELECT s.employee_id, count(*)::int AS days,
             (sum(s.value * wr.minutes) / NULLIF(sum(wr.minutes), 0))::float8 AS weighted
        FROM score s JOIN e ON e.id = s.employee_id
        LEFT JOIN wr ON wr.employee_id = s.employee_id AND wr.day = s.day
       WHERE s.day BETWEEN e.since AND e.until AND s.value IS NOT NULL
       GROUP BY 1
    )
    SELECT e.id AS employee_id,
           COALESCE(wa.minutes, 0) AS work_minutes, COALESCE(wa.days, 0) AS work_days,
           COALESCE(sa.minutes, 0) AS spent_minutes,
           COALESCE(sc.days, 0) AS scored_days, sc.weighted AS weighted_score
      FROM e
      LEFT JOIN wa ON wa.employee_id = e.id
      LEFT JOIN sa ON sa.employee_id = e.id
      LEFT JOIN sc ON sc.employee_id = e.id
  `);
  return new Map(rows.map(({ employeeId, ...rest }) => [employeeId, rest]));
}

/**
 * Every day of a range for each of these people, oldest first: timesheet,
 * time logged, the score, the backlog at the day's end — the sparklines of
 * My team and the chart of an employee page.
 */
async function memberDays(ids: number[], from: string, to: string): Promise<z.infer<typeof MemberDayRow>[]> {
  return MemberDayRow.array().parse(await sql`
    WITH e AS (SELECT id, time_zone FROM employee WHERE id = ANY(${ids})),
         d AS (SELECT e.id, e.time_zone, g::date AS day
                 FROM e, generate_series(${from}::date, ${to}::date, INTERVAL '1 day') g),
         w AS (
           SELECT w.employee_id, (w.started_at AT TIME ZONE e.time_zone)::date AS day, sum(w.spent_minutes) AS minutes
             FROM work w JOIN e ON e.id = w.employee_id
            WHERE w.spent_minutes IS NOT NULL
            GROUP BY 1, 2
         ),
         s AS (SELECT "by" AS employee_id, day, sum(value) AS minutes FROM spent_minutes WHERE "by" = ANY(${ids}) GROUP BY 1, 2)
    SELECT d.id AS employee_id, d.day::text, COALESCE(w.minutes, 0)::int AS work_minutes,
           COALESCE(s.minutes, 0)::int AS spent_minutes, sc.value AS score,
           b.minutes AS backlog_minutes
      FROM d
      JOIN backlog_by_day(${ids}, ${from}::date, ${to}::date) b ON b.employee_id = d.id AND b.day = d.day
      LEFT JOIN w ON w.employee_id = d.id AND w.day = d.day
      LEFT JOIN s ON s.employee_id = d.id AND s.day = d.day
      LEFT JOIN score sc ON sc.employee_id = d.id AND sc.day = d.day
     ORDER BY d.id, d.day
  `);
}

/**
 * The team summary: me first (my own report), then the whole subtree of my
 * reports, direct ones first, for a range of their days — workload and
 * score, days waiting for a score, tasks closed by hand and automatically
 * (decision 32). Nobody's hours are added up (decision 38).
 */
export async function summary(viewerId: number, from: string, to: string): Promise<Member[]> {
  const rows = MemberRow.array().parse(await sql`
    SELECT e.id, COALESCE(e.manager_id = ${viewerId}, FALSE) AS direct, e.id = ${viewerId} AS self
      FROM employee e
     WHERE e.id IN (SELECT subordinates(${viewerId})) OR e.id = ${viewerId}
     ORDER BY (e.id = ${viewerId}) DESC, (e.manager_id = ${viewerId}) DESC, e.email IS NULL, e.full_name, e.id
  `);
  const ids = rows.map((r) => r.id);
  const byId = await stats(ids, { from, to });
  // The current deadline row tells how a task closed: set at the moment it took effect —
  // by hand ("Finish" or moved to the past); set in advance and then reached — automatically.
  const extra = new Map(ExtraRow.array().parse(await sql`
    WITH e AS (SELECT id, time_zone, local_today(id) AS today FROM employee WHERE id = ANY(${ids})),
         -- Days of the range with shifts, all closed and before today, not scored: grouped once.
         days AS (
           SELECT w.employee_id, (w.started_at AT TIME ZONE e.time_zone)::date AS day,
                  bool_and(w.spent_minutes IS NOT NULL) AS closed
             FROM work w JOIN e ON e.id = w.employee_id
            WHERE w.started_at >= (${from}::date - 2)::timestamptz AND w.started_at < (${to}::date + 2)::timestamptz
            GROUP BY 1, 2
         ),
         unscored AS (
           SELECT d.employee_id, count(*)::int AS n
             FROM days d JOIN e ON e.id = d.employee_id
            WHERE d.closed AND d.day < e.today AND d.day BETWEEN ${from}::date AND ${to}::date
              AND NOT EXISTS (SELECT 1 FROM score s
                               WHERE s.employee_id = d.employee_id AND s.day = d.day AND s.value IS NOT NULL)
            GROUP BY 1
         ),
         asked AS (
           SELECT m.value AS employee_id, c.created_at AS asked_at,
                  (SELECT min(r.created_at) FROM comment r
                    WHERE r.task_id = m.task_id AND r.id > m.comment_id AND r.created_by = m.value) AS replied_at
             FROM mention m
             JOIN comment c ON c.task_id = m.task_id AND c.id = m.comment_id
             JOIN e ON e.id = m.value
            WHERE (c.created_at AT TIME ZONE e.time_zone)::date BETWEEN ${from}::date AND ${to}::date
         ),
         -- The reaction counts only the person's working time: hours off are not theirs to answer for.
         replies AS (
           SELECT a.*, CASE WHEN a.replied_at IS NOT NULL
                            THEN working_minutes(a.employee_id, a.asked_at, a.replied_at) END AS reaction
             FROM asked a
         ),
         closed AS (
           SELECT k.owner_id, f.value - f.entered_at > INTERVAL '1 minute' AS automatic
             FROM task k
             JOIN e ON e.id = k.owner_id
             JOIN finished_at f ON f.task_id = k.id AND f.expired_at IS NULL
            WHERE f.value <= NOW() AND (f.value AT TIME ZONE e.time_zone)::date BETWEEN ${from}::date AND ${to}::date
         )
    SELECT e.id AS employee_id,
           COALESCE((SELECT n FROM unscored u WHERE u.employee_id = e.id), 0) AS unscored_days,
           (SELECT count(*)::int FROM closed c WHERE c.owner_id = e.id AND NOT c.automatic) AS finished,
           (SELECT count(*)::int FROM closed c WHERE c.owner_id = e.id AND c.automatic) AS expired,
           (SELECT count(*)::int FROM task k
              LEFT JOIN finished_at f ON f.task_id = k.id AND f.expired_at IS NULL
             WHERE k.owner_id = e.id AND (f.value IS NULL OR f.value > NOW())) AS open_tasks,
           (SELECT count(*)::int FROM task k
              JOIN finished_at f ON f.task_id = k.id AND f.expired_at IS NULL AND f.value > NOW()
             WHERE k.owner_id = e.id AND EXISTS (SELECT 1 FROM deadline_risk(k.id))) AS at_risk,
           (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY GREATEST(0,
                     extract(epoch FROM w.updated_at - (w.started_at + w.spent_minutes * INTERVAL '1 minute')) / 60))
              FROM work w
             WHERE w.employee_id = e.id AND w.spent_minutes IS NOT NULL
               AND (w.started_at AT TIME ZONE e.time_zone)::date BETWEEN ${from}::date AND ${to}::date
           )::float8 AS record_delay_minutes,
           -- Without a timesheet there is no working time to measure against: no value.
           (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY r.reaction)
              FROM replies r
             WHERE r.employee_id = e.id AND r.replied_at IS NOT NULL
               AND EXISTS (SELECT 1 FROM work w WHERE w.employee_id = e.id))::float8 AS reply_minutes,
           (SELECT count(*)::int FROM replies r WHERE r.employee_id = e.id AND r.replied_at IS NULL) AS unanswered,
           (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM
                     s.added_at - ((s.day + 1)::timestamp AT TIME ZONE r.time_zone)) / 60)
              FROM score s JOIN employee r ON r.id = s.employee_id
             WHERE s."by" = e.id AND s.day BETWEEN ${from}::date AND ${to}::date)::float8 AS score_wait_minutes,
           backlog_minutes(e.id, NOW()) AS backlog_minutes,
           backlog_minutes(e.id, LEAST(NOW(), (${to}::date + 1)::timestamp AT TIME ZONE e.time_zone))
             - backlog_minutes(e.id, ${from}::date::timestamp AT TIME ZONE e.time_zone) AS backlog_growth_minutes
      FROM e
  `).map(({ employeeId, ...rest }) => [employeeId, rest]));
  const days = await memberDays(ids, from, to);
  const daysOf = new Map<number, DayStats[]>();
  for (const { employeeId, ...day } of days) daysOf.set(employeeId, [...(daysOf.get(employeeId) ?? []), day]);
  return rows.map((r) => ({
    employeeId: r.id, direct: r.direct, self: r.self, stats: byId.get(r.id)!, ...extra.get(r.id)!, days: daysOf.get(r.id) ?? [],
  }));
}

/** Metrics of a range and every day of it, for the chart. */
export async function employeeStats(viewerId: number, employeeId: number, from: string, to: string): Promise<PeriodStats> {
  await assertCanView(viewerId, employeeId);
  const result = (await stats([employeeId], { from, to })).get(employeeId);
  if (!result) throw new AppError('not_found');
  const days: DayStats[] = (await memberDays([employeeId], from, to)).map(({ employeeId: _, ...day }) => day);
  return { stats: result, days };
}

/** The same History as in their My day: shifts, time logged, visits, scores. */
export async function history(viewerId: number, employeeId: number, page: number): Promise<History> {
  await assertCanView(viewerId, employeeId);
  return MyDay.history(employeeId, page);
}

const ScoreRow = z.object({ value: z.number().nullable(), reason: z.string().nullable() });
const Now = z.object({ at: z.date() });

/**
 * The direct manager scores a past day or corrects the score (the trigger
 * checks the manager, the day and the timesheet). Every version goes to the
 * employee with its time, reason and the previous value: their mail keeps
 * the history, the table only the current value. An unchanged score is a no-op.
 */
export async function score(viewerId: number, input: ScoreInput): Promise<void> {
  const reason = input.reason || null;
  await sql.begin(async (tx) => {
    const db = tx as unknown as Sql;
    const [previous] = ScoreRow.array().parse(await db`
      SELECT value, reason FROM score WHERE employee_id = ${input.employeeId} AND day = ${input.day} FOR UPDATE
    `);
    if (previous && previous.value === input.value && previous.reason === reason) return;
    if (previous) {
      await db`
        UPDATE score SET value = ${input.value}, reason = ${reason}, "by" = ${viewerId}
         WHERE employee_id = ${input.employeeId} AND day = ${input.day}
      `;
    } else {
      await db`
        INSERT INTO score (employee_id, day, "by", value, reason)
        VALUES (${input.employeeId}, ${input.day}, ${viewerId}, ${input.value}, ${reason})
      `;
    }
    await notifyScore(db, viewerId, input.employeeId, input.day, input.value, reason, previous ?? null);
  });
}

async function notifyScore(
  db: Sql, by: number, employeeId: number, day: string, value: number | null, reason: string | null,
  previous: { value: number | null; reason: string | null } | null,
): Promise<void> {
  const [now] = Now.array().parse(await db`SELECT NOW() AS at`);
  await db`SELECT notify(${employeeId}, NULL, ${db.json({
    kind: 'score', by, day, value, reason, at: now!.at.toISOString(), previous,
  })})`;
}

/**
 * The direct manager withdraws a score so the employee can correct the
 * day's timesheet; the reason stays and shows up when the day is scored
 * again. Mailed like every version. A day without a standing score is a no-op.
 */
export async function unscore(viewerId: number, employeeId: number, day: string): Promise<void> {
  await sql.begin(async (tx) => {
    const db = tx as unknown as Sql;
    const [previous] = ScoreRow.array().parse(await db`
      SELECT value, reason FROM score WHERE employee_id = ${employeeId} AND day = ${day} FOR UPDATE
    `);
    if (!previous || previous.value === null) return;
    await db`UPDATE score SET value = NULL, "by" = ${viewerId} WHERE employee_id = ${employeeId} AND day = ${day}`;
    await notifyScore(db, viewerId, employeeId, day, null, previous.reason, previous);
  });
}
