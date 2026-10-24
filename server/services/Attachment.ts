import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { MyFile } from '#shared/comment.ts';
import env from '../env.ts';
import { AppError } from '../errors.ts';
import { sql } from '../pg.ts';
import { assertReadable } from './Task.ts';

const MB = 1024 * 1024;
const Id = z.object({ id: z.number() });
const File = z.object({ mime: z.string(), value: z.instanceof(Buffer).nullable(), purgedAt: z.date().nullable() });
const Used = z.object({ bytes: z.coerce.number() });

/** The largest file, in bytes: the configuration's, the demo's 2 MB. */
export const maxBytes = () => (env.DEMO_DATA ? 2 : env.FILE_MAX_MB) * MB;

/** The bytes of the files with content that count in the person's quota. */
async function usedBytes(employeeId: number, db = sql): Promise<number> {
  const [row] = Used.array().parse(await db`
    SELECT COALESCE(sum(size), 0) AS bytes FROM attachment WHERE uploaded_by @> ARRAY[${employeeId}::int] AND value IS NOT NULL
  `);
  return row!.bytes;
}

/**
 * Stores a file and returns its id (decision 84). The same bytes uploaded
 * again return the same row (deduplication by hash, size and content) — or
 * bring back the content of a purged one with that hash and size, so every
 * link to it works again. The uploader is remembered: they may read it
 * before it is attached anywhere, and it counts in their quota.
 * @throws file_too_big, file_quota
 */
export async function upload(employeeId: number, value: Buffer, mime: string): Promise<number> {
  if (value.length > maxBytes()) throw new AppError('file_too_big', { maxMb: maxBytes() / MB });
  const hash = createHash('sha256').update(value).digest();
  return sql.begin(async (tx) => {
    // One upload of a person at a time: the quota is checked against what is there.
    await tx`SELECT pg_advisory_xact_lock(hashtext('yartt.upload'), ${employeeId})`;
    const [existing] = z.object({ id: z.number(), mine: z.boolean(), purged: z.boolean() }).array().parse(await tx`
      SELECT id, uploaded_by @> ARRAY[${employeeId}::int] AS mine, value IS NULL AS purged FROM attachment
       WHERE hash = ${hash} AND size = ${value.length} AND (value IS NULL OR value = ${value})
       ORDER BY value IS NULL
       LIMIT 1
       FOR UPDATE
    `);
    // Already counted for me: nothing new takes my space.
    const counted = existing && existing.mine && !existing.purged;
    if (!counted) {
      const used = await usedBytes(employeeId, tx as unknown as typeof sql);
      if (used + value.length > env.FILE_QUOTA_MB * MB) {
        throw new AppError('file_quota', { quotaMb: env.FILE_QUOTA_MB, usedMb: Math.round((used / MB) * 10) / 10 });
      }
    }
    if (existing) {
      await tx`
        UPDATE attachment
           SET used_at = NOW(),
               value = COALESCE(value, ${value}),
               purged_at = NULL,
               uploaded_by = CASE WHEN uploaded_by @> ARRAY[${employeeId}::int] THEN uploaded_by
                                  ELSE uploaded_by || ${employeeId}::int END
         WHERE id = ${existing.id}
      `;
      return existing.id;
    }
    const [row] = Id.array().parse(await tx`
      INSERT INTO attachment (hash, size, mime, value, uploaded_by)
      VALUES (${hash}, ${value.length}, ${mime}, ${value}, ${[employeeId]})
      RETURNING id
    `);
    return row!.id;
  });
}

/**
 * The file, if the employee uploaded it or sees a task that refers to it.
 * @throws file_purged — its content was deleted; the same file uploaded again brings it back.
 */
export async function read(employeeId: number, id: number): Promise<{ mime: string; value: Buffer }> {
  await assertReadable([id], employeeId);
  const [file] = File.array().parse(await sql`SELECT mime, value, purged_at FROM attachment WHERE id = ${id}`);
  if (!file!.value) throw new AppError('file_purged');
  return { mime: file!.mime, value: file!.value };
}

const MyFileRow = z.object({
  id: z.number(),
  size: z.number(),
  mime: z.string(),
  addedAt: z.date(),
  usedAt: z.date(),
  purgedAt: z.date().nullable(),
  names: z.string().array(),
  taskIds: z.number().array(),
});

/**
 * The files someone uploaded, the newest first, with what they take of the
 * quota (decision 84): the names they go by in comments and the tasks they
 * are in, the deleted ones too — the history of what was uploaded.
 */
export async function mine(employeeId: number): Promise<{ files: MyFile[]; usedBytes: number; quotaBytes: number; bigBytes: number; bigDays: number }> {
  const files = MyFileRow.array().parse(await sql`
    SELECT a.id, a.size, a.mime, a.added_at, a.used_at, a.purged_at,
           COALESCE(ARRAY(SELECT DISTINCT c.attachment_names[array_position(c.attachment_ids, a.id)]
                            FROM comment c WHERE c.attachment_ids @> ARRAY[a.id]), '{}') AS names,
           COALESCE(ARRAY(SELECT DISTINCT c.task_id FROM comment c
                           WHERE c.attachment_ids @> ARRAY[a.id] OR c.image_ids @> ARRAY[a.id]
                          UNION SELECT k.id FROM task k WHERE k.context_image_ids @> ARRAY[a.id]), '{}') AS task_ids
      FROM attachment a
     WHERE a.uploaded_by @> ARRAY[${employeeId}::int]
     ORDER BY a.added_at DESC
     LIMIT 200
  `);
  return {
    files,
    usedBytes: await usedBytes(employeeId),
    quotaBytes: env.FILE_QUOTA_MB * MB,
    bigBytes: env.FILE_BIG_MB * MB,
    bigDays: env.FILE_BIG_DAYS,
  };
}

/** Deletes the content of a file the employee uploaded, to free their quota; the links say it is gone. */
export async function purge(employeeId: number, id: number): Promise<void> {
  await sql`SELECT purge_attachment(${id}, ${employeeId})`;
}

/** The worker's job: big files unused too long lose their content. */
export async function purgeOld(db = sql): Promise<void> {
  await db`SELECT purge_old_attachments(${env.FILE_BIG_MB * MB}, ${env.FILE_BIG_DAYS})`;
}
