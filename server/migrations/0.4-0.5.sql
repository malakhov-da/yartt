-- 0.4 -> 0.5

-- A deadline change within a minute of the previous one replaces it, and
-- the owners of dependent tasks are told once the deadline settles.

CREATE OR REPLACE FUNCTION deadline_settles()
RETURNS INTERVAL AS $$
    SELECT INTERVAL '1 minute';
$$ LANGUAGE sql IMMUTABLE;

COMMENT ON FUNCTION deadline_settles() IS
'How long a deadline change stays a draft: another change within it
replaces it in the history (change_deadline()), and the owners of
dependent tasks are told only once it has passed without one (the worker
holds finished_at_change notifications this long).';

CREATE OR REPLACE FUNCTION change_deadline(p_task_id INT, p_value TIMESTAMPTZ)
RETURNS VOID AS $$
DECLARE
    v_entered_at TIMESTAMPTZ;
    v_changed BOOLEAN;
BEGIN
    -- The last change, made less than deadline_settles() ago, is undone:
    -- the new one replaces it, so of a person picking a date only the
    -- last pick stays.
    SELECT entered_at INTO v_entered_at FROM finished_at
     WHERE task_id = p_task_id AND expired_at IS NULL
       FOR UPDATE;
    IF FOUND THEN
        IF v_entered_at > NOW() - deadline_settles() THEN
            DELETE FROM finished_at WHERE task_id = p_task_id AND expired_at IS NULL;
            UPDATE finished_at SET expired_at = NULL
             WHERE task_id = p_task_id AND expired_at = v_entered_at;
        END IF;
    ELSE
        -- No deadline: the last change was a clear, the row closed last.
        UPDATE finished_at SET expired_at = NULL
         WHERE task_id = p_task_id
           AND expired_at > NOW() - deadline_settles()
           AND expired_at = (SELECT max(expired_at) FROM finished_at WHERE task_id = p_task_id);
    END IF;

    -- The change against what was there before: the same value is no change.
    IF p_value IS NULL THEN
        UPDATE finished_at SET expired_at = NOW()
         WHERE task_id = p_task_id AND expired_at IS NULL;
        v_changed := FOUND;
    ELSE
        v_changed := NOT EXISTS (SELECT 1 FROM finished_at
                                  WHERE task_id = p_task_id AND expired_at IS NULL AND value = p_value);
        IF v_changed THEN
            UPDATE finished_at SET expired_at = NOW()
             WHERE task_id = p_task_id AND expired_at IS NULL;
            INSERT INTO finished_at (task_id, value) VALUES (p_task_id, p_value);
        END IF;
    END IF;

    -- Told about the settled deadline only: what waits to be sent about the
    -- replaced change is dropped, and nothing is sent when it came back.
    DELETE FROM notification
     WHERE sent_at IS NULL
       AND added_at > NOW() - deadline_settles()
       AND payload->>'kind' = 'finished_at_change'
       AND payload->>'dependencyId' = p_task_id::text;
    IF v_changed THEN
        PERFORM notify_dependents(p_task_id);
        -- Closed by hand: what waits for it hears it is done; reopened, it is not.
        UPDATE dependency
           SET done_at = CASE WHEN p_value IS NOT NULL AND p_value <= NOW() THEN COALESCE(done_at, NOW()) END
         WHERE value = p_task_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION change_deadline(INT, TIMESTAMPTZ) IS
'Sets, moves or (p_value NULL) clears the deadline. A change less than
deadline_settles() after the previous one replaces it: that row is
removed and the one before it reopened, then the new change is made — so
the history keeps the last decision, dated by it, and a value changed
back is no change at all. Owners of dependent tasks get one notification
for the settled deadline (notify_dependents(); unsent ones about the
replaced change are dropped). A deadline put at or before now closes the
task by hand: the tasks waiting for it are marked done for (done_at);
moved ahead or cleared, they are not.';


CREATE OR REPLACE FUNCTION set_finished_at(p_task_id INT, p_value TIMESTAMPTZ)
RETURNS VOID AS $$
BEGIN
    PERFORM change_deadline(p_task_id, p_value);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_finished_at(INT, TIMESTAMPTZ) IS
'Sets or moves the deadline (later or earlier) — change_deadline().
Permissions — in the application. Never forbidden by dependencies: a
deadline later than one a dependent task can live with puts both at risk
(at_risk()).';

CREATE OR REPLACE FUNCTION clear_finished_at(p_task_id INT)
RETURNS VOID AS $$
BEGIN
    PERFORM change_deadline(p_task_id, NULL);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION clear_finished_at(INT) IS
'Clears the deadline — change_deadline(). Permissions — in the
application. Dependent tasks with a latest deadline for this one are then
at risk (at_risk()).';

COMMENT ON TABLE finished_at IS
'Task deadline history.
Current = expired_at IS NULL. There may be no rows — "not set".
The task is done when the current value <= NOW().

Set, moved (later or earlier) and cleared only by the owner —
through set_finished_at / clear_finished_at.
Move: the old row is closed and a new one opened.
Clear: the old row is closed, no new one is created.
A change within deadline_settles() of the previous one replaces it
(change_deadline()): a person trying dates leaves only the last one.
Owners of dependent tasks are notified once the deadline settles, and
told when the new deadline breaks the latest one their task can live
with (dependency.latest_at).

A passed deadline closes the task by itself (decision 10), so the owner
is warned: from a day before it, the task is in their "Waiting for me"
("closes automatically"), and they are notified once (warned_at) if the
deadline was set earlier than that. When it closes, the owner is told
(closed_told_at) and the task waits in "Waiting for me" until they
confirm the closing (confirmed_at) or move the deadline
(send_deadline_notices()).';

