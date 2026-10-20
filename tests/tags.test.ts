import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { sql } from '../server/pg.ts';
import { KEYBOARD_KEYS, KEYBOARDS, retype } from '../shared/keyboards.ts';
import { client, createEmployee } from './helpers.ts';

async function tag(name: string): Promise<number> {
  const [row] = await sql<{ id: number }[]>`INSERT INTO tag (name) VALUES (${name}) RETURNING id`;
  return row!.id;
}

/** A tag as the API returns it to someone without a color for it. */
async function newTag(name: string): Promise<{ id: number; name: string; color: null }> {
  return { id: await tag(name), name, color: null };
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
    expect(task.tags[0]).toMatchObject({ id: x.id, name: `${unique}-x`, color: '#ff8800' });
    expect((await api.Tags.mine({ query: unique, page: 1 })).items[0]).toMatchObject({ id: x.id, weight: 5 });
    expect((await (await client(other.id)).Task.get({ id: a })).tags.find((t) => t.id === x.id)?.color).toBeNull();

    await api.Tags.set({ tagId: x.id, color: null, weight: 0 });
    expect((await sql`SELECT 1 FROM user_tag WHERE employee_id = ${me.id}`).length).toBe(0);
  });
});

describe('suggestions', () => {
  test('tags are lower case: the API lowers them, the database refuses capitals', async () => {
    const me = await createEmployee();
    const api = await client(me.id);
    const id = await api.Task.create({ tags: [`  Склад  Б-${me.id} `] });
    expect((await api.Task.get({ id })).tags.map((t) => t.name)).toEqual([`склад б-${me.id}`]);
    await expect(sql`INSERT INTO tag (name) VALUES (${`Склад-${me.id}`})`).rejects.toMatchObject({ constraint_name: 'chk_tag_name' });
  });

  test('typos, transliteration and the other keyboard layout find the tag', async () => {
    const me = await createEmployee();
    const api = await client(me.id);
    const name = `инвентаризация-${me.id}`;
    const { id } = await newTag(name);
    const [swapped] = retype(name, ['ru', 'en']);
    for (const text of [`инвентризация-${me.id}`, `inventarizatsiya-${me.id}`, swapped!, 'инвентар']) {
      const found = await api.Tags.suggest({ text });
      expect(found.tags.map((t) => t.id), text).toContain(id);
      expect(found.exact).toBe(false);
    }
    expect((await api.Tags.suggest({ text: name.toUpperCase() })).exact).toBe(true);
  });

  test('a text is read as existing tags, the words around them as new ones', async () => {
    const me = await createEmployee();
    const api = await client(me.id);
    const stock = await newTag(`склад-${me.id}`);
    const audit = await newTag(`инвентаризация-${me.id}`);

    const tail = await api.Tags.suggest({ text: `склад-${me.id} инвентризация-${me.id} перенос стеллажей` });
    expect(tail.variants[0]).toEqual([{ tag: stock }, { tag: audit }, { name: 'перенос стеллажей' }]);

    const between = await api.Tags.suggest({ text: `Склад-${me.id} срочно инвентаризация-${me.id}` });
    expect(between.variants[0]).toEqual([{ tag: stock }, { name: 'срочно' }, { tag: audit }]);

    expect((await api.Tags.suggest({ text: `склад-${me.id}` })).variants).toEqual([]);
  });

  test('the layouts are the person\'s: "б" and "ж" typed as "," and ";" stay inside words', async () => {
    const me = await createEmployee();
    const api = await client(me.id);
    const budget = await newTag(`бюджет-${me.id}`);
    const office = await newTag(`офис-${me.id}`);
    const text = retype(`бюджет-${me.id} офис-${me.id}`, ['ru', 'en'])[0]!;
    expect(text).toBe(`,.l;tn-${me.id} jabc-${me.id}`);
    expect((await api.Tags.suggest({ text })).variants[0]).toEqual([{ tag: budget }, { tag: office }]);

    // Someone who types only in English gets no reading in another layout.
    await api.Employee.updateSettings({ keyboards: ['en'] });
    expect((await api.Tags.suggest({ text: `jabc-${me.id}` })).tags.map((t) => t.id)).not.toContain(office.id);
    await api.Employee.updateSettings({ keyboards: ['uk', 'en'] });
    expect((await api.Tags.suggest({ text: `jabc-${me.id}` })).tags.map((t) => t.id)).toContain(office.id);
  });

  test('the layouts in the database are the ones the application has keys for', async () => {
    const [row] = await sql<{ values: string[] }[]>`SELECT enum_range(NULL::keyboard)::text[] AS values`;
    expect(row!.values).toEqual([...KEYBOARDS]);
    expect(Object.keys(KEYBOARD_KEYS)).toEqual([...KEYBOARDS]);
    for (const keys of Object.values(KEYBOARD_KEYS)) expect([...keys]).toHaveLength(47);
  });
});

