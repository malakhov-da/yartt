# yartt

A task tracker without projects, subtasks or assignments. The whole domain,
access rules and invariants are described in `db.sql` (COMMENT ON) — it is
the specification; read it before any work.

## Language

- Everything is in English: code, comments, `db.sql`, documentation,
  commit messages.
- The only exception is user-facing translations: `client/i18n/<locale>.ts`.

## Delivery

- One installation = one company. No multi-tenancy.
- The company deploys the system itself: one Docker image, PostgreSQL is
  external (`DATABASE_URL`). No docker-compose.
- Express serves both the API and the built client (static files) — no nginx.
- On startup: the schema (under an advisory lock), then the first employee
  from `.env` (`FIRST_EMPLOYEE_*`) if `employee` is empty. There are no
  roles and no admins: the first employee is an ordinary employee.

## Stack

- One `package.json` at the root, npm. Folders `server/`, `client/`, `shared/`.
  `dependencies` — only what the server needs at runtime (the image runs
  `npm ci --omit=dev`); the client and tooling — `devDependencies`.
- `shared/` is plain code without its own dependencies. Imports across
  folders use subpath imports from `package.json`: `#shared/errors.ts`,
  `#client/hooks/trpc.ts`. Node, tsc and Vite all understand them. Within
  a folder — relative imports.
- The client imports only `#shared/*`, never the server. The tRPC router
  type comes from `#shared/types.ts` (a type-only re-export).
- server: Node.js, TypeScript, Express, tRPC, zod, superjson, date-fns +
  @date-fns/tz. Node reads `.env` itself (`--env-file-if-exists`), no dotenv.
- Database: PostgreSQL through the `postgres` library (porsager), queries
  are `sql```. No ORM: the logic lives in triggers, functions, partial
  indexes and EXCLUDE constraints.
- client: React, Vite, React Query (through tRPC), Zustand, MUI.
- Localization from day one: UI texts go through keys, the server returns
  error codes, never texts. The employee's language is `employee.locale`.
- Major versions are pinned deliberately: TypeScript 5, Vite 7, MUI 7,
  React Router 7, Vitest 3. Moving to the next majors is a separate task.
- The server is not built: Node 24 runs TypeScript directly. Hence only
  erasable syntax (`erasableSyntaxOnly`: no enum, namespace, parameter
  properties) and relative imports with the `.ts` extension.

## Structure

```
server/
  index.ts          — startup: schema, first employee, express (/api + client static), worker
  env.ts            — zod schema of the environment (a new variable goes here and to .env.example)
  pg.ts             — `sql` (the postgres library)
  ctx.ts            — tRPC context: the employee from the session cookie
  trpc.ts           — initTRPC: router, procedure, authedProcedure, error format
  api.ts            — mounts /api/trpc
  trpc/index.ts     — root router; keys are client namespaces (trpc.Employee.list)
  trpc/<Entity>.ts  — an entity router: procedure descriptions only
  services/<Entity>.ts — SQL and business logic
  errors.ts         — AppError, Postgres errors -> codes
  migrate.ts, migrations/, bootstrap.ts, worker.ts, webhook.ts
shared/
  <entity>.ts       — zod schemas shared by the client and the server
  errors.ts         — error codes and the error.data shape
  types.ts          — root router type for the client
client/
  main.tsx          — providers; errors of all queries -> showError
  theme.ts          — MUI theme
  hooks/trpc.ts     — useTRPC(); hooks/store.ts — zustand, showError/showInfo; hooks/me.ts — useMe()
  i18n/             — translations (ru.ts is the reference), errors.ts — error texts
  components/App.tsx — the `pages` array (header tabs) and the layout
  components/App/   — header, notifications
  components/<Name>Page.tsx, components/<Name>Page/ — pages and their parts
tests/              — vitest against a real PostgreSQL
```

Adding an API: schemas — `shared/<entity>.ts`, SQL — `server/services/<Entity>.ts`,
procedures — `server/trpc/<Entity>.ts`, wire it in `server/trpc/index.ts`.
On the client: `useQuery(trpc.<Entity>.<procedure>.queryOptions(input))`.

Adding a page: a component in `client/components/<Name>Page.tsx` and an
entry in the `pages` array in `client/components/App.tsx`.

## Database

- `db.sql` always describes the whole current schema; its version
  (major.minor) is in `INSERT INTO schema_version`. A new installation
  applies `db.sql` in one step.
- Until 1.0 is released all schema changes go to `db.sql` only; there are
  no migrations.
