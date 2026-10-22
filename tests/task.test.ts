import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { sql } from '../server/pg.ts';
import * as Attachments from '../server/services/Attachment.ts';
import { client, createEmployee } from './helpers.ts';

async function createTask(ownerId: number): Promise<number> {
  return (await client(ownerId)).Task.create({ tags: [`t-${randomUUID().slice(0, 8)}`, 'shared'] });
}

async function notifications(employeeId: number) {
  return (await sql<{ payload: { kind: string; by?: number } }[]>`
    SELECT payload FROM notification WHERE employee_id = ${employeeId} ORDER BY id
  `).map((n) => n.payload);
}

const comment = (taskId: number, html: string, mentionIds: number[] = []) =>
  ({ taskId, html, replyToId: null, files: [], mentionIds, taskIds: [] });

describe('access', () => {
  test('a new task is private: the header is for everyone, the rest for observers', async () => {
    const boss = await createEmployee();
    const owner = await createEmployee({ managerId: boss.id });
    const stranger = await createEmployee();
    const id = await createTask(owner.id);

    const mine = await (await client(owner.id)).Task.get({ id });
    expect(mine).toMatchObject({ access: 'owner', isPublic: false, ownerId: owner.id });
    expect(mine.details).not.toBeNull();
    expect(await (await client(boss.id)).Task.get({ id })).toMatchObject({ access: 'observer' });

    const theirs = await (await client(stranger.id)).Task.get({ id });
    expect(theirs).toMatchObject({ access: 'none', details: null, priority: 'NORMAL' });
    expect(theirs.tags.map((t) => t.name)).toContain('shared');
    await expect((await client(stranger.id)).Comment.list({ taskId: id, filter: 'all', page: 1 }))
      .rejects.toMatchObject({ message: 'no_access' });
  });

  test('only the owner adds and hides observers; both are notified', async () => {
    const owner = await createEmployee();
    const helper = await createEmployee();
    const other = await createEmployee();
    const id = await createTask(owner.id);

    await (await client(owner.id)).Observer.add({ taskId: id, employeeId: helper.id });
    await expect((await client(helper.id)).Observer.add({ taskId: id, employeeId: other.id }))
      .rejects.toMatchObject({ message: 'forbidden' });
    await (await client(owner.id)).Observer.remove({ taskId: id, employeeId: helper.id });
    await (await client(owner.id)).Observer.add({ taskId: id, employeeId: helper.id });

    expect((await notifications(helper.id)).map((n) => n.kind)).toEqual(['access_opened', 'access_closed', 'access_opened']);
    await expect((await client(owner.id)).Observer.remove({ taskId: id, employeeId: owner.id }))
      .rejects.toMatchObject({ message: 'owner_cannot_leave' });

    const people = await (await client(helper.id)).Observer.list({ taskId: id, page: 1 });
    const helperRow = people.items.find((p) => p.employeeId === helper.id)!;
    expect(helperRow.periods).toHaveLength(2);
    expect(helperRow.periods[0]).toMatchObject({ addedBy: owner.id, removedBy: owner.id });
    expect(people.items.find((p) => p.employeeId === owner.id)?.lockedBy).toBe('owner');
  });

  test('a manager is locked by the observing report', async () => {
    const boss = await createEmployee();
    const dev = await createEmployee({ managerId: boss.id });
    const owner = await createEmployee();
    const id = await createTask(owner.id);
    await (await client(owner.id)).Observer.add({ taskId: id, employeeId: dev.id });

    const people = await (await client(owner.id)).Observer.list({ taskId: id, page: 1 });
    expect(people.items.find((p) => p.employeeId === boss.id)?.lockedBy).toBe(dev.id);
    await expect((await client(owner.id)).Observer.remove({ taskId: id, employeeId: boss.id }))
      .rejects.toMatchObject({ message: 'manager_cannot_leave' });
  });

  test('requests: withdraw, approve and reject; "no intervention needed" waits for them', async () => {
    const owner = await createEmployee();
    const asker = await createEmployee();
    const id = await createTask(owner.id);
    const askerApi = await client(asker.id);
    const ownerApi = await client(owner.id);

    await askerApi.Observer.request({ taskId: id });
    expect(await askerApi.Task.get({ id })).toMatchObject({ access: 'requested' });
    await askerApi.Observer.withdraw({ taskId: id });
    await askerApi.Observer.request({ taskId: id });
    await expect(ownerApi.Task.markReviewed({ id })).rejects.toMatchObject({ message: 'pending_requests' });
    expect((await ownerApi.Observer.list({ taskId: id, page: 1 })).requests).toEqual([{ employeeId: asker.id }]);

    await ownerApi.Observer.reject({ taskId: id, employeeId: asker.id });
    await askerApi.Observer.request({ taskId: id });
    await ownerApi.Observer.approve({ taskId: id, employeeId: asker.id });
    await ownerApi.Task.markReviewed({ id });

    expect((await notifications(asker.id)).map((n) => n.kind)).toEqual(['access_closed', 'access_opened']);
    expect(await askerApi.Task.get({ id })).toMatchObject({ access: 'observer' });
  });
});