COMMENT ON TABLE notification IS
'Notification queue. Not an inbox.
Created only through notify(), which handles absence and dismissal.
payload JSONB — context; kind is stored inside payload.
The worker takes WHERE sent_at IS NULL (FOR UPDATE SKIP LOCKED), sends
to the webhook and sets sent_at; a finished_at_change waits
deadline_settles() first, and change_deadline() replaces it meanwhile. The user handles the notification —
closed_at. Cleaned up after a year.

RULES:
  - comment -> the task owner (unless they wrote it).
  - mention -> the mentioned employee, always.
  - task attached to a comment -> the owner of the attached task
    (unless they wrote the comment).
  - reminder (remind) -> whoever set it.
  - access request -> the task owner.
  - access opened (added by the owner, request approved, the task made
    public while a request waited) -> the employee.
  - access closed (removed, request rejected, the task made private
    without them) -> the employee.
  - finished_at set / moved / cleared -> owners of dependent tasks, once
    it settles (deadline_settles(): the worker holds it that long).
  - the deadline a day away -> the owner (deadline_soon); the task closed
    by it -> the owner (deadline_closed) and the owners of the tasks
    waiting for it (dependency_done).
  - a new dependency -> the owner of the task waited for (with the latest
    deadline the waiting task can live with, if set).
  - owner change -> the new owner. If the manager initiated it — the
    previous owner too.
  - score -> the scored employee.
  - invite -> the invitee.
  - a new report (someone set their manager) -> the new manager.
  - a bot''s key a year old -> the bot''s manager, once a year of its age.
If the recipient is away, a copy goes to their manager (recursively).
Dismissed employees get no notifications.

Delivery is only through the outgoing webhook (URL and secret in the
config). Channels (email, Telegram, Slack, ...) and texts in the
employee.locale language are up to the webhook receiver.';

COMMENT ON SCHEMA public IS
'yartt — a task tracker without projects, subtasks or assignments.


============================================================================
PHILOSOPHY
============================================================================

yartt is a task tracker without projects and subtasks. Flexible clustering
through tags, links through a dependency graph, responsibility through
ownership.

Key principles:
  - No projects. Flexible clustering through tags.
  - No task titles. The set of tags is the task "title": nobody has to
    agree on a title format, and searching by tags keeps their variety
    under control.
  - No subtasks. Links go through dependency — a directed graph.
  - No assignments. The task owner (the author becomes the owner) is
    responsible for getting it done on time and well thought out. The
    owner directs other employees within the task like a project manager,
    or works alone if nobody else is needed.
  - Access is defined by task visibility (observer).
  - A task is private while it has active observers: only they see it.
    The owner of a private task is always an observer. The manager
    (recursively up manager_id) is automatically added as an observer to
    every task of their reports.
  - A task with no active observers is public: every employee sees it.
    The owner makes a task public (all observers go) and private again.
  - The header of any task — tags, priority, deadline — is visible to
    every employee, so a person can tell whether to ask for access. The
    context, comments and people are visible only to those who see the
    task. Only the owner changes the header and the context.
  - All work happens in comments.
  - Comments are never deleted or hidden. If a comment is outdated, reply
    to it (reply_to_id) and say so.
  - A task cannot be deleted. A task is closed by setting finished_at in
    the past. The owner can move finished_at (later or earlier) or clear
    it — owners of dependent tasks are notified.
  - A passed deadline closes the task by itself — on purpose. An owner who
    did not finish in time has to move the deadline before it passes, or
    explain why the task is closed but not done.
  - A task has an owner (owner_id). There is no separate creator role.
  - Ownership can be transferred by the owner or by the owner''s direct
    manager. The previous owner stays an observer. When the owner is
    dismissed, their tasks go to their manager. With no manager the task
    is left without an owner and any observer can take it.
  - Observers see the task and change only their own things: comments,
    their time entries, their time left, their reminders, their mentions.
    Access belongs to the owner: only the owner adds and removes
    observers, answers requests and makes the task public or private.
    A mention in a private task addresses only its observers; anyone
    else is brought in by the owner or asks for access.
  - Access is revoked explicitly: an observer can leave, the owner can
    remove an observer. There is also an access request flow: an employee
    files a request (added_at = NULL), the owner is notified and approves
    it (added_at = NOW()) or rejects it (deleted_at = NOW()). Opening and
    closing someone''s access is notified to them.
  - The deadline (finished_at) lives in an interval table. The current
    value = expired_at IS NULL. Clearing = closing the active row without
    opening a new one.
  - A dependency may carry the latest deadline of the task waited for that
    the waiting task can live with (latest_at). Nothing is forbidden by
    it: when the deadline waited for is later, or there is none, both
    tasks are at risk (at_risk()) — the waiting one is late because of
    the other, the other delays it — and the owner of the waiting task is
    told as the deadline moves.
  - Anyone sets limits of hours on a combination of tags for a fixed
    period (tag_limit): how much they and everyone under them may spend
    on it. A task under several limits counts in each. A limit is never
    edited: a change closes it and opens a new one, so its history is
    kept. It warns, it forbids nothing.
  - Work quality is scored only per employee per day, never per task.
    The current manager (employee.manager_id) scores any past day with a
    filled timesheet. Scores are optional: the manager decides which days
    to score, if any. After the first score neither the timesheet nor
    the time entries of that day can change. The score itself can be
    corrected by the current manager; every version (value, reason, time
    and the previous value) is emailed to the employee — the mail is the
    history, the table keeps only the current value.
  - The timesheet and time entries are optional too: they are kept when the
    manager asks for them.
  - Workload comes from the timesheet (work). Quality and workload are
    kept apart. A bonus is the manager''s decision; the system provides
    both metrics.
  - The timesheet only moves forward: a closed shift cannot be changed
    or deleted. People think when closing a shift instead of editing it
    afterwards.
  - While a person is away (human.next_day in the future),
    notifications go both to them and to their manager (recursively up
    manager_id until an available manager is found).
  - Notifications are a queue in the database. The worker delivers them
    by email (SMTP from the configuration) and/or to an outgoing webhook
    for other channels (sent_at); the user handles a notification
    (closed_at). Cleaned up after a year.
  - Comments are never edited. The interface protects against accidental
    sending: a sent comment can be pulled back into editing for a few
    seconds and only then goes to the server.
  - Attachments live in a separate table, deduplicated by hash. A comment
    refers to them by an array of ids.
  - Reminders (remind) are explicit: an employee decides when to be
    reminded about a task. Once due it waits in their "Waiting for me"
    until they remove it or move it.
  - Only an employee can create another employee (an invite). The first
    employee is created by the application on its first start. No roles:
    rights come from relationships. Only the direct manager can dismiss an
    employee or bring them back.
  - An employee is a person or a bot. A bot is a program — CI,
    monitoring — that owns tasks, comments and is mentioned like a
    person, through the API with its key, within permissions that only
    narrow what its relationships allow. It has no timesheet, time or
    scores and manages nobody. Its manager — whoever created it or got it
    handed over — runs it; its notifications go to its own webhook.
  - Visits are logged: opening a task or any other screen. They show the
    owner who looked at a task and help to suggest when a shift started
    and ended.
  - One database — one company. No multi-tenancy.


