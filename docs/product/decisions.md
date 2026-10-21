# Product decisions

Decisions on questions that looked risky from the users' side. Each records
what we chose and why, so the reasoning is not lost. New questions go to
the end under "Open".

## Decided

### 1. Only the direct manager dismisses

Any employee could dismiss anyone; one careless person could lock out a
colleague. Now only the direct manager can dismiss an employee or bring
them back. Tasks and reports of the dismissed employee move to that
manager. An employee without a manager cannot be dismissed. The right
comes from the org chart, not from a role.

*Implemented:* `dismiss_employee()`, `restore_employee()` in `db.sql`.

### 2. A passed deadline closes the task — on purpose

A task whose deadline passes is closed automatically, even if the work is
not finished. This is a feature: the owner has to move the deadline in
time, or explain why the task is closed but not done. Current tasks in
**My day** are sorted by deadline, so the nearest ones are always on top.
A closed task is not singled out — automatic and manual closing look the
same, and reopening a task closed by mistake is the owner's job. Hard
dependencies may forbid the move; then the owner has to go and
negotiate with the owners of the dependent tasks.

### 3. Email is built in

Without email nobody could sign in until someone wrote a webhook
receiver. Email is now built in: `SMTP_URL` and `MAIL_FROM` are passed like
the first employee's data. Sign-in links, invites and notifications are
sent in each employee's language. The webhook stays as an optional extra
channel.

*Implemented:* `server/delivery.ts`, `server/mail.ts`, templates in
`shared/i18n/<locale>.ts` (`mail`).

### 4. Tags as the title, ordered per person

A task has no title; its unique set of tags is its name. Tags are stored
sorted by id (for uniqueness) but shown in each employee's own order:
heavier tags first (the weight is a personal setting next to the tag
color); on a tie, the tag the employee meets in more of their tasks comes
first.

*Implemented:* `user_tag (color, weight)`, `ordered_tags()` in `db.sql`.

### 5. Visits are logged

Opening a task and opening **My day** are logged. The owner sees in the
task who looked at it; the history of a day (My day, the employee page)
shows which tasks were opened and when the person came in; and the shift
can be suggested from the first and last activity of the day instead of
being typed in.

*Implemented:* `visit`, `log_visit()` in `db.sql`; `Visit.log`.

### 6. Scores and time entries are optional

The manager decides whether to score days and which ones, and whether the
team keeps a timesheet and logs time. Nothing in the product requires
them. Averages are computed over scored days only and always shown with
the number of days behind them.

### 7. A new manager is told

An employee chooses their own manager without approval, and the manager
gets a notification (`new_report`). The inviter is not made the manager by
default: invitations are often sent by someone from support or HR.

*Implemented:* the trigger on `employee.manager_id`.

### 8. My day shows every task I see, mine apart from the others

Every manager up the chain observes all tasks of their reports, and the
database does not remember why someone became an observer — that history
is not needed. So Current tasks in My day lists every open task I see, in
two columns: the ones I own and the rest. My own tasks never get lost
among the subtree; the rest is a reference, not a to-do list — TODO is
built only from my tasks and open mentions of me.

### 8a. Scores live on the employee's page

Days waiting for a score are not put in TODO: scoring is optional, and a
reminder would turn it into a duty. From Team the manager opens a
person's page and sees their days; only the direct manager scores, the
managers above only look.

### 9. A mention is closed only explicitly

A reply to the comment does not close the mention: answering is not the
same as doing what was asked. The mentioned employee presses "Done" —
and only after replying to that comment: a reply is an answer to this
request, a comment elsewhere in the task is not. The replies show inside
the mention, all of them, so the request and its answers read together. An
open mention is also the only way a task one merely observes reaches their
TODO — the rest of its comments stay quiet, so Marina's sixty observed
tasks do not flood her day.

### 10. Finishing a task is setting its deadline to now

There is no "done" status and no separate field: "Finish" sets finished_at
to the current moment and the task is closed. A manual close and a passed
deadline look the same — on purpose (decision 2).

### 11. An ownerless task is not singled out

A task loses its owner only when a dismissed employee had no manager — a
rare case. It is not shown anywhere special: an observer who needs it takes
it.

### 12. Managers see the visits too — on purpose

The employee page shows the manager everything My day shows the employee,
visits included: which tasks were opened and when the person came in. For
someone who fills in the timesheet honestly this adds nothing new, so it
does not hurt them; for someone tempted to pad the timesheet, or to let an
agent work in their place, it removes the reason to try. Transparency is
the same for everyone in the chain.

### 13. The context, the owner, priority and tags keep no history

The context follows from the comments: why it changed is said there. The
owner is the task's state, not its story — it almost never changes, and
when a dismissal moves the task, the old owner is no longer relevant. Only
the deadline (what was promised and when it moved) and the observers (who
had access) keep their history.

### 14. A task with no observers is public

Some tasks concern everyone (an office move, a shared service). The owner
makes such a task public, and it has no observers at all: anyone sees it,
comments and logs time. There should be few of them, so a public task
simply appears in everyone's "others" in My day — no special filtering.

A mention in a public task adds no observer: one would make it private.
Making it private again leaves the owner, the managers above (as with any
private task) and everyone with an open mention (decision 15); the people
who commented are offered back with one click, the rest get "access
closed". A new task is private.

*Implemented:* `is_public()`, `can_see()`, `make_public()`, `make_private()`
in `db.sql`.

### 15. Observers comment and log their own time; access belongs to the owner

