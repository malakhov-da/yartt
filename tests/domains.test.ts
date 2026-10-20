import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Message } from '../server/delivery.ts';
import env from '../server/env.ts';
import { sql } from '../server/pg.ts';
import { deliverNotifications } from '../server/worker.ts';
import { client, createEmployee } from './helpers.ts';

const sent: { message: Message; mail: boolean }[] = [];
vi.mock('../server/delivery.ts', () => ({
  deliver: async (message: Message, options: { mail?: boolean } = {}) => { sent.push({ message, mail: options.mail !== false }); },
}));

// Test employees have addresses at yartt.test; the company's domain here is corp.test.
beforeEach(async () => {
  sent.length = 0;
  env.EMAIL_DOMAINS = ['corp.test'];
  await sql`UPDATE notification SET sent_at = NOW() WHERE sent_at IS NULL`;
});
afterEach(() => {
  env.EMAIL_DOMAINS = [];
});

/** A person at the company's domain. */
async function inside(fields: { managerId?: number } = {}) {
  const e = await createEmployee(fields);
  const email = e.email.replace('@yartt.test', '@corp.test');
  await sql`UPDATE employee SET email = ${email} WHERE id = ${e.id}`;
  return { id: e.id, email };
}

describe('email domains', () => {
  test('no address outside them is written: an invite, a change, bringing someone back', async () => {
    const boss = await inside();
    const api = await client(boss.id);
    await expect(api.Employee.invite({ email: 'someone@gmail.com', fullName: 'Someone' }))
      .rejects.toMatchObject({ message: 'email_not_allowed', cause: { params: { domains: 'corp.test' } } });
    expect(await api.Employee.invite({ email: `new-${boss.id}@CORP.test`, fullName: 'New' })).toMatchObject({ fullName: 'New' });
    await expect(api.Employee.requestEmailChange({ email: 'me@gmail.com' })).rejects.toMatchObject({ message: 'email_not_allowed' });

    // Dismissed with an old address: back only with a new one.
    const old = await createEmployee({ managerId: boss.id });
    await api.Employee.dismiss({ id: old.id });
    await expect(api.Employee.restore({ id: old.id })).rejects.toMatchObject({ message: 'email_not_allowed' });
    expect(await api.Employee.restore({ id: old.id, email: `back-${old.id}@corp.test` })).toMatchObject({ dismissedAt: null });
  });

  test('someone with an older address signs in to change it, and to nothing else', async () => {
    const old = await createEmployee();
    const api = await client(old.id);
    expect(await api.Auth.me()).toMatchObject({ id: old.id, outsideDomains: true, domains: ['corp.test'] });
    await expect(api.MyDay.todo()).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'email_outside_domains' });
    await expect(api.Task.create({ tags: [`x-${old.id}`] })).rejects.toMatchObject({ message: 'email_outside_domains' });
    await api.Employee.requestEmailChange({ email: `fixed-${old.id}@corp.test` });
    expect(sent.map((s) => s.message.payload.kind)).toContain('email_confirm');

    const fine = await inside();
    expect(await (await client(fine.id)).Auth.me()).toMatchObject({ outsideDomains: false });
    await (await client(fine.id)).MyDay.todo();
  });

  test('their notifications reach the bell and the webhook; their mail gets a request to change it, once a day', async () => {
    const boss = await createEmployee();
    const dev = await inside();
    const devApi = await client(dev.id);
    env.EMAIL_DOMAINS = [];
    await devApi.Employee.setManager({ managerId: boss.id });
    const task = await devApi.Task.create({ tags: [`d-${dev.id}`] });
    await devApi.Comment.create({ taskId: task, html: '<p>Look</p>', replyToId: null, files: [], mentionIds: [boss.id], taskIds: [] });
    env.EMAIL_DOMAINS = ['corp.test'];

    await deliverNotifications(sql);
    const toBoss = sent.filter((s) => s.message.to.employeeId === boss.id);
    expect(toBoss.map((s) => [s.message.payload.kind, s.mail])).toEqual([
      ['email_outside_domains', true], ['new_report', false], ['mention', false],
    ]);

    // The next one the same day: no second request.
    sent.length = 0;
    await sql`SELECT notify(${boss.id}, NULL, ${sql.json({ kind: 'invite', by: dev.id })})`;
    await deliverNotifications(sql);
    expect(sent.map((s) => [s.message.payload.kind, s.mail])).toEqual([['invite', false]]);
  });
});