============================================================================
WHY WE DROP THE USUAL CONSTRUCTS
============================================================================

From projects to tags.
  The problem with projects: a rigid hierarchy. A task belongs to one
  project. To share one task you have to share the whole project or
  build ACLs. To reclassify a task you have to move it, which breaks
  links and reports.
  What we do: tags are free clustering. A task can have several tags.
  Tags are labels, not folders. Access to a task is separate from tags.
  The set of tags is unique and serves as the task title. There is no
  "belongs to a project" — a task exists on its own.

From titles to sets of tags.
  The problem with titles: everyone words them differently, one task is
  called five ways, free-text search is weak.
  What we do: title = a unique set of tags. New tags appear, but
  searching through existing ones keeps the vocabulary compact.

From subtasks to dependencies.
  The problem with subtasks: a hierarchy. Parent and child. A parent
  cannot be closed while a child is open. Deep nesting. "Zombie parents"
  (all children closed, the parent hangs).
  What we do: a directed dependency graph. A depends on B — A cannot be
  considered done until B is done. But B is not part of A. It is a
  separate task with its own owner. No "levels", only a network. Cycles
  and self-dependencies are forbidden.

From assignments to ownership.
  The problem with assignments: a manager gives a task to an assignee.
  The assignee does it. The manager checks. A "done / not done"
  argument. Double responsibility. A task "hangs" on an assignee who
  cannot close it. Or the assignee "closed" it and the manager disagrees.
  What we do: the task owner is responsible for the result. The owner is
  the author of the idea and the one in charge. They work alone or bring
  others in. The others are observers: they log time, comment, plan, but
  are not responsible for the result. Ownership can be transferred. A
  task cannot be "closed" as an action — finished_at is set instead.
  When finished_at arrives, the task is done automatically.

From scoring tasks to scoring people per day.
  The problem with scoring tasks: a task lasts months and ten people work
  on it — what do you score? Whom do you blame? Unclear. A "bad" or
  "good" score is subjective and vague. Gaming: close faster to avoid
  being late, or drag it out to look "hard".
  What we do: the manager scores a person''s day, 0–100%. The score is
  about the quality of the day''s decisions: did the person pick the
  right priorities, do their decisions match the manager''s
  understanding. Not about the task result. A task may fail while the
  scores are good if the person chose well every day — then the problem
  is in priorities, plans or the manager, not in the person. Weighted by
  timesheet hours.

From created_by to owner_id.
  The problem with created_by: the creator is a role without
  responsibility. "I created it, but it is not mine." Responsibility
  blurs.
  What we do: owner_id. Creator = owner. No separate "author" role.
  Ownership can be transferred. No "who created it" history — not
  needed. Creation is not a metric. Lead time / cycle time are easy to
  game (create only "quick" tasks). created_at is not stored at all.

From deleting to closing.
  The problem with deleting: delete it and the data is gone. Metrics
  drift. History is lost. Links break.
  What we do: a task cannot be deleted (trigger). finished_at can be
  set, cleared (the task is back in progress) or moved. When finished_at
  arrives, the task is done automatically. A signal: "missed it and did
  not warn" — if the owner forgot to move it.

From watching a person to requesting access.
  The problem with observer_link: A "watches" B and sees all of B''s
  tasks. Cognitive load. "I followed Pete — now there are 200 tasks in
  my feed."
  What we do: access is per task. Want to see it — ask, or get added.
  A manager is automatically added to every task of their reports (down
  the hierarchy).

From a notification inbox to a queue.
  The problem with an inbox: "1000 unread". Nobody reads them. They lose
  meaning.
  What we do: notification is a queue. A notification goes to the
  webhook, the user handles it (closed_at). Cleaned up after a year.
  Reminders (remind) are explicit: an employee sets them; a due one
  waits for them until removed or moved.

From deleting comments to "they live forever".
  The problem with deleting: delete it and the context is lost. Replies
  dangle. Links break.
  What we do: comments are never deleted or hidden (trigger). If a
  comment is outdated, reply to it (reply_to_id) and say so.
  reply_to_id is the parent''s local id.

From parsing @username to attachments.
  Employees (mention) and tasks (task_mention) are attached to a comment
  explicitly. No text parsing.


