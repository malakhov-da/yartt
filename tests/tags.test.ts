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
  test('logged at most once per 5 minutes per task or "My day"', async () => {
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

    await sql`UPDATE visit SET at = at - INTERVAL '6 minutes' WHERE employee_id = ${me.id}`;
    await api.Visit.log({ taskId: null });
    expect(await count()).toBe(3);

    await expect(api.Visit.log({ taskId: 999_999 })).rejects.toMatchObject({ message: 'not_found' });
  });
});
