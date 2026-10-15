# Testing

How the product is checked, from the database rules up to a real browser.
Run both suites before calling a change done.

## Layers

| Layer | What it proves | Where | Command |
|---|---|---|---|
| Types | contracts between client, server and shared schemas | `tsconfig.json`, `client/tsconfig.json` | `npm run typecheck` |
| API + database | business rules in triggers and functions, access, procedures, emails | `tests/*.test.ts` (vitest, real PostgreSQL, `createCaller`; HTTP for files and avatars) | `TEST_DATABASE_URL=… npm test` |
| End-to-end | the built client against the real server, as a person uses it | `e2e/*.spec.ts` (Playwright, installed Chrome) | `TEST_DATABASE_URL=… npm run e2e` |

`TEST_DATABASE_URL` is an admin connection: each suite creates its own
database (vitest — a temporary one; end-to-end — `yartt_e2e`, filled by
`scripts/seed.ts`) and never touches the one in `.env`.

The end-to-end run builds the client (`npm run build`), starts
`e2e/serve.ts` on port 3100 — a fresh database with the demo data, then the
real server like in production — and drives Chrome in Russian, Moscow
time. Tests run one at a time: they share the data. The report with
traces and screenshots of failures is in `e2e-report/`
(`npx playwright show-report e2e-report`).

## What the end-to-end tests cover

| Area | Spec | Scenarios |
|---|---|---|
| Sign-in | `auth` | requesting a link without telling whether the email exists; the link signs in once; log out; a dismissed employee gets no link; a link switches to its person when someone else is signed in |
| My day | `my-day` | TODO: approve a request, close a mention ("Done"), pronoun forms and a bot's neutral ones, reply in place; current tasks: tabs, pages, state kept after a task (the logo leads home); history: start and close a shift, confirm a suggested one |
| Task | `task` | created from search; priority, deadline, context in place; a comment held with "Back to editing", `c` focuses the composer; a mention makes an observer and says why; reply and cancel; time logged and planned, both as feed events; observers added and hidden; public and private again; a dependency added and removed; a reminder; finish; hand-over; no access → request → withdraw |
| Search | `search` | `/` focuses; a tag narrows the tasks; text in comments; the same set of tags refused with its message |
| My team, employee page | `team` | the team block in My day: the subtree for a range with every column and a total, away and dismissed marks; no block without reports; the employee page with a range and a chart; scoring, a correction, a reason for a low score; a manager higher up only looks; a stranger is refused |
| Profile | `profile` | avatar upload and removal; language switches the interface and the name (яртт / yartt); pronoun |
| My tags | `tags` | in the profile: a personal color shows on the chip; weight; a tag closes the profile and opens the search |
| Interface walk-through | `interface` | docs/product/interface.md item by item: Invite; no raw translation keys on any screen in Russian and English; "No intervention needed" from TODO; history pages, deleting a time entry and the open shift, a shift at another time; tags edited in place; clearing a deadline; a hard dependency that does not fit explained; "Back to editing" restores the text, Ctrl+Enter, a file and an image (opens in full); made private again → "Bring back all"; an observer leaves; time for a past day lands on that day; no score without a closed timesheet; profile saved, manager applied at once, log out everywhere |
| Layout | `layout` | no horizontal scroll at phone width on My day with the team table, a task, an employee page |

## What is checked by hand

- Emails as received (subjects, line breaks, links) through a real SMTP.
- The webhook signature on a real receiver.
- The Docker image from scratch against an empty PostgreSQL.
- Reading everything in English once per release.

## Adding a feature

1. Rules in the database → a vitest test in `tests/` for every rule and
   every error code the feature adds.
2. A new screen or action → a scenario in `e2e/`, using the demo data
   (extend `scripts/seed.ts` so the feature shows up there too).
3. Prefer roles and visible texts in selectors (`getByRole`, `getByLabel`):
   a test that cannot find a control by its name is usually an
   accessibility bug in the interface, not in the test.
