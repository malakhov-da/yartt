import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Message } from '../server/delivery.ts';
import env from '../server/env.ts';
import { sql } from '../server/pg.ts';
import { deliverNotifications } from '../server/worker.ts';
import { createEmployee } from './helpers.ts';

const sent: Message[] = [];
let failNext = false;
vi.mock('../server/delivery.ts', () => ({
  deliver: async (message: Message) => {
    if (failNext) {
      failNext = false;
      throw new Error('channel is down');
    }
    sent.push(message);
  },
}));

beforeEach(async () => {
  sent.length = 0;
  // Other test files leave notifications behind; start from an empty queue.
  await sql`UPDATE notification SET sent_at = NOW() WHERE sent_at IS NULL`;
});

const unsent = async () => (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM notification WHERE sent_at IS NULL`)[0]!.n;

describe('notification delivery', () => {
  test('parsed payloads are delivered and marked as sent', async () => {
    const boss = await createEmployee();
    const dev = await createEmployee();
    await sql`UPDATE employee SET locale = 'en' WHERE id = ${boss.id}`;
    await sql`UPDATE employee SET manager_id = ${boss.id} WHERE id = ${dev.id}`;

    expect(await deliverNotifications(sql)).toBe(1);
    expect(sent).toEqual([
      {
        to: expect.objectContaining({ employeeId: boss.id, locale: 'en' }),
        taskId: null,
        payload: { kind: 'new_report', employeeId: dev.id },
      },
    ]);
    expect(await unsent()).toBe(0);
  });

  test('a deadline change waits a minute to settle before it goes out', async () => {
    const me = await createEmployee();
    await sql`SELECT notify(${me.id}, NULL, ${sql.json({ kind: 'finished_at_change', dependencyId: 1, late: false })})`;
    expect(await deliverNotifications(sql)).toBe(0);
    expect(await unsent()).toBe(1);

    await sql`UPDATE notification SET added_at = added_at - INTERVAL '1 minute' WHERE employee_id = ${me.id}`;
    expect(await deliverNotifications(sql)).toBe(1);
    expect(sent.map((m) => m.payload.kind)).toEqual(['finished_at_change']);
  });

  test('the demo sends nothing: its people are made up, the queue is only marked sent', async () => {
    const boss = await createEmployee();
    const dev = await createEmployee();
    await sql`UPDATE employee SET manager_id = ${boss.id} WHERE id = ${dev.id}`;
    env.DEMO_DATA = 'ru';
    try {
      await deliverNotifications(sql);
    } finally {
      env.DEMO_DATA = undefined;
    }
    expect(sent).toEqual([]);
    expect(await unsent()).toBe(0);
    const [left] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM notification WHERE employee_id = ${boss.id} AND closed_at IS NULL`;
    expect(left!.n).toBe(1); // still in the bell
  });

  test('a failed delivery stays in the queue, an invalid payload is skipped', async () => {
    const me = await createEmployee();
    await sql`INSERT INTO notification (employee_id, payload) VALUES (${me.id}, ${sql.json({ kind: 'nonsense' })})`;
    await sql`SELECT notify(${me.id}, NULL, ${sql.json({ kind: 'invite', by: me.id })})`;

    failNext = true;
    expect(await deliverNotifications(sql)).toBe(1); // the invalid one, skipped
    expect(await unsent()).toBe(1);

    expect(await deliverNotifications(sql)).toBe(1);
    expect(sent.map((m) => m.payload.kind)).toEqual(['invite']);
    expect(await unsent()).toBe(0);
  });
});
