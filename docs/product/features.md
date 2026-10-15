# Features

What the product does, in the order people meet it. Each feature names the
persona goal it serves. Status: **now** — stage one, **next** — stage two,
**never** — deliberately out.

## Getting in

| Feature | Serves | Status |
|---|---|---|
| Sign-in by a one-time link, no passwords | everyone: nothing to forget | now (done) |
| Invite a colleague by email, from the top line | Marina: bring the team in herself | now (done) |
| Profile behind the avatar: name, sign-in email, about me (position, contacts); back at work on (vacation, sick leave), time zone, language, pronoun applied at once | Pavel: control what others see | now (done) |
| Choose own manager | Marina: the org chart builds itself | now (done) |
| Dismiss / bring back a direct report; their tasks and reports move to the manager | Marina: no orphaned work, nobody else can do it | now (done) |
| The new manager is notified when someone chooses them | Marina: no surprise reports | now (done) |

## Tasks

| Feature | Serves | Status |
|---|---|---|
| Create a task from a set of tags; autocomplete existing tags | everyone: no title format to agree on | now (done) |
| Tags in lower case; found despite typos, transliteration and the wrong layout; several words read as a set of tags | everyone: one tag is not spelled five ways | now (done) |
| Tags shown in my own order: personal weight, then how often I meet the tag | everyone: the "title" reads naturally | now (in the database) |
| Context: what the owner wants, rich text with images, edited only by the owner | Marina: one source of truth | now (done) |
| Finish a task: the deadline is set to now and the task is closed | everyone: one way to close, no status | now (done) |
| Priority: low / normal / high / critical | Marina: order without debate | now (done) |
| Deadline; move it later or earlier, clear it. A passed deadline closes the task by itself | Marina: plans that can change honestly, and nobody forgets to say they slipped | now (done) |
| "No intervention needed": the owner confirms nothing waits for them; new comments since then put the task back in TODO | Marina: know what changed since she last looked | now (done) |
| Transfer ownership (owner or their manager) | Marina: hand over without losing history | now (done) |
| Take an ownerless task | Pavel: pick up what nobody owns | now (done) |
| Search by tags and by text in context and comments | everyone: find a task in seconds | now (done) |
| Dependencies, hard dependencies tie deadlines; the owner of the task waited for is told | Marina: see what blocks what | now (done) |
| Personal tag colors and weights — in the profile | Pavel: scan lists faster | now (done) |

## Access

| Feature | Serves | Status |
|---|---|---|
| Owner and all managers up the chain always see the task | Marina: no hidden work in her team | now (in the database) |
| The owner adds and hides observers; anyone requests access and the owner approves it | Pavel: help a colleague without broadcasting the task | now (done) |
| Public tasks: no observers, everyone sees them | Marina: announce what concerns everyone | now (done) |
| Notifications when access to a task opens or closes | Pavel: nothing appears or vanishes silently | now (done) |
| Leave a task (owner and managers of observers cannot) | Pavel: drop what is no longer his business | now (done) |

## Communication

| Feature | Serves | Status |
|---|---|---|
| Comments in rich text with images, never edited or deleted, with a few seconds to take one back | everyone: a reliable record | now (done) |
| Reply to a comment | everyone: keep threads readable | now (done) |
| Attach a colleague (mention); in a private task it makes them an observer; it stays in their TODO until they close it | Pavel: ask the right person | now (done) |
| Attach another task | everyone: link related work without dependencies | now (done) |
| Attachments with deduplication | everyone: share files where the discussion is | now (done) |
| Notifications and sign-in links by email, in each person's language | everyone: works right after installation | now (done) |
| An extra webhook channel (Telegram, Slack, ...) | Pavel: be reached where he already is | now (done) |
| Visits are logged: who opened my task, when I opened My day | Marina: see that her task was looked at; Pavel: shift suggested from activity | now (in the database) |
| While someone is away, their notifications also go to their manager | Marina: nothing waits for a vacation | now (done) |
| Personal reminders on a task | Pavel: come back at the right time | now (done) |

## Time and scores

All optional: a team keeps a timesheet, logs time and gets scores only if
its manager wants that.

| Feature | Serves | Status |
|---|---|---|
| Timesheet: a shift suggested from the first and last activity, confirmed with one click | Pavel: log the day in seconds | now (done) |
| Log own time to a task for a day | Marina: see where effort goes | now (done) |
| Own time left per task, next to the time spent | Marina: compare plans with reality | now (done) |
| My day: TODO, current tasks (mine and others), history of my days (shift, time logged, visits) | Pavel: know what to do next; log the day in seconds | now (done) |
| Employee page: their days and scores, seen by the employee and managers above | Marina: honest feedback with facts | now (done) |
| Score a past day of a direct report on their page, 0–100, with an optional reason; correct it later, every version is emailed | Marina: honest feedback with facts | now (done) |
| Workload and weighted score for any period, with a chart by day or week | Marina, Oleg: workload and quality side by side | now (done) |
| Team summary in My day: the subtree for a range — hours, score, days to score, tasks closed by hand and automatically | Marina, Oleg: the whole team in one table | now (done) |
| Avatars | everyone: recognize people faster | now (done) |

## Never

- Statuses, workflows, boards with status columns.
- Assignees, watchers-by-person, "follow this employee".
- Custom fields, issue types, task templates.
- Sprints, story points, velocity.
- Gantt charts, resource planning.
- Import from other trackers — not now; may come back if migration
  becomes the main obstacle to adoption.