describe('mentions', () => {
  test('a private task mentions only its participants; a public one anyone, adding nobody', async () => {
    const owner = await createEmployee();
    const colleague = await createEmployee();
    const id = await createTask(owner.id);
    const api = await client(owner.id);

    // Who takes part is the owner's decision: a mention does not bring anyone in.
    await expect(api.Comment.create(comment(id, '<p>Help?</p>', [colleague.id])))
      .rejects.toMatchObject({ message: 'mention_not_participant' });
    expect(await (await client(colleague.id)).Task.get({ id })).toMatchObject({ access: 'none' });
    expect(await api.Observer.mentionable({ taskId: id })).toEqual({ everyone: false, ids: [owner.id] });
    await api.Observer.add({ taskId: id, employeeId: colleague.id });
    await api.Comment.create(comment(id, '<p>Help?</p>', [colleague.id]));
    expect((await api.Observer.mentionable({ taskId: id })).ids.sort()).toEqual([owner.id, colleague.id].sort());

    await api.Task.makePublic({ id });
    expect(await api.Observer.mentionable({ taskId: id })).toEqual({ everyone: true, ids: [] });
    const outsider = await createEmployee();
    await api.Comment.create(comment(id, '<p>You too</p>', [outsider.id]));
    expect(await (await client(outsider.id)).Task.get({ id })).toMatchObject({ access: 'public', isPublic: true });
    await expect(api.Comment.create(comment(id, '<p>me</p>', [owner.id]))).rejects.toMatchObject({ message: 'self_mention' });
  });

  test('replies live in the thread of the first comment; the feed marks each with a line in time', async () => {
    const owner = await createEmployee();
    const dev = await createEmployee();
    const other = await createEmployee();
    const id = await createTask(owner.id);
    const api = await client(owner.id);
    await api.Task.makePublic({ id });
    const root = await api.Comment.create(comment(id, '<p>Who takes it?</p>', [dev.id]));
    // Someone else answers first: the mention stays open, it is not theirs.
    const byOther = await (await client(other.id)).Comment.create({ ...comment(id, '<p>Not me</p>'), replyToId: root });
    const byDev = await (await client(dev.id)).Comment.create({ ...comment(id, '<p>I do</p>'), replyToId: byOther });

    const all = await api.Comment.list({ taskId: id, filter: 'all', page: 1 });
    expect(all.items.map((i) => i.kind)).toEqual(['reply', 'reply', 'comment']);
    const thread = all.items[2]!;
    expect(thread.kind === 'comment' && thread.replies.map((r) => r.id)).toEqual([byOther, byDev]);
    expect(all.items[0]).toMatchObject({ kind: 'reply', commentId: byDev, authorId: dev.id, toAuthorId: other.id, excerpt: 'I do' });
    // A reply to a reply is not a reply to the mention.
    expect(thread.kind === 'comment' && thread.mentions[0]).toMatchObject({ employeeId: dev.id, replies: [] });

    // An open mention in a reply brings its whole thread under "open mentions".
    await (await client(dev.id)).Comment.create({ ...comment(id, '<p>Owner, ok?</p>', [owner.id]), replyToId: root });
    const open = await api.Comment.list({ taskId: id, filter: 'mentions', page: 1 });
    expect(open.items.map((i) => (i.kind === 'comment' ? i.id : i.kind))).toEqual([root]);
  });

  test('the mentioned employee closes the mention; the feed filters by open mentions', async () => {
    const owner = await createEmployee();
    const dev = await createEmployee();
    const id = await createTask(owner.id);
    const api = await client(owner.id);
    await api.Comment.create(comment(id, '<p>Plain</p>'));
    await api.Observer.add({ taskId: id, employeeId: dev.id });
    const asked = await api.Comment.create(comment(id, '<p>Check this</p>', [dev.id]));
    await api.Task.setDeadline({ id, deadline: new Date(Date.now() + 86_400_000) });

    const open = await api.Comment.list({ taskId: id, filter: 'mentions', page: 1 });
    expect(open.items.map((i) => (i.kind === 'comment' ? i.id : 'event'))).toEqual([asked]);
    expect(open).toMatchObject({ openMentions: 1, all: 3 });
    expect((await api.Comment.list({ taskId: id, filter: 'all', page: 1 })).items.map((i) => i.kind))
      .toEqual(['deadline', 'comment', 'comment']);

    await expect(api.Comment.closeMention({ taskId: id, commentId: asked })).rejects.toMatchObject({ message: 'not_found' });
    // No "Done" without a word: the mentioned one replies first.
    const devApi = await client(dev.id);
    await expect(devApi.Comment.closeMention({ taskId: id, commentId: asked })).rejects.toMatchObject({ message: 'mention_needs_reply' });
    await devApi.Comment.create({ ...comment(id, '<p>Checked</p>'), replyToId: asked });
    const mention = (await devApi.Comment.list({ taskId: id, filter: 'mentions', page: 1 })).items[0];
    expect(mention?.kind === 'comment' && mention.mentions[0]).toMatchObject({ employeeId: dev.id, replies: [{ excerpt: expect.any(String) }] });
    await devApi.Comment.closeMention({ taskId: id, commentId: asked });
    expect((await api.Comment.list({ taskId: id, filter: 'mentions', page: 1 })).items).toEqual([]);
  });
});