============================================================================
SEARCH
============================================================================

  - By tags: autocomplete forgiving typos, transliteration and the wrong
    keyboard layout. Every tag keeps its name in Latin letters
    (tag.latin); the typed text, and the same keys read with each other
    layout of the person (human.keyboards; the layouts themselves are
    in the application), are transliterated the same way and compared
    with Levenshtein and trigrams. Comparing in Latin also keeps trigrams
    working when the database locale is C, where pg_trgm ignores non-ASCII
    letters. Candidates are picked by the indexes on tag.latin first — the
    nearest by trigrams (GiST, KNN), the exact name, names starting with
    the word — so the cost does not grow with every tag.
    Then tasks WHERE tag_ids @> ARRAY[...] (GIN).
  - By text: task.context and comment.value with ILIKE / similarity
    (trigrams work for any language and for substrings).


============================================================================
TASK IDENTIFIERS
============================================================================

  - task.id — SERIAL PRIMARY KEY, immutable. All FKs and URLs use it.
  - task.tag_ids — the set of tags, stored sorted (trigger).
    UNIQUE: two tasks with the same set of tags are impossible.
    On a conflict the application asks to add a tag.
  - Tags cannot be empty (at least one tag).
  - Duplicate tags are forbidden. All tags must exist.


============================================================================
AUTHENTICATION
============================================================================

  - The email token (token) is single-use and lives 10 minutes.
  - The session token (session) is long-lived: 30 days of inactivity.
  - The database stores only SHA-256 of the tokens. Tokens are 32 random
    bytes, so no salt is needed. A database leak (backup, replica,
    read-only SQL injection) does not let anyone sign in.
  - Issuing and checking tokens — functions issue_token, login,
    authenticate.


============================================================================
OPERATIONS
============================================================================
What the application must be able to do. No URLs — they are defined when
the API is implemented.

  Authentication:
    - With the company''s identity provider configured (OIDC), only through
      it: the provider''s answer -> sign_in_external(); no sign-in links, no
      invites (people come in by signing in).
    - Otherwise: request sign-in by email -> issue_token(), send the link through the
      webhook directly (not through notification — the token must not lie
      in the database in plain text).
    - Follow the link from the email -> login(), set the cookie.
    - Every request -> authenticate().
    - Log out -> deletes the session.
    - Log out everywhere -> deletes all sessions of the employee.

  Employees:
    - Invite an employee (any employee: email, full_name, locale)
      -> notify(kind = invite).
    - Edit the profile (full_name, about, next_day, time_zone, locale).
    - Change one''s email -> request_email_change(), the link goes by email
      to the new address only; following it -> confirm_email_change().

  Bots:
    - Create a bot (create_bot: any person, under themselves).
    - Change its name, pronoun, about, permissions, webhook (its direct
      manager, check_bot_manager).
    - Replace its key (reset_bot_key: its direct manager).
    - Hand it to another person (transfer_bot: its direct manager).
    - Dismiss / bring back — like anyone, by its direct manager.
    - Every API request with a key -> authenticate_bot().
    - Set / change manager_id (the employee themselves).
    - Dismiss an employee (dismiss_employee: the direct manager).
    - Bring a dismissed employee back (restore_employee: the direct manager).

  Visits:
    - Open a task / any other screen -> log_visit().

  Tasks:
    - Create a task (owner = creator, tags, priority).
    - Change tag_ids / priority / context (owner only).
    - "No intervention needed" (mark_reviewed: owner only, not while an
      access request waits).
    - Make public / private (make_public / make_private: owner only).
    - Transfer ownership (the owner or the owner''s manager).
    - Take an ownerless task (owner_id IS NULL, any observer).

  Access:
    - Add an observer or bring one back (add_observer: the owner).
    - Request access (request_access: the employee themselves).
    - Withdraw one''s own request (withdraw_access).
    - Approve a request (approve_access: the owner).
    - Reject a request (reject_access: the owner).
    - Remove an observer (remove_observer: the owner).
    - Leave a task (leave_task: the observer themselves, except the owner
      and the manager of an observing report).

  Dependencies:
    - Add / change / remove a dependency (owner of task_id only).

  Deadlines:
    - Set / move finished_at (set_finished_at, owner only).
    - Clear finished_at (clear_finished_at, owner only).
    - Confirm a closing by the deadline (finished_at.confirmed_at, owner only).
    - Take note that a task waited for is done (dependency.done_at
      cleared, owner of task_id only).

  Time left:
    - Set / change / clear estimate_minutes for oneself (anyone who sees
      the task).

  Time entries:
    - Set one''s time on a task for a day (anyone who sees the task): the
      day''s whole time, replacing what was there; 0 removes the entry.

  Timesheet:
    - Open a shift (started_at = NOW, spent_minutes = NULL).
    - Change the open shift (started_at, about).
    - Close a shift (spent_minutes = N, about = text).
    - Delete the open shift.
    - Closed shifts are immutable.

  Comments:
    - Upload an attachment (deduplicated by hash) -> attachment.id.
    - Leave a comment (with attachment_ids and image_ids) — anyone who
      sees the task.
    - Reply to a comment (reply_to_id).
    - Attach an employee -> mention.
    - Attach a task -> task_mention.

  Mentions:
    - Close a mention (closed_at = NOW, explicitly, by the mentioned employee).

  Reminders:
    - Set a remind (an observer).
    - Move a remind to a later moment (its author): due again then.
    - Delete a remind (its author).

  Notifications:
    - Close a notification (closed_at = NOW).

  Scores:
    - Score an employee''s past day or correct the score (the current
      manager; every version is notified to the employee).


