import type { MyTags, SetTagInput } from '#shared/tags.ts';
import { MyTag } from '#shared/tags.ts';
import { z } from 'zod';
import { AppError } from '../errors.ts';
import { sql } from '../pg.ts';

export const PAGE_SIZE = 50;

/**
 * The tags of the tasks I see, with how many such tasks carry each and how
 * many are open, and my own color and weight. Tags I gave a color or a
 * weight come first, then by weight, by how often I meet them, by name.
 */
export async function mine(viewerId: number, query: string, page: number): Promise<MyTags> {
  const like = '%' + query.replace(/[\\%_]/g, '\\$&') + '%';
  const tags = sql`
    SELECT t.id, t.name, u.color, COALESCE(u.weight, 0) AS weight,
           count(*)::int AS tasks,
           count(*) FILTER (WHERE f.value IS NULL OR f.value > NOW())::int AS open,
           (u.tag_id IS NOT NULL) AS personal
      FROM task k
      CROSS JOIN LATERAL unnest(k.tag_ids) AS kt(id)
      JOIN tag t ON t.id = kt.id
      LEFT JOIN finished_at f ON f.task_id = k.id AND f.expired_at IS NULL
      LEFT JOIN user_tag u ON u.tag_id = t.id AND u.employee_id = ${viewerId}
     WHERE can_see(k.id, ${viewerId}) AND t.name ILIKE ${like}
     GROUP BY t.id, t.name, u.tag_id, u.color, u.weight
  `;
  const items = MyTag.array().parse(await sql`
    SELECT id, name, color, weight, tasks, open FROM (${tags}) x
     ORDER BY personal DESC, weight DESC, tasks DESC, name
     LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
  `);
  const [count] = z.object({ n: z.number() }).array().parse(await sql`SELECT count(*)::int AS n FROM (${tags}) x`);
  return { items, total: count?.n ?? 0 };
}

/** My color and weight of a tag; the default ones (no color, weight 0) remove my row. */
export async function set(employeeId: number, input: SetTagInput): Promise<void> {
  const [exists] = z.object({ value: z.boolean() }).array().parse(await sql`
    SELECT EXISTS (SELECT 1 FROM tag WHERE id = ${input.tagId}) AS value
  `);
  if (!exists?.value) throw new AppError('not_found');
  if (input.color === null && input.weight === 0) {
    await sql`DELETE FROM user_tag WHERE employee_id = ${employeeId} AND tag_id = ${input.tagId}`;
    return;
  }
  await sql`
    INSERT INTO user_tag (employee_id, tag_id, color, weight)
    VALUES (${employeeId}, ${input.tagId}, ${input.color}, ${input.weight})
    ON CONFLICT (employee_id, tag_id) DO UPDATE SET color = EXCLUDED.color, weight = EXCLUDED.weight
  `;
}