describe('public tasks', () => {
  test('public: everyone comments and logs time; private again keeps owner and open mentions', async () => {
    const owner = await createEmployee();
    const mentioned = await createEmployee();
    const commenter = await createEmployee();
    const id = await createTask(owner.id);
    const api = await client(owner.id);
    await api.Time.setLeft({ taskId: id, minutes: 60 });

    await api.Task.makePublic({ id });
    expect(await api.Time.mine({ taskId: id })).toMatchObject({ leftMinutes: 60 });
    await (await client(commenter.id)).Comment.create(comment(id, '<p>Count me in</p>'));
    await (await client(commenter.id)).Time.set({ taskId: id, day: '2026-01-05', minutes: 30 });
    await api.Comment.create(comment(id, '<p>Bring the keys</p>', [mentioned.id]));
    await expect(api.Observer.add({ taskId: id, employeeId: commenter.id })).rejects.toMatchObject({ message: 'task_public' });

    const people = await api.Observer.list({ taskId: id, page: 1 });
    expect(people.items.find((p) => p.employeeId === commenter.id)).toMatchObject({ spentMinutes: 30, periods: [] });

    expect(await api.Task.makePrivate({ id })).toEqual([commenter.id]);
    expect(await (await client(mentioned.id)).Task.get({ id })).toMatchObject({ access: 'observer' });
    expect(await (await client(commenter.id)).Task.get({ id })).toMatchObject({ access: 'none' });
    expect((await notifications(commenter.id)).at(-1)).toEqual({ kind: 'access_closed', by: owner.id });
    await expect((await client(commenter.id)).Time.set({ taskId: id, day: '2026-01-05', minutes: 30 }))
      .rejects.toMatchObject({ message: 'no_access' });
  });
});

