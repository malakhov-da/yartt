import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { sql } from '../server/pg.ts';
import { client, createEmployee } from './helpers.ts';

// Limits of hours on tag combinations (decision 69).
describe('tag limits', () => {
  test('count the hours of who set it and everyone under them, with plans; seen up and down the chain; a change is a new version', async () => {
    const lead = await createEmployee();
    const dev = await createEmployee({ managerId: lead.id });
    const stranger = await createEmployee();
    const leadApi = await client(lead.id);
    const devApi = await client(dev.id);
    const strangerApi = await client(stranger.id);
    const rubric = `lim-${randomUUID().slice(0, 8)}`;
    const both = await devApi.Task.create({ tags: [rubric, `a ${randomUUID().slice(0, 6)}`] });
    const other = await strangerApi.Task.create({ tags: [rubric, `b ${randomUUID().slice(0, 6)}`] });
    const today = (await devApi.MyDay.history({ page: 1 })).today;
    await devApi.Time.set({ taskId: both, day: today, minutes: 120 });
    await devApi.Time.setLeft({ taskId: both, minutes: 60 });
    await strangerApi.Time.set({ taskId: other, day: today, minutes: 500 }); // not one of the lead's people
    const [tag] = await sql<{ id: number }[]>`SELECT id FROM tag WHERE name = ${rubric}`;

    const id = await leadApi.TagLimit.set({ replaces: null, tagIds: [tag!.id], startsOn: today, endsOn: today, minutes: 150 });
    const [mine] = (await leadApi.TagLimit.list()).current;
    expect(mine).toMatchObject({
      id, employeeId: lead.id, minutes: 150, spentMinutes: 120, leftMinutes: 60, forecastMinutes: 180,
      days: [today], cumulative: [120], changed: false,
    });
    // The dev sees the lead's limit — it counts their hours; a stranger does not.
    expect((await devApi.TagLimit.list()).current.map((l) => l.id)).toEqual([id]);
    expect((await strangerApi.TagLimit.list()).current).toEqual([]);
    expect((await devApi.TagLimit.forTask({ taskId: both })).map((l) => l.id)).toEqual([id]);
    await expect(devApi.TagLimit.remove({ id })).rejects.toMatchObject({ message: 'forbidden' });

    // A change is a new version, the old one closed and kept; never edited in place.
    const next = await leadApi.TagLimit.set({ replaces: id, tagIds: [tag!.id], startsOn: today, endsOn: today, minutes: 300 });
    expect((await leadApi.TagLimit.list()).current).toMatchObject([{ id: next, minutes: 300, changed: true }]);
    expect((await leadApi.TagLimit.history({ id: next })).map((v) => [v.id, v.minutes, v.expiredAt === null]))
      .toEqual([[next, 300, true], [id, 150, false]]);
    await expect(leadApi.TagLimit.set({ replaces: id, tagIds: [tag!.id], startsOn: today, endsOn: today, minutes: 1 }))
      .rejects.toMatchObject({ message: 'not_found' });
    await expect(sql`UPDATE tag_limit SET minutes = 1 WHERE id = ${next}`).rejects.toMatchObject({ hint: 'forbidden' });
    await expect(sql`DELETE FROM tag_limit WHERE id = ${id}`).rejects.toMatchObject({ hint: 'forbidden' });

    await leadApi.TagLimit.remove({ id: next });
    expect(await leadApi.TagLimit.list()).toMatchObject({ current: [], removed: [{ id: next, minutes: 300 }] });
  });
});
