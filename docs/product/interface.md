# Interface

The interface is one screen — My day — and what opens over it: a task, a
person's page, the profile. Each answers one question. There is no
settings screen and no tabs (decision 31).

## The top line

A thin line, not a toolbar: the logo (the mark and the name of the only
screen in the interface language — Мой день / My day), my open shift
with its running time (a click closes it — the end of the day is often
spent on a task page; a shift is started in My day, where the first
visit suggests its start), a bell with how many TODO items wait for me
(a click brings My day — so a new mention is noticed on any page),
**Invite** (a person with a plus: a small dialog with a name and an
email) and my avatar (a photo, or the initials in a circle). The avatar
opens a menu: Profile, Log out. The search lives in My day (3). The product name and its release are in a quiet footer at the bottom
of My day.

The logo is the way back: there is no "Back" line on a page. My day keeps
its state while a task or a person is open (its tab, pages, scroll), so the
logo returns me exactly where I was — the search and its picked tags
included (3); a task is created in the new-task form (2a). Whatever is
typed and not saved — a comment, a new task, an edit — waits as a draft
until I come back to it (decision 36).

## 1. My day — "what needs me?"

The home screen, and the only one. Marina opens it with her morning
coffee; Pavel keeps it open all day. Three blocks, and a fourth for
someone with reports:

- **TODO** — what waits for my reaction, newest first:
  - mentions of me that are still open. A mention closes only explicitly
    ("Done"): a reply alone does not mean the request is handled — but
    "Done" needs a reply: until I comment in the task after the mention
    the button waits, so whoever asked always gets an answer. This is
    the only way a task I merely observe gets here — its other comments
    stay quiet;
  - my own tasks with comments by others since I last confirmed that no
    intervention is needed (decision 16);
  - access requests to my tasks.
  Each item has its action right there: done, reply, no intervention needed,
  approve or reject. When TODO is empty, the screen says so — that is the
  goal. Days of my reports waiting for a score are not here: scoring is
  never required, it lives on the employee's page.
- **Current tasks** — every open task I see (no deadline, or a deadline
  ahead), in two tabs: **I own** (I answer for them) and **others** —
  each explains itself on hover. Each tab is a
  grid with pages, by deadline, nearest first; tasks without a deadline at
  the end. For a director "others" is hundreds of tasks — pages keep it
  usable, the search on top narrows it (3). Public tasks of others are in
  "others" for everyone: there should be few of them (decision 14).
  **New task** in the "I own" tab opens the form (2a).
- **My team** — only for someone with reports; see 4.
- **History** — my days, from today back into the past, with pages. A day shows the shift (work) if the team keeps a timesheet, the
  time logged to tasks (spent_minutes), and the visits: which tasks I
  opened and when I came into the system. Next to each task I opened is
  "Log time" for that day (15m, 30m, 1h, 2h a click away), so time is
  logged where the day is reviewed, without opening every task. Today's day is where the shift
  is started: each arrival — the first visit, or one after a pause of 10
  minutes or more — has its own "Start" opposite it, so a shift begun
  after lunch starts from that return, not from the morning; "Start now"
  and another time are there too. The open shift is closed here or from
  the top line; past days suggest a shift from the same visits. Any day
  not scored is mine to fix: "Add a shift" (a forgotten or a second one),
  and each closed shift can be corrected or deleted (decision 37).

There is no separate "closed by its deadline" item: a passed deadline
closes the task like a manual close does, and the task simply leaves
Current tasks. Reopening it is the owner's job (see decision 2).

Opening My day is logged.

## 2. Task — "what is this and who answers for it?"

A page of its own (`/tasks/<id>`). There is no "Back" line: the My day tab
in the top line returns to it without reloading — tab, page and scroll
are kept.

Two columns: the task and its feed on the left, a side panel on the right
running the whole height of the page.

Left, top to bottom:

- **Header:** the task number before the tags, so the tags never shift;
  the tags (the "title", in my own tag order), the owner with avatar, priority, deadline, and whether the task
  is public or private. The owner edits them in place and has "Finish"
  (the deadline becomes now).