describe('rich text and attachments', () => {
  test('comments are sanitized; images must be our own readable attachments', async () => {
    const owner = await createEmployee();
    const other = await createEmployee();
    const id = await createTask(owner.id);
    const api = await client(owner.id);

    const imageId = await Attachments.upload(owner.id, Buffer.from(`png-${randomUUID()}`), 'image/png');
    await api.Comment.create(comment(id,
      `<p onclick="x()">Hi <script>alert(1)</script><img src="/api/attachments/${imageId}"><img src="https://evil.test/p.png"></p>`));
    const [first] = (await api.Comment.list({ taskId: id, filter: 'all', page: 1 })).items;
    expect(first).toMatchObject({ kind: 'comment', html: `<p>Hi <img src="/api/attachments/${imageId}" /></p>` });

    // Someone who never uploaded these bytes and does not see the task cannot reuse the id.
    const otherTask = await createTask(other.id);
    await expect((await client(other.id)).Comment.create(comment(otherTask, `<p><img src="/api/attachments/${imageId}"></p>`)))
      .rejects.toMatchObject({ message: 'unknown_attachment' });
    await expect(Attachments.read(other.id, imageId)).rejects.toMatchObject({ code: 'unknown_attachment' });

    // The same bytes uploaded by them: the same row, now readable for them too.
    const [bytes] = await sql<{ value: Buffer }[]>`SELECT value FROM attachment WHERE id = ${imageId}`;
    expect(await Attachments.upload(other.id, bytes!.value, 'image/png')).toBe(imageId);
    expect((await Attachments.read(other.id, imageId)).mime).toBe('image/png');

    await expect(api.Comment.create(comment(id, '<p>  </p>'))).rejects.toMatchObject({ message: 'invalid_data' });
  });

  test('the context keeps its images out of the cleanup', async () => {
    const owner = await createEmployee();
    const id = await createTask(owner.id);
    const imageId = await Attachments.upload(owner.id, Buffer.from(`ctx-${randomUUID()}`), 'image/png');
    await (await client(owner.id)).Task.update({ id, context: `<p>Plan</p><img src="/api/attachments/${imageId}">` });
    const [row] = await sql<{ inUse: boolean }[]>`SELECT attachment_in_use(${imageId}) AS in_use`;
    expect(row!.inUse).toBe(true);
    await expect((await client(owner.id)).Task.update({ id, context: '<p>x</p>', priority: 'HIGH' })).resolves.toBeUndefined();
    expect(await (await client(owner.id)).Task.get({ id })).toMatchObject({ priority: 'HIGH', details: { context: '<p>x</p>' } });
  });
});

describe('search', () => {
  test('tags find any task, mine apart from the others', async () => {
    const owner = await createEmployee();
    const stranger = await createEmployee();
    const tag = `s-${randomUUID().slice(0, 8)}`;
    const id = await (await client(owner.id)).Task.create({ tags: [tag] });
    const tagId = (await (await client(stranger.id)).Tags.suggest({ text: tag })).tags[0]!.id;

    const byTag = await (await client(stranger.id)).Task.search({ tagIds: [tagId], tab: 'others', page: 1 });
    expect(byTag).toMatchObject({ items: [{ id, canSee: false }], counts: { mine: 0, others: 1 } });
    expect((await (await client(owner.id)).Task.search({ tagIds: [tagId], tab: 'mine', page: 1 })).items)
      .toMatchObject([{ id, canSee: true }]);
    await expect((await client(stranger.id)).Task.create({ tags: [tag] })).rejects.toMatchObject({ message: 'tag_set_taken' });
  });

});

