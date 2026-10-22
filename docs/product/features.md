# Features

What the product does, in the order people meet it. Each feature names the
persona goal it serves. Status: **now** — stage one, **next** — stage two,
**never** — deliberately out.

## Getting in

| Feature | Serves | Status |
|---|---|---|
| Sign-in by a one-time link, no passwords | everyone: nothing to forget | now (done) |
| Invite a colleague by email, from the top line | Marina: bring the team in herself | now (done) |
| "I'll be away" from the top line: the day I'm back in one click, seen on every page | everyone: going on leave takes a second, and nothing waits unseen meanwhile | now (done) |
| Profile behind the avatar: name, sign-in email (a new one confirmed by a link sent there), about me (position, contacts); back at work on (vacation, sick leave), time zone, language, pronoun applied at once | Pavel: control what others see | now (done) |
| Choose own manager | Marina: the org chart builds itself | now (done) |
| Dismiss / bring back a direct report, with the email they had; their tasks and reports move to the manager | Marina: no orphaned work, nobody else can do it | now (done) |
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
| Search by tags — in My day, filtering Current tasks; "New task" over it creates a task with the title typed; a taken title is named as it is typed; a new tag only by its button, the whole phrase one tag | everyone: find a task in seconds, and never make a tag by accident | now (done) |
| Closed tasks in a tab of their own, the most recently closed first; the search finds them there | everyone: see what was just finished without losing it | now (done) |
| A task hovered in any list shows its context and each person's time logged and left | everyone: know what a task is and what it took without opening it | now (done) |
| One time entry per task and day: set and replaced, 0 removes it, the last change on hover; the same entry from the timesheet and the task | Pavel: correct the day's time without adding and deleting entries | now (done) |
| The guide behind "?": what yartt gives, how-tos, why the unusual rules are so — in each language | everyone: learn the product, and why it differs, without asking | now (done) |
| Tags in My day: per tag from any day to today — open, at risk, not moving, closed, comments, people and their average share of own time, who plans, when it last moved — on the tasks one sees, people only; picked tags with all and any; each person's time and plan by day; CSV | Marina, the director: see how a direction is doing without a project | now (done) |
| A title is rubrics and a phrase of what to do; the rubrics that often go together are offered while typing; a task made from another starts with its tags | everyone: a list of tasks reads as what is to be done | now (done) |
| Dependencies, with or without the latest deadline the waiting task can live with; broken, it puts both tasks at risk, forbidding nothing; the owner of the task waited for is told, the waiting one of every move | Marina: see what blocks what | now (done) |
| A new-task form: tags as the title, priority, deadline, context; opened from the search or tied to a task as its dependency; a dependency found by tags or number | everyone: write a task down whole, link it where it belongs | now (done) |
| Unsaved comments, new tasks and edits are kept as drafts when going to another page | everyone: following a link never costs the typed text | now (done) |
| Shifts of any day not scored are added, corrected and deleted; the manager withdraws a score to let a day be fixed | Pavel: a mistyped shift is fixed; Marina: lets it be fixed without losing the reason | now (done) |
| My team: my own row; time in tasks as a share of each timesheet; the team line averages people, never adds hours | Marina: compare people fairly, see her own report | now (done) |
| My team as a tree with each team's line, ticks and one-click teams; sparklines; how late the timesheet is written; how fast mentions are answered | Marina: see where a sub-team is heading and which habits slip | now (done) |
| My team narrowed to four comparable columns (in tasks, score, tasks, delay), teams that fold, details with charts on a click; a manager is part of their team's line; a team's score is its manager's; only people who were there in the range | Marina: read the team at a glance and dig in only where something stands out | now (done) |
| Last seen next to everyone in My team, the longest unseen first — away or not | Marina: someone gone without a word is seen, with no false alarms on holidays | now (done) |
| My dismissed under the team table: bring back under me (moving on is their own choice); a dismissed person always has a manager; someone at the top leaves through their successor | Marina, Oleg: no one lost when people come and go, even at the top | now (done) |
| Deadline at risk: a person's plan does not fit their working time before the deadline, or a latest deadline of a dependency is broken — marked on the task with the reasons, counted in My team, Tags and Monday's email | Marina: learn about a slip while it can still be avoided | now (done) |
| A shift suggested for activity outside the written shifts of a past day | Pavel: an evening of work is not lost from the timesheet | now (done) |
| Export for payroll: timesheet, logged time and scores of the picked people for a range, as Excel or CSV | Marina: hand the month to accounting without retyping | now (done) |
| Bots: an employee kind of its own, created by anyone, run by its manager; one key, permissions that only narrow what it sees, its own signed JSON webhook; no timesheet, scores or reports. Bots under My team from any day to today: tasks, comments, calls by day, share refused, share delivered, the quiet first; a yearly word about an old key | Pavel: a failed build lands in the task as a mention, and the bot cannot do more than it should | now (done) |
| A weekly email for managers: Monday morning, days waiting for a score, tasks closed automatically, tasks at risk | Marina: the week starts with what needs her | now (done) |
| A dark theme: as the system, or chosen in the profile | Pavel: My day open all evening without glare | now (done) |
| Installable (PWA) and working offline: changes made without a connection are kept and sent at the first chance | everyone: a train or a basement does not stop work | now (done) |
| The top line: how many TODO items wait for me, starting a shift now, the open shift and closing it, from any page | Pavel: notice a mention and close the day without going back to My day | now (done) |
| Personal tag colors and weights — in the profile | Pavel: scan lists faster | now (done) |

## Access

| Feature | Serves | Status |
|---|---|---|
| Owner and all managers up the chain always see the task | Marina: no hidden work in her team | now (in the database) |
| The owner adds and hides participants; anyone requests access and the owner approves it | Pavel: help a colleague without broadcasting the task | now (done) |
| Public tasks: no participants, everyone sees them | Marina: announce what concerns everyone | now (done) |
| Notifications when access to a task opens or closes | Pavel: nothing appears or vanishes silently | now (done) |
| Leave a task (owner and managers of participants cannot) | Pavel: drop what is no longer his business | now (done) |

## Communication

| Feature | Serves | Status |
|---|---|---|
| Comments in rich text with images, never edited or deleted, with a few seconds to take one back | everyone: a reliable record | now (done) |
| Reply to a comment; replies live in a thread under the first comment, a line in the feed marks each | everyone: keep threads readable | now (done) |
| Attach a colleague (mention) — a participant of a private task, anyone in a public one; it stays in their TODO until they close it | Pavel: ask the right person | now (done) |
| Attach another task | everyone: link related work without dependencies | now (done) |
| Attachments with deduplication | everyone: share files where the discussion is | now (done) |
| Notifications and sign-in links by email, in each person's language | everyone: works right after installation | now (done) |
| Only the company's mail domains (`EMAIL_DOMAINS`); someone with another address signs in only to change it, and is asked by mail once a day | the company: the tracker on its own addresses, nobody locked out when it is turned on | now (done) |
| Sign-in through the company's identity provider (OIDC: Entra, Google, Okta, Keycloak): the only way in, people created on first sign-in; a session lasts a day; every day the provider is asked, and someone it refuses is out, bots included | the company: one account, one switch to cut someone off | now (done) |
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
| My day: TODO, what I wait for from others (my requests, my open mentions), current tasks (mine and others), today and the last day before it — the ribbon of shifts, visits and what was done, every task once; all days in History | Pavel: know what to do next; log the day in seconds | now (done) |
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
