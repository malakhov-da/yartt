import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';
import { afterAll, describe, expect, inject, test } from 'vitest';
import { connect, sql } from '../server/pg.ts';
import {
  MIGRATIONS_DIR, checkMigrationSql, migrate, parseMigrations, parseVersion, planMigrations,
} from '../server/migrate.ts';

// Schema fingerprint: everything db.sql defines except data.
const FINGERPRINT = `
  SELECT 'column' AS kind, table_name || '.' || column_name AS name,
         concat_ws(' ', data_type, udt_name, is_nullable, column_default) AS def
    FROM information_schema.columns
   WHERE table_schema = 'public'
  UNION ALL
  SELECT 'constraint', conrelid::regclass || '.' || conname, pg_get_constraintdef(oid)
    FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace
  UNION ALL
  SELECT 'index', indexname, indexdef
    FROM pg_indexes
   WHERE schemaname = 'public'
  UNION ALL
  SELECT 'function', p.oid::regprocedure::text, pg_get_functiondef(p.oid)
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  UNION ALL
  SELECT 'trigger', tgrelid::regclass || '.' || tgname, pg_get_triggerdef(oid)
    FROM pg_trigger
   WHERE NOT tgisinternal
  UNION ALL
  SELECT 'type', t.typname, array_to_string(array_agg(e.enumlabel ORDER BY e.enumsortorder), ',')
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
   GROUP BY t.typname
  UNION ALL
  SELECT 'comment', classoid::regclass || ':' || objoid || ':' || objsubid, description
    FROM pg_description
   WHERE classoid = 'pg_namespace'::regclass
  UNION ALL
  SELECT 'version', 'schema_version', version FROM schema_version WHERE expired_at IS NULL
  ORDER BY 1, 2
`;

describe('migration chain rules', () => {
  const v = parseVersion;

  test('minor and major steps', () => {
    const migrations = parseMigrations(['0.0-0.1.sql', '0.1-1.0.sql', '1.0-1.1.sql', '1.1-2.0.sql']);
    expect(planMigrations(migrations, v('0.0'), v('2.0')).map((m) => m.file))
      .toEqual(['0.0-0.1.sql', '0.1-1.0.sql', '1.0-1.1.sql', '1.1-2.0.sql']);
    expect(planMigrations(migrations, v('1.1'), v('2.0')).map((m) => m.file)).toEqual(['1.1-2.0.sql']);
  });

  test('invalid steps are rejected', () => {
    expect(() => parseMigrations(['1.0-1.2.sql'])).toThrow();
    expect(() => parseMigrations(['1.2-2.1.sql'])).toThrow();
    expect(() => parseMigrations(['1.2-3.0.sql'])).toThrow();
  });

  test('major step only from the last minor', () => {
    expect(() => parseMigrations(['1.1-1.2.sql', '1.1-2.0.sql'])).toThrow(/last minor/);
  });

  test('non-transactional commands are rejected', () => {
    expect(() => checkMigrationSql('1.0-1.1.sql', 'CREATE INDEX CONCURRENTLY i ON t(x);')).toThrow(/CONCURRENTLY/);
    expect(() => checkMigrationSql('1.0-1.1.sql', 'vacuum t;')).toThrow(/VACUUM/);
    expect(() => checkMigrationSql('1.0-1.1.sql', '-- no CONCURRENTLY here\nCREATE INDEX i ON t(x);')).not.toThrow();
    expect(() => checkMigrationSql('1.0-1.1.sql', "COMMENT ON TABLE t IS 'never vacuumed ''concurrently''';")).not.toThrow();
  });

  test('missing path is an error', () => {
    const migrations = parseMigrations(['1.0-1.1.sql']);
    expect(() => planMigrations(migrations, v('1.0'), v('1.2'))).toThrow(/No migration path/);
  });
});

// Every released version upgrades to exactly the schema of db.sql: the
// database is built from db.sql as it was at the release tag, migrated with
// the migrations of today, and compared with a fresh db.sql. The same
// version at a tag and now means the same schema — a change without a new
// version and a migration fails here. Nothing released, nothing to check.
const files = await readdir(MIGRATIONS_DIR);
const releases = (() => {
  try {
    return execFileSync('git', ['tag', '--list', 'v*'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return []; // no git (an unpacked tree): nothing to compare with
  }
})();

test('released migrations are transactional', async () => {
  for (const m of parseMigrations(files)) {
    checkMigrationSql(m.file, await readFile(join(MIGRATIONS_DIR, m.file), 'utf8'));
  }
});

describe.skipIf(releases.length === 0)('db.sql', () => {
  const name = `yartt_release_${process.pid}`;
  const admin = postgres(inject('adminUrl'), { onnotice: () => {} });

  afterAll(async () => {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
  });

  test.each(releases)('is what %s becomes by the migrations', async (tag) => {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE ${name}`);
    const url = new URL(inject('adminUrl'));
    url.pathname = `/${name}`;
    const released = connect(url.toString());
    try {
      await released.unsafe(execFileSync('git', ['show', `${tag}:db.sql`], { encoding: 'utf8' }));
      await migrate(released);
      expect(await released.unsafe(FINGERPRINT)).toEqual(await sql.unsafe(FINGERPRINT));
    } finally {
      await released.end();
    }
  });
});
