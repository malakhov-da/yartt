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
same as doing what was asked. The mentioned employee presses "Done". An
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
day's timesheet and time entries freeze at the first score.

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
minutes. Sitting on a page all day is one visit.

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
reading is never applied silently. A tag can exist without a task; one
nobody uses is removed after a day so abandoned spellings do not come
back as suggestions.

*Implemented:* `translit()`, `tag.latin`, `employee.keyboards`, the
`tag_cleanup` cron job in `db.sql`; `shared/keyboards.ts`;
`Tags.suggest`, `Tags.create`.
