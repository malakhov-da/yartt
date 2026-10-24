import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { sql } from '../server/pg.ts';
import { client, createEmployee } from './helpers.ts';

async function createTask(ownerId: number): Promise<number> {
  return (await client(ownerId)).Task.create({ tags: [`d-${randomUUID().slice(0, 8)}`] });
}

const comment = (taskId: number, html: string, mentionIds: number[] = []) =>
  ({ taskId, html, replyToId: null, files: [], mentionIds, taskIds: [] });

describe('waiting', () => {
  test('my requests not answered and my open mentions of others, the longest waiting first, with their answers', async () => {
    const me = await createEmployee();
    const owner = await createEmployee();
    const helper = await createEmployee();
    const theirs = await createTask(owner.id);
    const mine = await createTask(me.id);
    const api = await client(me.id);

    await api.Observer.request({ taskId: theirs });
    await api.Observer.add({ taskId: mine, employeeId: helper.id });
    const asked = await api.Comment.create(comment(mine, '<p>Can you check?</p>', [helper.id]));
    expect(await api.MyDay.waiting()).toMatchObject([
      { kind: 'request', task: { id: theirs } },
      { kind: 'mention', task: { id: mine }, commentId: asked, employeeId: helper.id, excerpt: 'Can you check?', replies: [] },
    ]);

    // Answered: it stays until they press "Done"; the request is gone once withdrawn.
    const helperApi = await client(helper.id);
    const answer = await helperApi.Comment.create({ ...comment(mine, '<p>Checked</p>'), replyToId: asked });
    await api.Observer.withdraw({ taskId: theirs });
    expect(await api.MyDay.waiting()).toMatchObject([{ kind: 'mention', replies: [{ id: answer, excerpt: 'Checked' }] }]);
    await helperApi.Comment.closeMention({ taskId: mine, commentId: asked });
    expect(await api.MyDay.waiting()).toEqual([]);
  });
});

