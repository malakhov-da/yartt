import { describe, expect, test } from 'vitest';
import { sql } from '../server/pg.ts';
import { renderMail } from '../server/services/Mail.ts';
import { createEmployee } from './helpers.ts';

async function taskWithTags(ownerId: number, names: string[]): Promise<number> {
  const ids: number[] = [];
  for (const name of names) {
    const [row] = await sql<{ id: number }[]>`INSERT INTO tag (name) VALUES (${name}) RETURNING id`;
    ids.push(row!.id);
  }
  const [task] = await sql<{ id: number }[]>`INSERT INTO task (owner_id, tag_ids) VALUES (${ownerId}, ${ids}) RETURNING id`;
  return task!.id;
}

describe('mail', () => {
  test('rendered in the recipient language with names and the task title', async () => {
    const previous = await createEmployee();
    const me = await createEmployee();
    await sql`UPDATE employee SET full_name = 'Pavel' WHERE id = ${previous.id}`;
    const taskId = await taskWithTags(me.id, [`billing-${me.id}`, `export-${me.id}`]);
    const to = { employeeId: me.id, email: me.email, fullName: 'Me', locale: 'en' as const };

    const en = await renderMail({ to, taskId, payload: { kind: 'owner_change', from: previous.id } });
    expect(en.subject).toBe(`You own: billing-${me.id} · export-${me.id}`);
    expect(en.text).toContain('Previous owner: Pavel.');
    expect(en.text).toContain(`http://yartt.test/tasks/${taskId}`);

    const ru = await renderMail({ to: { ...to, locale: 'ru' }, taskId, payload: { kind: 'owner_change', from: previous.id } });
    expect(ru.subject).toBe(`Вы владелец: billing-${me.id} · export-${me.id}`);
  });

  test('sign-in link and a copy for an absent employee', async () => {
    const me = await createEmployee();
    const absent = await createEmployee();
    await sql`UPDATE employee SET full_name = 'Marina' WHERE id = ${absent.id}`;
    const to = { employeeId: me.id, email: me.email, fullName: 'Me', locale: 'en' as const };

    const login = await renderMail({ to, taskId: null, payload: { kind: 'login', url: 'http://yartt.test/login/abc' } });
    expect(login.text).toContain('http://yartt.test/login/abc');
    expect(login.text).not.toContain('/tasks/');

    const copy = await renderMail({ to, taskId: null, payload: { kind: 'new_report', employeeId: me.id, for: absent.id } });
    expect(copy.text).toContain('A copy: Marina is away.');
  });
});