describe('observer list', () => {
  test('one line per person after public and private again; periods and the reason are kept', async () => {
    const boss = await createEmployee();
    const owner = await createEmployee({ managerId: boss.id });
    const helper = await createEmployee();
    const id = await createTask(owner.id);
    const api = await client(owner.id);
    await api.Observer.add({ taskId: id, employeeId: helper.id });
    await (await client(owner.id)).Comment.create(comment(id, '<p>Look</p>', [helper.id]));

    await api.Task.makePublic({ id });
    await api.Task.makePrivate({ id });

    const people = await api.Observer.list({ taskId: id, page: 1 });
    const ids = people.items.map((p) => p.employeeId);
    expect(ids).toHaveLength(new Set(ids).size);
    expect(people.total).toBe(3);
    const helperRow = people.items.find((p) => p.employeeId === helper.id)!;
    expect(helperRow).toMatchObject({ active: true, openMention: true, lockedBy: null });
    expect(helperRow.periods).toHaveLength(2);
    expect(people.items.find((p) => p.employeeId === boss.id)).toMatchObject({ lockedBy: owner.id, openMention: false });
  });
});

describe('feed events', () => {
  test('mentions in other tasks, time logged and planned are events of "all"', async () => {
    const owner = await createEmployee();
    const id = await createTask(owner.id);
    const other = await createTask(owner.id);
    const api = await client(owner.id);

    await api.Comment.create({ ...comment(other, '<p>See this</p>'), taskIds: [id] });
    await api.Time.set({ taskId: id, day: '2026-01-02', minutes: 30 });
    await api.Time.setLeft({ taskId: id, minutes: 120 });
    await api.Time.setLeft({ taskId: id, minutes: 60 });
    await api.Time.setLeft({ taskId: id, minutes: null });

    const feed = await api.Comment.list({ taskId: id, filter: 'all', page: 1 });
    expect(feed.all).toBe(5);
    expect(feed.items.map((i) => i.kind).sort()).toEqual(['mentioned_in', 'plan', 'plan', 'plan', 'spent']);
    expect(feed.items.find((i) => i.kind === 'mentioned_in')).toMatchObject({ task: { id: other } });
    expect(feed.items.filter((i) => i.kind === 'plan').map((i) => i.kind === 'plan' && i.minutes).sort()).toEqual([120, 60, null].sort());
    expect(feed.items.find((i) => i.kind === 'spent')).toMatchObject({ employeeId: owner.id, minutes: 30, entries: [{ day: '2026-01-02', minutes: 30 }] });
    expect((await api.Comment.list({ taskId: id, filter: 'mentions', page: 1 })).total).toBe(0);
  });
});