describe('todo', () => {
  test('a passed deadline: a day of warning, then a closing to confirm; what waits for the task hears it is done', async () => {
    const owner = await createEmployee();
    const waiting = await createEmployee();
    const task = await createTask(owner.id);
    const dependent = await createTask(waiting.id);
    const api = await client(owner.id);
    await (await client(waiting.id)).Dependency.set({ taskId: dependent, value: task, latestAt: null });
    const kinds = async (employeeId: number) => (await sql<{ payload: { kind: string } }[]>`
      SELECT payload FROM notification WHERE employee_id = ${employeeId} ORDER BY id
    `).map((n) => n.payload.kind);
    const todo = async (employeeId: number) =>
      (await (await client(employeeId)).MyDay.todo()).filter((i) => ['closing', 'closed', 'done'].includes(i.kind));

    // Set two days ahead, now 12 hours away: in TODO, and the owner is told once.
    await api.Task.setDeadline({ id: task, deadline: new Date(Date.now() + 12 * 3_600_000) });
    await sql`UPDATE finished_at SET entered_at = NOW() - INTERVAL '2 days' WHERE task_id = ${task}`;
    await sql`SELECT send_deadline_notices()`;
    await sql`SELECT send_deadline_notices()`;
    expect(await todo(owner.id)).toMatchObject([{ kind: 'closing', task: { id: task } }]);
    expect((await kinds(owner.id)).filter((k) => k === 'deadline_soon')).toHaveLength(1);

    // The deadline came: the closing waits for a confirmation; the waiting task's owner hears it is done.
    await sql`UPDATE finished_at SET value = NOW() - INTERVAL '1 minute' WHERE task_id = ${task} AND expired_at IS NULL`;
    await sql`SELECT send_deadline_notices()`;
    expect(await todo(owner.id)).toMatchObject([{ kind: 'closed', task: { id: task } }]);
    expect(await kinds(owner.id)).toContain('deadline_closed');
    expect(await todo(waiting.id)).toMatchObject([{ kind: 'done', task: { id: dependent }, dependency: { id: task } }]);
    expect(await kinds(waiting.id)).toContain('dependency_done');

    await expect((await client(waiting.id)).Task.confirmClosed({ id: task })).rejects.toMatchObject({ message: 'forbidden' });
    await api.Task.confirmClosed({ id: task });
    expect(await todo(owner.id)).toEqual([]);
    await expect(api.Task.confirmClosed({ id: task })).rejects.toMatchObject({ message: 'not_found' });
    await (await client(waiting.id)).Dependency.noted({ taskId: dependent, value: task });
    expect(await todo(waiting.id)).toEqual([]);
  });

  test('a task closed by hand is not one to confirm, but what waits for it hears it is done; reopened, it is not', async () => {
    const owner = await createEmployee();
    const waiting = await createEmployee();
    const task = await createTask(owner.id);
    const dependent = await createTask(waiting.id);
    const api = await client(owner.id);
    await (await client(waiting.id)).Dependency.set({ taskId: dependent, value: task, latestAt: null });
    await api.Task.setDeadline({ id: task, deadline: new Date() });
    await sql`SELECT send_deadline_notices()`;
    expect((await api.MyDay.todo()).filter((i) => i.kind === 'closed')).toEqual([]);
    const waitingApi = await client(waiting.id);
    expect((await waitingApi.MyDay.todo()).filter((i) => i.kind === 'done')).toHaveLength(1);
    // Reopened: not done any more (the change replaces the last one within a minute).
    await api.Task.setDeadline({ id: task, deadline: new Date(Date.now() + 86_400_000 * 3) });
    expect((await waitingApi.MyDay.todo()).filter((i) => i.kind === 'done')).toEqual([]);
  });

  test('an open mention stays until "Done"', async () => {
    const owner = await createEmployee();
    const helper = await createEmployee();
    const id = await createTask(owner.id);
    await (await client(owner.id)).Observer.add({ taskId: id, employeeId: helper.id });
    const commentId = await (await client(owner.id)).Comment.create(comment(id, '<p>Please look</p>', [helper.id]));

    const api = await client(helper.id);
    expect(await api.MyDay.todo()).toMatchObject([
      { kind: 'mention', task: { id }, commentId, authorId: owner.id, excerpt: 'Please look', replies: [] },
    ]);
    // A comment elsewhere in the task is not an answer: "Done" still waits.
    await api.Comment.create(comment(id, '<p>Something else</p>'));
    expect(await api.MyDay.todo()).toMatchObject([{ kind: 'mention', replies: [] }]);
    await expect(api.Comment.closeMention({ taskId: id, commentId })).rejects.toMatchObject({ message: 'mention_needs_reply' });
    // Every reply to it shows inside the mention, oldest first.
    const first = await api.Comment.create({ ...comment(id, '<p>On it</p>'), replyToId: commentId });
    const second = await api.Comment.create({ ...comment(id, '<p>Done, see the file</p>'), replyToId: commentId });
    expect((await api.MyDay.todo())[0]).toMatchObject({ replies: [{ id: first, excerpt: 'On it' }, { id: second, excerpt: 'Done, see the file' }] });
    await api.Comment.closeMention({ taskId: id, commentId });
    expect(await api.MyDay.todo()).toEqual([]);
  });

  test('my task with comments by others until "No intervention needed"; requests first', async () => {
    const owner = await createEmployee();
    const helper = await createEmployee();
    const stranger = await createEmployee();
    const id = await createTask(owner.id);
    const api = await client(owner.id);
    expect(await api.MyDay.todo()).toEqual([]);

    await api.Observer.add({ taskId: id, employeeId: helper.id });
    await (await client(helper.id)).Comment.create(comment(id, '<p>One</p>'));
    await (await client(helper.id)).Comment.create(comment(id, '<p>Two</p>'));
    await (await client(stranger.id)).Observer.request({ taskId: id });

    expect(await api.MyDay.todo()).toMatchObject([
      { kind: 'request', task: { id }, employeeId: stranger.id },
      { kind: 'review', task: { id }, count: 2, authorIds: [helper.id], pendingRequests: 1 },
    ]);
    await api.Observer.reject({ taskId: id, employeeId: stranger.id });
    await api.Task.markReviewed({ id });
    expect(await api.MyDay.todo()).toEqual([]);
  });
});

