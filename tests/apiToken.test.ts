import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import api from '../server/api.ts';
import { client, createEmployee } from './helpers.ts';

describe('API tokens', () => {
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let url: string;
  beforeAll(async () => {
    server = express().use('/api', api).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    url = `http://localhost:${(server.address() as AddressInfo).port}/api/trpc`;
  });
  afterAll(() => {
    server.close();
  });

  /** A raw HTTP call as a script would make it: tRPC with superjson's { json } envelope. */
  async function call(token: string, path: string, input: unknown, method: 'GET' | 'POST' = 'POST') {
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const response = method === 'GET'
      ? await fetch(`${url}/${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`, { headers })
      : await fetch(`${url}/${path}`, { method, headers, body: JSON.stringify({ json: input }) });
    return { status: response.status, body: (await response.json()) as { result?: { data: { json: unknown } } } };
  }

  test('the manager issues a token for a bot; the bot comments and mentions over HTTP; revoked, it stops', async () => {
    const lead = await createEmployee();
    const bot = await createEmployee({ managerId: lead.id });
    const stranger = await createEmployee();
    const leadApi = await client(lead.id);
    const task = await leadApi.Task.create({ tags: [`ci-${lead.id}`] });
    await leadApi.Observer.add({ taskId: task, employeeId: bot.id });

    await expect((await client(stranger.id)).ApiToken.issue({ employeeId: bot.id, name: 'CI' })).rejects.toMatchObject({ message: 'forbidden' });
    const { token } = await leadApi.ApiToken.issue({ employeeId: bot.id, name: 'GitHub Actions' });
    expect(token).toMatch(/^yartt_[0-9a-f]{64}$/);

    const me = await call(token, 'Auth.me', undefined, 'GET');
    expect(me.body.result?.data.json).toMatchObject({ id: bot.id });
    const posted = await call(token, 'Comment.create', {
      taskId: task, html: '<p>Build #512 failed</p>', replyToId: null, files: [], mentionIds: [lead.id], taskIds: [],
    });
    expect(posted.status).toBe(200);
    expect((await leadApi.MyDay.todo()).map((i) => i.kind)).toContain('mention');

    const [listed] = await leadApi.ApiToken.list({ employeeId: bot.id });
    expect(listed).toMatchObject({ name: 'GitHub Actions', createdBy: lead.id, revokedAt: null });
    expect(listed!.lastUsedAt).not.toBeNull();
    await expect((await client(stranger.id)).ApiToken.list({ employeeId: bot.id })).rejects.toMatchObject({ message: 'forbidden' });

    await leadApi.ApiToken.revoke({ id: listed!.id });
    expect((await call(token, 'Auth.me', undefined, 'GET')).body.result?.data.json).toBeNull();
    expect((await call('yartt_' + '0'.repeat(64), 'Auth.me', undefined, 'GET')).body.result?.data.json).toBeNull();
  });

  test('dismissal revokes every token', async () => {
    const lead = await createEmployee();
    const bot = await createEmployee({ managerId: lead.id });
    const leadApi = await client(lead.id);
    const { token } = await (await client(bot.id)).ApiToken.issue({ employeeId: bot.id, name: 'own' });
    await leadApi.Employee.dismiss({ id: bot.id });
    expect((await call(token, 'Auth.me', undefined, 'GET')).body.result?.data.json).toBeNull();
    expect((await leadApi.ApiToken.list({ employeeId: bot.id }))[0]!.revokedAt).not.toBeNull();
  });
});
