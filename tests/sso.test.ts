import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import api from '../server/api.ts';
import type { Message } from '../server/delivery.ts';
import env from '../server/env.ts';
import { sql } from '../server/pg.ts';
import { checkPeople } from '../server/sso.ts';
import { client, clientBySession, createEmployee } from './helpers.ts';
import { startProvider, type Person } from './oidc.ts';

vi.mock('../server/delivery.ts', () => ({ deliver: async (_message: Message) => {} }));

const CLIENT_ID = 'yartt-test';

describe('sign-in through the identity provider', () => {
  let provider: Awaited<ReturnType<typeof startProvider>>;
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let base: string;
  beforeAll(async () => {
    provider = await startProvider(CLIENT_ID);
    server = express().use('/api', api).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });
  beforeEach(() => {
    Object.assign(env, { OIDC_ISSUER: provider.issuer, OIDC_CLIENT_ID: CLIENT_ID, OIDC_CLIENT_SECRET: 'secret', EMAIL_DOMAINS: [] });
  });
  afterAll(() => {
    Object.assign(env, { OIDC_ISSUER: undefined, OIDC_CLIENT_ID: undefined, OIDC_CLIENT_SECRET: undefined });
    server.close();
    provider.close();
  });

  /** The redirects a browser would follow: here, the provider, back here. Where it ends, and the session cookie. */
  async function signIn(person: Person, next = '/') {
    provider.signInAs(person);
    const start = await fetch(`${base}/api/sso/start?next=${encodeURIComponent(next)}`, { redirect: 'manual' });
    const flow = /yartt_sso=([^;]+)/.exec(start.headers.get('set-cookie') ?? '')?.[1];
    const authorized = await fetch(start.headers.get('location')!, { redirect: 'manual' });
    // The provider sends the browser to PUBLIC_URL; here it is this test server.
    const back = new URL(authorized.headers.get('location')!);
    const done = await fetch(`${base}${back.pathname}${back.search}`, { redirect: 'manual', headers: { cookie: `yartt_sso=${flow}` } });
    const session = /yartt_session=([^;]+)/.exec(done.headers.get('set-cookie') ?? '')?.[1] ?? null;
    return { location: done.headers.get('location'), session };
  }
  const person = (fields: Partial<Person> = {}): Person =>
    ({ sub: randomUUID(), email: `${randomUUID()}@yartt.test`, email_verified: true, name: 'Ann Lee', locale: 'en-GB', ...fields });

  test('someone new comes in by signing in: created, known by the provider id, a session for a day', async () => {
    const ann = person({ zoneinfo: 'Asia/Almaty' });
    const { location, session } = await signIn(ann, '/tasks/12');
    expect(location).toBe('/tasks/12');
    const me = await (await clientBySession(session!)).Auth.me();
    expect(me).toMatchObject({ kind: 'human', email: ann.email, fullName: 'Ann Lee', locale: 'en', timeZone: 'Asia/Almaty', managerId: null });

    // Her email changes at the provider: the same person here, with the new address.
    const again = await signIn({ ...ann, email: `new-${ann.email}` });
    expect(await (await clientBySession(again.session!)).Auth.me()).toMatchObject({ id: me!.id, email: `new-${ann.email}` });

    // A day from sign-in, active or not — as the browser sees it.
    const meOverHttp = async () => (await (await fetch(`${base}/api/trpc/Auth.me`, { headers: { cookie: `yartt_session=${session}` } }))
      .json() as { result: { data: { json: { id: number } | null } } }).result.data.json;
    expect(await meOverHttp()).toMatchObject({ id: me!.id });
    await sql`UPDATE session SET created_at = NOW() - INTERVAL '25 hours' WHERE hash = digest(${session!}, 'sha256')`;
    expect(await meOverHttp()).toBeNull();
  });

  test('someone invited before is found by the email the provider vouches for, once', async () => {
    const invited = await createEmployee();
    const { session } = await signIn(person({ email: invited.email }));
    expect((await (await clientBySession(session!)).Auth.me())?.id).toBe(invited.id);

    // An address the provider does not vouch for finds nobody: someone else with it is a conflict.
    const other = await createEmployee();
    expect((await signIn(person({ email: other.email, email_verified: false }))).location).toBe('/login?error=email_taken');
  });

  test('refused: the dismissed, an address outside the domains, a broken flow; never sent elsewhere', async () => {
    const boss = await createEmployee();
    const gone = await createEmployee({ managerId: boss.id });
    await (await client(boss.id)).Employee.dismiss({ id: gone.id });
    expect((await signIn(person({ email: gone.email }))).location).toBe('/login?error=dismissed');

    env.EMAIL_DOMAINS = ['corp.test'];
    expect((await signIn(person())).location).toBe('/login?error=email_not_allowed');
    env.EMAIL_DOMAINS = [];

    expect((await fetch(`${base}/api/sso/callback?code=x&state=y`, { redirect: 'manual' })).headers.get('location'))
      .toBe('/login?error=sso_failed');
    expect((await signIn(person(), '//evil.example.com/')).location).toBe('/');
  });

  test('no sign-in links, invites or email changes: the provider is the only way', async () => {
    const me = await createEmployee();
    const api = await client(me.id);
    await expect((await client()).Auth.requestLogin({ email: me.email })).rejects.toMatchObject({ message: 'sso_only' });
    await expect(api.Employee.invite({ email: `x-${me.email}`, fullName: 'X' })).rejects.toMatchObject({ message: 'sso_only' });
    await expect(api.Employee.requestEmailChange({ email: `y-${me.email}` })).rejects.toMatchObject({ message: 'sso_only' });
    expect(await (await client()).Auth.config()).toEqual({ sso: { name: 'SSO' } });
  });

  test('every day the provider is asked: someone it refuses is out — sessions, links, their bots', async () => {
    const ann = person();
    const { session } = await signIn(ann);
    const me = (await (await clientBySession(session!)).Auth.me())!;
    const { key } = await (await client(me.id)).Bot.create({ fullName: 'CI', pronoun: null, about: null, permissions: [], webhookUrl: null });
    const bot = async () => (await sql<{ id: number | null }[]>`SELECT authenticate_bot(${key}) AS id`)[0]!.id;

    // Checked a day ago: still let in.
    await sql`UPDATE human SET idp_checked_at = NOW() - INTERVAL '25 hours' WHERE employee_id = ${me.id}`;
    expect(await sql.begin((tx) => checkPeople(tx as unknown as typeof sql))).toBe(0);
    expect(await bot()).not.toBeNull();

    provider.block(ann.sub);
    await sql`UPDATE human SET idp_checked_at = NOW() - INTERVAL '25 hours' WHERE employee_id = ${me.id}`;
    expect(await sql.begin((tx) => checkPeople(tx as unknown as typeof sql))).toBe(1);
    expect(await (await clientBySession(session!)).Auth.me()).toBeNull();
    expect(await bot()).toBeNull();
    expect((await (await client(me.id)).Auth.me())?.idpBlockedAt).toBeInstanceOf(Date);
    // Back to sign-in links in an outage, they are still refused.
    expect((await sql<{ token: string | null }[]>`SELECT issue_token(${ann.email!}) AS token`)[0]!.token).toBeNull();

    // Let in again: signing in clears it.
    await signIn(ann);
    expect(await bot()).not.toBeNull();
  });
});