describe('dependencies', () => {
  test('the owner sets them, with or without a latest deadline; cycles are refused; a broken latest deadline is a risk, not an error', async () => {
    const owner = await createEmployee();
    const other = await createEmployee();
    const stranger = await createEmployee();
    const id = await createTask(owner.id);
    const base = await createTask(other.id);
    const api = await client(owner.id);
    const otherApi = await client(other.id);
    const day = (n: number) => new Date(Date.now() + n * 86_400_000);

    await expect((await client(stranger.id)).Dependency.set({ taskId: id, value: base, latestAt: null }))
      .rejects.toMatchObject({ message: 'forbidden' });
    await api.Dependency.set({ taskId: id, value: base, latestAt: null });
    expect((await api.Task.get({ id })).details?.waitsFor).toMatchObject([{ id: base, latestAt: null, late: [], delays: [] }]);
    expect(await notifications(other.id)).toContainEqual(expect.objectContaining({ kind: 'dependency_added', by: owner.id, hard: false }));

    await expect(otherApi.Dependency.set({ taskId: base, value: id, latestAt: null }))
      .rejects.toMatchObject({ message: 'dependency_cycle' });
    await expect(api.Dependency.set({ taskId: id, value: id, latestAt: null })).rejects.toMatchObject({ message: 'dependency_cycle' });

    // I need theirs by tomorrow; they have no deadline: both at risk, nothing refused.
    await api.Dependency.set({ taskId: id, value: base, latestAt: day(1) });
    expect(await api.Task.get({ id })).toMatchObject({ late: [base], delays: [] });
    expect(await api.Task.get({ id: base })).toMatchObject({ late: [], delays: [id] });
    expect((await api.Task.get({ id: base })).details).toBeNull(); // header only for me — I do not observe it

    // In time: no risk. Moved past it: allowed, both at risk again, and I am told it is late.
    await otherApi.Task.setDeadline({ id: base, deadline: new Date(Date.now() + 86_400_000 / 2) });
    expect(await api.Task.get({ id })).toMatchObject({ late: [], delays: [] });
    await otherApi.Task.setDeadline({ id: base, deadline: day(3) });
    expect(await api.Task.get({ id })).toMatchObject({ late: [base] });
    expect((await notifications(owner.id)).at(-1)).toEqual({ kind: 'finished_at_change', dependencyId: base, late: true });
    const [risk] = await sql<{ value: boolean }[]>`SELECT at_risk(${base}) AS value`;
    expect(risk!.value).toBe(true);

    await api.Dependency.remove({ taskId: id, value: base });
    expect((await api.Task.get({ id })).details?.waitsFor).toEqual([]);
    await expect(api.Dependency.remove({ taskId: id, value: base })).rejects.toMatchObject({ message: 'not_found' });
  });
});

describe('creating with details', () => {
  test('priority, deadline, context and a dependency either way come with the task', async () => {
    const me = await createEmployee();
    const other = await createEmployee();
    const api = await client(me.id);
    const theirs = await createTask(other.id);
    const mine = await createTask(me.id);
    const deadline = new Date(Date.now() + 86_400_000);

    const id = await api.Task.create({
      tags: [`n-${randomUUID().slice(0, 8)}`], priority: 'HIGH', deadline, context: '<p>why</p>', waitsFor: theirs,
    });
    const task = await api.Task.get({ id });
    expect(task).toMatchObject({ priority: 'HIGH', deadline });
    expect(task.details?.context).toBe('<p>why</p>');
    expect(task.details?.waitsFor.map((d) => d.id)).toEqual([theirs]);
    expect((await notifications(other.id)).map((n) => n.kind)).toContain('dependency_added');

    const blocker = await api.Task.create({ tags: [`n-${randomUUID().slice(0, 8)}`], waitedOnBy: mine });
    expect((await api.Task.get({ id: mine })).details?.waitsFor.map((d) => d.id)).toEqual([blocker]);
  });

  test("another's task cannot be made to wait; nothing is created then", async () => {
    const me = await createEmployee();
    const theirs = await createTask((await createEmployee()).id);
    const tag = `n-${randomUUID().slice(0, 8)}`;
    await expect((await client(me.id)).Task.create({ tags: [tag], waitedOnBy: theirs })).rejects.toMatchObject({ message: 'forbidden' });
    expect(await sql`SELECT 1 FROM tag WHERE name = ${tag}`).toHaveLength(0);
  });
});

