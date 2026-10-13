import type { Request, Response } from 'express';
import { parse as parseCookie } from 'cookie';
import env from './env.ts';
import * as Auth from './services/Auth.ts';

const SESSION_COOKIE = 'yartt_session';
// The session expires on inactivity (30 days, see db.sql); the cookie lives
// as long as browsers allow, the server decides when it is over.
const COOKIE_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;

export type Context = {
  employeeId: number | null;
  sessionToken: string | null;
  setSessionCookie: (token: string) => void;
  clearSessionCookie: () => void;
};

export default async function ctx(req: Request, res: Response): Promise<Context> {
  const sessionToken = parseCookie(req.headers.cookie ?? '')[SESSION_COOKIE] ?? null;
  const employeeId = sessionToken ? await Auth.authenticate(sessionToken) : null;

  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.COOKIE_SECURE,
    path: '/',
  };

  return {
    employeeId,
    sessionToken,
    setSessionCookie: (token) => res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: COOKIE_MAX_AGE_MS }),
    clearSessionCookie: () => res.clearCookie(SESSION_COOKIE, cookieOptions),
  };
}
