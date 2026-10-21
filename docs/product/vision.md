# Vision

## One sentence

yartt is a task tracker built around responsibility and security: every
task has exactly one owner, only the people invited to it see it, and
every manager sees what is really going on — without configuring
anything.

## The problem

Popular trackers are built for the tool, not for the people using it.
They grow fields, statuses, workflows, boards and permission schemes until
a dedicated administrator is needed to keep them alive. Meanwhile the two
questions that matter stay hard to answer:

- **Who is responsible for this?** Assignments split responsibility between
  the one who asked and the one who does. "Done / not done" turns into an
  argument.
- **What is actually happening in my team?** Statuses are stale, boards are
  decorative, and the manager learns about problems in a meeting.
- **Who can see this?** Access comes by project: everyone on it sees
  everything in it, so an important idea reaches far more people than
  need it, and narrowing that takes an administrator.

## The bet

yartt does not merely drop the worn constructs of trackers; it replaces
each with a more flexible, better thought-out mechanism. That is what is
radical about it:

| Instead of            | yartt has                                   |
|-----------------------|---------------------------------------------|
| Projects              | Tags: a project, a kind of work, a direction, an action or any context; a task may carry several, and a new tag is made whenever a task needs one |
| Access by project     | Observers invited to the task by name, and the owner's managers; nobody else sees what is inside |
| Titles                | A unique set of tags, suggested as typed so the same thing keeps one name — synonyms become rare, nothing is lost |
| Subtasks              | Dependencies between equal tasks: a follow-up takes the tags of its origin and adds its own; one task may be needed by several; hard ones tie deadlines, so promises are kept in check |
| Assignments           | One owner — whoever started the task — who alone decides when it is done; observers solve their part, in a follow-up task or right there, and plan and log their own time |
| Statuses and workflows| A deadline: the task is done when it passes, so whoever started it answers for a sensible one |
| A single estimate     | Shifts, time entries and plans of time left side by side: several views of the same time instead of one figure taken on trust |
| Performance reviews   | A daily score of decisions, not of results, with feedback |
| Notification inbox    | Email in your language, or another channel  |
| Admins and roles      | The org chart: managers see their reports   |

**Transparency builds trust.** A manager sees the days of their people —
shifts, entries, visits — as the people see them. An honest employee
gains from it: the manager can trust them more. Looking busy only on
paper gets hard, since the ribbon of a day shows whether the visits,
shifts and entries agree.

**Everything beyond tasks is optional.** The timesheet, time entries,
plans and scores are there when a team wants transparency; a team that
wants only tasks with tags still gets their flexibility and secure
access.

## Positioning

**For** companies of 20–300 people with a real reporting line, where
managers hire, evaluate and are accountable for their people,

**who** are tired of trackers that need an administrator and still do not
show who is responsible,

**yartt** is a self-hosted task tracker built around ownership and the
org chart,

**that** makes responsibility explicit, keeps every task to the people
invited to it and gives every manager an honest picture of their team in
minutes a day,

**unlike** Jira, YouTrack or Yandex Tracker, which describe *process*,
yartt describes *responsibility*: instead of workflows, assignees and
project permissions — owners, deadlines, dependencies and invitations,
with nothing to configure.

The first market is companies that must keep data on their own servers and
have a clear hierarchy (typical for small and mid-size businesses in the
CIS). Flat product teams that want a public backlog for everyone are not
the target.

## Design principles

We follow goal-directed design (Alan Cooper): design for the goals of
specific people, not for a list of features.

1. **Design for the perpetual intermediate.** People learn the basics in a
   day and then use the product for years. Optimize for the hundredth use,
   not the first one; never for the expert's power settings.
2. **No configuration.** Every setting is a design decision we refused to
   make. If two teams need different behavior, at least one of them is
   wrong, or the product is.
3. **Don't ask, act and allow undo.** Confirmation dialogs train people to
   click "OK". Do the thing, show what happened, let them take it back
   (like the few-second undo of a sent comment).
4. **Don't make people do the computer's work.** Do not ask for what the
   system already knows or can infer: dates, the current user, the obvious
   next step.
5. **One owner, visible everywhere.** Who owns a task is never more than a
   glance away.
6. **The data never lies.** Nothing is deleted, nothing is silently
   rewritten; a closed shift, a score and a comment stay as they were.
7. **Quiet by default.** The product interrupts only the person who has to
   act, and only when they have to act.

## Non-goals

- Project portfolio management, Gantt charts, resource leveling.
- Configurable workflows, statuses, custom fields, issue types.
- Agile ceremonies: sprints, story points, burndown charts.
- Public or anonymous access; multi-company hosting.
- A notification inbox.

See also: [personas and roles](personas.md), [features](features.md),
[interface](interface.md), [decisions](decisions.md), [roadmap](roadmap.md).
