import { createHash } from 'node:crypto';
import { z } from 'zod';
import { sql } from '../pg.ts';
import { assertReadable } from './Task.ts';

const Id = z.object({ id: z.number() });
const File = z.object({ mime: z.string(), value: z.instanceof(Buffer) });

/**
 * Stores a file and returns its id. The same bytes uploaded again return
 * the same row (deduplication by hash, size and content), and the uploader
 * is remembered so they may read it before it is attached anywhere.
 */
export async function upload(employeeId: number, value: Buffer, mime: string): Promise<number> {
  const hash = createHash('sha256').update(value).digest();
  return sql.begin(async (tx) => {
    const [existing] = Id.array().parse(await tx`
      SELECT id FROM attachment
       WHERE hash = ${hash} AND size = ${value.length} AND value = ${value}
       LIMIT 1
       FOR UPDATE
    `);
    if (existing) {
      await tx`
        UPDATE attachment
           SET used_at = NOW(),
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

/** The file, if the employee uploaded it or sees a task that refers to it. */
export async function read(employeeId: number, id: number): Promise<z.infer<typeof File>> {
  await assertReadable([id], employeeId);
  const [file] = File.array().parse(await sql`SELECT mime, value FROM attachment WHERE id = ${id}`);
  return file!;
}
