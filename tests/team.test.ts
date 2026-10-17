import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { sql } from '../server/pg.ts';
import { client, createEmployee } from './helpers.ts';

async function createTask(ownerId: number): Promise<number> {
  return (await client(ownerId)).Task.create({ tags: [`m-${randomUUID().slice(0, 8)}`] });
}

async function kinds(employeeId: number) {
  return (await sql<{ payload: { kind: string; for?: number } }[]>`
    SELECT payload FROM notification WHERE employee_id = ${employeeId} ORDER BY id
  `).map((n) => n.payload);
}

/** A closed shift `daysAgo` days back, 8 hours from 09:00 in the employee's time zone. */
async function shift(employeeId: number, daysAgo: number, hours = 8) {
  const [row] = await sql<{ at: Date }[]>`
    SELECT ((local_today(${employeeId}) - ${daysAgo}::int) + time '09:00')
             AT TIME ZONE (SELECT time_zone FROM employee WHERE id = ${employeeId}) AS at
  `;
  await (await client(employeeId)).Work.add({ startedAt: row!.at, endedAt: new Date(row!.at.getTime() + hours * 3_600_000), about: null });
  const [day] = await sql<{ d: string }[]>`SELECT (local_today(${employeeId}) - ${daysAgo}::int)::text AS d`;
  return day!.d;
}

/** The employee's last `days` days, today included. */
async function lastDays(employeeId: number, days: number) {
  const [row] = await sql<{ from: string; to: string }[]>`
    SELECT (local_today(${employeeId}) - ${days - 1}::int)::text AS from, local_today(${employeeId})::text AS to
  `;
  return { employeeId, ...row! };
}

describe('ownership', () => {
  test('the owner hands a task over; the new owner is told and the old one stays an observer', async () => {
    const owner = await createEmployee();
    const heir = await createEmployee();
    const id = await createTask(owner.id);
    await (await client(owner.id)).Task.markReviewed({ id });

    await (await client(owner.id)).Task.transfer({ id, ownerId: heir.id });
    const task = await (await client(heir.id)).Task.get({ id });
    expect(task).toMatchObject({ ownerId: heir.id, access: 'owner' });
    expect(task.details?.reviewedAt).toBeNull();
    expect(await (await client(owner.id)).Task.get({ id })).toMatchObject({ access: 'observer' });
    expect((await kinds(heir.id)).map((n) => n.kind)).toEqual(['owner_change']);
    expect(await kinds(owner.id)).toEqual([]);
  });

  test("the owner's manager hands it over: both are told; nobody else may", async () => {
    const boss = await createEmployee();
    const owner = await createEmployee({ managerId: boss.id });
    const heir = await createEmployee();
    const id = await createTask(owner.id);

    await expect((await client(heir.id)).Task.transfer({ id, ownerId: heir.id })).rejects.toMatchObject({ message: 'forbidden' });
    await (await client(boss.id)).Task.transfer({ id, ownerId: heir.id });
    expect((await kinds(heir.id)).map((n) => n.kind)).toEqual(['owner_change']);
    expect(await kinds(owner.id)).toMatchObject([{ kind: 'owner_handed', by: boss.id, employeeId: heir.id }]);
  });

  test('an ownerless task is taken by someone who sees it', async () => {
    const owner = await createEmployee();
    const helper = await createEmployee();
    const stranger = await createEmployee();
    const id = await createTask(owner.id);
    await (await client(owner.id)).Observer.add({ taskId: id, employeeId: helper.id });
    await sql`UPDATE task SET owner_id = NULL WHERE id = ${id}`;

    await expect((await client(stranger.id)).Task.take({ id })).rejects.toMatchObject({ message: 'no_access' });
    // The feed of an ownerless task opens (no comment is "new" for nobody).
    expect((await (await client(helper.id)).Comment.list({ taskId: id, filter: 'all', page: 1 })).total).toBe(0);
    await (await client(owner.id)).Comment.create({ taskId: id, html: '<p>Anyone?</p>', replyToId: null, files: [], mentionIds: [], taskIds: [] });
    expect((await (await client(helper.id)).Comment.list({ taskId: id, filter: 'all', page: 1 })).items).toMatchObject([{ isNew: false }]);
    await (await client(helper.id)).Task.take({ id });
    expect(await (await client(helper.id)).Task.get({ id })).toMatchObject({ ownerId: helper.id });
    await expect((await client(owner.id)).Task.take({ id })).rejects.toMatchObject({ message: 'forbidden' });
  });
});