An observer sees everything the owner sees but changes only their own
things: writes comments, logs time, sets their own time left, closes their
own mentions, leaves the task. Adding and hiding observers, approving
requests, making the task public or private — the owner only.

Anyone can still bring a colleague into a private task: a mention of
someone who does not observe it makes them an observer, like a manager
joins when a report of theirs does. A request for help is the only
legitimate reason for an observer to widen access, and it leaves a trace
in the feed. Access opened or closed — added, mentioned, request approved
or rejected, hidden, task made private — is always notified, so nobody
discovers a task appearing or vanishing by accident.

*Implemented:* `add_observer()`, `remove_observer()`, `approve_access()`,
`reject_access()`, `withdraw_access()`, `make_public()`, `make_private()`,
`trg_mention_check()` in `db.sql`; notifications `access_opened`,
`access_closed`.

### 16. "No intervention needed", not "Seen"

reviewed_at is the owner's statement that nothing in the task waits for
their decision — not a read receipt. The button says so: "No
intervention needed", next to a line with what came in since the last
check (how many comments, from whom). The new comments are marked in the
feed. Until the owner says it, the task stays in their TODO. An access
request waiting for an answer is something that needs the owner, so the
button is disabled until the request is approved or rejected.

*Implemented:* `mark_reviewed()` in `db.sql` (code `pending_requests`).

### 17. The estimate is the time left

estimate_minutes is how much more time a person plans to spend, not the
total; the person updates it as the work goes. Spent + left is the
current forecast; the history of "left" shows how the forecast changed.

The task page has no time table and no totals: a sum over observers means
nothing (a manager's half hour of reading is not the task's cost). Each
person in the observer list has a clock icon if they logged time and an
hourglass if they gave their time left, the numbers in tooltips. My own
time and its buttons sit above the list. In a private task the list is
the observers; in a public one — everyone who opened it.

### 18. Navigation: tabs instead of "Back" — superseded by 31

### 19. Tags, priority and deadline are visible to everyone

Only the context, the feed and the people are private. The tags, the
priority and the deadline of any task are seen by every employee: without
them a person cannot tell whether to request access, a dependency on a
task one does not observe would be a blank line, and search by tags could
not say that such a task exists. The tags are a name, not a secret; what
is sensitive goes into the context and the comments.

*Implemented:* `can_see()` in `db.sql`; `Task.get` returns the header to
everyone and `details` only to those who see the task; search by tags finds
any task, search by text only the visible ones.

## Open

Taken while building, to be approved or changed.

### 20. TODO counts only comments by others

The "needs attention" rule in `db.sql` also counts a task never reviewed
(`reviewed_at IS NULL`). TODO takes only comments by others since the last
review, as the interface describes: otherwise every new task would sit in
its owner's TODO until they pressed a button about nothing. Access
requests come first in TODO: they have no time of their own and they block
"No intervention needed".

### 21. My day: the shift starts from the first activity

*Changed by decision 54: a shift starts now, with a button.*

Today offers "Start the shift at <first activity>" in one click (another
time through the pencil). A past day without a shift offers the one its
first and last activity suggest, confirmed in one click. Closing a shift
always opens a dialog with "what was done": a closed shift is final, so
it is the moment to think (the timesheet only moves forward).

### 22. A score is corrected; its history lives in the employee's mail

The direct manager scores a day in a small dialog (below 60% a reason is
required) and may correct the score later. The interface shows only the
current value. Every version — the value, the reason, the moment and, for
a correction, the previous value — is emailed to the employee, so in a
dispute they have the record in their mail. A score is never deleted; the
day's timesheet and time entries are frozen while a score stands — it can
be withdrawn (decision 37).

### 23. Metrics for any range, with a chart

Workload (timesheet hours and days), time logged to tasks and the score
weighted by the hours of the scored days, with the number of scored days
next to it (decision 6). Quick ranges — the last 7, 30, 90 days — or any
dates up to a year, in the employee's own days. The chart shows hours as
bars and the score as a line on its own axis; ranges over two months go
by weeks. Team shows every report's last 30 days.

### 24. Handing a task over tells the previous owner too

