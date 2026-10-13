# Features

What the product does, in the order people meet it. Each feature names the
persona goal it serves. Status: **now** — stage one, **next** — stage two,
**never** — deliberately out.

## Getting in

| Feature | Serves | Status |
|---|---|---|
| Sign-in by a one-time link, no passwords | everyone: nothing to forget | now (done) |
| Invite a colleague by email | Marina: bring the team in herself | now (done) |
| Profile: name, how to reach me, away until, time zone, language | Pavel: control what others see | now (done) |
| Choose own manager | Marina: the org chart builds itself | now (done) |
| Dismiss / bring back a direct report; their tasks and reports move to the manager | Marina: no orphaned work, nobody else can do it | now (done) |
| The new manager is notified when someone chooses them | Marina: no surprise reports | now (done) |

## Tasks

| Feature | Serves | Status |
|---|---|---|
| Create a task from a set of tags; autocomplete existing tags | everyone: no title format to agree on | now |
| Tags shown in my own order: personal weight, then how often I meet the tag | everyone: the "title" reads naturally | now (in the database) |
| Context: what the owner wants, edited only by the owner | Marina: one source of truth | now |
| Priority: low / normal / high / critical | Marina: order without debate | now |
| Deadline; move it later or earlier, clear it. A passed deadline closes the task by itself | Marina: plans that can change honestly, and nobody forgets to say they slipped | now |
| "Mark as reviewed"; tasks with new comments since then need attention | Marina: know what changed since she last looked | now |
| Transfer ownership (owner or their manager) | Marina: hand over without losing history | now |
| Take an ownerless task | Pavel: pick up what nobody owns | now |
| Search by tags and by text in context and comments | everyone: find a task in seconds | now |
| Dependencies, hard dependencies tie deadlines | Marina: see what blocks what | next |
| Personal tag colors and weights in the interface | Pavel: scan lists faster | next |

## Access

| Feature | Serves | Status |
|---|---|---|
| Owner and all managers up the chain always see the task | Marina: no hidden work in her team | now (in the database) |
| Add an observer; request access and get it approved | Pavel: help a colleague without broadcasting the task | now |
| Leave a task (owner and managers of observers cannot) | Pavel: drop what is no longer his business | now |

## Communication

| Feature | Serves | Status |
|---|---|---|
| Comments that are never edited or deleted, with a few seconds to take one back | everyone: a reliable record | now |
| Reply to a comment | everyone: keep threads readable | now |
| Attach a colleague (mention) — only someone who sees the task | Pavel: ask the right person | now |
| Attach another task | everyone: link related work without dependencies | now |
| Attachments with deduplication | everyone: share files where the discussion is | now |
| Notifications and sign-in links by email, in each person's language | everyone: works right after installation | now (done) |
| An extra webhook channel (Telegram, Slack, ...) | Pavel: be reached where he already is | now (done) |
| Visits are logged: who opened my task, when I opened My day | Marina: see that her task was looked at; Pavel: shift suggested from activity | now (in the database) |
| While someone is away, their notifications also go to their manager | Marina: nothing waits for a vacation | now |
| Personal reminders on a task | Pavel: come back at the right time | next |

## Time and scores

All optional: a team keeps a timesheet, logs time and gets scores only if
its manager wants that.

| Feature | Serves | Status |
|---|---|---|
| Timesheet: a shift suggested from the first and last activity, confirmed with one click | Pavel: log the day in seconds | now |
| Log own time to a task for a day | Marina: see where effort goes | now |
| Own time estimate per task | Marina: compare plans with reality | now |
| Score a past day of a report, 0–100, with an optional reason | Marina: honest feedback with facts | now |
| Workload and weighted score per period | Marina, Oleg: workload and quality side by side | now |
| Avatars | everyone: recognize people faster | next |

## Never

- Statuses, workflows, boards with status columns.
- Assignees, watchers-by-person, "follow this employee".
- Custom fields, issue types, task templates.
- Sprints, story points, velocity.
- Gantt charts, resource planning.
- Import from other trackers — not now; may come back if migration
  becomes the main obstacle to adoption.
