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
const MemberRow = z.object({ id: z.number(), direct: z.boolean() });
const ExtraRow = z.object({
  employeeId: z.number(),
  unscoredDays: z.number(),
  finished: z.number(),
  expired: z.number(),
  openTasks: z.number(),
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
    w AS (
      SELECT e.id AS employee_id, (w.started_at AT TIME ZONE e.time_zone)::date AS day, sum(w.spent_minutes) AS minutes
        FROM work w JOIN e ON e.id = w.employee_id
       WHERE w.spent_minutes IS NOT NULL
       GROUP BY 1, 2
    )
    SELECT e.id AS employee_id,
           (SELECT COALESCE(sum(minutes), 0)::int FROM w
             WHERE w.employee_id = e.id AND w.day BETWEEN e.since AND e.until) AS work_minutes,
           (SELECT count(*)::int FROM w
             WHERE w.employee_id = e.id AND w.day BETWEEN e.since AND e.until) AS work_days,
           (SELECT COALESCE(sum(value), 0)::int FROM spent_minutes s
             WHERE s."by" = e.id AND s.day BETWEEN e.since AND e.until) AS spent_minutes,
           (SELECT count(*)::int FROM score s
             WHERE s.employee_id = e.id AND s.day BETWEEN e.since AND e.until) AS scored_days,
           (SELECT (sum(s.value * w.minutes) / NULLIF(sum(w.minutes), 0))::float8
              FROM score s JOIN w ON w.employee_id = s.employee_id AND w.day = s.day
             WHERE s.employee_id = e.id AND s.day BETWEEN e.since AND e.until) AS weighted_score
      FROM e
  `);
  return new Map(rows.map(({ employeeId, ...rest }) => [employeeId, rest]));
}

/**
 * The team summary: the whole subtree of my reports, direct ones first,
 * for a range of their days — workload and score, days waiting for a score,
 * tasks closed by hand and automatically (decision 32).
 */
export async function summary(viewerId: number, from: string, to: string): Promise<Member[]> {
  const rows = MemberRow.array().parse(await sql`
    SELECT e.id, e.manager_id = ${viewerId} AS direct
      FROM employee e
     WHERE e.id IN (SELECT subordinates(${viewerId}))
     ORDER BY (e.manager_id = ${viewerId}) DESC, e.email IS NULL, e.full_name, e.id
  `);
  const ids = rows.map((r) => r.id);
  const byId = await stats(ids, { from, to });
  // The current deadline row tells how a task closed: set at the moment it took effect —
  // by hand ("Finish" or moved to the past); set in advance and then reached — automatically.
  const extra = new Map(ExtraRow.array().parse(await sql`
    WITH e AS (SELECT id, time_zone, local_today(id) AS today FROM employee WHERE id = ANY(${ids})),
         days AS (
           SELECT w.employee_id, (w.started_at AT TIME ZONE e.time_zone)::date AS day,
                  bool_and(w.spent_minutes IS NOT NULL) AS closed
             FROM work w JOIN e ON e.id = w.employee_id
            GROUP BY 1, 2
         ),
         closed AS (
           SELECT k.owner_id, f.value - f.entered_at > INTERVAL '1 minute' AS automatic
             FROM task k
             JOIN e ON e.id = k.owner_id
             JOIN finished_at f ON f.task_id = k.id AND f.expired_at IS NULL
            WHERE f.value <= NOW() AND (f.value AT TIME ZONE e.time_zone)::date BETWEEN ${from}::date AND ${to}::date
         )
    SELECT e.id AS employee_id,
           (SELECT count(*)::int FROM days d
             WHERE d.employee_id = e.id AND d.closed AND d.day < e.today
               AND d.day BETWEEN ${from}::date AND ${to}::date
               AND NOT EXISTS (SELECT 1 FROM score s WHERE s.employee_id = e.id AND s.day = d.day)) AS unscored_days,
           (SELECT count(*)::int FROM closed c WHERE c.owner_id = e.id AND NOT c.automatic) AS finished,
           (SELECT count(*)::int FROM closed c WHERE c.owner_id = e.id AND c.automatic) AS expired,
           (SELECT count(*)::int FROM task k
              LEFT JOIN finished_at f ON f.task_id = k.id AND f.expired_at IS NULL
             WHERE k.owner_id = e.id AND (f.value IS NULL OR f.value > NOW())) AS open_tasks
      FROM e
  `).map(({ employeeId, ...rest }) => [employeeId, rest]));
  return rows.map((r) => ({ employeeId: r.id, direct: r.direct, stats: byId.get(r.id)!, ...extra.get(r.id)! }));
}

const DayStatsRow = z.object({
  day: z.string(),
  workMinutes: z.number(),
  spentMinutes: z.number(),
  score: z.number().nullable(),
});

/** Metrics of a range and every day of it, for the chart. */
export async function employeeStats(viewerId: number, employeeId: number, from: string, to: string): Promise<PeriodStats> {
  await assertCanView(viewerId, employeeId);
  const result = (await stats([employeeId], { from, to })).get(employeeId);
  if (!result) throw new AppError('not_found');
  const days: DayStats[] = DayStatsRow.array().parse(await sql`
    WITH d AS (SELECT generate_series(${from}::date, ${to}::date, INTERVAL '1 day')::date AS day),
         w AS (
           SELECT (w.started_at AT TIME ZONE e.time_zone)::date AS day, sum(w.spent_minutes) AS minutes
             FROM work w JOIN employee e ON e.id = w.employee_id
            WHERE w.employee_id = ${employeeId} AND w.spent_minutes IS NOT NULL
            GROUP BY 1
         ),
         s AS (SELECT day, sum(value) AS minutes FROM spent_minutes WHERE "by" = ${employeeId} GROUP BY day)
    SELECT d.day::text, COALESCE(w.minutes, 0)::int AS work_minutes, COALESCE(s.minutes, 0)::int AS spent_minutes,
           sc.value AS score
      FROM d
      LEFT JOIN w ON w.day = d.day
      LEFT JOIN s ON s.day = d.day
      LEFT JOIN score sc ON sc.employee_id = ${employeeId} AND sc.day = d.day
     ORDER BY d.day
  `);
  return { stats: result, days };
}

/** The same History as in their My day: shifts, time logged, visits, scores. */
export async function history(viewerId: number, employeeId: number, page: number): Promise<History> {
  await assertCanView(viewerId, employeeId);
  return MyDay.history(employeeId, page);
}

const ScoreRow = z.object({ value: z.number(), reason: z.string().nullable() });
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
    const [now] = Now.array().parse(await db`SELECT NOW() AS at`);
    await db`SELECT notify(${input.employeeId}, NULL, ${db.json({
      kind: 'score', by: viewerId, day: input.day, value: input.value, reason,
      at: now!.at.toISOString(), previous: previous ?? null,
    })})`;
  });
}
