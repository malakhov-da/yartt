import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { Router } from 'express';
import ctx from './ctx.ts';
import trpc from './trpc/index.ts';

export default Router().use(
  '/trpc',
  createExpressMiddleware({ router: trpc, createContext: ({ req, res }) => ctx(req, res) }),
);
