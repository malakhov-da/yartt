import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { sql } from '../server/pg.ts';
import { client, createEmployee } from './helpers.ts';

async function createTask(ownerId: number): Promise<number> {
  return (await client(ownerId)).Task.create({ tags: [`d-${randomUUID().slice(0, 8)}`] });
}

const comment = (taskId: number, html: string, mentionIds: number[] = []) =>
  ({ taskId, html, replyToId: null, files: [], mentionIds, taskIds: [] });

describe('todo', () => {
  test('an open mention stays until "Done"', async () => {
    const owner = await createEmployee();
    const helper = await createEmployee();
    const id = await createTask(owner.id);
    const commentId = await (await client(owner.id)).Comment.create(comment(id, '<p>Please look</p>', [helper.id]));

    const api = await client(helper.id);
    expect(await api.MyDay.todo()).toMatchObject([
      { kind: 'mention', task: { id }, commentId, authorId: owner.id, excerpt: 'Please look' },
    ]);
    await api.Comment.create({ ...comment(id, '<p>On it</p>'), replyToId: commentId });
    expect(await api.MyDay.todo()).toHaveLength(1);
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

  test('by deadline, nearest first, no deadline last', async () => {
    const owner = await createEmployee();
    const api = await client(owner.id);
    const none = await createTask(owner.id);
    const later = await createTask(owner.id);
    const sooner = await createTask(owner.id);
    await api.Task.setDeadline({ id: later, deadline: new Date(Date.now() + 2 * 86_400_000) });
    await api.Task.setDeadline({ id: sooner, deadline: new Date(Date.now() + 86_400_000) });

    const page = await api.MyDay.current({ tab: 'mine', page: 1 });
    expect(page.items.map((t) => t.id)).toEqual([sooner, later, none]);
    expect(page.counts.mine).toBe(3);
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
    await api.Time.log({ taskId: id, day: empty.today, minutes: 30 });
    const startedAt = new Date(Date.now() - 3_600_000);
    await api.Work.start({ startedAt });
    await expect(api.Work.start({ startedAt: new Date() })).rejects.toMatchObject({ message: 'shift_overlap' });

    const [today] = (await api.MyDay.history({ page: 1 })).days;
    expect(today!.visits.map((v) => v.taskId)).toEqual([null, id]);
    expect(today!.entries).toMatchObject([{ taskId: id, minutes: 30 }]);
    expect(today!.shifts).toMatchObject([{ spentMinutes: null }]);
    expect(today!.firstActivity).not.toBeNull();

    await api.Work.close({ startedAt, endedAt: new Date(), about: 'Done' });
    const [closed] = (await api.MyDay.history({ page: 1 })).days;
    expect(closed!.shifts).toMatchObject([{ spentMinutes: 60, about: 'Done' }]);
    await expect(api.Work.remove()).rejects.toMatchObject({ message: 'not_found' });

    await api.Time.remove({ id: today!.entries[0]!.id });
    expect((await api.MyDay.history({ page: 1 })).days[0]!.entries).toEqual([]);
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
      .rejects.toMatchObject({ message: 'shift_overlap' });
    await api.Work.start({ startedAt: new Date(Date.now() - hour) });

    const days = (await api.MyDay.history({ page: 1 })).days;
    // Days come newest first and the morning may fall on yesterday: order by start.
    const shifts = days.flatMap((d) => d.shifts).sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    expect(shifts.map((s) => s.spentMinutes)).toEqual([120, null]);
    await api.Work.close({ startedAt: shifts[1]!.startedAt, endedAt: new Date(), about: 'Evening' });
    // Shifts started 6 hours ago may fall on yesterday: take every day shown.
    const range = { employeeId: me.id, from: days[days.length - 1]!.day, to: days[0]!.day };
    expect((await api.Team.stats(range)).stats.workMinutes).toBe(180);
  });

  test('a time entry of someone else cannot be deleted', async () => {
    const me = await createEmployee();
    const other = await createEmployee();
    const id = await createTask(me.id);
    await (await client(me.id)).Time.log({ taskId: id, day: '2026-01-01', minutes: 10 });
    const [entry] = await sql<{ id: number }[]>`SELECT id FROM spent_minutes WHERE "by" = ${me.id}`;
    await expect((await client(other.id)).Time.remove({ id: entry!.id })).rejects.toMatchObject({ message: 'not_found' });
  });
});