- **Needs the owner:** when others have commented since the owner's last
  check, the owner sees "Since your check on <date>: N comments from …"
  and "No intervention needed". Pressing it is a statement — "I read
  this, nothing here waits for my decision" — not "I have seen it"
  (decision 16). The new comments are marked in the feed. The button is
  disabled while an access request waits for an answer.
- **Context:** the owner's description, edited in place. It follows from
  the comments, so it keeps no history of its own; neither do the owner,
  priority and tags — they are the task's state, not its story.
- **Dependencies:** "Waits for", then "Waited on by", one under the other.
  Each line — tags, priority, kind (hard, with its lag), deadline, owner's
  avatar. Resolved dependencies stay in the list, struck through, so the
  history of what blocked the task is not lost.
  **New task** next to each list opens the new-task form tied to this
  task: one this task waits for (the owner only), or one that waits for
  it (anyone who sees it — the new task is theirs).
- **Feed**, newest first; the composer on top is a rich text editor
  (mui-tiptap): images are pasted, dropped or picked and shown in the
  text; other files become attachments; people and tasks are attached
  explicitly. After "Send" the comment waits a few seconds with "Back to
  editing" and then goes out. By default the feed shows only the comments
  with open mentions — what still waits for someone; "All events" shows
  every comment and event, with pages. Events appear between the comments
  as grey lines: deadline moves, a comment of another task attaching this
  one ("Mentioned in #7"), time logged ("Pavel logged 2h for Oct 14") and
  time left set or cleared. Time entries of one person in a row, with
  nothing else between them, are one line ("logged 16h over 8 days,
  Oct 5 — Oct 14"); a click shows the days. A reply shows a
  quote of its parent; the feed stays flat. Who read a comment is not
  shown: in a public task that would be the whole company.

Right, the side panel:

- **My time:** what I spent and what I have left, with "Log time" and
  "Time left" — on top, apart from the list.
- **Observers**, one list:
  - access requests first, with "Approve" and "Reject", then "Add
    observer" (owner only);
  - every observer, sorted by the last visit, with pages. No roles, no
    table and no totals: a clock icon if the person logged time, an
    hourglass if they gave their time left; the tooltip shows the
    number (decision 17);
  - the owner and a manager whose report observes the task have a lock
    instead of "Hide"; its tooltip says why ("Task owner", "Pavel's
    manager");
  - hovering a person shows their observation periods — from when to
    when, who added or removed them;
  - the owner sees "Hide" on hover, and "Bring back" on someone who no
    longer observes the task. Former observers stay in the list, greyed
    out;
  - "Make public" — owner only.

No tabs, no "details" section, no activity log apart from the feed and the
observation periods. Opening a task is logged as a visit.

### What an observer sees

Exactly what the owner sees — header, context, dependencies, feed,
observers with their time — but as text, without the requests, "Add",
"Hide" and "Bring back". An observer writes comments, logs their
own time and sets their own time left; nothing else (decision 15). Their
own open mention is shown in the header with "Done". They can leave the
task.

### Access

- In a private task the owner adds observers explicitly; anyone else
  brings a person in only by mentioning them (decision 15).
- Becoming an observer and stopping being one is always notified: "access
  opened" (added, mentioned, request approved) and "access closed"
  (hidden, request rejected, the task made private without them).
- Someone without access sees the task number, tags, priority and
  deadline — they are visible to everyone (decision 19) — and "Request
  access"; the page says that the answer comes as a notification. The
  context, the feed and the people open after approval.

### Public tasks

A task with no observers is **public**: every employee sees it, comments,
logs time; it is in everyone's "others" in My day. A mention in a public
task does not add an observer. A new task is private, with its owner as
the only observer. The owner makes it public (all observers go). Making it
private again leaves the owner, the managers above and everyone with an
open mention; the people who commented are offered back with one click
(decision 14). A public task shows a "Public" mark in its header; its
side panel lists only the people who opened it, the same way as
observers, with pages.

## 2a. New task — "what is there to do?"

A form over My day (`/tasks/new`), opened by **New task** in Current
tasks (the "I own" tab) or from a task's dependencies. The title is the
tags, typed as in Find: typos forgiven, several words offered as ready
sets of tags, "New tag" when no tag is spelled exactly so — shown dashed
and created only when the task is saved. Priority,
deadline and context are optional; a dependency the form was opened with
can be dropped. "Create task" opens the new task.

## 3. Find — "where is that task?"

One input at the top of Current tasks in My day; `/` anywhere (a task
page too) brings My day back and focuses it. It finds by tags only.
Typing suggests tags — despite typos, transliteration or the wrong
layout, and several words as ready sets of tags (decision 33); Enter
takes the best one. There is no "create" here: a tag nobody has would
find nothing. Picked tags narrow both tabs to the tasks carrying all of
them — any task then, closed ones and ones the person does not see
included (they open on "Request access"), since tags are visible to
everyone. When the current tab has nothing and the other has, the other
one opens. **New task** in the "I own" tab takes the picked tags into the
form (2a).

## 4. My team — "how is my team doing?" (managers only)

A block of My day across its whole width, shown only to someone who has
reports: the tree of
the whole subtree for a range (the last 7, 30, 90 days or any dates) —
me at the root (my own report: there is no other place to see it), each
manager's reports nested under them, collapsible. A person's row:

- workload (timesheet hours and days);
- time in tasks — the share of their own timesheet logged to tasks;
- the score weighted by their own hours, with the number of scored days;
- days waiting for my score (direct reports only);
- tasks closed by hand and closed automatically — a deadline set in
  advance came (decision 32); open tasks now;
- how late the timesheet is written — the median time from a shift's end
  to its record (a day or more: written after the fact);
- reaction to mentions — the median of their working time (shifts only)
  to the first reply in the task, and how many are left unanswered;
- for a manager, how long their reports' days wait for a score;
- backlog — planned work in hours (their "time left" on open tasks), its
  growth over the range and a sparkline.

Time in tasks and the score have a sparkline of the range's days under
them (hover tells a day). Under a manager's reports is the line of their team: counts add up,
shares and scores are averaged over people, hours are never added up
(decision 38). "With managers" counts the manager in their team's line.
Ticks pick people for a line of their own ("Picked"); one click on a
manager picks their whole team.

Direct reports can be dismissed and brought back here. A name opens the
person's page. Inviting is not here — anyone invites from the top line.

## 4a. Employee page — "how are this person's days?"

The same History as in their My day: shifts, time logged to tasks, visits
(which tasks were opened, when they came in), and the score of each day if
given. Nothing is hidden from the managers (decision 12). Seen by the employee and every manager
above them. Only the direct manager scores a day — never required;
managers higher up only look. A score is given in a small dialog, with a
reason for a low one, and may be corrected or withdrawn so the employee
can correct the day (the reason stays for the next score); the page
shows the current value, the employee's mail keeps every version
(decisions 22, 37). On top —
workload and the weighted score for 7, 30, 90 days or any dates, with a
chart (decision 23).

## 5. Profile — "who am I here?"

A dialog behind my avatar, not a screen.

- **Name, sign-in email, about me** — what I write; saved with one button.
  "About me" is free text: position, how to reach me, anything colleagues
  should know.
- **Back at work on, time zone, language, my manager** — applied as soon as
  picked, no button. "Back at work on" covers any absence: vacation, sick
  leave, a day off; until that day my notifications are copied to my
  manager.
- **Pronoun** — he, she or not given (a bot): verb forms follow.
- **Keyboard layouts** I switch between (by default the interface
  language's and the US one): tag search reads a word typed with the
  wrong one in each of them (decision 33).
- **Avatar** — a photo, cropped to a square; or the initials.
- **My tags** — a second section of the dialog: the tags of the tasks I
  see, with how many tasks carry each; my own color and weight of a tag
  (nobody else sees them). A tag opens the search narrowed to it.
- Log out on all devices.

There is no list of all employees: a person is picked where needed (my
manager, a mention, an observer), and a new one is invited from the top
line.

## Interaction rules

- **No confirmations for reversible actions.** Show what happened with
  "Undo" for a few seconds. Confirm only what cannot be undone and hurts
  others (dismissing an employee).
- **Edit in place.** No separate edit forms for things the owner changes
  daily.
- **Errors explain themselves.** A message says what happened and what to do
  next, with the task or person named, in the user's language.
- **Never an empty decision.** Defaults are always filled: the current
  user, today, the inviter's language and time zone.
- **Keyboard first for the perpetual intermediate:** `/` to search, `c` to
  comment, `Enter` to send.
