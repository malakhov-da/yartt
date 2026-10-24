# Personas and roles

Personas are composite archetypes of real users. We design for their goals,
not for "the user". When a feature is discussed, ask: which persona needs
it, and which of their goals does it serve?

## Primary persona: Marina, head of a function

Leads a team of 8 in a company of 120 (engineering, sales, accounting — the
role is the same). Hired most of the team and answers for its results to
the director. Owns 5–10 tasks herself, takes part in about 60.

- **Life goals:** to be a fair manager; to have a team that does not need
  her for every decision.
- **End goals:**
  - see in the morning what needs her decision today, in under 5 minutes;
  - know who is overloaded and who is idle without asking in a meeting;
  - give honest feedback with facts, not impressions;
  - hand a task over without losing its history.
- **Experience goals:** never feel like a supervisor spying on people; not
  feel stupid in front of the tool; spend no more than 10 minutes a day in
  it.
- **Frustrations today:** statuses nobody updates; "who is doing this?"
  threads; performance reviews built from memory twice a year.

Marina is the **primary** persona: if the product works for her, it works
for the company. A design that serves someone else at her expense is wrong.

## Secondary persona: Pavel, specialist

An engineer in Marina's team. Owns 3–4 tasks, takes part in 15–20 others where
colleagues need his help.

- **Life goals:** do good work; be judged fairly.
- **End goals:**
  - know what to do next without hunting through lists;
  - be interrupted only when he is really needed;
  - log time and shifts in seconds, not minutes;
  - see why a day was scored low and what to change.
- **Experience goals:** be judged by facts, not suspicion — his days are
  open to his managers, so nobody has to guess; never lose work because of
  the tool.
- **Frustrations today:** notifications about everything; filling in
  timesheets on Friday from memory; tasks "assigned" to him that he cannot
  close.

Pavel's needs are met by the same design as Marina's plus a few additions
(timesheet, time entries). Where they conflict, Marina wins — but the
conflict must not make Pavel's day worse.

## Supplemental persona: Oleg, director

Runs the company, with four heads of function under him. Sees everything
down the hierarchy but rarely opens individual tasks.

- **End goals:** see where things stall across the company; see which
  teams keep their deadlines and how workload and quality are distributed.

Oleg is served by aggregated views over what Marina already produces. We
never add work for Marina or Pavel to make Oleg's reports nicer.

## Negative personas — we do not design for them

- **The process administrator** who wants workflows, custom fields and
  permission schemes. yartt deliberately has nothing to administer.
- **The resource planner** who wants Gantt charts and capacity leveling.
- **The open-source maintainer** who wants a public backlog for strangers.

## Roles

yartt has **no permission roles and no admins**. Rights come from
relationships that already exist in the company:

| Relationship | Who | Can |
|---|---|---|
| Employee | anyone with an account | invite colleagues, request access to a task, edit own profile, choose own manager (the manager is notified) |
| Owner | one per task | change tags, context, priority, deadline and dependencies; approve or reject access; transfer ownership |
| Participant | anyone the task is open to: added by the owner, approved on request, or a manager of a participant | comment, mention other participants, bring others in, link tasks, log own time, set own time left and reminders, leave; hiding participants is the owner's |
| Direct manager | the manager of an employee | dismiss the employee or bring them back (their tasks and reports move to the manager); score their past days, if the manager wants to; transfer their tasks |
| Manager up the chain | any manager above | automatically a participant of every task a report below takes part in, seen on the Team screen |
| First employee | created on installation | nothing special — an ordinary employee |

Why these rights are where they are: [decisions](decisions.md).
