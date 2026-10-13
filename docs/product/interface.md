# Interface

The interface is a handful of places, each answering one question. There is
no settings screen.

## 1. My day — "what needs me?"

The home screen. Marina opens it with her morning coffee; Pavel keeps it
open all day.

- **Needs my action** — the only list that matters, ordered by urgency:
  - access requests to my tasks;
  - mentions of me that are still open;
  - my tasks with comments or visits by others since I last reviewed them;
  - my tasks whose deadline is today, and those a passed deadline has just
    closed — move the deadline or leave them closed;
  - (managers) days of my reports waiting for a score.
  Each item has its action right there: approve, reply, mark as reviewed,
  move the deadline, score. When the list is empty, the screen says so —
  that is the goal.
- **My tasks** — tasks I own, by priority, then deadline.
- **Shift** — suggested from activity: it starts with the first action of
  the day ("Not working now" to cancel) and "Stop" proposes the end from the
  last activity. Shown only if the team keeps a timesheet. Today's time
  logged to tasks is next to it.

My day shows only what I own, observe by choice or was mentioned in — never
the whole subtree of my reports. Opening it is logged.

## 2. Task — "what is this and who answers for it?"

- **Header:** the tags (the "title", in my own tag order), the owner with
  avatar, priority, deadline. The owner edits them in place; everyone else sees them as text.
- **Context:** the owner's description, edited in place.
- **Comments:** the full history, newest at the bottom, with a composer that
  attaches people, tasks and files. After "Send" the comment waits a few
  seconds with "Back to editing" and then goes out.
- **Side panel:** observers, pending requests (owner only), my time logged
  and my estimate, dependencies (next).

No tabs, no "details" section, no activity log separate from comments.
Opening a task is logged as a visit; the owner sees who looked.

## 3. Find — "where is that task?"

One input at the top of every screen. Typing suggests tags first; picking
tags narrows the list, free text searches context and comments. Results
show tags, owner, deadline.

Creating a task starts here: if the typed set of tags matches no task,
"Create a task with these tags" is the last item.

## 4. Team — "how is my team doing?" (managers only)

Visible only to someone who has reports. This is the only place where the
whole subtree of reports is shown.

- **Tasks of my reports** grouped by owner: overdue first.
- **Timesheet and scores** (if the team keeps them): a week grid — hours
  per person per day, the score if given. Scoring a day is one click;
  scoring is never required.
- **People:** invite, dismiss and bring back direct reports.

## 5. Profile — "who am I here?"

Name, how to reach me, away until, time zone, language, my manager, sign
out everywhere.

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