describe('deadline at risk', () => {
  test("a plan that does not fit the person's working time before the deadline marks the task", async () => {
    const owner = await createEmployee();
    const dev = await createEmployee();
    const api = await client(owner.id);
    const id = await createTask(owner.id);
    await api.Observer.add({ taskId: id, employeeId: dev.id });
    await api.Task.setDeadline({ id, deadline: new Date(Date.now() + 2 * 86_400_000) });
    expect((await api.Task.get({ id })).risk).toBeNull(); // nobody planned it

    // No timesheet: a 40-hour week, so two days give about 11.4 hours.
    await (await client(dev.id)).Time.setLeft({ taskId: id, minutes: 5 * 60 });
    expect((await api.Task.get({ id })).risk).toBeNull();
    await (await client(dev.id)).Time.setLeft({ taskId: id, minutes: 20 * 60 });
    const { risk } = await api.Task.get({ id });
    expect(risk).toMatchObject({ employeeId: dev.id, plannedMinutes: 20 * 60 });
    expect(risk!.capacityMinutes).toBeGreaterThan(11 * 60);
    expect(risk!.capacityMinutes).toBeLessThan(12 * 60);

    const { from, to } = { from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) };
    await sql`UPDATE employee SET manager_id = ${owner.id} WHERE id = ${dev.id}`;
    const me = (await api.Team.summary({ from, to })).find((m) => m.self)!;
    expect(me.atRisk).toBe(1);
  });
});

describe('reminders', () => {
  test('for oneself, in the future; delivered once due, then gone; leaving the task drops them', async () => {
    const owner = await createEmployee();
    const helper = await createEmployee();
    const stranger = await createEmployee();
    const id = await createTask(owner.id);
    await (await client(owner.id)).Observer.add({ taskId: id, employeeId: helper.id });
    const api = await client(helper.id);
    const later = new Date(Date.now() + 3_600_000);

    await expect(api.Remind.add({ taskId: id, at: new Date(Date.now() - 1000), text: null })).rejects.toMatchObject({ message: 'remind_in_past' });
    await expect((await client(stranger.id)).Remind.add({ taskId: id, at: later, text: null })).rejects.toMatchObject({ message: 'no_access' });
    await api.Remind.add({ taskId: id, at: later, text: 'Check the build' });
    await api.Remind.add({ taskId: id, at: new Date(Date.now() + 7_200_000), text: null });
    expect(await api.Remind.list({ taskId: id })).toMatchObject([{ at: later, text: 'Check the build' }, { text: null }]);
    expect(await (await client(owner.id)).Remind.list({ taskId: id })).toEqual([]);

    // Due: the worker's job sends it and deletes it.
    await sql`UPDATE remind SET at = NOW() - INTERVAL '1 second' WHERE employee_id = ${helper.id} AND value = 'Check the build'`;
    await sql`SELECT send_due_reminds()`;
    expect(await notifications(helper.id)).toContainEqual(expect.objectContaining({ kind: 'remind', text: 'Check the build' }));
    expect(await api.Remind.list({ taskId: id })).toHaveLength(1);

    await api.Observer.leave({ taskId: id });
    expect((await sql`SELECT 1 FROM remind WHERE employee_id = ${helper.id}`).length).toBe(0);
  });
});

describe('time in the feed', () => {
  test("one person's entries in a row are one event; anything between them splits it", async () => {
    const owner = await createEmployee();
    const helper = await createEmployee();
    const id = await createTask(owner.id);
    await (await client(owner.id)).Observer.add({ taskId: id, employeeId: helper.id });
    const mine = await client(owner.id);
    const theirs = await client(helper.id);

    // Oldest first: mine ×3, a comment, mine ×1, theirs ×2, mine ×1.
    for (const day of ['2026-01-01', '2026-01-02', '2026-01-03']) await mine.Time.set({ taskId: id, day, minutes: 60 });
    await mine.Comment.create(comment(id, '<p>Between</p>'));
    await mine.Time.set({ taskId: id, day: '2026-01-04', minutes: 30 });
    await theirs.Time.set({ taskId: id, day: '2026-01-04', minutes: 20 });
    await theirs.Time.set({ taskId: id, day: '2026-01-05', minutes: 25 });
    await mine.Time.set({ taskId: id, day: '2026-01-05', minutes: 15 });

    const feed = await mine.Comment.list({ taskId: id, filter: 'all', page: 1 });
    const shape = feed.items.map((i) => (i.kind === 'spent' ? [i.employeeId, i.minutes, i.entries.length] : i.kind));
    expect(shape).toEqual([
      [owner.id, 15, 1],
      [helper.id, 45, 2],
      [owner.id, 30, 1],
      'comment',
      [owner.id, 180, 3],
    ]);
    expect(feed.all).toBe(5);
    const run = feed.items[4]!;
    expect(run.kind === 'spent' && run.entries.map((e) => e.day)).toEqual(['2026-01-03', '2026-01-02', '2026-01-01']);
  });
});

