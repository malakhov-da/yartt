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

/** The bytes of the files the person holds: their quota taken. */
async function usedBytes(employeeId: number, db = sql): Promise<number> {
  const [row] = Used.array().parse(await db`
    SELECT COALESCE(sum(size), 0) AS bytes FROM attachment WHERE held_by @> ARRAY[${employeeId}::int]
  `);
  return row!.bytes;
}

/** Refuses a file that would not fit in the person's quota. */
async function assertFits(employeeId: number, size: number, db = sql): Promise<void> {
  const used = await usedBytes(employeeId, db);
  if (used + size > env.FILE_QUOTA_MB * MB) {
    throw new AppError('file_quota', { quotaMb: env.FILE_QUOTA_MB, usedMb: Math.round((used / MB) * 10) / 10 });
  }
}

/**
 * Stores a file and returns its id (decision 84). The same bytes uploaded
 * again return the same row (deduplication by hash, size and content) — or
 * bring back the content of a deleted one with that hash and size, so every
 * link to it works again. The uploader holds it: it counts in their quota.
 * @throws file_too_big, file_quota
 */
export async function upload(employeeId: number, value: Buffer, mime: string): Promise<number> {
  if (value.length > maxBytes()) throw new AppError('file_too_big', { maxMb: maxBytes() / MB });
  const hash = createHash('sha256').update(value).digest();
  return sql.begin(async (tx) => {
    // One upload of a person at a time: the quota is checked against what is there.
    await tx`SELECT pg_advisory_xact_lock(hashtext('yartt.upload'), ${employeeId})`;
    const [existing] = z.object({ id: z.number(), held: z.boolean() }).array().parse(await tx`
      SELECT id, held_by @> ARRAY[${employeeId}::int] AS held FROM attachment
       WHERE hash = ${hash} AND size = ${value.length} AND (value IS NULL OR value = ${value})
       ORDER BY value IS NULL
       LIMIT 1
       FOR UPDATE
    `);
    // Held already: nothing new takes my space.
    if (!existing?.held) await assertFits(employeeId, value.length, tx as unknown as typeof sql);
    if (existing) {
      await tx`
        UPDATE attachment
           SET used_at = NOW(), value = COALESCE(value, ${value}), purged_at = NULL,
               held_by = CASE WHEN held_by @> ARRAY[${employeeId}::int] THEN held_by ELSE held_by || ${employeeId}::int END,
               uploaded_by = CASE WHEN uploaded_by @> ARRAY[${employeeId}::int] THEN uploaded_by
                                  ELSE uploaded_by || ${employeeId}::int END
         WHERE id = ${existing.id}
      `;
      return existing.id;
    }
    const [row] = Id.array().parse(await tx`
      INSERT INTO attachment (hash, size, mime, value, uploaded_by, held_by)
      VALUES (${hash}, ${value.length}, ${mime}, ${value}, ${[employeeId]}, ${[employeeId]})
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
  held: z.boolean(),
  holders: z.number(),
  size: z.number(),
  mime: z.string(),
  addedAt: z.date(),
  usedAt: z.date(),
  purgedAt: z.date().nullable(),
  names: z.string().array(),
  taskIds: z.number().array(),
});

/**
 * The files someone holds, then the ones they uploaded and let go, the
 * newest first, with what they take of the quota (decision 84): the names
 * they go by in comments and the tasks they are in, how many hold them.
 */
export async function mine(employeeId: number): Promise<{ files: MyFile[]; usedBytes: number; quotaBytes: number }> {
  const files = MyFileRow.array().parse(await sql`
    SELECT a.id, a.held_by @> ARRAY[${employeeId}::int] AS held, cardinality(a.held_by) AS holders,
           a.size, a.mime, a.added_at, a.used_at, a.purged_at,
           COALESCE(ARRAY(SELECT DISTINCT c.attachment_names[array_position(c.attachment_ids, a.id)]
                            FROM comment c WHERE c.attachment_ids @> ARRAY[a.id]), '{}') AS names,
           COALESCE(ARRAY(SELECT DISTINCT c.task_id FROM comment c
                           WHERE c.attachment_ids @> ARRAY[a.id] OR c.image_ids @> ARRAY[a.id]
                          UNION SELECT k.id FROM task k WHERE k.context_image_ids @> ARRAY[a.id]), '{}') AS task_ids
      FROM attachment a
     WHERE a.uploaded_by @> ARRAY[${employeeId}::int] OR a.held_by @> ARRAY[${employeeId}::int]
     ORDER BY a.held_by @> ARRAY[${employeeId}::int] DESC, a.added_at DESC
     LIMIT 200
  `);
  return {
    files,
    usedBytes: await usedBytes(employeeId),
    quotaBytes: env.FILE_QUOTA_MB * MB,
  };
}

/**
 * Keeps a file the employee sees (in a task, or uploaded by them): it counts
 * in their quota and stays while they hold it, whoever else lets it go.
 * @throws unknown_attachment, file_purged, file_quota
 */
export async function keep(employeeId: number, id: number): Promise<void> {
  await sql.begin(async (tx) => {
    const db = tx as unknown as typeof sql;
    await assertReadable([id], employeeId, db);
    await tx`SELECT pg_advisory_xact_lock(hashtext('yartt.upload'), ${employeeId})`;
    const [row] = z.object({ size: z.number(), held: z.boolean() }).array().parse(await tx`
      SELECT size, held_by @> ARRAY[${employeeId}::int] AS held FROM attachment WHERE id = ${id} FOR UPDATE
    `);
    if (!row!.held) await assertFits(employeeId, row!.size, db);
    await tx`SELECT keep_attachment(${id}, ${employeeId})`;
  });
}

/** Lets a file go, to free the quota; the last one to let it go deletes its content, the links say so. */
export async function release(employeeId: number, id: number): Promise<void> {
  await sql`SELECT release_attachment(${id}, ${employeeId})`;
}
