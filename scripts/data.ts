// Test data as plain SQL: dumped from a database, loaded into another, and
// compared table by table. Used to check that migrations carry data, not only
// the schema (tests/schema.test.ts, docs/engineering/testing.md).

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
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
export async function dumpData(db: Sql): Promise<string> {
  // Moments are written in UTC and rows sorted bytewise: the text must not
  // depend on the time zone or the collation of the PostgreSQL server it was
  // dumped on (a developer's vs CI's).
  return db.begin(async (sql) => {
    await sql`SET LOCAL TIME ZONE 'UTC'`;
    const out = ['-- Test data (scripts/data.ts). Loaded with triggers off: the rows are as they were.', ''];
    for (const table of await tables(db)) {
      const cols = await writable(db, table);
      const list = cols.map((c) => `"${c}"`).join(', ');
      const rows = Line.array().parse(await sql.unsafe(`
        SELECT format('INSERT INTO %I (%s) SELECT %s FROM json_populate_record(NULL::%I, %L);',
                      '${table}', '${list.replace(/'/g, "''")}', '${list.replace(/'/g, "''")}', '${table}',
                      json_build_object(${cols.map((c) => `'${c}', t."${c}"`).join(', ')})::text) AS line
          FROM public."${table}" t
         ORDER BY to_jsonb(t)::text COLLATE "C"
      `));
      if (rows.length === 0) continue;
      out.push(`-- ${table}`, ...rows.map((r) => r.line), '');
    }
    return out.join('\n');
  });
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

/** When each release X.Y was made, by version: the commit time of its tag X.Y.0. */
export function releaseMoments(): Record<string, string> {
  const root = join(import.meta.dirname, '..');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  return Object.fromEntries(git('tag', '--list', '[0-9]*.[0-9]*.0').split('\n').filter(Boolean)
    .map((tag) => [tag.replace(/\.0$/, ''), git('log', '-1', '--format=%cI', tag)]));
}

/**
 * Pins now() of a fresh database to the moment of a release while the
 * database is at that release's schema version (the real now() at any other):
 * a migration step from X.Y runs as of X.Y.0, as when `npm run fixture --
 * --migrate` turned that release's data into the next one. What a step derives
 * from now() — a deadline passed or not — then comes out the same in the
 * fixture and in every later test run. A now() of its own comes before
 * pg_catalog in the search path, so it is set on the database before anything
 * else connects: `db` is a connection used for this only, then closed.
 */
export async function pinClock(db: Sql, moments: Record<string, string>): Promise<void> {
  await db.unsafe(`
    CREATE SCHEMA clock;
    CREATE TABLE clock.release (version TEXT PRIMARY KEY, at TIMESTAMPTZ NOT NULL);
    CREATE FUNCTION clock.now() RETURNS TIMESTAMPTZ AS $$
    DECLARE
        v_at TIMESTAMPTZ;
    BEGIN
        IF to_regclass('public.schema_version') IS NOT NULL THEN
            EXECUTE 'SELECT r.at FROM clock.release r JOIN public.schema_version s ON s.version = r.version
                      WHERE s.expired_at IS NULL' INTO v_at;
        END IF;
        RETURN COALESCE(v_at, pg_catalog.now());
    END;
    $$ LANGUAGE plpgsql STABLE;
    DO $$ BEGIN
        EXECUTE format('ALTER DATABASE %I SET search_path = public, clock, pg_catalog', current_database());
    END $$;
  `);
  for (const [version, at] of Object.entries(moments)) {
    await db`INSERT INTO clock.release (version, at) VALUES (${version}, ${at})`;
  }
}
