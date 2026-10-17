// Test data as plain SQL: dumped from a database, loaded into another, and
// compared table by table. Used to check that migrations carry data, not only
// the schema (tests/schema.test.ts, docs/engineering/testing.md).

import { z } from 'zod';
import type { Sql } from '../server/pg.ts';

/** Kept by the migrator, not data: a fresh install writes its own. */
const SKIP = new Set(['schema_version']);

const Table = z.object({ name: z.string() });
const Column = z.object({ name: z.string() });
const Line = z.object({ line: z.string() });

async function tables(sql: Sql): Promise<string[]> {
  return Table.array().parse(await sql`
    SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `).map((t) => t.name).filter((t) => !SKIP.has(t));
}

/**
 * Columns a row is written with, by name: generated ones are computed by the
 * database, and the order of columns in a table depends on how it was built
 * (a migration adds a column at the end), so it is not part of the data.
 */
async function writable(sql: Sql, table: string): Promise<string[]> {
  return Column.array().parse(await sql`
    SELECT attname AS name FROM pg_attribute
     WHERE attrelid = ${`public.${table}`}::regclass AND attnum > 0 AND NOT attisdropped AND attgenerated = ''
     ORDER BY attname
  `).map((c) => c.name);
}

/**
 * Every row of every table as an INSERT, in a stable order (by the whole
 * row), values carried as JSON so every type comes back exactly.
 */
export async function dumpData(sql: Sql): Promise<string> {
  const out = ['-- Test data (scripts/data.ts). Loaded with triggers off: the rows are as they were.', ''];
  for (const table of await tables(sql)) {
    const cols = await writable(sql, table);
    const list = cols.map((c) => `"${c}"`).join(', ');
    const rows = Line.array().parse(await sql.unsafe(`
      SELECT format('INSERT INTO %I (%s) SELECT %s FROM json_populate_record(NULL::%I, %L);',
                    '${table}', '${list.replace(/'/g, "''")}', '${list.replace(/'/g, "''")}', '${table}',
                    json_build_object(${cols.map((c) => `'${c}', t."${c}"`).join(', ')})::text) AS line
        FROM public."${table}" t
       ORDER BY to_jsonb(t)::text
    `));
    if (rows.length === 0) continue;
    out.push(`-- ${table}`, ...rows.map((r) => r.line), '');
  }
  return out.join('\n');
}

/** Loads dumped data as it is: triggers and foreign key checks off, then sequences moved past the rows. */
export async function loadData(sql: Sql, text: string): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe('SET LOCAL session_replication_role = replica');
    await tx.unsafe(text);
    await tx.unsafe(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN SELECT s.relname AS seq, t.relname AS tab, a.attname AS col
                   FROM pg_class s
                   JOIN pg_depend d ON d.objid = s.oid AND d.deptype = 'a'
                   JOIN pg_class t ON t.oid = d.refobjid
                   JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
                  WHERE s.relkind = 'S'
        LOOP
          EXECUTE format('SELECT setval(%L, COALESCE((SELECT max(%I) FROM %I), 0) + 1, false)', r.seq, r.col, r.tab);
        END LOOP;
      END $$;
    `);
  });
}

/** Every table's rows (as JSONB — keys in a fixed order, whatever the columns' order — sorted): what two databases must agree on. */
export async function dataOf(sql: Sql): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  for (const table of await tables(sql)) {
    result[table] = Line.array().parse(await sql.unsafe(`
      SELECT to_jsonb(t)::text AS line FROM public."${table}" t ORDER BY 1
    `)).map((r) => r.line);
  }
  return result;
}
