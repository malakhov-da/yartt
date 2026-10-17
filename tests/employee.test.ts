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

  test('settings: invalid time zone is rejected with a code, left-out fields stay', async () => {
    const me = await createEmployee();
    const api = await client(me.id);

    expect(await api.Employee.updateSettings({ timeZone: 'Europe/Moscow', locale: 'en' }))
      .toMatchObject({ timeZone: 'Europe/Moscow', locale: 'en' });
    expect(await api.Employee.updateSettings({ nextDay: '2026-12-31' }))
      .toMatchObject({ timeZone: 'Europe/Moscow', locale: 'en', nextDay: '2026-12-31' });
    expect(await api.Employee.updateSettings({ locale: 'ru' })).toMatchObject({ nextDay: '2026-12-31' });
    expect(await api.Employee.updateSettings({ nextDay: null })).toMatchObject({ nextDay: null });
    await expect(api.Employee.updateSettings({ timeZone: 'Mars/Base' }))
      .rejects.toMatchObject({ message: 'invalid_time_zone' });
    await expect(api.Employee.updateSettings({ nextDay: '2026-13-01' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  test('profile: name, email and about; the email stays unique', async () => {
    const me = await createEmployee();
    const other = await createEmployee();
    const api = await client(me.id);

    expect(await api.Employee.updateProfile({ fullName: 'Me', email: `me-${me.id}@yartt.test`, about: 'QA lead' }))
      .toMatchObject({ fullName: 'Me', email: `me-${me.id}@yartt.test`, about: 'QA lead' });
    await expect(api.Employee.updateProfile({ fullName: 'Me', email: other.email.toUpperCase(), about: null }))
      .rejects.toMatchObject({ message: 'email_taken' });
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
    await api.Employee.updateSettings({ timeZone: 'Pacific/Kiritimati' });
    const saved = await api.Employee.updateSettings({ nextDay: '2026-12-31' });
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

  test('a dismissed employee always has a manager to bring them back: theirs, or the one above when theirs leaves', async () => {
    const top = await createEmployee();
    const lead = await createEmployee({ managerId: top.id });
    const dev = await createEmployee({ managerId: lead.id });
    await (await client(lead.id)).Employee.dismiss({ id: dev.id });
    await (await client(top.id)).Employee.dismiss({ id: lead.id });
    // The lead's dismissed report moved up with the rest: the top manager brings them back.
    expect((await (await client(top.id)).Employee.list()).find((e) => e.id === dev.id)?.managerId).toBe(top.id);
    await expect(sql`UPDATE employee SET manager_id = NULL WHERE id = ${dev.id}`)
      .rejects.toMatchObject({ constraint_name: 'chk_employee_dismissed_manager' });
  });

  test('bringing back may hand the employee to another manager, who is notified', async () => {
    const boss = await createEmployee();
    const peer = await createEmployee();
    const dev = await createEmployee({ managerId: boss.id });
    const api = await client(boss.id);
    await api.Employee.dismiss({ id: dev.id });
    // Not under someone dismissed — themselves included.
    await expect(api.Employee.restore({ id: dev.id, email: dev.email, managerId: dev.id })).rejects.toMatchObject({ message: 'not_found' });
    expect(await api.Employee.restore({ id: dev.id, email: dev.email, managerId: peer.id }))
      .toMatchObject({ email: dev.email, managerId: peer.id, dismissedAt: null });
    const rows = await sql<{ payload: unknown }[]>`SELECT payload FROM notification WHERE employee_id = ${peer.id}`;
    expect(rows.map((r) => r.payload)).toContainEqual({ kind: 'new_report', employeeId: dev.id });
  });

  test('someone at the top hands the team to a report, who then may dismiss them', async () => {
    const top = await createEmployee();
    const heir = await createEmployee({ managerId: top.id });
    const other = await createEmployee({ managerId: top.id });
    const gone = await createEmployee({ managerId: top.id });
    const topApi = await client(top.id);
    await topApi.Employee.dismiss({ id: gone.id });
    await expect(topApi.Employee.handOver({ successorId: gone.id }))
      .rejects.toMatchObject({ message: 'not_direct_report', cause: { params: { employeeId: gone.id } } });
    await expect((await client(heir.id)).Employee.handOver({ successorId: top.id })).rejects.toMatchObject({ message: 'not_direct_report' });

    await topApi.Employee.handOver({ successorId: heir.id });
    const managers = new Map((await topApi.Employee.list()).map((e) => [e.id, e.managerId]));
    expect([managers.get(heir.id), managers.get(top.id), managers.get(other.id), managers.get(gone.id)])
      .toEqual([null, heir.id, heir.id, heir.id]);
    await (await client(heir.id)).Employee.dismiss({ id: top.id });
  });

  test('the new manager is notified', async () => {
    const boss = await createEmployee();
    const dev = await createEmployee();
    await (await client(dev.id)).Employee.setManager({ managerId: boss.id });

    const rows = await sql<{ payload: unknown }[]>`SELECT payload FROM notification WHERE employee_id = ${boss.id}`;
    expect(rows.map((r) => r.payload)).toEqual([{ kind: 'new_report', employeeId: dev.id }]);
  });
});

describe('pronoun', () => {
  test('set, cleared, and only he or she', async () => {
    const me = await createEmployee();
    const api = await client(me.id);
    expect(await api.Employee.updateSettings({ pronoun: 'she' })).toMatchObject({ pronoun: 'she' });
    expect(await api.Employee.updateSettings({ locale: 'en' })).toMatchObject({ pronoun: 'she' });
    expect(await api.Employee.updateSettings({ pronoun: null })).toMatchObject({ pronoun: null });
    // @ts-expect-error — not a pronoun
    await expect(api.Employee.updateSettings({ pronoun: 'it' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
