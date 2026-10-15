import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { Router } from 'express';
import attachments from './attachments.ts';
import avatars from './avatars.ts';
import ctx from './ctx.ts';
import trpc from './trpc/index.ts';

export default Router()
  .use('/trpc', createExpressMiddleware({ router: trpc, createContext: ({ req, res }) => ctx(req, res) }))
  .use('/attachments', attachments)
  .use('/avatars', avatars);
