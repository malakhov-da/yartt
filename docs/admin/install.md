# Installing yartt

yartt is installed by the company itself: one Docker image and an external
PostgreSQL. One installation is one company. There are no administrators
in the product: the first employee is created from the configuration, and
everyone else is invited by an employee.

## What you need

- PostgreSQL 16 or newer, a database and a user that owns it. On the first
  start yartt creates the extensions `citext`, `pgcrypto`, `btree_gist`,
  `pg_trgm`, `fuzzystrmatch` (all in PostgreSQL's standard contrib) — the
  user needs the right to do that (or create them first).
- A host for the container, reachable by employees over HTTPS (put any
  TLS-terminating proxy or load balancer in front: the container speaks
  plain HTTP).
- An SMTP server for emails: sign-in links, invites, notifications. The
  image does not start without it: nobody could sign in.

## Configuration

Everything is set with environment variables, from a file of its own for
each kind of installation: [prod.env.example](../../prod.env.example) for
work, [demo.env.example](../../demo.env.example) for a trial. Copy one to
`prod.env` or `demo.env` (git ignores them) and fill it in.

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | `postgres://user:password@host:5432/yartt` |
| `PUBLIC_URL` | yes | the address employees open, e.g. `https://tasks.example.com`; used in links in emails |
| `PORT` | no | default `3000` |
| `ROLE` | no | `all` (default) — the API and the background worker in one process; `api` / `worker` to run them in separate containers |
| `SMTP_URL` | yes, but in the demo | `smtp://user:password@host:587` or `smtps://user:password@host:465` |
| `MAIL_FROM` | with `SMTP_URL` | e.g. `yartt <noreply@example.com>` |
| `WEBHOOK_URL`, `WEBHOOK_SECRET` | no | an extra channel (Telegram, Slack, …): every message is POSTed there as JSON with the header `X-Yartt-Signature: sha256=<hex>` — HMAC-SHA256 of the body with the secret |
| `COOKIE_SECURE` | no | `true` (default) — keep it unless you test over plain HTTP |
| `FIRST_EMPLOYEE_EMAIL`, `FIRST_EMPLOYEE_NAME` | first start | the first employee, created only while there are no employees |
| `FIRST_EMPLOYEE_LOCALE`, `FIRST_EMPLOYEE_TIME_ZONE` | no | `ru` / `en`; an IANA zone such as `Europe/Moscow`. Invited employees inherit them from whoever invites |
| `DEMO_DATA` | only in the demo | `ru` / `en` — a trial: the demo company in that language, seeded afresh on every start, no sign-in ([below](#a-trial-with-demo-data)). Never for work |

In the demo, without `SMTP_URL`, messages are only written to the log.

## Start

```sh
cp prod.env.example prod.env   # fill it in
docker run -d --name yartt -p 3000:3000 --env-file prod.env yartt/public:<version>
```

On start the container installs or upgrades the schema (under a lock, so
several containers may start at once), creates the first employee if there
is none, and serves the application. The first employee opens
`PUBLIC_URL`, asks for a sign-in link with their email and invites the
others from the top line.

To run the worker apart from the API, start the same image twice with
`ROLE=api` and `ROLE=worker`; several workers are safe.

The image checks itself: `GET /api/health` answers 200 while the server
is up and the database answers, 503 otherwise, and Docker's
`HEALTHCHECK` calls it every 30 seconds — `docker ps` shows the container
healthy or unhealthy, and an orchestrator or a load balancer can use the
same address. A `ROLE=worker` container serves no HTTP and counts as
healthy while it runs.

## A trial with demo data

To look around before inviting anyone, start the image with
[demo.env.example](../../demo.env.example) against a database of its own:
a made-up company in English or Russian (`DEMO_DATA`) — managers, tasks,
comments, shifts, scores, avatars — written relative to today.

```sh
cp demo.env.example demo.env   # the database and the language
docker run -d --name yartt-demo -p 3000:3000 --env-file demo.env yartt/public:<version>
```

There is no sign-in: the first page lists the company's people, and you
pick whose eyes to see it through; the profile menu switches to someone
else at any moment, and "Demo" in the top line reminds everyone it is not
real. No SMTP or `FIRST_EMPLOYEE_*` is needed: its people are made up, so
the demo sends nothing — notifications still come to the bell in the
interface.

Every start and every night (after 03:00 in the demo company's time zone)
seed the demo afresh, so its days stay around today; it is never
migrated — a new image simply installs its schema anew. That is safe for
real data by design: the demo's schema version is `demo` (`SELECT * FROM
schema_version`), and only such a database is wiped. A database with
tables at any other version is refused — the container stops with
"DEMO_DATA is set, but the database holds real data" — and nothing in it
is touched; the other way round, an installation started without
`DEMO_DATA` refuses a demo database rather than migrate it. Still, keep
the demo on a database of its own, and never set `DEMO_DATA` for work.

### A public demo

The same container can be the demo you link to from a website, open to
anyone. Put it behind HTTPS like a working installation, set `PUBLIC_URL`
to its address and drop `COOKIE_SECURE=false` from `demo.env`. The demo
keeps visitors in check by itself: the first page and the top line say
the company is made up, everything written there is visible to any
visitor and starts afresh every night; files are limited to 2 MB, so
nobody fills the database; and its pages ask search engines not to index
them (`X-Robots-Tag: noindex`).

## Dismissing someone who will not hand over

In the product only a manager dismisses, so nobody can dismiss the person
at the top, and someone may refuse to hand over. The administrator of the
installation does it from the running container, naming the heir:

```sh
docker exec yartt node server/admin.ts dismiss ceo@example.com --heir marina@example.com
```

The heir becomes their manager and dismisses them: the tasks and the whole
team, dismissed people included, go to the heir — the only one who can
bring the person back. If the heir is in the person's own team, they first
leave it for the person's place (under the person's manager, or at the
top). Everyone affected is notified as usual.

## Upgrades

Replace the container with one from the new image. Schema migrations run on start, all of
them in one transaction — if one fails, the database stays on the old
version and the container exits with the reason in the log. Take a backup
of PostgreSQL before an upgrade: that is the administrator's job, the
application does not do it. There are no downgrades.

## Data and backups

Everything is in PostgreSQL, files included (attachments and avatars are
stored in the database). A regular `pg_dump` is a complete backup. The
worker removes on its own: sign-in tokens after an hour, sessions after 30
days of inactivity, notifications and visits after a year, files no
comment or task refers to after a day.