describe('absence', () => {
  test('while someone is away, their notifications are copied to the manager', async () => {
    const boss = await createEmployee();
    const away = await createEmployee({ managerId: boss.id });
    const colleague = await createEmployee();
    const [future] = await sql<{ d: string }[]>`SELECT (local_today(${away.id}) + 3)::text AS d`;
    await (await client(away.id)).Employee.updateSettings({ nextDay: future!.d });

    const id = await createTask(away.id);
    await (await client(away.id)).Observer.add({ taskId: id, employeeId: colleague.id });
    await (await client(colleague.id)).Comment.create({ taskId: id, html: '<p>Hi</p>', replyToId: null, files: [], mentionIds: [], taskIds: [] });

    expect((await kinds(away.id)).map((n) => n.kind)).toEqual(['comment']);
    expect(await kinds(boss.id)).toContainEqual(expect.objectContaining({ kind: 'comment', for: away.id }));
  });
});

describe('team', () => {
  test('the summary: the whole subtree, direct reports first; days to score; finished and missed deadlines', async () => {
    const boss = await createEmployee();
    const lead = await createEmployee({ managerId: boss.id });
    const dev = await createEmployee({ managerId: lead.id });
    const scored = await shift(dev.id, 1, 8);
    await shift(dev.id, 2, 6);
    await (await client(lead.id)).Team.score({ employeeId: dev.id, day: scored, value: 80, reason: null });

    // Finished by the owner; missed: a deadline set in advance that passed (moved back in SQL to simulate time).
    const api = await client(dev.id);
    const finished = await createTask(dev.id);
    await api.Task.setDeadline({ id: finished, deadline: new Date() }); // "Finish"
    const missed = await createTask(dev.id);
    await api.Task.setDeadline({ id: missed, deadline: new Date(Date.now() + 3_600_000) });
    await sql`UPDATE finished_at SET value = NOW() - INTERVAL '1 hour', entered_at = NOW() - INTERVAL '2 days' WHERE task_id = ${missed}`;
    await createTask(dev.id); // open

    const range = await lastDays(boss.id, 7);
    const members = await (await client(boss.id)).Team.summary({ from: range.from, to: range.to });
    // Me first — my own report — then direct reports, then theirs.
    expect(members.map((m) => [m.employeeId, m.self, m.direct])).toEqual([[boss.id, true, false], [lead.id, false, true], [dev.id, false, false]]);
    expect(members[2]).toMatchObject({
      stats: { workMinutes: 14 * 60, workDays: 2, scoredDays: 1, weightedScore: 80 },
      unscoredDays: 1,
      finished: 1,
      expired: 1,
      openTasks: 1,
    });
    expect((await (await client(dev.id)).Team.summary({ from: range.from, to: range.to })).map((m) => m.employeeId)).toEqual([dev.id]);
  });

  test('days and metrics: the employee and the managers above; others are refused', async () => {
    const boss = await createEmployee();
    const lead = await createEmployee({ managerId: boss.id });
    const dev = await createEmployee({ managerId: lead.id });
    const peer = await createEmployee({ managerId: boss.id });

    for (const viewer of [dev, lead, boss]) {
      expect((await (await client(viewer.id)).Team.history({ employeeId: dev.id, page: 1 })).days.length).toBeGreaterThan(0);
    }
    await expect((await client(peer.id)).Team.history({ employeeId: dev.id, page: 1 })).rejects.toMatchObject({ message: 'forbidden' });
    await expect((await client(dev.id)).Team.stats(await lastDays(lead.id, 30))).rejects.toMatchObject({ message: 'forbidden' });
  });

  test('only the direct manager scores and corrects; the score is weighted by hours; every version is mailed', async () => {
    const boss = await createEmployee();
    const lead = await createEmployee({ managerId: boss.id });
    const dev = await createEmployee({ managerId: lead.id });
    const long = await shift(dev.id, 1, 9);
    const short = await shift(dev.id, 2, 3);

    await expect((await client(boss.id)).Team.score({ employeeId: dev.id, day: long, value: 50, reason: null }))
      .rejects.toMatchObject({ message: 'not_manager' });
    const api = await client(lead.id);
    await api.Team.score({ employeeId: dev.id, day: long, value: 100, reason: null });
    await api.Team.score({ employeeId: dev.id, day: short, value: 40, reason: 'Wrong priorities' });
    const week = await api.Team.stats(await lastDays(dev.id, 7));
    expect(week.stats).toMatchObject({ scoredDays: 2, weightedScore: 85, workMinutes: 12 * 60 });
    expect(week.days).toHaveLength(7);
    expect(week.days.find((d) => d.day === long)).toEqual({ day: long, workMinutes: 9 * 60, spentMinutes: 0, score: 100, backlogMinutes: 0 });

    // A correction: the interface keeps the current value, the mail keeps the history.
    await api.Team.score({ employeeId: dev.id, day: long, value: 90, reason: 'On second thought' });
    await api.Team.score({ employeeId: dev.id, day: long, value: 90, reason: 'On second thought' }); // unchanged: no mail
    await expect((await client(boss.id)).Team.score({ employeeId: dev.id, day: long, value: 10, reason: 'x' }))
      .rejects.toMatchObject({ message: 'not_manager' });
    await expect(sql`DELETE FROM score WHERE employee_id = ${dev.id}`).rejects.toMatchObject({ hint: 'score_final' });
    const mails = await kinds(dev.id);
    expect(mails).toHaveLength(3);
    expect(mails[2]).toMatchObject({ kind: 'score', day: long, value: 90, reason: 'On second thought', previous: { value: 100, reason: null } });
    expect((await api.Team.stats(await lastDays(dev.id, 7))).stats).toMatchObject({ weightedScore: 77.5 });
    await expect(api.Team.stats({ employeeId: dev.id, from: '2026-01-01', to: '2027-06-01' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const [day] = (await (await client(dev.id)).MyDay.history({ page: 1 })).days.filter((d) => d.day === short);
    expect(day?.score).toEqual({ value: 40, reason: 'Wrong priorities' });
  });

  test('a day is the employee\'s until scored: several shifts, corrected and deleted; a withdrawn score frees it', async () => {
    const lead = await createEmployee();
    const dev = await createEmployee({ managerId: lead.id });
    const devApi = await client(dev.id);
    const leadApi = await client(lead.id);
    const day = await shift(dev.id, 3, 4);
    const history = async () => (await devApi.MyDay.history({ page: 1 })).days.find((d) => d.day === day)!;
    const [morning] = (await history()).shifts;

    // A second shift the same day, then corrections: the day is not scored yet.
    const afternoon = new Date(morning!.startedAt.getTime() + 5 * 3_600_000);
    await devApi.Work.add({ startedAt: afternoon, endedAt: new Date(afternoon.getTime() + 3_600_000), about: 'Calls' });
    await devApi.Work.update({ startedAt: afternoon, newStartedAt: afternoon, endedAt: new Date(afternoon.getTime() + 2 * 3_600_000), about: 'Calls, notes' });
    expect((await history()).shifts.map((s) => [s.spentMinutes, s.about])).toEqual([[240, null], [120, 'Calls, notes']]);
    await devApi.Work.remove({ startedAt: afternoon });
    expect((await history()).shifts).toHaveLength(1);

    // A score freezes the day.
    await leadApi.Team.score({ employeeId: dev.id, day, value: 50, reason: 'The report was late' });
    await expect(devApi.Work.update({ startedAt: morning!.startedAt, newStartedAt: morning!.startedAt, endedAt: new Date(morning!.startedAt.getTime() + 3_600_000), about: null }))
      .rejects.toMatchObject({ message: 'day_scored' });
    await expect(devApi.Work.remove({ startedAt: morning!.startedAt })).rejects.toMatchObject({ message: 'day_scored' });

    // Withdrawn: the reason stays, the day counts nowhere and is open again.
    await expect((await client((await createEmployee()).id)).Team.unscore({ employeeId: dev.id, day }))
      .rejects.toMatchObject({ message: 'not_manager' });
    await leadApi.Team.unscore({ employeeId: dev.id, day });
    expect((await history()).score).toEqual({ value: null, reason: 'The report was late' });
    expect((await leadApi.Team.stats(await lastDays(dev.id, 7))).stats).toMatchObject({ scoredDays: 0, weightedScore: null });
    const { from, to } = await lastDays(lead.id, 7);
    expect((await leadApi.Team.summary({ from, to })).find((m) => m.employeeId === dev.id)).toMatchObject({ unscoredDays: 1 });
    await devApi.Work.update({ startedAt: morning!.startedAt, newStartedAt: morning!.startedAt, endedAt: new Date(morning!.startedAt.getTime() + 5 * 3_600_000), about: 'Report done' });

    // Scored again; the mail tells a withdrawal and a new score apart.
    await leadApi.Team.score({ employeeId: dev.id, day, value: 80, reason: 'The report was late, but done well' });
    const mails = (await kinds(dev.id)).filter((m) => m.kind === 'score');
    expect(mails.map((m) => (m as unknown as { value: number | null }).value)).toEqual([50, null, 80]);
  });

  test('the summary tells how late the timesheet is written and how fast mentions are answered', async () => {
    const lead = await createEmployee();
    const dev = await createEmployee({ managerId: lead.id });
    const day = await shift(dev.id, 2, 8); // written two days late, minus the 8 hours
    const task = await createTask(lead.id);
    const ask = (await client(lead.id)).Comment.create;
    const asked = await ask({ taskId: task, html: '<p>Look</p>', replyToId: null, files: [], mentionIds: [dev.id], taskIds: [] });
    await ask({ taskId: task, html: '<p>And this</p>', replyToId: null, files: [], mentionIds: [dev.id], taskIds: [] });
    await (await client(dev.id)).Comment.create({ taskId: task, html: '<p>Done</p>', replyToId: asked, files: [], mentionIds: [], taskIds: [] });
    const { from, to } = await lastDays(lead.id, 7);

    const member = (await (await client(lead.id)).Team.summary({ from, to })).find((m) => m.employeeId === dev.id)!;
    expect(member.recordDelayMinutes).toBeGreaterThan(24 * 60);
    // Both mentions are answered by the one reply after them, at once.
    expect(member.replyMinutes).toBeGreaterThanOrEqual(0);
    expect(member.replyMinutes).toBeLessThan(5);
    expect(member.unanswered).toBe(0);
    expect(member.days).toHaveLength(7);
    expect(member.days.find((d) => d.day === day)).toMatchObject({ workMinutes: 8 * 60 });
  });

  test('reaction counts working time only: a mention after the shift, answered as the next began, took nothing', async () => {
    const dev = await createEmployee();
    const day = await shift(dev.id, 1, 8); // yesterday 09:00–17:00
    const at = async (time: string, daysAgo = 1) => (await sql<{ v: Date }[]>`
      SELECT ((local_today(${dev.id}) - ${daysAgo}::int) + ${time}::time) AT TIME ZONE (SELECT time_zone FROM employee WHERE id = ${dev.id}) AS v
    `)[0]!.v;
    const minutes = async (from: Date, to: Date) =>
      Number((await sql<{ v: string }[]>`SELECT working_minutes(${dev.id}, ${from}, ${to}) AS v`)[0]!.v);
    expect(day).toBeTruthy();
    expect(await minutes(await at('17:01'), await at('09:00', 0))).toBe(0);
    expect(await minutes(await at('16:00'), await at('18:00'))).toBe(60);
    await (await client(dev.id)).Work.start({ startedAt: new Date(Date.now() - 3_600_000) });
    // The shift's start is cut to the minute: an hour and up to a minute more.
    const open = await minutes(new Date(Date.now() - 2 * 3_600_000), new Date());
    expect(open).toBeGreaterThanOrEqual(60);
    expect(open).toBeLessThanOrEqual(61);
  });

  test('backlog: planned work on open tasks, its growth over the range; how long days wait for a score', async () => {
    const lead = await createEmployee();
    const dev = await createEmployee({ managerId: lead.id });
    const devApi = await client(dev.id);
    const a = await createTask(dev.id);
    const b = await createTask(dev.id);
    await devApi.Time.setLeft({ taskId: a, minutes: 120 });
    await devApi.Time.setLeft({ taskId: b, minutes: 60 });
    await devApi.Time.setLeft({ taskId: b, minutes: 90 }); // re-estimated: the current value counts
    const day = await shift(dev.id, 2, 8);
    await (await client(lead.id)).Team.score({ employeeId: dev.id, day, value: 70, reason: null });
    const { from, to } = await lastDays(lead.id, 7);
    const summary = async () => (await (await client(lead.id)).Team.summary({ from, to }));

    let member = (await summary()).find((m) => m.employeeId === dev.id)!;
    expect(member).toMatchObject({ backlogMinutes: 210, backlogGrowthMinutes: 210 });
    expect(member.days.at(-1)).toMatchObject({ backlogMinutes: 210 });
    await devApi.Task.setDeadline({ id: a, deadline: new Date() }); // finished: its plan leaves the backlog
    member = (await summary()).find((m) => m.employeeId === dev.id)!;
    expect(member.backlogMinutes).toBe(90);

    // The day ended two days ago and was scored now: about 1–2 days of waiting, on the manager's row.
    const leadRow = (await summary()).find((m) => m.employeeId === lead.id)!;
    expect(leadRow.scoreWaitMinutes).toBeGreaterThan(1440);
    expect(leadRow.scoreWaitMinutes).toBeLessThan(2 * 1440);
  });

  test('the weekly email: Monday from 09:00 in the manager\'s time zone, once, only when there is something', async () => {
    const lead = await createEmployee();
    const dev = await createEmployee({ managerId: lead.id });
    await shift(dev.id, 2, 8); // a past day waiting for the lead's score
    const monday = async (time: string) => (await sql<{ at: Date }[]>`
      SELECT (date_trunc('week', NOW() AT TIME ZONE time_zone)::date + 7 + ${time}::time) AT TIME ZONE time_zone AS at
        FROM employee WHERE id = ${lead.id}
    `)[0]!.at;
    const digests = async () => (await sql<{ payload: { kind: string; unscored: number } }[]>`
      SELECT payload FROM notification WHERE employee_id = ${lead.id} AND payload->>'kind' = 'weekly_digest'
    `).map((n) => n.payload);

    await sql`SELECT send_weekly_digests(${await monday('08:59')})`;
    expect(await digests()).toEqual([]);
    await sql`SELECT send_weekly_digests(${await monday('09:05')})`;
    await sql`SELECT send_weekly_digests(${await monday('10:05')})`; // once a week
    expect(await digests()).toEqual([expect.objectContaining({ unscored: 1, expired: 0, atRisk: 0 })]);

    // A manager with nothing waiting gets no email.
    const calm = await createEmployee();
    await createEmployee({ managerId: calm.id });
    await sql`SELECT send_weekly_digests(${await monday('09:30')})`;
    expect(await sql`SELECT 1 FROM notification WHERE employee_id = ${calm.id} AND payload->>'kind' = 'weekly_digest'`).toHaveLength(0);
  });
});
