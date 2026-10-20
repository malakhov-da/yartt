import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';

// A fake OpenID Connect provider for the sign-in tests: discovery, the
// authorization endpoint (it signs in whoever the test says), the token
// endpoint (codes with PKCE, refresh tokens that can be revoked) and its keys.

export type Person = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  locale?: string;
  zoneinfo?: string;
};

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test';
const b64 = (value: object | Buffer) => (Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value))).toString('base64url');

export async function startProvider(clientId: string) {
  /** Who signs in at the next authorization. */
  let next: Person | null = null;
  const codes = new Map<string, { person: Person; nonce: string; challenge: string }>();
  /** Refresh token -> the person's sub; deleted when the provider stops letting them in. */
  const refresh = new Map<string, string>();

  const app = express().use(express.urlencoded({ extended: false }));
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const issuer = `http://localhost:${(server.address() as AddressInfo).port}`;

  const idToken = (person: Person, nonce: string) => {
    const now = Math.floor(Date.now() / 1000);
    const head = b64({ alg: 'RS256', kid: KID, typ: 'JWT' });
    const body = b64({ iss: issuer, aud: clientId, iat: now, exp: now + 300, nonce, ...person });
    return `${head}.${body}.${b64(sign('sha256', Buffer.from(`${head}.${body}`), privateKey))}`;
  };

  app.get('/.well-known/openid-configuration', (_req, res) => {
    res.json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'email', 'profile', 'offline_access'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    });
  });
  app.get('/jwks', (_req, res) => {
    res.json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KID, use: 'sig', alg: 'RS256' }] });
  });
  app.get('/authorize', (req, res) => {
    const q = req.query as Record<string, string>;
    if (!next || q.client_id !== clientId || q.code_challenge_method !== 'S256') {
      res.status(400).send('unexpected authorization request');
      return;
    }
    const code = randomUUID();
    codes.set(code, { person: next, nonce: q.nonce!, challenge: q.code_challenge! });
    next = null;
    const back = new URL(q.redirect_uri!);
    back.searchParams.set('code', code);
    back.searchParams.set('state', q.state!);
    res.redirect(back.toString());
  });
  app.post('/token', (req, res) => {
    const body = req.body as Record<string, string>;
    if (body.grant_type === 'authorization_code') {
      const grant = codes.get(body.code ?? '');
      codes.delete(body.code ?? '');
      const challenge = createHash('sha256').update(body.code_verifier ?? '').digest('base64url');
      if (!grant || challenge !== grant.challenge) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
      const token = randomUUID();
      refresh.set(token, grant.person.sub);
      res.json({ access_token: randomUUID(), token_type: 'Bearer', expires_in: 300, id_token: idToken(grant.person, grant.nonce), refresh_token: token });
      return;
    }
    if (body.grant_type === 'refresh_token') {
      const sub = refresh.get(body.refresh_token ?? '');
      if (!sub) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
      refresh.delete(body.refresh_token!);
      const token = randomUUID();
      refresh.set(token, sub);
      res.json({ access_token: randomUUID(), token_type: 'Bearer', expires_in: 300, refresh_token: token });
      return;
    }
    res.status(400).json({ error: 'unsupported_grant_type' });
  });

  return {
    issuer,
    /** The next authorization signs in this person. */
    signInAs: (person: Person) => { next = person; },
    /** The provider stops letting this person in: their refresh tokens are refused. */
    block: (sub: string) => {
      for (const [token, owner] of refresh) if (owner === sub) refresh.delete(token);
    },
    close: () => server.close(),
  };
}
