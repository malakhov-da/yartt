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
time, or explain why the task is closed but not done. Overdue tasks stand
right in front of the owner in **My day**, so a responsible owner moves
them. Hard dependencies may forbid the move; then the owner has to go and
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

Opening a task and opening **My day** are logged. My day can then show not
only new comments on my tasks but also who looked at them, and the shift
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

### 8. Managers see their whole subtree — on the Team screen

Every manager up the chain keeps access to all tasks of their reports. But
My day and search show only what the person owns, observes by choice or
was mentioned in. The whole subtree lives on the **Team** screen, so a
director's daily lists do not drown in hundreds of tasks.

## Open

Nothing yet.
