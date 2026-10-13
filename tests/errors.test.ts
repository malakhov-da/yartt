import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import api from '../server/api.ts';
import { client, createEmployee } from './helpers.ts';

describe('error codes', () => {
  test('business errors carry parameters from the database', async () => {
    const boss = await createEmployee();
    const dev = await createEmployee({ managerId: boss.id });

    await expect((await client(boss.id)).Employee.setManager({ managerId: dev.id })).rejects.toMatchObject({
      message: 'manager_cycle',
      cause: { params: { employeeId: boss.id } },
    });
  });
});

describe('error format over HTTP', () => {
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

  async function call(path: string, input: unknown) {
    const response = await fetch(`${url}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ json: input }),
    });
    const body = (await response.json()) as { error: { json: { message: string; data: Record<string, unknown> } } };
    return { status: response.status, error: body.error.json };
  }

  test('validation issues come without server-side messages', async () => {
    const { status, error } = await call('Auth.requestLogin', { email: 'not-an-email' });
    expect(status).toBe(400);
    expect(error.message).toBe('invalid_input');
    expect(error.data.appCode).toBe('invalid_input');
    expect(error.data.issues).toEqual([
      expect.objectContaining({ code: 'invalid_format', format: 'email', path: ['email'] }),
    ]);
    expect(JSON.stringify(error.data.issues)).not.toContain('message');
  });

  test('business error code', async () => {
    const { status, error } = await call('Auth.login', { token: 'nope' });
    expect(status).toBe(400);
    expect(error.data).toMatchObject({ appCode: 'invalid_token' });
  });

  test('no session', async () => {
    const { status, error } = await call('Employee.dismiss', { id: 1 });
    expect(status).toBe(401);
    expect(error.data).toMatchObject({ appCode: 'unauthorized' });
  });
});