- Releasing 1.0: `db.sql` is copied to `server/migrations/1.0.sql` (a snapshot).
- Every later release that changes the schema: a migration
  `server/migrations/<from>-<to>.sql` + a change in `db.sql` + a new version
  there. Minor — `X.Y-X.(Y+1)`, major — only from the last minor,
  `X.last-(X+1).0`. The version history (`schema_version`, entered_at /
  expired_at) is kept by the migrator; migration files never touch it.
  No downgrades. Patch releases never change the schema.
- The whole migration chain is one transaction with `lock_timeout` 30s.
  So migrations cannot use `CREATE INDEX CONCURRENTLY` or `VACUUM` (the
  migrator and the test reject them). A backup before an upgrade is the
  administrator's job, not the application's.
- A migration of an unreleased version is a draft and may be edited (local
  databases are recreated). Released migrations never change.
- `tests/schema.test.ts`: snapshot + migration chain must give the same
  result as a fresh `db.sql`.
- Business rules live in the database (triggers, functions). A rule error:
  `RAISE EXCEPTION '<message for logs>' USING HINT = '<code>'
  [, DETAIL = json_build_object(...)::text]`. The code is added to
  `shared/errors.ts` and to the translations `client/i18n/*.ts`;
  DETAIL carries the parameters for the message template.
  Constraint violations map to a code by constraint name in `server/errors.ts`.
- `postgres` converts columns to camelCase: snake_case in SQL, camelCase
  in TS. `DATE` comes as a `YYYY-MM-DD` string, `BIGINT` as a string.

## Contracts and data

- Procedure inputs and outputs are zod schemas in `shared/`; types are
  inferred from them (`z.infer`), never duplicated by hand. A schema and
  its type share a name: `Employee` is both.
- Every procedure has `.input()` (if it takes input) and `.output()`.
- Everything that comes from the database is parsed with a zod schema
  right at the query: `Employee.array().parse(await sql\`...\`)`. No
  helpers and no `sql<T>` — that is an unchecked type cast.
- superjson: a `Date` from the database reaches the client as a `Date`.
- Every procedure has JSDoc: what it does, who may call it,
  `@throws <code>`. It shows up in client-side hints.

## Errors and localization

- The server never builds a message. An error carries a code
  (`message` and `data.appCode`), parameters (`data.params`) and, for
  validation, zod issues without text (`data.issues`).
- The message template depends on the locale and is applied on the client:
  - business errors — `errors.<code>` in `client/i18n/*.ts`, parameters
    substituted as `{{taskId}}`;
  - field errors — zod's built-in locales (`zod/locales`), `fieldErrors()`.
- The English text of `RAISE EXCEPTION` is for server logs and psql only;
  users never see it.
- Errors of all queries are shown in a snackbar automatically; forms
  additionally highlight fields.
- Translations are TS objects (`client/i18n/ru.ts` is the reference,
  `en.ts` is typed by it), so a missing key is a compile error.

## Code style

- React components — `export default function (p: {...})`.
- Styling — MUI only: `sx`, `styled()`, the theme. No CSS files.

## Processes

- The API (Express + tRPC) and the worker come from one code base and one
  image. `ROLE=all` (default) — both in one process; `ROLE=api` /
  `ROLE=worker` — to split them across containers.
- The worker: notification delivery and the cron jobs from `db.sql`
  (CRON section). Safe with several instances: the queue uses
  `FOR UPDATE SKIP LOCKED`, every cron job runs under an advisory lock.
- Every outgoing message (notifications, sign-in links, invites) goes only
  through the outgoing webhook (URL and secret in `.env`, body signed with
  HMAC-SHA256). Email, Telegram, etc. are up to the webhook receiver.
- UI updates — polling through React Query; WebSocket only if ever needed.

## Interface

- Comments are never edited. After "Send" a comment stays in the
  interface for a few seconds with a "Back to editing" button and only
  then goes to the server.

## Commands

- `npm run dev` — server (:3000, `node --watch`) and client (:5173, proxy `/api`).
- `npm run typecheck` — `tsconfig.json` (server + shared + tests) and `client/tsconfig.json`.
- `TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm test`

## Tests

- vitest against a real PostgreSQL: business rules live in triggers, mocks
  would not check them. A run creates its own database and drops it after.
- Procedures are tested through `createCaller` (`tests/helpers.ts`), the
  webhook through `vi.mock('../server/webhook.ts')`. The HTTP error format —
  `tests/errors.test.ts`.

## Scope

- Stage one: sign-in by link, employees and invites, tasks with tags and
  search, deadlines, observers and requests, comments with attachments and
  mentions, timesheet, time entries, scores, notification delivery to the
  webhook.
- Stage two: dependencies, reminders, avatars and tag colors.
- No import from other trackers for now.
