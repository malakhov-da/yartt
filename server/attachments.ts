import express, { Router, type Request, type Response } from 'express';
import ctx from './ctx.ts';
import env from './env.ts';
import { AppError } from './errors.ts';
import * as Attachments from './services/Attachment.ts';

// Files go around tRPC: raw bytes in, raw bytes out.
//   POST /api/attachments  (body: the file, Content-Type: its type) -> { id }
//   GET  /api/attachments/:id[?name=file.pdf]
// Errors answer with the same codes as the API: { appCode }.

// A demo is open to anyone: a small limit keeps a visitor from filling its database.
const MAX_SIZE = env.DEMO_DATA ? '2mb' : '25mb';
// Shown in the page; anything else is downloaded. SVG can carry scripts.
const INLINE = /^image\/(png|jpeg|gif|webp|avif)$/;

/** Who asks; a bot uploads only to comment (its `comment` permission). */
async function employeeId(req: Request, res: Response, upload = false): Promise<number | null> {
  const context = await ctx(req, res);
  if (context.employeeId === null) {
    res.status(401).json({ appCode: 'unauthorized' });
    return null;
  }
  if (upload && context.bot && !context.bot.includes('comment')) {
    res.status(403).json({ appCode: 'bot_not_permitted' });
    return null;
  }
  return context.employeeId;
}

function fail(res: Response, error: unknown) {
  if (error instanceof AppError) {
    const status = error.code === 'no_access' || error.code === 'forbidden' ? 403 : 404;
    res.status(status).json({ appCode: error.code });
    return;
  }
  console.error(error);
  res.status(500).json({ appCode: 'internal' });
}

export default Router()
  .post('/', express.raw({ type: () => true, limit: MAX_SIZE }), async (req, res) => {
    const id = await employeeId(req, res, true);
    if (id === null) return;
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ appCode: 'invalid_input' });
      return;
    }
    try {
      const mime = (req.headers['content-type'] ?? 'application/octet-stream').split(';')[0]!.trim().slice(0, 100);
      res.json({ id: await Attachments.upload(id, req.body, mime) });
    } catch (error) {
      fail(res, error);
    }
  })
  .get('/:id', async (req, res) => {
    const id = await employeeId(req, res);
    if (id === null) return;
    const attachmentId = Number(req.params.id);
    if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
      res.status(404).json({ appCode: 'not_found' });
      return;
    }
    try {
      const file = await Attachments.read(id, attachmentId);
      const name = typeof req.query.name === 'string' ? req.query.name : `attachment-${attachmentId}`;
      const inline = INLINE.test(file.mime);
      res
        .set({
          'Content-Type': inline ? file.mime : 'application/octet-stream',
          'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'",
          // Access may be revoked: the browser asks again every time.
          'Cache-Control': 'private, no-cache',
        })
        .send(file.value);
    } catch (error) {
      fail(res, error);
    }
  });
