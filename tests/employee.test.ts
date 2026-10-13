import { describe, expect, test } from 'vitest';
import { sql } from '../server/pg.ts';
import { client, createEmployee } from './helpers.ts';

describe('employee', () => {
  test('invite inherits locale and time zone, notifies invitee', async () => {
    const inviter = await createEmployee();
    await sql`UPDATE employee SET locale = 'en', time_zone = 'Asia/Almaty' WHERE id = ${inviter.id}`;

    const api = await client(inviter.id);
    const invited = await api.Employee.invite({ email: 'New.Person@yartt.test', fullName: 'New Person' });
    expect(invited).toMatchObject({ locale: 'en', timeZone: 'Asia/Almaty', managerId: null });

    const [notification] = await sql<{ payload: { kind: string; by: number } }[]>`
      SELECT payload FROM notification WHERE employee_id = ${invited.id}
    `;
    expect(notification?.payload).toEqual({ kind: 'invite', by: inviter.id });

    await expect(api.Employee.invite({ email: 'new.person@YARTT.test', fullName: 'Dup' }))
      .rejects.toMatchObject({ message: 'email_taken' });
  });

  test('profile: invalid time zone is rejected with a code', async () => {
    const me = await createEmployee();
    const api = await client(me.id);
    const profile = { fullName: 'Me', about: null, nextDay: null, timeZone: 'Europe/Moscow', locale: 'ru' as const };

    expect(await api.Employee.updateProfile(profile)).toMatchObject({ timeZone: 'Europe/Moscow' });
    await expect(api.Employee.updateProfile({ ...profile, timeZone: 'Mars/Base' }))
      .rejects.toMatchObject({ message: 'invalid_time_zone' });
    await expect(api.Employee.updateProfile({ ...profile, nextDay: '2026-13-01' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  test('output contract catches data the client does not know', async () => {
    const me = await createEmployee();
    // The database accepts any language code, the contract only supported ones.
    await sql`UPDATE employee SET locale = 'de' WHERE id = ${me.id}`;
    try {
      await expect((await client(me.id)).Auth.me()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    } finally {
      await sql`UPDATE employee SET locale = 'ru' WHERE id = ${me.id}`;
    }
  });

  test('nextDay stays a plain date', async () => {
    const me = await createEmployee();
    const api = await client(me.id);
    const saved = await api.Employee.updateProfile({
      fullName: 'Me', about: null, nextDay: '2026-12-31', timeZone: 'Pacific/Kiritimati', locale: 'ru',
    });
    expect(saved.nextDay).toBe('2026-12-31');
  });

  test('setManager rejects cycles', async () => {
    const boss = await createEmployee();
    const dev = await createEmployee({ managerId: boss.id });

    await expect((await client(boss.id)).Employee.setManager({ managerId: dev.id }))
      .rejects.toMatchObject({ message: 'manager_cycle' });
    await expect((await client(boss.id)).Employee.setManager({ managerId: boss.id }))
      .rejects.toMatchObject({ message: 'manager_cycle' });
    await (await client(dev.id)).Employee.setManager({ managerId: null });
  });

  test('only the direct manager dismisses; tasks and reports move to them', async () => {
    const top = await createEmployee();
    const middle = await createEmployee({ managerId: top.id });
    const bottom = await createEmployee({ managerId: middle.id });
    const [tag] = await sql<{ id: number }[]>`INSERT INTO tag (name) VALUES (${'t-' + middle.id}) RETURNING id`;
    const [task] = await sql<{ id: number }[]>`
      INSERT INTO task (owner_id, tag_ids) VALUES (${middle.id}, ${[tag!.id]}) RETURNING id
    `;

    // Not the manager (a report, a stranger), and nobody above the top.
    await expect((await client(bottom.id)).Employee.dismiss({ id: middle.id }))
      .rejects.toMatchObject({ message: 'not_manager', cause: { params: { employeeId: middle.id } } });
    await expect((await client(middle.id)).Employee.dismiss({ id: top.id }))
      .rejects.toMatchObject({ message: 'not_manager' });

    const api = await client(top.id);
    await api.Employee.dismiss({ id: middle.id });
    const list = await api.Employee.list();
    expect(list.find((e) => e.id === middle.id)?.email).toBeNull();
    expect(list.find((e) => e.id === bottom.id)?.managerId).toBe(top.id);
    const [owner] = await sql<{ ownerId: number }[]>`SELECT owner_id FROM task WHERE id = ${task!.id}`;
    expect(owner?.ownerId).toBe(top.id);

    await expect(api.Employee.dismiss({ id: middle.id })).rejects.toMatchObject({ message: 'not_found' });
  });

  test('only the direct manager brings back', async () => {
    const boss = await createEmployee();
    const other = await createEmployee();
    const dev = await createEmployee({ managerId: boss.id });
    await (await client(boss.id)).Employee.dismiss({ id: dev.id });

    await expect((await client(other.id)).Employee.restore({ id: dev.id, email: dev.email }))
      .rejects.toMatchObject({ message: 'not_manager' });
    expect(await (await client(boss.id)).Employee.restore({ id: dev.id, email: dev.email }))
      .toMatchObject({ email: dev.email });
    await expect((await client(boss.id)).Employee.restore({ id: dev.id, email: dev.email }))
      .rejects.toMatchObject({ message: 'not_found' });
  });

  test('the new manager is notified', async () => {
    const boss = await createEmployee();
    const dev = await createEmployee();
    await (await client(dev.id)).Employee.setManager({ managerId: boss.id });

    const rows = await sql<{ payload: unknown }[]>`SELECT payload FROM notification WHERE employee_id = ${boss.id}`;
    expect(rows.map((r) => r.payload)).toEqual([{ kind: 'new_report', employeeId: dev.id }]);
  });
});