describe('titles', () => {
  test('a taken title is told by its tags before saving; a name no tag has means free', async () => {
    const me = await createEmployee();
    const api = await client(me.id);
    const a = `t-${randomUUID().slice(0, 8)}`;
    const b = `t-${randomUUID().slice(0, 8)}`;
    const id = await api.Task.create({ tags: [a, b] });
    expect(await api.Task.byTags({ tags: [b, a] })).toEqual({ id });
    expect(await api.Task.byTags({ tags: [a] })).toBeNull();
    expect(await api.Task.byTags({ tags: [a, b, `${b} новое`] })).toBeNull();
    await expect(api.Task.create({ tags: [b, a] })).rejects.toMatchObject({ message: 'tag_set_taken' });
  });

  test('current tasks: the nearest deadline first; the same moment and no deadline — by priority', async () => {
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

  test('closed tasks have a tab of their own, the most recently closed first — in the search too', async () => {
    const me = await createEmployee();
    const api = await client(me.id);
    const tag = `c-${randomUUID().slice(0, 8)}`;
    const first = await api.Task.create({ tags: [tag, 'a'] });
    const second = await api.Task.create({ tags: [tag, 'b'] });
    const open = await api.Task.create({ tags: [tag, 'c'] });
    await sql`SELECT set_finished_at(${first}, NOW() - INTERVAL '2 hours')`;
    await sql`SELECT set_finished_at(${second}, NOW() - INTERVAL '1 hour')`;

    // Other tests leave public tasks behind: only mine are looked at.
    const ours = (items: { id: number }[]) => items.map((i) => i.id).filter((id) => [first, second, open].includes(id));
    expect(ours((await api.MyDay.current({ tab: 'closed', page: 1 })).items)).toEqual([second, first]);
    expect((await api.MyDay.current({ tab: 'mine', page: 1 })).items.map((i) => i.id)).toEqual([open]);

    const [tagId] = (await sql<{ id: number }[]>`SELECT id FROM tag WHERE name = ${tag}`).map((r) => r.id);
    const found = await api.Task.search({ tagIds: [tagId!], tab: 'closed', page: 1 });
    expect(found.items.map((i) => i.id)).toEqual([second, first]);
    expect(found.counts).toEqual({ mine: 1, others: 0, closed: 2 });
  });
});

describe('preview', () => {
  test('the hint over a task: its context and each one\'s time, only for someone who sees it', async () => {
    const me = await createEmployee();
    const dev = await createEmployee({ managerId: me.id });
    const stranger = await createEmployee();
    const devApi = await client(dev.id);
    const id = await devApi.Task.create({ tags: [`p-${randomUUID().slice(0, 8)}`], context: '<p>Сверить акт</p>' });
    const today = (await devApi.MyDay.history({ page: 1 })).today;
    await devApi.Time.set({ taskId: id, day: today, minutes: 45 });
    await devApi.Time.setLeft({ taskId: id, minutes: 60 });

    expect(await (await client(me.id)).Task.preview({ id })).toEqual({
      visible: true, context: '<p>Сверить акт</p>', people: [{ employeeId: dev.id, spentMinutes: 45, leftMinutes: 60 }],
    });
    expect(await (await client(stranger.id)).Task.preview({ id })).toEqual({ visible: false, context: null, people: [] });
  });
});