============================================================================
ACCESS RULES
============================================================================

  Task:
    - priority, tag_ids, context — owner only.
    - reviewed_at — owner only.
    - owner_id — the current owner or the owner''s direct manager.
    - finished_at — owner only.
    - dependency — owner of task_id only.

  Seeing a task (can_see):
    - The header (tag_ids, priority, finished_at, owner) — everyone.
    - The rest (context, comments, people, time) — the active observers
      of a private task; everyone for a public task.

  Observers:
    - Add, remove, bring back an observer — owner only.
    - Make the task public / private — owner only.
    - Any employee can request access to a private task.
    - Approve / reject a request — owner only.
    - Leave a task — the observer themselves. The owner cannot leave.
    - A manager cannot be removed (and cannot leave) while a report of
      theirs (recursively) observes the task.

  Time left and time entries:
    - estimate_minutes — anyone who sees the task, for themselves only.
    - spent_minutes — anyone who sees the task, for themselves only.
    - remind — anyone who sees the task, for themselves only.
    - work — the employee themselves (their own shift).

  Comments:
    - Leave a comment — anyone who sees the task.
    - Attach an employee or a task — anyone who sees the task.
    - A private task: only an active observer can be attached (mentioned).
      A public task: any active employee can be attached.

  Scores:
    - score — only the current manager (employee.manager_id).

  Bots:
    - Create — any person, under themselves.
    - Change, replace the key, hand over, dismiss, bring back — its
      direct manager only.
    - What it may change — its permissions (bot_permission), checked by
      the application; never more than its relationships allow.

  Employees:
    - Invite — any employee.
    - manager_id — the employee themselves (own profile). No confirmation
      from the manager: such a substitution is too noticeable.
    - Dismiss / bring back — the direct manager only. An employee with no
      manager cannot be dismissed (nobody dismisses themselves); a
      dismissed one always has a manager, and only that manager brings
      them back — under themselves: the employee then moves to another
      manager on their own.
    - Someone at the top leaves in three steps of their own people:
      the successor clears their manager (or picks the one above), the
      leaver picks the successor as manager, the successor dismisses them.
      Someone who will not: the installation administrator dismisses them
      with an heir (dismiss_with_heir, server/admin.ts) — outside the API.
    - Setting a manager notifies the new manager (new_report).


============================================================================
INVARIANTS (forbidden; all checked in the database)
============================================================================

  Task:
    - Empty tag_ids, NULL inside, duplicates, unknown tags.
    - Two tasks with the same set of tags.
    - Deleting a task.
    - The owner of a private task who is not an observer.

  Mentions:
    - Closing a mention the mentioned employee has not replied to (no
      reply of theirs to the mentioning comment).

  Tags:
    - Deleting a tag that is in use.
    - A name with capital letters or surrounding spaces.

  Dependencies:
    - Self-dependency (task_id = value).
    - A cycle (A -> B -> A).

  Observers:
    - Two open rows (task_id, value): request + access, two requests,
      two accesses.
    - An active observer whose manager is not an observer.
    - Closing a manager''s access while a report of theirs observes the task.

  Mentions:
    - Self-mention.
    - Mentioning a dismissed employee.
    - A comment attaching its own task.

  Hierarchy:
    - A cycle in manager_id (A -> B -> A).
    - An employee being their own manager.

  Timesheet:
    - Overlapping shifts of one employee (including two open ones).
    - A shift that runs into the next day of the employee.
    - spent_minutes <= 0.
    - A shift that starts in the future or ends after the current minute.
    - Changing or deleting a closed shift.
    - Any timesheet change for a scored day.

  Time entries:
    - An entry by someone who does not see the task, for a future day,
      for a scored day.
    - More than 24 hours logged by one person for one day, all tasks
      together.
    - Two entries of one person for one task and day.
    - Moving an entry to another task, person or day.

  Deadlines:
    - finished_at.value IS NULL (clearing = closing the row without a new one).

  Scores:
    - A score not by the current manager.
    - Scoring today or a future day.
    - Scoring a day without closed shifts or with an open shift.
    - A score changed by anyone but the current manager; deleting a score.

  Comments:
    - Changing or deleting a comment.
    - A comment by someone who does not see the task.
    - attachment_ids / image_ids with duplicates or unknown attachments.
    - Deleting an attachment referenced by a comment or a task context.
    - reply_to_id pointing to a missing comment of the same task.

  Employees:
    - Deleting an employee (dismissal only).
    - An employee without the row of its kind, or with both (human, bot).
    - A bot with an email, without a manager, or managing anyone.
    - A bot with a timesheet, time entries, estimates, scores, reminders,
      visits, sessions or tag settings (they refer to human).


============================================================================
WHAT THE APPLICATION DOES ITSELF (not in the database)
============================================================================

  - Permission checks "owner only" / "manager only" for task operations
    (priority, tag_ids, context, owner_id, finished_at, dependency).
  - The "for oneself" check for estimate_minutes and remind.
  - Sanitizing the HTML of comment.value and task.context (an allow-list
    of tags; images only from the application''s own attachments) and
    filling comment.image_ids / task.context_image_ids from it.
  - A frontend warning "more time logged than in the timesheet".
  - Creating notifications through notify(): comment, mention, task
    attachment, owner change, score. Database functions create the rest.
  - Protection against accidental comment sending: after "Send" the
    comment stays in the interface for a few seconds with a "Back to
    editing" button and only then goes to the server.
  - Attachment deduplication: on upload, look for an attachment with the
    same hash and size and compare the bytes; on a match return the
    existing id. The file name is stored in the comment
    (attachment_names), not in the attachment.
  - Notification delivery: the worker reads notification WHERE sent_at
    IS NULL (a finished_at_change only once deadline_settles() has
    passed since it was added), sends an email in the recipient''s language (SMTP from the
    config) and/or posts it to the webhook (URL and secret in the config,
    body signed with HMAC-SHA256), then sets sent_at = NOW().
  - The close_delay metric (delay in closing a shift) — on the frontend.
  - Rate limiting of issue_token: 5 links per employee in 15 minutes.


