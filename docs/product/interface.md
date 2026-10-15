# Interface

The interface is one screen — My day — and what opens over it: a task, a
person's page, the profile. Each answers one question. There is no
settings screen and no tabs (decision 31).

## The top line

A thin line, not a toolbar: the logo (the name in the interface language —
яртт / yartt), a compact search input, **Invite** (a person with a plus: a
small dialog with a name and an email) and my avatar (a photo, or the
initials in a circle). The avatar opens a menu: Profile, Log out. On a
phone the search takes a line of its own.

The logo is the way back: there is no "Back" line on a page. My day keeps
its state while a task or a person is open (its tab, pages, scroll), so the
logo returns me exactly where I was. Search stays on every page: it is the
only way to find a task and the only way to create one.

## 1. My day — "what needs me?"

The home screen, and the only one. Marina opens it with her morning
coffee; Pavel keeps it open all day. Three blocks, and a fourth for
someone with reports:

- **TODO** — what waits for my reaction, newest first:
  - mentions of me that are still open. A mention closes only explicitly
    ("Done"): a reply alone does not mean the request is handled. This is
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
  ahead), in two tabs: **mine** (I own them) and **others**. Each tab is a
  grid with pages, by deadline, nearest first; tasks without a deadline at
  the end. For a director "others" is hundreds of tasks — pages keep it
  usable, search finds the rest. Public tasks of others are in "others"
  for everyone: there should be few of them (decision 14).
- **My team** — only for someone with reports; see 4.
- **History** — my days, from today back into the past, with pages. A day shows the shift (work) if the team keeps a timesheet, the
  time logged to tasks (spent_minutes), and the visits: which tasks I
  opened and when I came into the system. Today's day is where the shift
  is started and stopped; the suggestion comes from the same visits.

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

## 3. Find — "where is that task?"

One input at the top of every screen (`/` focuses it). Typing suggests
tasks and tags; picked tags narrow the list to the tasks carrying all of
them — any task, since tags are visible to everyone; a task the person does
not see opens on "Request access". The typed text searches the context and
comments of the tasks the person sees. Results show the number and tags.

Creating a task starts here: if the typed set of tags matches no task,
"Create a task with these tags" is the last item.

## 4. My team — "how is my team doing?" (managers only)

A block of My day, shown only to someone who has reports — a summary of
the whole subtree for a range (the last 7, 30, 90 days or any dates),
direct reports first, then theirs with their manager named:

- workload (timesheet hours and days) and time logged to tasks;
- the score weighted by hours, with the number of scored days;
- days waiting for my score (direct reports only);
- tasks closed by hand and closed automatically — a deadline set in
  advance came (decision 32); open tasks now;
- a total line.

Direct reports can be dismissed and brought back here. A name opens the
person's page. Inviting is not here — anyone invites from the top line.

## 4a. Employee page — "how are this person's days?"

The same History as in their My day: shifts, time logged to tasks, visits
(which tasks were opened, when they came in), and the score of each day if
given. Nothing is hidden from the managers (decision 12). Seen by the employee and every manager
above them. Only the direct manager scores a day — never required;
managers higher up only look. A score is given in a small dialog, with a
reason for a low one, and may be corrected; the page shows the current
value, the employee's mail keeps every version (decision 22). On top —
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