describe('current tasks', () => {
  test('mine apart from the others; closed tasks leave; public tasks are everyone\'s', async () => {
    const boss = await createEmployee();
    const report = await createEmployee({ managerId: boss.id });
    const stranger = await createEmployee();
    const own = await createTask(boss.id);
    const theirs = await createTask(report.id);
    const closed = await createTask(boss.id);
    await (await client(boss.id)).Task.setDeadline({ id: closed, deadline: new Date(Date.now() - 1000) });

    const api = await client(boss.id);
    const mine = await api.MyDay.current({ tab: 'mine', page: 1 });
    expect(mine.items.map((t) => t.id)).toContain(own);
    expect(mine.items.map((t) => t.id)).not.toContain(closed);
    expect(mine.items.map((t) => t.id)).not.toContain(theirs);
    expect((await api.MyDay.current({ tab: 'others', page: 1 })).items.map((t) => t.id)).toContain(theirs);

    const strangerApi = await client(stranger.id);
    expect((await strangerApi.MyDay.current({ tab: 'others', page: 1 })).items.map((t) => t.id)).not.toContain(own);
    await api.Task.makePublic({ id: own });
    expect((await strangerApi.MyDay.current({ tab: 'others', page: 1 })).items.map((t) => t.id)).toContain(own);
  });

  test('by deadline, nearest first; the same moment and no deadline — by priority, no deadline last', async () => {
    const me = await createEmployee();
    const api = await client(me.id);
    const at = new Date(Date.now() + 86_400_000);
    const make = (priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL', deadline: Date | null) =>
      api.Task.create({ tags: [`o-${randomUUID().slice(0, 8)}`], priority, deadline });
    const later = await make('CRITICAL', new Date(at.getTime() + 60_000));
    const low = await make('LOW', at);
    const high = await make('HIGH', at);
    const none = await make('NORMAL', null);
    const noneCritical = await make('CRITICAL', null);
    const { items } = await api.MyDay.current({ tab: 'mine', page: 1 });
    expect(items.map((i) => i.id)).toEqual([high, low, later, noneCritical, none]);
  });
});

describe('history', () => {
  test('today is always there, with visits, time logged and the shift', async () => {
    const me = await createEmployee();
    const api = await client(me.id);
    const empty = await api.MyDay.history({ page: 1 });
    expect(empty.days).toMatchObject([{ day: empty.today, shifts: [], entries: [], visits: [], firstActivity: null }]);
    expect(empty.total).toBe(1);

    const id = await createTask(me.id);
    await api.Visit.log({ taskId: null });
    await api.Visit.log({ taskId: id });
    await api.Time.set({ taskId: id, day: empty.today, minutes: 30 });
    // An hour ago, but not before today began in their time zone: the shift must be today's.
    const [midnight] = await sql<{ at: Date }[]>`
      SELECT local_today(id)::timestamp AT TIME ZONE time_zone AS at FROM employee WHERE id = ${me.id}
    `;
    const startedAt = new Date(Math.max(Date.now() - 3_600_000, midnight!.at.getTime()));
    await api.Work.start({ startedAt });
    await expect(api.Work.start({ startedAt: new Date() })).rejects.toMatchObject({ message: 'shift_overlap_open' });

    const [today] = (await api.MyDay.history({ page: 1 })).days;
    expect(today!.visits.map((v) => v.taskId)).toEqual([null, id]);
    expect(today!.entries).toMatchObject([{ taskId: id, minutes: 30 }]);
    expect(today!.shifts).toMatchObject([{ spentMinutes: null }]);
    expect(today!.firstActivity).not.toBeNull();

    await api.Work.close({ startedAt, endedAt: new Date(), about: 'Done' });
    const [closed] = (await api.MyDay.history({ page: 1 })).days;
    expect(closed!.shifts).toMatchObject([{ about: 'Done' }]);
    expect(closed!.shifts[0]!.spentMinutes).toBe(Math.floor(Date.now() / 60_000) - Math.floor(startedAt.getTime() / 60_000));
    await expect(api.Work.remove({ startedAt: new Date(0) })).rejects.toMatchObject({ message: 'not_found' });

    // One entry a day: a new value replaces it, 0 removes it.
    await api.Time.set({ taskId: id, day: empty.today, minutes: 50 });
    expect((await api.MyDay.history({ page: 1 })).days[0]!.entries).toMatchObject([{ taskId: id, minutes: 50 }]);
    await api.Time.set({ taskId: id, day: empty.today, minutes: 0 });
    expect((await api.MyDay.history({ page: 1 })).days[0]!.entries).toEqual([]);
  });

  test('what was done, for the ribbon: comments and time logged, in order; My day asks for two days', async () => {
    const me = await createEmployee();
    const api = await client(me.id);
    const id = await createTask(me.id);
    const { today } = await api.MyDay.history({ page: 1 });
    await api.Comment.create({ taskId: id, html: '<p>Started</p>', replyToId: null, files: [], mentionIds: [], taskIds: [] });
    await api.Time.set({ taskId: id, day: today, minutes: 15 });
    const [day] = (await api.MyDay.history({ page: 1, size: 2 })).days;
    expect(day!.actions.map((a) => [a.kind, a.taskId])).toEqual([['comment', id], ['time', id]]);

    // A day logged earlier: two days fit, the third is on the next page.
    for (const back of [3, 5]) {
      await sql`INSERT INTO spent_minutes (task_id, "by", day, value) VALUES (${id}, ${me.id}, ${today}::date - ${back}::int, 10)`;
    }
    const two = await api.MyDay.history({ page: 1, size: 2 });
    expect(two.days.map((d) => d.day)).toHaveLength(2);
    expect(two.total).toBe(3);
  });

  test('a shift just started closes as one minute: its end may be the end of the current minute', async () => {
    const me = await createEmployee();
    const api = await client(me.id);
    await api.Work.start({ startedAt: new Date() });
    const open = (await api.Work.open())!;
    // What the close dialog offers: now rounded up to the minute.
    const endedAt = new Date(Math.floor(Date.now() / 60_000) * 60_000 + 60_000);
    await api.Work.close({ startedAt: open.startedAt, endedAt, about: null });
    const [today] = (await api.MyDay.history({ page: 1 })).days;
    expect(today!.shifts[0]!.spentMinutes).toBe((endedAt.getTime() - open.startedAt.getTime()) / 60_000);

    // Past the current minute is the future.
    const other = await createEmployee();
    await expect(sql`
      INSERT INTO work (employee_id, started_at, spent_minutes)
      VALUES (${other.id}, date_trunc('minute', NOW()) - INTERVAL '10 minutes', 12)
    `).rejects.toMatchObject({ hint: 'shift_in_future' });
    await sql`
      INSERT INTO work (employee_id, started_at, spent_minutes)
      VALUES (${other.id}, date_trunc('minute', NOW()) - INTERVAL '10 minutes', 11)
    `;
  });

  test('days without activity are skipped; earlier days are on further pages', async () => {
    const me = await createEmployee();
    const api = await client(me.id);
    // Ten past days with a confirmed shift each, every other day.
    for (let i = 1; i <= 10; i++) {
      const startedAt = new Date(Date.now() - i * 2 * 86_400_000);
      await api.Work.add({ startedAt, endedAt: new Date(startedAt.getTime() + 3_600_000), about: null });
    }
    const first = await api.MyDay.history({ page: 1 });
    expect(first.days).toHaveLength(7);
    expect(first.days[0]!.day).toBe(first.today);
    expect(first.total).toBe(11);
    const second = await api.MyDay.history({ page: 2 });
    expect(second.days).toHaveLength(4);
    expect(second.days[0]!.day < first.days[6]!.day).toBe(true);
    expect(second.days.every((d) => d.shifts.length === 1 && d.shifts[0]!.spentMinutes === 60)).toBe(true);
  });

  test('several shifts in one day; an open one after a closed one', async () => {
    const me = await createEmployee();
    const api = await client(me.id);
    const hour = 3_600_000;
    const morning = new Date(Date.now() - 6 * hour);
    await api.Work.add({ startedAt: morning, endedAt: new Date(morning.getTime() + 2 * hour), about: 'Morning' });
    await expect(api.Work.add({ startedAt: new Date(morning.getTime() + hour), endedAt: new Date(morning.getTime() + 3 * hour), about: null }))
      .rejects.toMatchObject({ message: 'shift_overlap_with' });
    expect(await api.Work.open()).toBeNull();
    const evening = new Date(Date.now() - hour);
    await api.Work.start({ startedAt: evening });
    expect((await api.Work.open())?.startedAt.getTime()).toBe(Math.floor(evening.getTime() / 60_000) * 60_000);

    const days = (await api.MyDay.history({ page: 1 })).days;
    // Days come newest first and the morning may fall on yesterday: order by start.
    const shifts = days.flatMap((d) => d.shifts).sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    expect(shifts.map((s) => s.spentMinutes)).toEqual([120, null]);
    await api.Work.close({ startedAt: shifts[1]!.startedAt, endedAt: new Date(), about: 'Evening' });
    expect(await api.Work.open()).toBeNull();
    // Shifts started 6 hours ago may fall on yesterday: take every day shown.
    const range = { employeeId: me.id, from: days[days.length - 1]!.day, to: days[0]!.day };
    expect((await api.Team.stats(range)).stats.workMinutes).toBe(180);
  });

  test('a shift belongs to one day; an overlap names the shift in the way', async () => {
    const me = await createEmployee();
    const api = await client(me.id);
    const hour = 3_600_000;
    // Yesterday in UTC, the employee's time zone.
    const midnight = new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000 - 86_400_000);
    const at = (h: number, m = 0) => new Date(midnight.getTime() + h * hour + m * 60_000);

    await api.Work.add({ startedAt: at(10), endedAt: at(12, 30), about: null });
    // A shift around all of the day's shifts says which one is in the way, with its times.
    await expect(api.Work.add({ startedAt: at(8), endedAt: at(18), about: null }))
      .rejects.toMatchObject({ message: 'shift_overlap_with', cause: { params: { from: '10:00', to: '12:30' } } });
    // Up to midnight is the day's; a minute later is the next day's.
    await api.Work.add({ startedAt: at(20), endedAt: at(24), about: null });
    await expect(api.Work.add({ startedAt: at(0), endedAt: at(24, 1), about: null }))
      .rejects.toMatchObject({ message: 'shift_crosses_day' });
    await expect(api.Work.update({ startedAt: at(20), newStartedAt: at(20), endedAt: at(25), about: null }))
      .rejects.toMatchObject({ message: 'shift_crosses_day' });

    await api.Work.start({ startedAt: new Date(Date.now() - 60_000) });
    await expect(api.Work.start({ startedAt: new Date() })).rejects.toMatchObject({ message: 'shift_overlap_open' });
  });

  test('two shifts started at the same minute at once: a known error, not an internal one', async () => {
    const me = await createEmployee();
    const api = await client(me.id);
    const startedAt = new Date(Date.now() - 3_600_000);
    const results = await Promise.allSettled([api.Work.start({ startedAt }), api.Work.start({ startedAt })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected');
    expect(['shift_overlap', 'shift_overlap_open']).toContain((failed as PromiseRejectedResult).reason.message);
  });

  test('a day has 24 hours: all tasks of the day together, the entry replaced counted once', async () => {
    const me = await createEmployee();
    const api = await client(me.id);
    const first = await createTask(me.id);
    const second = await createTask(me.id);
    await api.Time.set({ taskId: first, day: '2026-01-02', minutes: 20 * 60 });
    // Replacing the same entry is not adding to it.
    await api.Time.set({ taskId: first, day: '2026-01-02', minutes: 22 * 60 });
    await api.Time.set({ taskId: second, day: '2026-01-02', minutes: 2 * 60 });
    await expect(api.Time.set({ taskId: second, day: '2026-01-02', minutes: 2 * 60 + 1 }))
      .rejects.toMatchObject({ message: 'spent_over_day', cause: { params: { logged: '22:00', left: '2:00' } } });
    // Another day is a day of its own.
    await api.Time.set({ taskId: second, day: '2026-01-03', minutes: 24 * 60 });
  });

  test('one entry per task and day: replaced, not added; 0 removes it; the last change is kept', async () => {
    const me = await createEmployee();
    const other = await createEmployee();
    const id = await createTask(me.id);
    const api = await client(me.id);
    await api.Time.set({ taskId: id, day: '2026-01-01', minutes: 10 });
    await sql`UPDATE spent_minutes SET updated_at = NOW() - INTERVAL '1 day' WHERE "by" = ${me.id}`;
    await api.Time.set({ taskId: id, day: '2026-01-01', minutes: 40 });
    const rows = await sql<{ value: number; updatedAt: Date }[]>`SELECT value, updated_at FROM spent_minutes WHERE "by" = ${me.id}`;
    expect(rows.map((r) => r.value)).toEqual([40]);
    expect(rows[0]!.updatedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect((await api.Time.mine({ taskId: id })).days).toMatchObject([{ day: '2026-01-01', minutes: 40 }]);
    // Someone else's entry is never theirs to change: setting 0 touches only their own.
    await (await client(other.id)).Time.set({ taskId: id, day: '2026-01-01', minutes: 0 }).catch(() => {});
    expect(await sql`SELECT 1 FROM spent_minutes WHERE "by" = ${me.id}`).toHaveLength(1);
    await expect(sql`UPDATE spent_minutes SET day = '2026-01-02' WHERE "by" = ${me.id}`).rejects.toMatchObject({ hint: 'spent_immutable' });
    await api.Time.set({ taskId: id, day: '2026-01-01', minutes: 0 });
    expect(await sql`SELECT 1 FROM spent_minutes WHERE "by" = ${me.id}`).toHaveLength(0);
  });
});