============================================================================
CRON JOBS (outside SQL)
============================================================================

  - every minute: SELECT send_due_reminds();
  - every minute: SELECT send_deadline_notices();
  - every hour:   DELETE FROM token
                   WHERE sent_at < NOW() - CASE WHEN email IS NULL THEN INTERVAL ''1 hour''
                                                ELSE INTERVAL ''2 days'' END;
  - every hour:   SELECT send_weekly_digests();
  - every day:    DELETE FROM session WHERE last_seen_at < NOW() - INTERVAL ''30 days'';
  - every day:    DELETE FROM notification WHERE added_at < NOW() - INTERVAL ''1 year'';
  - every day:    DELETE FROM attachment a
                   WHERE used_at < NOW() - INTERVAL ''1 day''
                     AND NOT attachment_in_use(a.id);
  - every day:    DELETE FROM visit WHERE at < NOW() - INTERVAL ''1 year'';
  - every day:    DELETE FROM bot_usage WHERE day < CURRENT_DATE - 366;
  - every hour:   ask the identity provider about people last checked a
                  day ago or more (human.idp_refresh_token); a refusal ->
                  SELECT idp_refused(employee_id).
  - every day:    SELECT send_bot_key_reminders();
  - every day:    DELETE FROM tag t
                   WHERE created_at < NOW() - INTERVAL ''1 day''
                     AND NOT EXISTS (SELECT 1 FROM task WHERE tag_ids @> ARRAY[t.id])
                     AND NOT EXISTS (SELECT 1 FROM user_tag WHERE tag_id = t.id);
  - every day:    UPDATE human SET next_day = NULL
                   WHERE next_day <= local_today(employee_id);
';


-- A shift belongs to one day, and an overlap names the shift in the way.

