# Roadmap

What is ahead — and only that. What the product already does is in
[features](features.md), why it is so — in [decisions](decisions.md). A
task leaves this file when it is done and verified; a new one comes in when
it is decided. Proposals wait for a decision in their own section.

## Now — stage 6: ready for 1.0

- [ ] **Delivery check.** Build the Docker image from scratch, start it
  against an empty PostgreSQL ([install guide](../admin/install.md)), sign
  in through a test SMTP, check the webhook signature on a real receiver.
- [ ] **A manual pass in English** and a check that every error code
  reachable from the interface shows its message.
- [ ] **Security pass.** Attachments and avatars (types, sizes, who may
  read), rate limiting of sign-in links, cookies, the HTML allow-list.
- [ ] **Performance.** Current tasks, search and the team summary on
  ~10 000 tasks and ~300 people; indexes for `can_see()`.
- [ ] **Release 1.0.** Copy `db.sql` to `server/migrations/1.0.sql`; from
  then on every schema change is a migration.

## Next — approved features

In this order after stage 6 (S — a day, M — a few days, L — a week or more).

- [ ] **Deadline at risk** (S). An open task whose time left — the plans of
  its people — does not fit before the deadline is marked in Current tasks
  and counted in the team summary: "4 days left, 30 h planned". Marina
  learns about a slip while it can still be avoided.
- [ ] **Suggested shift for a gap** (S). A day with a shift and more
  activity later: "Looks like a shift 14:10–18:30".
- [ ] **Export for payroll** (S). Timesheet, logged time and scores of the
  subtree for a range — an Excel file (`.xlsx`), built in the browser so
  the server image gets no new dependency; CSV as a fallback.
- [ ] **Bots through the API** (M). An employee without a pronoun (a bot)
  gets a token; CI and monitoring comment and mention through it.
- [ ] **A weekly email for managers** (M). Monday morning: days waiting for
  a score, tasks closed automatically, tasks at risk in the subtree.
- [ ] **A dark theme; installable on a phone (PWA)** (M).

## Decided against

- More tabs — reminders, a company org chart, "all tasks" (decision 31).
- A task without movement in TODO — a task may be put off on purpose.
- `@` and `#` while typing in a comment — the buttons are enough.
- Notification digests — notifications stay instant.
- Import from other trackers — only if migration becomes the main
  obstacle to adoption.
- Everything in "Never" of [features](features.md).
