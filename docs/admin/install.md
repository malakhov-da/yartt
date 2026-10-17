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
- An SMTP server for emails: sign-in links, invites, notifications. Without
  email nobody can sign in, unless a webhook delivers the links.

## Configuration

Everything is set with environment variables.

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | `postgres://user:password@host:5432/yartt` |
| `PUBLIC_URL` | yes | the address employees open, e.g. `https://tasks.example.com`; used in links in emails |
| `PORT` | no | default `3000` |
| `ROLE` | no | `all` (default) — the API and the background worker in one process; `api` / `worker` to run them in separate containers |
| `SMTP_URL` | for email | `smtp://user:password@host:587` or `smtps://user:password@host:465` |
| `MAIL_FROM` | with `SMTP_URL` | e.g. `yartt <noreply@example.com>` |
| `WEBHOOK_URL`, `WEBHOOK_SECRET` | no | an extra channel (Telegram, Slack, …): every message is POSTed there as JSON with the header `X-Yartt-Signature: sha256=<hex>` — HMAC-SHA256 of the body with the secret |
| `COOKIE_SECURE` | no | `true` (default) — keep it unless you test over plain HTTP |
| `FIRST_EMPLOYEE_EMAIL`, `FIRST_EMPLOYEE_NAME` | first start | the first employee, created only while there are no employees |
| `FIRST_EMPLOYEE_LOCALE`, `FIRST_EMPLOYEE_TIME_ZONE` | no | `ru` / `en`; an IANA zone such as `Europe/Moscow`. Invited employees inherit them from whoever invites |

With neither `SMTP_URL` nor `WEBHOOK_URL` messages are only written to the
log — useful for a trial, not for work.

## Start

```sh
docker build -t yartt .
docker run -d --name yartt -p 3000:3000 \
  -e DATABASE_URL=postgres://yartt:secret@db:5432/yartt \
  -e PUBLIC_URL=https://tasks.example.com \
  -e SMTP_URL=smtps://mailer:secret@smtp.example.com:465 \
  -e MAIL_FROM='yartt <noreply@example.com>' \
  -e FIRST_EMPLOYEE_EMAIL=ceo@example.com \
  -e FIRST_EMPLOYEE_NAME='Олег Петров' \
  -e FIRST_EMPLOYEE_TIME_ZONE=Europe/Moscow \
  yartt
```

On start the container installs or upgrades the schema (under a lock, so
several containers may start at once), creates the first employee if there
is none, and serves the application. The first employee opens
`PUBLIC_URL`, asks for a sign-in link with their email and invites the
others from the top line.

To run the worker apart from the API, start the same image twice with
`ROLE=api` and `ROLE=worker`; several workers are safe.

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
