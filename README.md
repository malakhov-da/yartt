# yartt

A task tracker without projects, subtasks or assignments. Installed by a
company on its own server.

## Installation

You need Docker and PostgreSQL 15+ (external). The database user must own
the database: the first start creates the extensions `citext`, `pgcrypto`,
`btree_gist`, `pg_trgm`.

```sh
docker build -t yartt .
docker run -d --name yartt -p 3000:3000 --env-file .env yartt
```

Environment variables are listed in [.env.example](.env.example). The
first start creates the schema and the first employee
(`FIRST_EMPLOYEE_EMAIL`, `FIRST_EMPLOYEE_NAME`). Everyone else is invited
from the interface.

### Upgrading

1. Back up the database. Downgrades are not supported, and only a backup
   can undo a mistake in a migration's logic.
2. Stop all instances of the old version.
3. Start the new image — it upgrades the schema itself.

The upgrade runs in one transaction: if anything goes wrong, the database
stays at the old version, the new instance exits with an error in the log,
and the old image can be started again. If a migration cannot get a lock
within 30 seconds (for example, an old instance is still running), it is
rolled back too.

A new major version can be reached only from the last minor one: for
example, 1.2 → 1.4 → 2.0 (upgrade to the latest 1.x first). The schema
version history is in the `schema_version` table.

### Webhook

The system never sends email itself. Every message (sign-in links,
invites, notifications) is sent as a POST request to `WEBHOOK_URL`:

```json
{
  "kind": "login",
  "to": { "employeeId": 1, "email": "a@b.c", "fullName": "…", "locale": "ru" },
  "taskId": null,
  "data": { "url": "https://…/login/…" }
}
```

The `x-yartt-signature: sha256=<hex>` header is the HMAC-SHA256 of the body
with `WEBHOOK_SECRET`. The receiver picks the channel (email, Telegram, …)
and writes the text in the `to.locale` language. A non-2xx response keeps
the notification in the queue, and it is retried.

### Scaling

`ROLE=all` (default) runs the API and background jobs in one process. They
can be split across containers of the same image: `ROLE=api` and
`ROLE=worker`. Several instances run safely.

## Development

Node 24+, PostgreSQL.

```sh
npm install
cp .env.example .env   # set DATABASE_URL
npm run dev            # server :3000 + client :5173
```

Without `WEBHOOK_URL` messages are written to the server log — take the
sign-in link from there.

```sh
npm run typecheck
TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm test
```

Tests create and drop their own database on the given server.