describe('phrases and rubrics', () => {
  test('a tag no other task carries is the phrase of its task; the tags that go together are offered', async () => {
    const me = await createEmployee();
    const api = await client(me.id);
    const rubric = `r-${randomUUID().slice(0, 8)}`;
    const often = `o-${randomUUID().slice(0, 8)}`;
    const phrase = `подписать акт ${randomUUID().slice(0, 8)}`;
    const id = await api.Task.create({ tags: [rubric, often, phrase] });
    await api.Task.create({ tags: [rubric, often, `другое ${randomUUID().slice(0, 8)}`] });

    const page = await api.Task.get({ id });
    expect(Object.fromEntries(page.tags.map((tag) => [tag.name, tag.phrase]))).toEqual({ [rubric]: false, [often]: false, [phrase]: true });

    const rubricId = page.tags.find((tag) => tag.name === rubric)!.id;
    expect((await api.Tags.related({ tagIds: [rubricId] })).map((tag) => tag.name)).toEqual([often]);
  });
});

describe('tag summary', () => {
  test('per tag, on the tasks I see, over a range; picked tags add all of them together and any of them', async () => {
    const me = await createEmployee();
    const dev = await createEmployee({ managerId: me.id });
    const api = await client(me.id);
    const devApi = await client(dev.id);
    const a = `sa-${randomUUID().slice(0, 8)}`;
    const b = `sb-${randomUUID().slice(0, 8)}`;
    const both = await devApi.Task.create({ tags: [a, b, `phrase ${randomUUID().slice(0, 6)}`] });
    const onlyA = await devApi.Task.create({ tags: [a, `phrase ${randomUUID().slice(0, 6)}`] });
    const hidden = await (await client((await createEmployee()).id)).Task.create({ tags: [a, `phrase ${randomUUID().slice(0, 6)}`] });
    const today = (await devApi.MyDay.history({ page: 1 })).today;
    await devApi.Time.log({ taskId: both, day: today, minutes: 90 });
    await devApi.Comment.create({ taskId: onlyA, html: '<p>Done</p>', replyToId: null, files: [], mentionIds: [], taskIds: [] });
    await sql`SELECT set_finished_at(${onlyA}, NOW() - INTERVAL '1 minute')`;
    expect(hidden).toBeGreaterThan(0);

    const ids = (await sql<{ id: number }[]>`SELECT id FROM tag WHERE name IN (${a}, ${b}) ORDER BY name`).map((r) => r.id);
    const summary = await api.Tags.stats({ from: today, to: today, tagIds: ids, page: 1 });
    const line = (kind: string, name?: string) => summary.rows.find((r) => r.group.kind === kind && (!name || r.tags[0]!.name === name))!;
    // The hidden task of a stranger is not counted: only what I see (dev's tasks, through the manager chain).
    expect(line('tag', a)).toMatchObject({ tasks: 2, open: 1, finished: 1, expired: 0, active: 2, comments: 1, people: 1 });
    expect(line('tag', b)).toMatchObject({ tasks: 1, open: 1, active: 1, comments: 0, people: 1 });
    expect(line('all')).toMatchObject({ tasks: 1 });
    expect(line('any')).toMatchObject({ tasks: 2 });

    // Unpicked: rubrics only — the phrases of one task are not lines.
    const all = await api.Tags.stats({ from: today, to: today, tagIds: [], page: 1 });
    expect(all.rows.every((r) => !r.tags[0]!.name.startsWith('phrase'))).toBe(true);

    const people = await api.Tags.people({ from: today, to: today, group: { kind: 'tag', tagId: ids[0]! } });
    expect(people).toEqual([{ employeeId: dev.id, minutes: 90, comments: 1 }]);
  });
});