CREATE OR REPLACE FUNCTION trg_work_check()
RETURNS TRIGGER AS $$
DECLARE
    v_time_zone TEXT;
    v_other work;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') AND EXISTS (
        SELECT 1 FROM score
         WHERE employee_id = OLD.employee_id
           AND day = local_day(OLD.employee_id, OLD.started_at)
           AND value IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'day is already scored'
            USING HINT = 'day_scored';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    -- The end may be the end of the current minute: closing rounds it up.
    IF NEW.started_at > NOW()
       OR NEW.started_at + NEW.spent_minutes * INTERVAL '1 minute'
          > date_trunc('minute', NOW()) + INTERVAL '1 minute' THEN
        RAISE EXCEPTION 'shift cannot be in the future'
            USING HINT = 'shift_in_future';
    END IF;

    -- A shift belongs to one day: it ends by the midnight after its start.
    SELECT time_zone INTO v_time_zone FROM employee WHERE id = NEW.employee_id;
    IF NEW.started_at + NEW.spent_minutes * INTERVAL '1 minute'
       > ((NEW.started_at AT TIME ZONE v_time_zone)::date + 1)::timestamp AT TIME ZONE v_time_zone THEN
        RAISE EXCEPTION 'shift of employee % runs into the next day', NEW.employee_id
            USING HINT = 'shift_crosses_day';
    END IF;

    -- Said with the shift in the way, so the person knows which one to fix;
    -- excl_work_overlap still guards against two writes at once.
    SELECT * INTO v_other FROM work w
     WHERE w.employee_id = NEW.employee_id
       AND (TG_OP = 'INSERT' OR w.started_at <> OLD.started_at)
       AND work_period(w.started_at, w.spent_minutes) && work_period(NEW.started_at, NEW.spent_minutes)
     ORDER BY w.started_at
     LIMIT 1;
    IF FOUND THEN
        IF v_other.spent_minutes IS NULL THEN
            RAISE EXCEPTION 'shift overlaps the open shift of employee %', NEW.employee_id
                USING HINT = 'shift_overlap_open',
                      DETAIL = json_build_object(
                          'from', to_char(v_other.started_at AT TIME ZONE v_time_zone, 'HH24:MI'))::text;
        END IF;
        RAISE EXCEPTION 'shift overlaps another shift of employee %', NEW.employee_id
            USING HINT = 'shift_overlap_with',
                  DETAIL = json_build_object(
                      'from', to_char(v_other.started_at AT TIME ZONE v_time_zone, 'HH24:MI'),
                      'to', to_char((v_other.started_at + v_other.spent_minutes * INTERVAL '1 minute')
                                    AT TIME ZONE v_time_zone, 'HH24:MI'))::text;
    END IF;

    IF EXISTS (
        SELECT 1 FROM score
         WHERE employee_id = NEW.employee_id
           AND day = local_day(NEW.employee_id, NEW.started_at)
           AND value IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'day is already scored'
            USING HINT = 'day_scored';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        NEW.updated_at := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_work_check() IS
'The timesheet of a day is the employee''s until the day is scored:
  - any shift of a day without a standing score can be added, changed
    or deleted, an open or a closed one;
  - a shift does not start in the future nor end after the current minute
    (closing rounds the end up to the minute);
  - a shift belongs to one day of the employee: it ends by the midnight
    after its start, so it is never longer than a day (shift_crosses_day);
  - a shift overlapping another is refused with the other''s times
    (shift_overlap_with, or shift_overlap_open for the open one), so the person
    sees which shift is in the way;
  - nothing changes on a scored day — neither the shift''s old day nor
    its new one; a withdrawn score (value NULL) frees the day.
Updates updated_at on UPDATE.';



COMMENT ON TABLE work IS
'Timesheet. The employee records: "started at 10:00, worked N minutes".
Optional — if nobody keeps it, the day cannot be scored.

spent_minutes IS NULL — the shift is open (working right now).
An open shift lasts until infinity, so an employee has at most one open
shift and no shift can follow it.
The employee always closes the shift themselves, with whatever time
they consider right.
Shift end = started_at + spent_minutes. Shift day = local_day(started_at).
A shift belongs to that day alone: it ends by the following midnight, so it
is never longer than a day — work past midnight is a shift of the next day.
Shifts of one employee never overlap (EXCLUDE).
A shift cannot start in the future, nor end after the end of the current
minute: the timesheet is kept in whole minutes, so closing rounds the end
up — a shift closed at 17:59:40 ends at 18:00, and one started a moment
ago can be closed as one minute.

Any shift of a day without a standing score can be added, changed or
deleted, closed ones included, and a day may have several shifts. A
score freezes the day''s timesheet; the manager withdrawing the score
(score.value NULL) lets the employee correct it.

about — what was done during the shift. Free text, optional.

The close_delay metric (delay in closing a shift) is computed on the
frontend: the difference between updated_at and
(started_at + spent_minutes). A large one is a signal for the manager.

If more time is logged to tasks (spent_minutes) than worked (work), the
employee''s timesheet shows a warning.';


-- At most 24 hours are logged for one day, all tasks together.

CREATE OR REPLACE FUNCTION check_day_minutes(p_employee_id INT, p_day DATE, p_task_id INT, p_minutes INT)
RETURNS VOID AS $$
DECLARE
    v_others INT;
BEGIN
    -- Two entries of the same day written at once must not both pass.
    PERFORM pg_advisory_xact_lock(hashtext('yartt.spent'), p_employee_id);
    SELECT COALESCE(sum(value), 0) INTO v_others FROM spent_minutes
     WHERE "by" = p_employee_id AND day = p_day AND task_id <> p_task_id;
    IF v_others + p_minutes > 24 * 60 THEN
        RAISE EXCEPTION 'more than 24 hours logged by employee % on %', p_employee_id, p_day
            USING HINT = 'spent_over_day',
                  DETAIL = json_build_object(
                      'logged', (v_others / 60) || ':' || lpad((v_others % 60)::text, 2, '0'),
                      'left', ((24 * 60 - v_others) / 60) || ':' || lpad(((24 * 60 - v_others) % 60)::text, 2, '0'))::text;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_day_minutes(INT, DATE, INT, INT) IS
'A day has 24 hours: the time an employee logs to all tasks of one day
together is at most that. p_minutes — the new value of the entry of
p_task_id, which replaces the old one. Refused with spent_over_day, saying
how much the other tasks of the day already have and how much is left.';


CREATE OR REPLACE FUNCTION trg_spent_minutes_check()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (NEW.task_id <> OLD.task_id OR NEW."by" <> OLD."by" OR NEW.day <> OLD.day) THEN
        RAISE EXCEPTION 'a time entry keeps its task, person and day'
            USING HINT = 'spent_immutable';
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF EXISTS (SELECT 1 FROM score WHERE employee_id = OLD."by" AND day = OLD.day AND value IS NOT NULL) THEN
            RAISE EXCEPTION 'day is already scored'
            USING HINT = 'day_scored';
        END IF;
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        PERFORM check_day_minutes(NEW."by", NEW.day, NEW.task_id, NEW.value);
        NEW.updated_at := NOW();
        RETURN NEW;
    END IF;

    IF NOT can_see(NEW.task_id, NEW."by") THEN
        RAISE EXCEPTION 'employee % does not see task %', NEW."by", NEW.task_id
            USING HINT = 'no_access',
                  DETAIL = json_build_object('taskId', NEW.task_id)::text;
    END IF;

    IF NEW.day > local_today(NEW."by") THEN
        RAISE EXCEPTION 'cannot spend time in the future'
            USING HINT = 'spent_in_future';
    END IF;

    IF EXISTS (SELECT 1 FROM score WHERE employee_id = NEW."by" AND day = NEW.day AND value IS NOT NULL) THEN
        RAISE EXCEPTION 'day is already scored'
            USING HINT = 'day_scored';
    END IF;
    PERFORM check_day_minutes(NEW."by", NEW.day, NEW.task_id, NEW.value);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_spent_minutes_check() IS
'Time entries: only by someone who sees the task, not for a future day,
not for a scored day, and at most a day''s 24 hours on all tasks of the
day together (check_day_minutes()). An UPDATE sets the value of the same
task, person and day (updated_at follows); a scored day changes in no way.';

COMMENT ON TABLE spent_minutes IS
'Time entries: one per task, person and day (uq_spent_minutes_day).
by — who logged it. Only for oneself, only someone who sees the task
(can_see). Checked by a trigger.
Time cannot be logged for a future day or a scored day (trigger), nor more
than 24 hours for one day, all tasks together (check_day_minutes()).
The value is the day''s whole time on the task: a new value replaces it
(updated_at follows), 0 removes the entry — never on a scored day.
When the day''s entries exceed the timesheet hours, the frontend shows
a warning (in the employee''s timesheet).
Does not notify the task owner.';


-- A due reminder waits in "Waiting for me" until removed or moved.

ALTER TABLE remind ADD COLUMN sent_at TIMESTAMPTZ;
DROP INDEX idx_remind_at;
CREATE INDEX idx_remind_at ON remind(at) WHERE sent_at IS NULL;

CREATE OR REPLACE FUNCTION send_due_reminds()
RETURNS VOID AS $$
DECLARE
    r remind;
BEGIN
    FOR r IN
        UPDATE remind SET sent_at = NOW() WHERE at <= NOW() AND sent_at IS NULL RETURNING *
    LOOP
        PERFORM notify(r.employee_id, r.task_id, jsonb_build_object(
            'kind', 'remind', 'text', r.value));
    END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION send_due_reminds() IS
'Cron, every minute: due reminders -> notification, once (sent_at); the
reminder stays until its author removes or moves it.';

COMMENT ON TABLE remind IS
'Task reminders. Any observer can set a reminder for themselves at a
given moment: a thought put off until then, so it need not be kept in
mind meanwhile. send_due_reminds() sends it once due (sent_at), and from
then on it waits in their "Waiting for me" until they remove it or move
it to a later moment (at changes, sent_at is cleared) — a reminder is not
gone because a notification went out. Leaving the task deletes the
reminders.
value — reminder text (what exactly to remind about). Optional.';

COMMENT ON COLUMN remind.sent_at IS
'When the notification went out; NULL — not due yet. A sent reminder is
in "Waiting for me" until removed or moved.';


-- A passed deadline closes the task by itself: the owner is warned a day
-- before and confirms the closing; what waits for it hears it is done.

ALTER TABLE finished_at
    ADD COLUMN warned_at TIMESTAMPTZ,
    ADD COLUMN closed_told_at TIMESTAMPTZ,
    ADD COLUMN confirmed_at TIMESTAMPTZ;
ALTER TABLE dependency ADD COLUMN done_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION send_deadline_notices()
RETURNS VOID AS $$
DECLARE
    r RECORD;
    d RECORD;
BEGIN
    -- A day before: the owner learns that the task closes by itself, unless
    -- they set the deadline within that day themselves.
    FOR r IN
        UPDATE finished_at f SET warned_at = NOW()
          FROM task k
         WHERE k.id = f.task_id AND k.owner_id IS NOT NULL
           AND f.expired_at IS NULL AND f.warned_at IS NULL
           AND f.value > NOW() AND f.value <= NOW() + INTERVAL '1 day'
           AND f.entered_at <= f.value - INTERVAL '1 day'
        RETURNING f.task_id, k.owner_id, f.value
    LOOP
        PERFORM notify(r.owner_id, r.task_id, jsonb_build_object(
            'kind', 'deadline_soon',
            'deadline', to_char(r.value AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));
    END LOOP;

    -- Closed by a deadline set in advance (decision 32), within the last day:
    -- the owner is told and asked to confirm; what waits for the task hears
    -- it is done.
    FOR r IN
        UPDATE finished_at f SET closed_told_at = NOW()
          FROM task k
         WHERE k.id = f.task_id
           AND f.expired_at IS NULL AND f.closed_told_at IS NULL
           AND f.value <= NOW() AND f.value > NOW() - INTERVAL '1 day'
           AND f.value - f.entered_at > INTERVAL '1 minute'
        RETURNING f.task_id, k.owner_id
    LOOP
        IF r.owner_id IS NOT NULL THEN
            PERFORM notify(r.owner_id, r.task_id, jsonb_build_object('kind', 'deadline_closed'));
        END IF;
        FOR d IN
            UPDATE dependency dp SET done_at = COALESCE(dp.done_at, NOW())
              FROM task t
             WHERE dp.value = r.task_id AND t.id = dp.task_id
            RETURNING dp.task_id, t.owner_id
        LOOP
            IF d.owner_id IS NOT NULL AND d.owner_id IS DISTINCT FROM r.owner_id THEN
                PERFORM notify(d.owner_id, d.task_id, jsonb_build_object(
                    'kind', 'dependency_done', 'dependencyId', r.task_id));
            END IF;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION send_deadline_notices() IS
'Cron, every minute. A passed deadline closes the task by itself, so:
  - a day before it the owner is notified (deadline_soon, once —
    warned_at), unless they set it within that day;
  - when a deadline set in advance comes (within the last day), the owner
    is notified (deadline_closed, once — closed_told_at) and the task
    waits in their "Waiting for me" until they confirm it (confirmed_at)
    or move the deadline; the tasks waiting for it are marked done for
    (dependency.done_at) and their owners notified (dependency_done).
Safe with several workers: each row is claimed by its UPDATE.';

COMMENT ON COLUMN finished_at.warned_at IS
'When the owner was notified that the task closes by this deadline within
a day (deadline_soon). NULL — not yet, or the deadline was set less than a
day before it: then the owner knows.';

COMMENT ON COLUMN finished_at.closed_told_at IS
'When the owner was told that the task closed by this deadline, set in
advance (deadline_closed). From then on it waits in their "Waiting for
me" until confirmed_at. NULL — not closed by itself (closed by hand, or
not yet), or closed before the owner could be told.';

COMMENT ON COLUMN finished_at.confirmed_at IS
'When the owner confirmed that the task closed by this deadline is
closed as it should be. NULL — not confirmed.';

COMMENT ON COLUMN dependency.done_at IS
'When value closed — by hand (change_deadline()) or by its deadline
(send_deadline_notices()): the owner of task_id sees it in "Waiting for
me" until they take note (cleared). Cleared too when value reopens.
NULL — value is not done, or the owner of task_id took note.';

COMMENT ON COLUMN notification.payload IS
'JSONB context. Contains kind:
  comment | mention | task_mention | remind | access_request |
  access_opened | access_closed | finished_at_change | dependency_added |
  deadline_soon | deadline_closed | dependency_done |
  owner_change | owner_handed |
  score | invite | new_report | weekly_digest | bot_key_old.
Payload keys are camelCase (employeeId, dependencyId, ...).
A copy for an absent employee''s manager has for = the recipient id.';
