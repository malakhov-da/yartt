-- 0.0 -> 0.1: the demo is a version of its own. A database the demo filled
-- (DEMO_DATA) has demo as its current schema_version: the migrator refuses
-- it, and the demo wipes only such a database.

ALTER TABLE schema_version
    DROP CONSTRAINT schema_version_version_check,
    ADD CONSTRAINT schema_version_version_check CHECK (version ~ '^([0-9]+\.[0-9]+|demo)$');

COMMENT ON TABLE schema_version IS
'History of database schema versions (major.minor). Current = expired_at IS NULL.
Matches the product version without the patch (patches never change the schema).
Installation: a single row with the db.sql version.
Migrations — server/migrations/<from>-<to>.sql:
  - minor: X.Y-X.(Y+1);
  - major: only from the last minor, X.last-(X+1).0.
At every step the application closes the current row and opens a new one.
The whole chain is one transaction: on failure the database stays at the
old version. No downgrades.
demo — the database holds the demo company (DEMO_DATA, server/demo.ts): it is
installed from db.sql and seeded, then this row closes the installed version;
entered_at is when it was seeded. A demo is never migrated, only wiped and
seeded afresh, and only a database whose current version is demo is ever
wiped; the migrator refuses it, and the demo refuses a database with tables
and any other version — made-up and real data never pass for each other.';

COMMENT ON COLUMN schema_version.version IS
'Schema version major.minor, or demo for the demo company.';