The owner or their direct manager hands a task over to any active
employee. The new owner gets `owner_change`; when the manager acts, the
previous owner gets `owner_handed` ("Marina hands your task over to
Ivan") — nothing about one's own work changes silently. An ownerless
task is taken by anyone who sees it, without notifications.

### 25. The employee page is a route, not a section

`/employees/<id>` opens over the sections like a task. Team lists people
with their metrics and links to their pages; My day links to one's own
("Metrics"). The page shows the same History, read-only.

### 26. One line per observer, with the reason

Observation periods are rows of `observer`; the list shows a person once,
every period in the tooltip. Someone who observes without having been
added by hand says why: the task owner, the manager of a report who
observes, or an open mention (which also keeps them when the task is made
private again).

### 27. A visit is an arrival, not a page view

A visit is logged on opening a screen and on coming back to a tab that
was hidden for 10 minutes or more; the database ignores repeats within 10
minutes. Sitting on a page all day is one visit. Every screen counts — a
task with its number, any other (My day, someone's days, a new task)
without one: someone who spent the day in History was here too.

### 28. The feed is the whole story of a task

Besides comments and deadline moves, "All events" shows a comment of
another task attaching this one, time logged and time left set or
cleared. The separate "Mentioned in" panel is gone. Daily time entries
would flood it, so one person's entries in a row — nothing else between
them — are one line with the total, the days on a click; the feed pages
count these lines, so a run is never split by a page.

### 29. Pronouns instead of "(а)"

An employee may say he or she in the profile; verb forms follow
("упомянул" / "упомянула"). Not given — a bot, or someone who prefers not
to — keeps both endings ("упомянул(а)"). Emails are written in the present
tense ("Марина оценивает…") and need no forms.

### 30. The name follows the language

The product is "yartt" in English and "яртт" in Russian: the window title,
emails and a quiet footer at the bottom of My day with the release and ©.
Next to the mark in the top line is not the product name but the name of
the only screen — Мой день / My day: the logo leads there, and people
already know which product they have opened. The mark is a tag with a
check: tasks are named by tags, and each has one owner who sees it done.
The tag takes off like a rocket: done tasks are how a product gets built
and shipped.

### 31. One screen, no tabs

Of the candidate sections none earned a tab: Team is a block of My day for
someone with reports, the tags live in the profile (they are personal
settings), reminders are on the task, a company org chart and "all tasks"
are not needed (search and Current tasks cover them). With one screen
left, tabs would be a bar with a single item — so there are none. The
logo is the way home; a task and a person's page open over My day by
route and My day keeps its state underneath.

### 32. Closed by hand or automatically

A task is closed one way — its deadline comes (decision 10). The team
summary tells the two cases apart by the current deadline row: set at the
moment it took effect ("Finish", or a deadline moved to the past) — closed
by hand; set in advance (more than a minute before) and then reached —
closed automatically: the owner neither finished the task nor moved the
deadline. Nothing new is stored. The word is neutral on purpose: an
automatic close may be fine (the work was done on time), the manager
looks into it.

### 33. Tags forgive how they are typed

Tags are the title, so a misspelled tag is a second name for the same
thing and search splits in two. Tags are lower case only ("Склад" and
"склад" are one tag), and suggestions forgive typos ("инвентризация"),
transliteration ("sklad") and the wrong keyboard layout ("crkfl"): each
tag keeps its name in Latin letters, and the typed text and the same keys
read with each other layout of the person are compared with it by
Levenshtein distance and trigrams. The layouts are the person's, chosen
in the profile, not derived from the interface language: a Russian
interface says nothing about the keyboards someone switches between, and
with many languages one fixed pair would be wrong for most. Until chosen
— the interface language's layout and the US one. Layouts are tables in
the application (a new one is a line of code); transliteration stays one
for everybody, since it depends on how tags are written, not on who
types — another alphabet is a line in `translit()`. Only spaces part
words: "," and ";" are "б" and "ж" in the other layout. Comparing in Latin also keeps it working on a database with
the C locale. Several typed words are read as a set of tags: words that
match existing tags become those tags, the words around them are offered
as new ones, and a few such readings are suggested, best first — a
reading is never applied silently. A tag is created only when a task is
saved with it — while a title is typed its tags keep changing; a tag no
task carries any more is removed after a day so abandoned spellings do
not come back as suggestions.

*Implemented:* `translit()`, `tag.latin`, `employee.keyboards`, the
`tag_cleanup` cron job in `db.sql`; `shared/keyboards.ts`;
`Tags.suggest`.

### 34. A task is created in a form

*Changed by decision 55: "+" in the search opens the form with the title typed.*

The search used to be the only way to create a task: a set of tags, then
"Create", and everything else filled in on the task page. That hid
creation inside finding, and a task meant to unblock another had to be
created and then linked by its number. Now a form opens over My day from
**New task** in my tasks, or from a task's dependencies already tied to
it (a task this one waits for, or one that waits for it). The title
field works like the search (decision 33); priority, deadline, context
and the dependency are saved with the task in one transaction, under the
same rules as changing them later.

*Implemented:* `NewTaskPage`, `TagInput`; `Task.create` takes the
optional fields.

### 35. The search lives in My day and filters Current tasks

The search sat in the top line and showed its results in a dropdown —
a second list of tasks next to Current tasks, with its own look and
without pages. Now it is the input on top of Current tasks: picked tags
and typed text narrow both tabs, so there is one list of tasks and it
is filtered in place. With a filter the tabs hold any task with those
tags, closed and not visible ones included, as the old search did. "/"
from any page brings My day back with the input focused. Creating moved
out of the search (decision 34), and the search finds by tags only: text
in contexts and comments mixed tasks with a word into the list of tasks
with a tag, and a tag that does not exist finds nothing, so there is
nothing to create there. Enter takes the best suggestion. "New task"
takes the picked tags. The top line is left with the logo, Invite and
the avatar.

*Implemented:* `CurrentTasks`, `Task.search` with tabs and counts.

### 36. Typed is kept until saved or cancelled

A task page unmounts when another page opens, and with it went a half
written comment, a context being edited, a new task being filled in.
Following a link to check something should not cost the text. What is
typed and not saved — a comment, the new-task form, the tags, context or
a dependency being edited — is a draft: it stays when the person goes
elsewhere and is there when they come back, until it is sent, saved or
cancelled. Drafts live in the browser tab (they survive a reload, not a
new tab), under the employee, so a sign-in link for someone else in the
same tab never shows them; logging out clears them. The server stores
nothing. My day keeps its own state anyway (the search included): it
stays mounted under a task.

*Implemented:* `client/hooks/drafts.ts` (`useDraft`).

### 37. The timesheet is the employee's until the day is scored

The timesheet only moved forward: a closed shift could be neither
corrected nor deleted, a second shift was offered only for a past day
without any, and a scored day was frozen for good. A wrong end typed at
night stayed wrong, and the manager had no way to let it be fixed.

Now every shift of a day without a standing score — open or closed — can
be added, corrected and deleted, and any day may have several. The score
is what freezes the day. The direct manager can withdraw a score
(the value goes, the reason stays): the employee corrects the timesheet
and time entries, and the day is scored again, with the old reason
offered in the dialog; scoring a withdrawn day checks it like a first
score. A withdrawal is mailed like every version, so the history in the
employee's mail stays whole; a withdrawn score counts nowhere — not in
scored days, not in the weighted score, and the day waits for a score
again.

*Implemented:* `score.value` NULL, `trg_work_check()`,
`trg_spent_minutes_check()`, `trg_score_check()` in `db.sql`;
`Work.update`, `Work.remove`, `Team.unscore`.

### 38. Hours of different people are never added up

An hour of one person is not an hour of another: what each hour is worth
— pay, grade, contract — differs, and the company keeps it to itself, so
the product cannot store the weights and must not pretend hours are
interchangeable. A sum of the team's hours, or a score weighted by hours
across people, is therefore meaningless and is not shown anywhere.

Each person's hours stay theirs: their timesheet, and their score
weighted by their own hours. Across people only what does not depend on
the weight is combined: time in tasks as a share of each person's own
timesheet, averaged over people; the score averaged over people; counts
of days and tasks. Settled — not to be revisited without a way to know
the weights, which the product deliberately does not have.

*Implemented:* `MyDayPage/Team.tsx` (the team line), `Team.summary`.

### 39. Signals of how a team works, not only how much

Hours and scores say how much and how well, but not whether the team's
habits hold or where the work is heading. My team adds signals that come
from data already kept and that cannot be gamed by working worse:

- **How late the timesheet is written** — the median between a shift's
  end and its record: a timesheet written days later is a
  reconstruction, and a score built on it is weaker.
- **Reaction to mentions** — the median of the person's *working* time
  (their shifts, `working_minutes()`) from a mention to their first
  reply to it, and the mentions left unanswered. Time off is not theirs to
  answer for: a mention a minute after the shift, answered as the next
  shift began, took 0. Without a timesheet there is nothing to measure
  against, so no value.
- **How long days wait for a score** — on a manager's row: the median
  from the end of a report's day to the manager's score.
- **Backlog** — the person's planned work in hours (their "time left"
  estimates on open tasks, `backlog_minutes()`), its growth over the
  range and its sparkline: is planned work piling up faster than it is
  done.

Medians, so one outlier does not color a month. Across people they are
averaged, and hours — the backlog included — are never added up
(decision 38). Deliberately not measured: task flow (many small tasks or
a few big ones say nothing), deadline moves (often not the owner's
doing), cycle time (it discourages writing down tasks of unknown length)
and blocked tasks (it discourages linking tasks) — each would push people
to game the tracker instead of doing the work.

*Implemented:* `working_minutes()`, `backlog_minutes()` in `db.sql`;
`Team.summary`; the charts in `client/components/MyDayPage/TeamDetails.tsx`.

### 40. A deadline at risk is one person's plan against their own time

An open task is at risk when someone's "time left" on it does not fit
their working time before the deadline: their usual minutes per day
(the last 28 days of their timesheet, or a 40-hour week without one)
times the days left. The task line and card say "At risk" with whose
plan and by how much; My team counts such tasks per owner. The plans of
different people are never added up (decision 38) — each is measured
against their own time — and other tasks competing for the same hours
are deliberately left out: the signal is early and simple, not a
schedule.

*Implemented:* `deadline_risk()` in `db.sql`; `TaskHeader.risk`,
`Member.atRisk`; `RiskChip`.

### 41. A bot is an employee with a token

*Replaced by decision 49: a bot is a kind of employee with one key.*

CI and monitoring need to write into tasks — a failed build as a comment
that mentions whoever must react. Rather than a separate kind of account
with its own rights, a bot is an ordinary employee (invited, without a
pronoun) and a program acts as it with an API token: the same rights, the
same visibility, the same history. The bot cannot sign in, so its direct
manager issues and revokes its tokens; anyone can issue tokens for
themselves. A token is shown once and kept only as a hash; dismissal
revokes them all. The API is the one the interface uses — tRPC over HTTP
with `Authorization: Bearer` — documented for administrators in
`docs/admin/api.md`.

*Implemented:* `api_token`, `issue_api_token()`, `authenticate_token()`,
`revoke_api_token()` in `db.sql`; `server/ctx.ts`; `ApiToken` router;
`ApiTokens` in the profile and on the employee page.

### 42. Monday's email says what waits, or nothing

A manager starts the week with an email — Monday from 09:00 in their own
time zone — that says what waits for them in their team: days of direct
reports waiting for a score, tasks of the subtree closed automatically
last week, tasks at risk now, with a link to My day. Only the lines that
are there; a quiet week sends nothing, so the email stays worth opening.
It goes once a week (`weekly_digest_on`), is not copied to anyone while
the manager is away (it is about their own team), and reaches the
webhook like every notification.

*Implemented:* `send_weekly_digests()`, `employee.weekly_digest_on` in
`db.sql`; the `weekly_digests` cron job; `weekly_digest` notifications.

### 43. Offline, a change is accepted and sent later

yartt installs on a phone and keeps working without a connection — in a
train, in a basement. A change made offline is accepted at once: the
screen moves on as if it was sent, and the change waits in an outbox
kept in the browser, to go out in order at the first chance (when the
connection is back, and every 30 seconds while anything waits). The
server stays the judge: a change it refuses when it finally arrives is
dropped with its reason shown; anything short of the server's answer is
tried again, never dropped. What was last loaded is saved too and comes
back when the app starts without a connection (online, fresh data is
used — a saved state might be someone else's on a shared computer); a
service worker serves the app itself. With several tabs open, one sends
the outbox at a time, so no change goes out twice.

Deliberately not queued: signing in and out, a token shown once, and
visits (sent later, they would be logged at the wrong time). A queued
change has no result yet — a new task has no number until it is sent —
so screens that use a result handle its absence. There is no merging:
a change applies as of when it arrives, like one made a moment late.
Logging out with unsent changes asks first; another person signing in
on the same browser starts with an empty outbox.

*Implemented:* `client/hooks/offline.ts` (the offline link, the outbox,
the saved cache), `client/public/sw.js`, `manifest.webmanifest`.

### 44. My team: a narrow table of what compares, teams fold, details on a click

The first My team was a wide table: thirteen columns, sparklines under the
numbers, a horizontal scroll that hid the actions, managers who unfolded
into their reports. Managers read it as a wall: which number matters, what
a dotted sparkline says, where to bring back a dismissed person.

Now the table has only what compares across rows — time in tasks, score,
tasks, delay — and everything else goes to the details under a line, with
real charts (axes, a legend, the day in a tooltip) instead of sparklines.
Tasks closed by hand and automatically, open, at risk and the backlog are
one column; the three delays are one column showing the delay furthest
past its limit (a day for the timesheet, a working day for a reply, three
days for a score) and naming it. Teams fold, not managers: a manager is
a person in the list, and their team is a line of its own under them; my
own team is never folded, its total on top. A manager is part of their
team: its line includes them, and it unfolds into them first.

A team's score is its manager's score: how well the team works is what its
manager answers for, and an average or an hours-weighted mix of its
people's scores would either repeat the people's own lines or add up
hours of different people (decision 38). For the same reason a team has
no backlog — a dash, not a sum of hours. A person shows only for ranges
they were there in: invited before the range ended, dismissed on or after
its first day (`employee.created_at`, `dismissed_at`). Bringing someone
back is a separate, folded list under the table: the viewer's own
dismissed reports, whatever the range (decision 45).

*Implemented:* `client/components/MyDayPage/Team.tsx`, `TeamDetails.tsx`,
`TeamChart.tsx`, `teamMetrics.ts`; `employee.dismissed_at`;
`Member.days` with the delays of each day.

### 45. A dismissed employee always has a manager who can bring them back

Nobody dismisses themselves: to leave, you need a manager, who dismisses
you and gets your team — your dismissed reports too. Only that manager
brings you back, and under themselves: moving on to another manager is
then your own choice (`manager_id` is yours to set), never the manager's
— nobody hands people around. A dismissed employee without a manager
could never return, so the database keeps that from happening
(`chk_employee_dismissed_manager`): nobody is dismissed without a
manager, and when a manager is dismissed their reports, the dismissed
included, move to the manager above.

Someone at the top has no manager and cannot be dismissed. They leave
through their own people, each acting for themselves: the successor
steps out from under them (clears their manager, or picks the leaver's),
the leaver picks the successor as their manager — no cycle any more —
and the successor dismisses them, getting the team. No special "hand
over" operation: it would have the leaver move the successor, and a
manager does not move people. Deliberately not added: a manager moving a
report, dismissed or brought back, to another manager.

Someone who will not hand over — at the top, nobody in the product can
dismiss them — is dismissed by the installation administrator with an
heir (`node server/admin.ts dismiss <email> --heir <email>`): the heir
becomes their manager and dismisses them, getting the tasks and the team;
an heir from their own team first leaves it for their place. It is a
command, not a button: the product has no admins, and whoever runs the
installation already holds its database.

*Implemented:* `restore_employee()`, `dismiss_with_heir()`,
`chk_employee_dismissed_manager` in `db.sql`; `server/admin.ts`; the
"My dismissed" list and the restore dialog in `client/components/MyDayPage/`.

### 46. Replies live in threads; the feed keeps a line at their moment

A flat feed scattered the answers to a request among later comments,
each with a quote of its parent, and "open mentions" showed the request
without what was answered. Now a reply lives under the first comment of
its thread — replies to replies too, one level deep, oldest first — so a
request and its answers read together, in "open mentions" as well.

The feed is newest first, so a fresh reply to an old comment would sink
with its thread; instead the feed keeps a grey line at the moment of the
reply ("Pavel → Marina: «…»") that unfolds the thread in place. Anyone
may reply, but a mention counts as answered only by a reply of the person
mentioned, to the comment that mentions them: a word elsewhere in the
task, or someone answering for them, does not let them press "Done"
(decision 9) and does not count in My team's reaction to mentions.

*Implemented:* `Comment.replies`, `ReplyEvent` in `shared/comment.ts`;
`threads()` in `server/services/Comment.ts`; `trg_mention_close_check()`;
`client/components/TaskPage/CommentItem.tsx`, `Feed.tsx`.


### 47. The demo has no sign-in, and never touches real data

Someone weighing yartt wants to see it lived in, through the eyes of a
CEO, a manager and the people under them — not to set up mail and sign
in to an empty screen. With `DEMO_DATA=en|ru` the image is a made-up
company in that language, drawn avatars included: the first page lists
its people, a click shows the interface as that person, and the profile
menu switches to another; "Demo" in the top line says it is not real.
Every start and every night seed it afresh, because its days are
relative to the day it was seeded and a week-old demo shows an empty
today; it is never migrated — a new image installs its schema anew. Open
to anyone, it says that whatever is written there any visitor reads and
the night erases, takes files of 2 MB at most and keeps out of search
engines.

No sign-in is safe only on made-up data, so the database says whether it
is a demo: its schema version is `demo`, a version of its own that is
never migrated. Only such a database is wiped, and one with tables at any
other version stops the start with nothing touched — a mistaken
`DEMO_DATA` neither erases a company nor opens it to everyone; the
migrator, the other way, refuses a demo database. The other
way, the image refuses to start for work without SMTP: no email, no
sign-in links.

*Implemented:* `schema_version` demo (migration `0.0-0.1`), `seedDemo()`,
`refreshDemo()` in `server/demo.ts` (nightly from `server/worker.ts`), `demoTexts.ts`, `demoImages.ts`;
`Auth.demo`, `Auth.demoSignIn`; `client/components/App/DemoPeople.tsx`;
`prod.env.example`, `demo.env.example`.

### 48. Dismissal is a date, not a missing email

A dismissal used to erase the email, so "working" meant "has an email":
bringing someone back meant typing their address again, and nobody could
work without one — a bot needed a made-up mailbox. Now whether someone
works is `dismissed_at` alone. A dismissed employee keeps their email,
and the manager brings them back without typing it; the address is not
held, though: one working employee per email, so someone new may get the
address of someone who left, and the one coming back then takes another.
An employee may have no email at all: no emails and no sign-in link, but
the bell, mentions and everything else work.

*Implemented:* `employee.dismissed_at`, `uq_employee_email`,
`restore_employee()` (migration `0.1-0.2`); `Employee.restore` with an
optional email; `server/delivery.ts` sends mail only to an address.

### 49. A bot is a kind of employee, with one key and narrow permissions

A bot used to be an invited person with an API token, and anyone could
issue tokens for themselves: a bot needed a made-up mailbox, kept a
timesheet it never wrote and showed in My team with empty metrics, and a
person's token outlived their leaving. Now an employee is a person or a
bot. `employee` keeps what both have — a name, a manager, tasks,
comments, mentions, notifications; `human` and `bot` hold the rest, and
what only people have (timesheet, time, scores, sessions, reminders,
visits, managing) refers to `human`, so the database itself keeps bots
out of it. The email stays in `employee`: one working account per address
needs it next to `dismissed_at`.

A bot has one key, without expiry: its manager replaces it when it may
have leaked. Handing the bot over and dismissing its manager replace the
key with one nobody knows, because the previous manager knew it. People
have no keys at all. A bot reads what an employee in its place would
see, and changes only what its permissions allow — its tasks, handing
them over, comments, observers: they narrow its relationships, never
widen them, so no role appears. Anyone creates a bot under themselves;
only its direct manager runs it and hands it over, at once, like tasks of
someone dismissed. Its notifications go to its own webhook as signed
JSON, with its own secret so one bot cannot forge another's; a webhook
that is down gets one attempt and never holds people's notifications.

A bot made as a person before stays a person: its manager creates a bot
and dismisses the old one, handing its tasks over by hand.

A bot has no timesheet or score, but a manager still needs to know it
works: Bots under My team show, for the last N days, its tasks, comments
and mentions, its API calls with a sparkline by day and the share
refused, the share of webhook deliveries that got through, the quiet ones
first; its settings chart calls and refusals by day. Calls are counted per bot and day in
the database, after each call and outside its transaction, so a refused
one counts too. What it created or handed over is not shown: task
creation and owner history are not kept (decision on `created_by`). A
key a year old is told to its manager once a year, without stopping it.

*Implemented:* `employee.kind`, `human`, `bot`, `bot_permission`,
`create_bot()`, `reset_bot_key()`, `transfer_bot()`,
`authenticate_bot()`, `employee_kind_row`, `bot_usage`,
`send_bot_key_reminders()` (migration `0.1-0.2`); `Bot`
router, `Meta.bot`, the check and `countBot` in `server/trpc.ts`; bot webhooks in
`server/worker.ts`, `server/webhook.ts`; `client/components/MyDayPage/Bots.tsx`,
`BotDialog.tsx`; `docs/admin/api.md`.

### 50. The unseen come first, without an alarm

A person who left the company without being dismissed in yartt — their
provider account disabled, their mailbox closed — stays in the team with
their tasks until someone notices. An alert after N days without a visit
was the first idea, but weekends and holidays make any N wrong: every
Monday it would cry about half the team. Instead My team shows, next to
everyone, when they were last seen — a visit or a session, whatever the
range — and puts the longest unseen first in each level. People away are
not spared: an absence may be on paper only, and their return date is
right next to them.

*Implemented:* `Member.lastSeenAt` in `shared/team.ts`, `summary()` in
`server/services/Team.ts`; the order and the line in
`client/components/MyDayPage/Team.tsx`.

### 51. A new email is confirmed by a link sent there

The profile changed the sign-in email at once, so a typo locked the
person out for good: the next sign-in link went to an address nobody
reads, and only a manager could help. Now "Change" sends a link to the
new address, and the email changes only when it is followed, within a
day; the old address gets a word, in case it was not them. The link goes
by email only, never to the webhook: following it is what proves the
mailbox is theirs. It signs nobody in, and following one drops the other
pending changes. An invite and bringing someone back still set the email
directly: the manager typing it answers for it.

*Implemented:* `token.email`, `request_email_change()`,
`confirm_email_change()` (migration `0.1-0.2`); `Employee.requestEmailChange`,
`Auth.confirmEmail`; the mail-only kinds in `server/delivery.ts`;
`client/components/EmailConfirmPage.tsx`, the email field in the profile.

### 52. Only the company's mail domains, and a way out for the rest

A company wants its tracker on its own addresses: a personal mailbox
outlives the job, and an address with a typo invites a stranger. With
`EMAIL_DOMAINS` set, no other address is written anywhere — an invite, a
change of one's email, bringing someone back (with their old address
too). It is configuration, like SMTP, so it lives in the environment, not
the database; exact domains only, so a subdomain is one more entry.

Someone who already has another address is not locked out: they sign in
as before, but the server refuses them everything except changing their
email (and logging out), and the interface shows only that. Their
notifications still reach the bell and the webhook; their mail gets a
request to change the address instead, at most once a day. Turning the
setting on is therefore safe on a working installation: people move to
the company's addresses on their own.

*Implemented:* `EMAIL_DOMAINS` in `server/env.ts`, `server/domains.ts`;
`Meta.outsideDomains` and the check in `server/trpc.ts`; `Auth.me`
(`Me`); `human.outside_domains_told_at` (migration `0.1-0.2`) and the
request in `server/worker.ts`; `client/components/OutsideDomainsPage.tsx`.

### 53. With the company's identity provider, it is the only way in

A company with Entra, Google Workspace or Keycloak wants one account for
everything and one switch to cut someone off. With `OIDC_ISSUER` set,
yartt signs people in only through it (OpenID Connect, the authorization
code with PKCE): no sign-in links, no invites, no changing one's email —
the provider decides who comes in and what their address is. Someone
new is created on their first sign-in, known afterwards by the
provider's id, not the email, which may change there; someone invited
before is found once by an email the provider vouches for; a dismissed
person is refused — only their manager brings them back.

Cutting someone off must reach yartt without a person remembering to,
yet a manager's decisions stay theirs. So a session lasts a day from
sign-in, active or not, and every day the worker asks the provider, with
the refresh token of the person's last sign-in, whether they may still
sign in. A refusal ends their sessions and links and stops their bots —
whoever runs a bot must be someone the company still lets in — and shows
in My team and in their manager's Monday email; dismissing them, with
their tasks and people, stays the manager's act. LDAP is not spoken
directly, so yartt never sees a password: Keycloak or Authentik bridges
LDAP and SAML to OIDC. An outage of the provider is handled by turning
the setting off: sign-in links work again on the same data.

*Implemented:* `server/sso.ts` (openid-client); `sign_in_external()`,
`start_session()`, `idp_refused()`, `authenticate(p_lifetime)`,
`human.external_id`, `idp_*`, `session.created_at` (migration
`0.1-0.2`); the `idp_check` cron; `Auth.config`; the login page;
`docs/admin/install.md`.

### 54. My day keeps two days; a day is a ribbon

History in My day grew long: seven days a page, every task of a day up
to three times — logged, opened at 0, and once per visit in the log under
the shifts. Now My day keeps today and the last day before it with
activity — what was I doing? — and "History" leads to all of them, the
employee's own page, two weeks a page. A day lists every task once, with
the time logged to it; tasks opened and not logged are folded under one
line, the visits one by one under another.

Transparency stays in one line: the ribbon of the day, the shifts as
bars, every visit as a tick — faint inside a shift, marked outside one —
and what was done, a comment or time logged, as a dot. It shows at a
glance when someone was here and whether that agrees with the shifts. A
visit proves little — clicking around is easy — but a shift without a
single mark inside, or work outside any shift, stands out, and a comment
is harder to fake than a visit; that is why they are marked apart.

A shift starts now, with "Start the shift" in today's header or the icon
in the top line, and finishes now with "Finish", which still asks what
was done (decision 21). Starting from a visit is gone: an earlier start
is a correction of the shift, or a shift added by hand afterwards.

*Implemented:* `DayHistory.actions`, `HistoryInput.size` in
`shared/myDay.ts`; `client/components/MyDayPage/Day.tsx`, `DayRibbon.tsx`,
`History.tsx`; the start icon in `client/components/App/TopStatus.tsx`.

### 55. One title field everywhere; a tag is never made by accident

People did not get how tags make a title. Enter turned whatever was typed
into a new tag, so a typo became a tag; the search could not create, the
form could not tell that a title was taken until it was saved, the title
on a task page was changed in a bare field without suggestions, and a
dependency was linked by a number one had to look up.

Now one field does it all — the search of Current tasks, the new task,
changing a title, finding a task to link. Enter takes only a tag spelled
exactly so (in the search, the best suggestion); a new tag is a button
under the field, offered only when no tag is spelled so, the whole phrase
one tag ("перевести форму на новый API"). Text left unpicked becomes a
tag of its own when a task is created, unless a tag is spelled so — then
it has to be picked first. A title another task has is named, with a
link, as it is typed (`Task.byTags`; the database refuses it anyway —
uq_task_tag_ids). "+" at the end of the search opens a new task with the
title typed. A dependency is found the same way, by tags or "#number";
in "Waited on by" one of my own tasks can be linked, not only a new one.

*Implemented:* `TagInput` and `useTitle` in
`client/components/App/TagInput.tsx`; `TaskPicker`; `Task.byTags`,
`SearchInput.tab` 'all'.

### 56. A title is rubrics and a phrase

The main criticism of titles made of tags: "отчёт · q3", "api ·
авторизация" name a heading, not what is to be done, and a list of them
says nothing. A tag may be a whole phrase (decision 55), so a title is
rubrics to group by and one phrase that says what this task is: "склад ·
инвентаризация · подписать акт до пятницы". The phrase needs no flag of
its own: a tag no other task carries is the task's phrase. It is shown as
a chip like any tag — showing it as text set it apart, but a title read
the same either way, and telling the two apart on every title cost a
count per tag; the difference matters only where groups are listed.
A new task made from another one starts with that task's tags, to be told
apart with a phrase or one more tag. Under a title being
typed, the rubrics that most often go with the picked ones are offered,
so the same things keep the same names; a phrase of one task is never
offered as one.

The demo company is written this way too — "сайт · новая главная к
осенней кампании", "поддержка · тикет 1049: двойное списание по карте" —
since it is the first thing anyone weighing yartt sees.

*Implemented:* `rubric()` (a tag on two tasks or more, read with `LIMIT 2`)
in `Tags.related` and `Tags.stats`; "Often together" in `TagInput`; the
title of a related new task in `NewTaskPage`.

### 57. Closed tasks have a tab of their own

Current tasks showed only open tasks, so what was just closed — by hand
or by its deadline — disappeared, and the search mixed closed tasks into
the open ones. Now a third tab, **Closed**, holds the closed tasks I see,
the most recently closed first; with a search the closed ones found go
there too, and "I own" and "Others" stay open tasks only. The open tabs
keep their order: the nearest deadline first, the same moment by
priority, tasks without a deadline at the end, by priority.

*Implemented:* `CurrentTab` 'closed', `current()` in
`server/services/MyDay.ts`, `search()` in `server/services/Task.ts`;
`CurrentTasks`.

### 58. Tags: what happened under each, for everyone

Tags are how work is grouped, yet nothing showed how a tag was doing.
Now My day has **Tags**, under My team, for everyone: for the last N
days (7, 30, 90, 365 — ending today, so a plan of time left belongs
next to them), each tag's tasks (open, at risk, untouched in the period),
those closed by hand and by deadline,
comments and the people who commented or logged time — counted only on
the tasks the person sees, so it shows a director the company and anyone
else their corner of it. Without a search every rubric (a tag on more
than one task — a phrase of one task is not a group) is a line, the most
active first, with pages; with tags picked, those lines and, for two or
more, their tasks all together and any of them. The People column
adds the average over them of each one's share of their own time logged
in the period. A line unfolds into charts: per day, comments, closings
and people at work; then each person's own time per day, a line each,
never stacked. Their legend and the table under it carry each one's
share of their own time and their plan — the time they have left on the
open tasks of the tag. A plan is never on the tag's line: it would be a
sum of hours of different people (decision 38). Everything shown goes
out as CSV: a line per tag and person, with share and plan.

*Implemented:* `Tags.stats`, `Tags.detail` in `server/services/Tags.ts`;
`client/components/MyDayPage/TagStats.tsx`.

### 59. A task hovered anywhere shows what it is and who spends on it

A title says what a task is; deciding what to open or where to log time
needs a little more — what is wanted and how much it has taken. Hovering
a task in any list (Current tasks, What waits for me, dependencies, the
search, the days) for a moment shows its context, cut short, and each
person's time logged on it and time left — one's own first, then the
others, each their own, with no total (decision 38). Someone who does not
see a private task gets only that it is private. In the days a task now
shows its whole title, wrapped, not cut.

*Implemented:* `Task.preview`; `client/components/App/TaskHint.tsx` in
`TaskLine` and the day rows.

### 60. One time entry per task and day, set, not added up

Time was logged as entries added up: logging twice for one task and day
made two entries, a correction meant deleting one and logging again, and
the timesheet listed them all. Now a person has one entry per task and
day — the day's whole time on it. Logging shows what is there and
replaces it; 0 removes the entry; when it was last set shows over it. The
same entry is set from the timesheet and from the task ("Today 1h 30m"
in My time) — two places, one record. A scored day changes in no way, as
before. The migration merged the entries of one day into their sum.

*Implemented:* `uq_spent_minutes_day`, `spent_minutes.updated_at`,
`trg_spent_minutes_check()` (migration `0.1-0.2`); `Time.set` instead of
`Time.log` and `Time.remove`; `LogTimeDialog`, `MyTime`.

### 61. The days are the Timesheet

The block of one's days was called "My days" on a screen called "My
day" — two names a letter apart for different things. It is the
Timesheet now: shifts and time logged are what it holds. "History",
which leads to all of one's days, keeps its name.

### 62. The guide is in the product, written for each language

yartt drops things people expect — titles, projects, assignees, deleting
— so they need to know why as much as how. "?" in the top line (in the
menu under the avatar at phone width) opens a guide over My day: what
yartt is and what it gives, short how-tos for the usual things, and
answers to "why is it so" for every unusual rule. It is written for each
language, not translated word by word, and kept in step with features
like the demo.

*Implemented:* `shared/i18n/help/ru.ts` (the reference), `en.ts`;
`client/components/HelpPage.tsx`, `/help`.
