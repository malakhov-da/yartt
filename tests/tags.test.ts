import { describe, expect, test } from 'vitest';
import { sql } from '../server/pg.ts';
import { client, createEmployee } from './helpers.ts';

async function tag(name: string): Promise<number> {
  const [row] = await sql<{ id: number }[]>`INSERT INTO tag (name) VALUES (${name}) RETURNING id`;
  return row!.id;
}

async function ordered(employeeId: number, tagIds: number[]): Promise<number[]> {
  const [row] = await sql<{ ids: number[] }[]>`SELECT ordered_tags(${employeeId}, ${tagIds}) AS ids`;
  return row!.ids;
}

describe('task title order', () => {
  test('by weight, then by how many of my tasks carry the tag, then by id', async () => {
    const me = await createEmployee();
    const suffix = `-${me.id}`;
    const [a, b, c] = [await tag('a' + suffix), await tag('b' + suffix), await tag('c' + suffix)];
    // My tasks: a in 1, b in 3, c in 2.
    for (const tags of [[a, b, c], [b], [b, c]]) {
      await sql`INSERT INTO task (owner_id, tag_ids) VALUES (${me.id}, ${tags})`;
    }

    expect(await ordered(me.id, [a!, b!, c!])).toEqual([b, c, a]);

    await sql`INSERT INTO user_tag (employee_id, tag_id, weight) VALUES (${me.id}, ${a!}, 5)`;
    expect(await ordered(me.id, [a!, b!, c!])).toEqual([a, b, c]);

    await sql`INSERT INTO user_tag (employee_id, tag_id, weight) VALUES (${me.id}, ${c!}, 5)`;
    expect(await ordered(me.id, [a!, b!, c!])).toEqual([c, a, b]);

    // Another employee sees the same tags in their own order.
    const other = await createEmployee();
    expect(await ordered(other.id, [c!, b!, a!])).toEqual([a, b, c]);
  });
});

describe('visits', () => {
  test('logged at most once per 10 minutes per task or "My day"', async () => {
    const me = await createEmployee();
    const [t] = await sql<{ id: number }[]>`INSERT INTO tag (name) VALUES (${'visit-' + me.id}) RETURNING id`;
    const [task] = await sql<{ id: number }[]>`INSERT INTO task (owner_id, tag_ids) VALUES (${me.id}, ${[t!.id]}) RETURNING id`;
    const api = await client(me.id);

    await api.Visit.log({ taskId: null });
    await api.Visit.log({ taskId: null });
    await api.Visit.log({ taskId: task!.id });
    const count = async () =>
      (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM visit WHERE employee_id = ${me.id}`)[0]!.n;
    expect(await count()).toBe(2);

    await sql`UPDATE visit SET at = at - INTERVAL '11 minutes' WHERE employee_id = ${me.id}`;
    await api.Visit.log({ taskId: null });
    expect(await count()).toBe(3);

    await expect(api.Visit.log({ taskId: 999_999 })).rejects.toMatchObject({ message: 'not_found' });
  });
});

describe('my tags', () => {
  test('the tags of tasks I see, with counts; my color and weight change only my view', async () => {
    const me = await createEmployee();
    const other = await createEmployee();
    const unique = `mt-${me.id}`;
    const api = await client(me.id);
    const a = await api.Task.create({ tags: [unique, `${unique}-x`] });
    await api.Task.create({ tags: [unique, `${unique}-y`] });
    await (await client(other.id)).Task.create({ tags: [unique, `${unique}-hidden`] });

    const list = await api.Tags.mine({ query: unique, page: 1 });
    expect(list.items.map((t) => t.name)).not.toContain(`${unique}-hidden`);
    const tag = list.items.find((t) => t.name === unique)!;
    expect(tag).toMatchObject({ tasks: 2, open: 2, color: null, weight: 0 });

    const x = list.items.find((t) => t.name === `${unique}-x`)!;
    await api.Tags.set({ tagId: x.id, color: '#ff8800', weight: 5 });
    const task = await api.Task.get({ id: a });
    expect(task.tags[0]).toEqual({ id: x.id, name: `${unique}-x`, color: '#ff8800' });
    expect((await api.Tags.mine({ query: unique, page: 1 })).items[0]).toMatchObject({ id: x.id, weight: 5 });
    expect((await (await client(other.id)).Task.get({ id: a })).tags.find((t) => t.id === x.id)?.color).toBeNull();

    await api.Tags.set({ tagId: x.id, color: null, weight: 0 });
    expect((await sql`SELECT 1 FROM user_tag WHERE employee_id = ${me.id}`).length).toBe(0);
  });
});
