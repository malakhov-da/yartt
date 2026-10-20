import { beforeEach, describe, expect, test, vi } from 'vitest';
import { sql } from '../server/pg.ts';
import type { Message } from '../server/delivery.ts';
import { client, clientBySession, createEmployee } from './helpers.ts';

const sent: Message[] = [];
vi.mock('../server/delivery.ts', () => ({
  deliver: async (message: Message) => { sent.push(message); },
}));

beforeEach(() => { sent.length = 0; });

async function loginLink(email: string): Promise<string> {
  await (await client()).Auth.requestLogin({ email });
  const message = sent.findLast((m) => m.payload.kind === 'login' && m.to.email?.toLowerCase() === email.toLowerCase());
  const url = message?.payload.kind === 'login' ? message.payload.url : '';
  return url.slice(url.lastIndexOf('/') + 1);
}

describe('auth', () => {
  test('magic link -> session -> me', async () => {
    const { id, email } = await createEmployee();
    const token = await loginLink(email.toUpperCase());
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    const anonymous = await client();
    await anonymous.Auth.login({ token });
    expect(anonymous.cookie.value).toMatch(/^[0-9a-f]{64}$/);

    const authed = await clientBySession(anonymous.cookie.value!);
    expect((await authed.Auth.me())?.id).toBe(id);
  });

  test('token is single-use and stored hashed', async () => {
    const { email } = await createEmployee();
    const token = await loginLink(email);

    const [stored] = await sql`SELECT 1 FROM token WHERE hash = ${token}`;
    expect(stored).toBeUndefined();

    await (await client()).Auth.login({ token });
    await expect((await client()).Auth.login({ token })).rejects.toMatchObject({ message: 'invalid_token' });
  });

  test('expired token is rejected', async () => {
    const { email } = await createEmployee();
    const token = await loginLink(email);
    await sql`UPDATE token SET sent_at = NOW() - INTERVAL '11 minutes' WHERE hash = digest(${token}, 'sha256')`;
    await expect((await client()).Auth.login({ token })).rejects.toMatchObject({ message: 'invalid_token' });
  });

  test('unknown email: same answer, nothing sent', async () => {
    await (await client()).Auth.requestLogin({ email: 'nobody@yartt.test' });
    expect(sent).toHaveLength(0);
  });

  test('dismissed employee cannot log in', async () => {
    const boss = await createEmployee();
    const { id, email } = await createEmployee({ managerId: boss.id });
    await sql`SELECT dismiss_employee(${id}, ${boss.id})`;
    await (await client()).Auth.requestLogin({ email });
    expect(sent).toHaveLength(0);
  });

  test('logout and logout everywhere', async () => {
    const { email } = await createEmployee();
    const sessions: string[] = [];
    for (let i = 0; i < 3; i++) {
      const anonymous = await client();
      await anonymous.Auth.login({ token: await loginLink(email) });
      sessions.push(anonymous.cookie.value!);
    }

    const first = await clientBySession(sessions[0]!);
    await first.Auth.logout();
    expect(first.cookie.value).toBeNull();
    expect(await (await clientBySession(sessions[0]!)).Auth.me()).toBeNull();
    expect(await (await clientBySession(sessions[1]!)).Auth.me()).not.toBeNull();

    const second = await clientBySession(sessions[1]!);
    await second.Auth.logoutEverywhere();
    expect(await (await clientBySession(sessions[2]!)).Auth.me()).toBeNull();
  });

  test('protected procedures require a session', async () => {
    await expect((await client()).Employee.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('sign-in links are limited', () => {
  test('five links in 15 minutes; the sixth is refused like an unknown address', async () => {
    const me = await createEmployee();
    for (let i = 0; i < 5; i++) {
      const [row] = await sql<{ token: string | null }[]>`SELECT issue_token(${me.email}) AS token`;
      expect(row!.token).not.toBeNull();
    }
    const [sixth] = await sql<{ token: string | null }[]>`SELECT issue_token(${me.email}) AS token`;
    expect(sixth!.token).toBeNull();
  });
});
