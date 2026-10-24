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
        -- Open again: what waits for it waits again. Closed, it is done once
        -- its owner confirms it (mark_reviewed()).
        IF p_value IS NULL OR p_value > NOW() THEN
            UPDATE dependency SET done_at = NULL WHERE value = p_task_id AND done_at IS NOT NULL;
        END IF;
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
task; the application confirms it at once (mark_reviewed()), which marks
the tasks waiting for it done for. Moved ahead or cleared, they are not
done for any more (done_at cleared).';


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

A passed deadline closes the task by itself (decision 2), so the owner
sees it coming: from a day before it, the task is in their "Waiting for
me" ("closes automatically"). Once closed it waits there while the owner
has not looked at it since (task.reviewed_at before the deadline): they
confirm it ("No intervention needed", refused while someone still has
time planned on it — that plan is cleared first) or move the deadline.
Closing by hand is confirmed at once. Nothing is sent: "Waiting for me"
is computed from these rows (decision 87).';

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
  - a closed task confirmed by its owner (mark_reviewed) -> the owners of
    the tasks waiting for it (dependency_done).
  - a new dependency -> the owner of the task waited for (with the latest
    deadline the waiting task can live with, if set).
  - someone''s part of a task made a task of theirs -> the owner of the
    waiting task (part_added).
  - owner change -> the new owner. If the manager initiated it — the
    previous owner too.
  - score -> the scored employee.
  - invite -> the invitee.
  - welcome -> someone added without an invite: the first employee, or
    whoever the installation''s administrator adds outside the API.
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
    their time entries, their time left, their reminders, their mentions —
    and bring others in, the way a copy is added to an email. The owner
    keeps the rest of access: removes observers, answers requests and
    makes the task public or private. A mention in a private task
    addresses only its observers; anyone else is brought in by a
    participant or asks for access.
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
  - Attachments live in a separate table, deduplicated by hash; a file is
    kept while someone holds it in their quota. A comment refers to them
    by an array of ids.
  - Reminders (remind) are explicit: an employee decides when to be
    reminded about a task. Once due it waits in their "Waiting for me"
    until they remove it or move it.
  - Only an employee can create another employee (an invite). The first
    employee is created by the application on its first start, and is
    greeted with a link to sign in (welcome), as is anyone the
    installation''s administrator adds outside the API. No roles:
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
      it: the provider''s answer -> sign_in_external(); someone it lets in
      for the first time confirms their email by a link opened in the same
      browser (begin_external_sign_in(), send_external_email(),
      confirm_external_email()); no sign-in links, no invites (people come
      in by signing in).
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
      access request waits, nor on a closed task while someone still has
      time planned on it). On a closed task it is the confirmation that
      it is closed as it should be.
    - Make public / private (make_public / make_private: owner only).
    - Transfer ownership (the owner or the owner''s manager).
    - Take an ownerless task (owner_id IS NULL, any observer).

  Access:
    - Add an observer or bring one back (add_observer: any participant).
    - Request access (request_access: the employee themselves).
    - Withdraw one''s own request (withdraw_access).
    - Approve a request (approve_access: the owner).
    - Reject a request (reject_access: the owner).
    - Remove an observer (remove_observer: the owner).
    - Leave a task (leave_task: the observer themselves, except the owner
      and the manager of an observing report).

  Dependencies:
    - Add / change / remove a dependency (owner of task_id only).
    - Create a task as one''s part of a task one sees: that task waits for
      the new one (anyone who sees task_id; its owner is notified).

  Deadlines:
    - Set / move finished_at (set_finished_at, owner only).
    - Clear finished_at (clear_finished_at, owner only).
    - Close by hand: a deadline at or before now, confirmed at once
      (set_finished_at, then mark_reviewed — refused the same way).
    - Confirm a task closed by its deadline (mark_reviewed); the tasks
      waiting for it are done for from then on (dependency.done_at).
    - Take note that a task waited for is done (mark_reviewed of the
      waiting task).

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
    - Upload an attachment (deduplicated by hash; refused over the size
      and quota limits; the same bytes restore a purged one) -> attachment.id.
    - Keep a file one sees in a task (keep_attachment); let a file one
      holds go (release_attachment) — the last one to let it go deletes
      its content.
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
    - dependency — owner of task_id only; except a new task made as one''s
      part of task_id, linked as it is created by anyone who sees task_id.

  Seeing a task (can_see):
    - The header (tag_ids, priority, finished_at, owner) — everyone.
    - The rest (context, comments, people, time) — the active observers
      of a private task; everyone for a public task.

  Observers:
    - Add or bring back an observer — any participant of a private task
      (like a copy in an email); remove — owner only.
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
    same hash and size and compare the bytes (or take one whose content
    was deleted); on a match return the existing id. The file name is stored in the comment
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
  - every hour:   DELETE FROM token
                   WHERE sent_at < NOW() - CASE WHEN email IS NULL THEN INTERVAL ''1 hour''
                                                ELSE INTERVAL ''2 days'' END;
  - every hour:   DELETE FROM external_sign_in WHERE created_at < NOW() - INTERVAL ''1 hour'';
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


-- A task closed by its deadline waits for its owner to confirm it, and is
-- done for what waits for it only then (decision 87). Tasks closed before
-- count as confirmed: nothing asked for it then.

ALTER TABLE dependency ADD COLUMN done_at TIMESTAMPTZ;

UPDATE task k SET reviewed_at = f.value
  FROM finished_at f
 WHERE f.task_id = k.id AND f.expired_at IS NULL AND f.value <= NOW()
   AND (k.reviewed_at IS NULL OR k.reviewed_at < f.value);

CREATE OR REPLACE FUNCTION mark_reviewed(p_task_id INT, p_actor_id INT)
RETURNS VOID AS $$
DECLARE
    v_closed BOOLEAN;
    v_plans INT;
    r RECORD;
BEGIN
    PERFORM check_owner(p_task_id, p_actor_id);
    IF EXISTS (
        SELECT 1 FROM observer
         WHERE task_id = p_task_id
           AND added_at IS NULL
           AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'task % has access requests waiting for an answer', p_task_id
            USING HINT = 'pending_requests',
                  DETAIL = json_build_object('taskId', p_task_id)::text;
    END IF;

    v_closed := EXISTS (SELECT 1 FROM finished_at
                         WHERE task_id = p_task_id AND expired_at IS NULL AND value <= NOW());
    IF v_closed THEN
        -- Work still planned is not done: whoever planned it clears it first.
        SELECT count(*) INTO v_plans FROM estimate_minutes WHERE task_id = p_task_id AND expired_at IS NULL;
        IF v_plans > 0 THEN
            RAISE EXCEPTION 'task % is closed with % plans left', p_task_id, v_plans
                USING HINT = 'plans_left',
                      DETAIL = json_build_object('taskId', p_task_id, 'count', v_plans)::text;
        END IF;
    END IF;
    UPDATE task SET reviewed_at = NOW() WHERE id = p_task_id;

    -- Confirmed closed: done for what waits for it, whose owners hear it.
    IF v_closed THEN
        FOR r IN
            UPDATE dependency d SET done_at = NOW()
              FROM task t
             WHERE d.value = p_task_id AND t.id = d.task_id AND d.done_at IS NULL
            RETURNING d.task_id, t.owner_id
        LOOP
            IF r.owner_id IS NOT NULL AND r.owner_id <> p_actor_id THEN
                PERFORM notify(r.owner_id, r.task_id, jsonb_build_object(
                    'kind', 'dependency_done', 'dependencyId', p_task_id));
            END IF;
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_reviewed(INT, INT) IS
'"No intervention needed": the owner confirms that nothing in the task
waits for their decision. Refused while an access request waits: that is
exactly something that needs the owner. On a closed task it confirms the
closing (decision 87): refused while someone still has time planned on
it (plans_left — whoever planned it clears it), and the tasks waiting for
it are done for from then on (dependency.done_at), their owners notified
(dependency_done). Closing by hand is confirmed the same way at once.';


COMMENT ON COLUMN dependency.done_at IS
'When the owner of value confirmed it closed (mark_reviewed() of a
closed task, or closing it by hand): only then is it done for task_id,
whose owner is notified (dependency_done) and sees it in "Waiting for
me" while done_at is after their own task''s reviewed_at — "No
intervention needed" there takes note. Cleared when value reopens
(change_deadline()). NULL — not done.';

COMMENT ON COLUMN notification.payload IS
'JSONB context. Contains kind:
  comment | mention | task_mention | remind | access_request |
  access_opened | access_closed | finished_at_change | dependency_added |
  dependency_done | part_added |
  owner_change | owner_handed |
  score | invite | welcome | new_report | weekly_digest | bot_key_old.
Payload keys are camelCase (employeeId, dependencyId, ...).
A copy for an absent employee''s manager has for = the recipient id.';

COMMENT ON TABLE dependency IS
'The dependency graph. task_id depends on value.
Set, changed and removed only by the owner of task_id — except one case,
checked by the application: someone who sees task_id makes their part of
it a new task of their own, and task_id waits for it from its creation
(the owner of task_id is notified, part_added). The owner of the result
stays its owner; the part is the other''s to own and close.
Cycles are forbidden (trigger). Self-dependency is forbidden (CHECK).
Deletion is physical. No audit.
When finished_at of value is set, moved or cleared, owners of all
dependent tasks are notified.';


-- Any participant brings someone in, like a copy in an email; the owner removes.

CREATE OR REPLACE FUNCTION add_observer(
    p_task_id INT,
    p_employee_id INT,
    p_actor_id INT
)
RETURNS VOID AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM task WHERE id = p_task_id) THEN
        RAISE EXCEPTION 'task % not found', p_task_id
            USING HINT = 'not_found';
    END IF;
    IF is_public(p_task_id) THEN
        RAISE EXCEPTION 'task % is public', p_task_id
            USING HINT = 'task_public',
                  DETAIL = json_build_object('taskId', p_task_id)::text;
    END IF;
    -- Like a copy in an email: anyone in the task brings someone in; the owner removes.
    IF NOT is_observer(p_task_id, p_actor_id) THEN
        RAISE EXCEPTION 'only participants of task % add participants', p_task_id
            USING HINT = 'forbidden';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM employee WHERE id = p_employee_id AND dismissed_at IS NULL) THEN
        RAISE EXCEPTION 'employee % is unknown or dismissed', p_employee_id
            USING HINT = 'not_found';
    END IF;
    IF is_observer(p_task_id, p_employee_id) THEN
        RETURN;
    END IF;

    PERFORM grant_observer(p_task_id, p_employee_id, p_actor_id);
    PERFORM notify(p_employee_id, p_task_id, jsonb_build_object(
        'kind', 'access_opened', 'by', p_actor_id));
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION add_observer(INT, INT, INT) IS
'A participant (active observer — the owner among them) adds an observer
to a private task, or brings a former one back, the way a copy is added
to an email: whoever needs someone in brings them in, and the owner
removes whoever came in by mistake (remove_observer). Access is active at
once, a pending request is approved, and the employee is notified
(access_opened, by — who added them). A public task has no observers:
make it private first.';

COMMENT ON TABLE observer IS
'Access to a task and access requests.

STATES:
  - added_at IS NULL AND deleted_at IS NULL — a request awaiting approval.
  - added_at IS NOT NULL AND deleted_at IS NULL — active access.
  - deleted_at IS NOT NULL — access closed or request rejected.
At most one open row per (task_id, value).

A task without active rows is public (is_public()).

WHO CREATES A ROW:
  - The employee requests access to a private task: added_by = NULL,
    added_at = NULL. The owner is notified.
  - A participant adds someone (add_observer): added_by = them,
    added_at = NOW(). The new observer is notified (access_opened).
  - The system: added_by = NULL, added_at = NOW(). This is how the owner
    (on task creation and transfer, unless the task is public) and the
    managers of all active observers, recursively, are added (triggers).

WHO APPROVES:
  - The task owner: approve_access / reject_access; the requester is
    notified (access_opened / access_closed). The requester may withdraw
    the request (withdraw_access).

ACCESS IS REVOKED:
  - An observer can leave (leave_task, deleted_by = value).
  - The owner can remove an observer (remove_observer); they are
    notified (access_closed).
  - make_public closes every row; make_private brings back the owner and
    everyone with an open mention, and notifies the others who commented
    (access_closed).
  - The owner cannot leave.
  - A manager cannot leave or be removed while an active report of theirs
    (recursively) observes the task.
Rows are never deleted: they are the observation periods shown in the
task.

When an observer leaves, their current estimate_minutes row is closed
(expired_at = NOW()) and their reminders (remind) are deleted (trigger).';

COMMENT ON TABLE mention IS
'An employee attached to a comment (a mention).
Attached explicitly, the text is not parsed.
closed_at IS NULL — the mention is open.
Closed only explicitly, by the mentioned employee ("Done"): a reply alone
does not mean the request is handled — but there is no "Done" without a
reply: the mentioned employee must have commented in the task after the
mention, so whoever asked sees the answer (trigger). An open mention is the only way a
task the employee merely observes gets into their TODO in My day.
Self-mention and mentioning a dismissed employee are forbidden. In a
private task only an active observer can be mentioned: someone is brought
in first (add_observer), a mention only addresses those already in. In a
public task anyone can be mentioned, and it adds no observer (trigger).
The mentioned employee is always notified.';

COMMENT ON FUNCTION trg_mention_check() IS
'Forbids self-mentions, mentioning a dismissed employee and, in a private
task, mentioning anyone who is not an active observer: someone is
brought in first (add_observer, approve_access), a mention only
addresses those already in. In a public task anyone may be mentioned and
no observer is added.';

COMMENT ON TYPE bot_permission IS
'What a bot may change, on top of reading what its relationships show it:
  task          — create tasks and run its own (tags, priority, context,
                  deadline, dependencies, public or private, reviewed);
  task.transfer — hand its own tasks to someone;
  comment       — comment and close its mentions;
  observers     — bring people into tasks it takes part in, run the
                  observers of its own tasks, request access.
Checked by the application. Never: timesheet, time, scores, people, keys.';


-- Storage is limited: a file's content may be deleted, its row stays.

ALTER TABLE attachment
    ALTER COLUMN value DROP NOT NULL,
    ADD COLUMN held_by INT[] NOT NULL DEFAULT '{}',
    ADD COLUMN purged_at TIMESTAMPTZ,
    ADD CONSTRAINT chk_attachment_purged CHECK ((value IS NULL) = (purged_at IS NOT NULL)),
    ADD CONSTRAINT chk_attachment_held CHECK (value IS NOT NULL OR cardinality(held_by) = 0);
-- Whoever uploaded a file holds it: it counts in their quota from now on.
UPDATE attachment SET held_by = uploaded_by;
CREATE INDEX idx_attachment_uploaded_by ON attachment USING GIN (uploaded_by);
CREATE INDEX idx_attachment_held_by ON attachment USING GIN (held_by);

CREATE OR REPLACE FUNCTION keep_attachment(p_attachment_id INT, p_employee_id INT)
RETURNS VOID AS $$
BEGIN
    UPDATE attachment SET held_by = held_by || p_employee_id
     WHERE id = p_attachment_id AND value IS NOT NULL AND NOT held_by @> ARRAY[p_employee_id];
    IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM attachment WHERE id = p_attachment_id AND held_by @> ARRAY[p_employee_id]) THEN
        RAISE EXCEPTION 'attachment % has no content to keep', p_attachment_id
            USING HINT = 'file_purged';
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION keep_attachment(INT, INT) IS
'Someone keeps a file — one they see in a task (the application checks
that and the quota): it counts in their quota and stays while they hold
it, whoever else lets it go. Kept already — nothing changes.';


CREATE OR REPLACE FUNCTION release_attachment(p_attachment_id INT, p_employee_id INT)
RETURNS VOID AS $$
BEGIN
    UPDATE attachment SET held_by = array_remove(held_by, p_employee_id)
     WHERE id = p_attachment_id AND held_by @> ARRAY[p_employee_id];
    IF NOT FOUND THEN
        RAISE EXCEPTION 'employee % does not hold attachment %', p_employee_id, p_attachment_id
            USING HINT = 'not_found';
    END IF;
    -- Nobody holds it any more: the content goes, the row and the links stay.
    UPDATE attachment SET value = NULL, purged_at = NOW()
     WHERE id = p_attachment_id AND cardinality(held_by) = 0;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION release_attachment(INT, INT) IS
'Someone lets a file they hold go, to free their quota. While anyone
else holds it, it stays as it is; let go by the last one, its content is
deleted. The row stays, and so do the comments that refer to it: their
link says the file is gone; the same bytes uploaded again bring it back.';


COMMENT ON TABLE attachment IS
'Attachments: files of comments and images inside comments and task
contexts.
Uploaded before the comment is sent; the comment refers to them by the
arrays comment.attachment_ids (files) and comment.image_ids (images in
the text), a context by task.context_image_ids — by id, not by hash
(hashes may collide).
Reading an attachment: whoever uploaded or holds it, or whoever sees a
task whose comment or context refers to it (the application checks).
There is no file name here: the same file may arrive under different
names; the name is stored in comment.attachment_names.
Deduplication: on upload the application looks for a row with the same
hash and size and compares the bytes (or finds one whose content was
deleted); on a match it returns the existing id, puts the content back if
it was gone, and the uploader holds it (held_by).
Cron deletes, once a day, attachments nothing refers to
(attachment_in_use) that have not been used for more than a day
(uploaded, but the comment was never sent). An attachment in use cannot
be deleted (trigger) — comments live forever.

Storage is limited (decision 84), by the configuration, not the
database: a file at most so large; the files a person holds (held_by) at
most so much together, refused at upload or keep. Nothing deletes a
file''s content by its size or age: people let go of what they no longer
need when their quota runs out.
A file is kept while someone holds it: its uploaders, and whoever saw it
in a task and kept it (keep_attachment()) — a file handed to the one who
needs it stays theirs when its author lets it go. Letting a file go
(release_attachment()) takes it out of one''s quota; when nobody holds it
any more, its content is deleted. The row stays — who uploaded it, its
size, the names in comments — and value goes (purged_at): a link to it
says the file is gone. Anyone uploading the same bytes again (the same
hash and size) restores it in place, so every link to it works again.';

COMMENT ON COLUMN attachment.value IS
'File content. NULL — deleted when nobody held it any more (purged_at);
the same bytes uploaded again bring it back.';

COMMENT ON COLUMN attachment.purged_at IS
'When the content was deleted — the last holder let it go. NULL — the
content is here.';

COMMENT ON COLUMN attachment.uploaded_by IS
'Everyone who uploaded these bytes (deduplication returns the same row).
They may read it before it is attached anywhere. It stays when they let
the file go and after its content is gone: the history of who uploaded
what. Who keeps it in their quota is held_by.';

COMMENT ON CONSTRAINT chk_attachment_purged ON attachment IS
'No content exactly when it was purged.';

COMMENT ON INDEX idx_attachment_uploaded_by IS
'A person''s files: their list.';

COMMENT ON COLUMN attachment.held_by IS
'Who keeps the file — it counts in each one''s quota: the uploaders, and
whoever kept a file they saw in a task. Empty with content — uploaded
before 0.5 and not let go of, or kept by nobody: nobody pays for it. When
the last holder lets it go, the content is deleted.';

COMMENT ON CONSTRAINT chk_attachment_held ON attachment IS
'Nobody holds a file without content.';

COMMENT ON INDEX idx_attachment_held_by IS
'A person''s quota: the files they hold.';


-- A first sign-in through the identity provider confirms the email
-- (decision 86): the provider's address is only offered, so someone
-- created before by their address is found by it.

COMMENT ON COLUMN human.external_id IS
'Who the person is at the company''s identity provider (the OIDC sub):
sign-in through it finds them by this, whatever their email is there.
Set on their first sign-in through it, once they confirmed their email
(confirm_external_email()).';

CREATE TABLE external_sign_in (
    hash BYTEA PRIMARY KEY,
    sub TEXT NOT NULL,
    suggested_email CITEXT,
    full_name VARCHAR(255) NOT NULL,
    locale VARCHAR(10) NOT NULL,
    time_zone TEXT NOT NULL,
    refresh_token TEXT,
    email CITEXT,
    email_hash BYTEA UNIQUE,
    sends INT NOT NULL DEFAULT 0,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_external_sign_in_created_at ON external_sign_in(created_at);
CREATE INDEX idx_external_sign_in_email ON external_sign_in(email, sent_at);

COMMENT ON TABLE external_sign_in IS
'A first sign-in through the company''s identity provider that vouched
for no address, waiting for the person to confirm their email (decision
86): the email says which employee they are here, as without the
provider, so someone added before by their address is found by it. The
provider''s address, if any, is only offered.
  1. sign_in_external() did not know them: begin_external_sign_in()
     keeps what it said and gives the browser a token (a cookie).
  2. They type their email: send_external_email() issues the token of a
     link to it.
  3. They open the link in the same browser: confirm_external_email()
     finds the working employee with that email or creates one, binds the
     provider id to them and starts a session.
Only SHA-256 of both tokens is stored. Valid for an hour from step 1;
cron removes older rows. The browser token keeps a link forwarded to
someone else from binding their account to the provider account of
whoever asked.';

COMMENT ON COLUMN external_sign_in.hash IS
'SHA-256 of the browser''s token (the cookie).';

COMMENT ON COLUMN external_sign_in.sub IS
'Who the person is at the provider (the OIDC sub).';

COMMENT ON COLUMN external_sign_in.suggested_email IS
'The address the provider sent, if any: offered, never trusted.';

COMMENT ON COLUMN external_sign_in.full_name IS
'The name the provider sent: given to the employee if one is created.';

COMMENT ON COLUMN external_sign_in.locale IS
'The language the provider sent (or the installation''s): of the email
with the link, and of the employee if one is created.';

COMMENT ON COLUMN external_sign_in.time_zone IS
'The time zone the provider sent (or the installation''s), for a new employee.';

COMMENT ON COLUMN external_sign_in.refresh_token IS
'The provider''s refresh token, moved to human.idp_refresh_token on
confirmation.';

COMMENT ON COLUMN external_sign_in.email IS
'The address the last link went to. NULL — none sent yet.';

COMMENT ON COLUMN external_sign_in.email_hash IS
'SHA-256 of the token in the last link; a new link voids the previous one.';

COMMENT ON COLUMN external_sign_in.sends IS
'How many links this sign-in sent: at most 5.';

COMMENT ON COLUMN external_sign_in.sent_at IS
'When the last link went out.';

COMMENT ON COLUMN external_sign_in.created_at IS
'When the provider let them in: valid for an hour from then.';

DROP FUNCTION sign_in_external(TEXT, CITEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION sign_in_external(
    p_sub TEXT,
    p_email CITEXT,
    p_full_name TEXT,
    p_locale TEXT,
    p_time_zone TEXT,
    p_refresh_token TEXT
)
RETURNS TEXT AS $$
DECLARE
    v_id INT;
    v_dismissed_at TIMESTAMPTZ;
BEGIN
    -- Two tabs coming back from the provider at once must not create two people.
    PERFORM pg_advisory_xact_lock(hashtext('yartt.sso'), hashtext(p_sub));

    SELECT e.id, e.dismissed_at INTO v_id, v_dismissed_at
      FROM human h JOIN employee e ON e.id = h.employee_id
     WHERE h.external_id = p_sub;
    IF v_id IS NULL THEN
        -- No address the provider vouches for: the person confirms one (decision 86).
        IF p_email IS NULL THEN
            RETURN NULL;
        END IF;
        -- Someone created before by their address — invited, or added by
        -- the administrator — signing in through the provider for the first time.
        SELECT e.id INTO v_id
          FROM employee e JOIN human h ON h.employee_id = e.id
         WHERE e.email = p_email AND e.dismissed_at IS NULL AND h.external_id IS NULL;
        IF v_id IS NULL THEN
            -- The address is someone's who signs in with another provider account: theirs to confirm.
            IF EXISTS (SELECT 1 FROM employee WHERE email = p_email AND dismissed_at IS NULL) THEN
                RETURN NULL;
            END IF;
            SELECT e.id, e.dismissed_at INTO v_id, v_dismissed_at
              FROM employee e JOIN human h ON h.employee_id = e.id
             WHERE e.email = p_email
             ORDER BY e.dismissed_at DESC
             LIMIT 1;
        END IF;
        IF v_id IS NULL THEN
            INSERT INTO employee (email, full_name, locale, time_zone)
            VALUES (p_email, p_full_name, p_locale, p_time_zone)
            RETURNING id INTO v_id;
            INSERT INTO human (employee_id) VALUES (v_id);
        END IF;
        IF v_dismissed_at IS NULL THEN
            UPDATE human SET external_id = p_sub WHERE employee_id = v_id;
        END IF;
    END IF;
    IF v_dismissed_at IS NOT NULL THEN
        RAISE EXCEPTION 'employee % is dismissed', v_id
            USING HINT = 'dismissed';
    END IF;

    UPDATE human
       SET idp_refresh_token = COALESCE(p_refresh_token, idp_refresh_token),
           idp_checked_at = NOW(),
           idp_blocked_at = NULL
     WHERE employee_id = v_id;
    RETURN start_session(v_id);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION sign_in_external(TEXT, CITEXT, TEXT, TEXT, TEXT, TEXT) IS
'A person the company''s identity provider let in (OIDC): returns a
session token, or NULL — they confirm their email first
(begin_external_sign_in(), decision 86).
  1. Known by their provider id (human.external_id): signed in.
  2. Otherwise, with an address the provider vouches for (p_email; the
     application passes only a verified one inside the company''s
     domains): the employee with it who has no provider id yet — invited,
     or created before by their address — is them from now on; with
     nobody at that address someone new is created.
  3. No such address, or it is someone''s bound to another provider
     account: NULL.
A dismissed person is refused (dismissed): only their manager brings them
back. The email does not follow the provider''s afterwards: it is the
person''s, changed in the profile.';


CREATE OR REPLACE FUNCTION begin_external_sign_in(
    p_sub TEXT,
    p_suggested_email CITEXT,
    p_full_name TEXT,
    p_locale TEXT,
    p_time_zone TEXT,
    p_refresh_token TEXT
)
RETURNS TEXT AS $$
DECLARE
    v_token TEXT := encode(gen_random_bytes(32), 'hex');
BEGIN
    INSERT INTO external_sign_in (hash, sub, suggested_email, full_name, locale, time_zone, refresh_token)
    VALUES (digest(v_token, 'sha256'), p_sub, p_suggested_email, p_full_name, p_locale, p_time_zone, p_refresh_token);
    RETURN v_token;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION begin_external_sign_in(TEXT, CITEXT, TEXT, TEXT, TEXT, TEXT) IS
'Someone the provider let in is unknown here by their provider id:
keeps what the provider said (external_sign_in) and returns the token for
the browser''s cookie. They confirm their email next.';


CREATE OR REPLACE FUNCTION send_external_email(p_browser TEXT, p_email CITEXT)
RETURNS TEXT AS $$
DECLARE
    v_sends INT;
    v_token TEXT;
BEGIN
    SELECT sends INTO v_sends FROM external_sign_in
     WHERE hash = digest(p_browser, 'sha256') AND created_at > NOW() - INTERVAL '1 hour'
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'sign-in through the provider is unknown or expired'
            USING HINT = 'sso_failed';
    END IF;
    -- As many as sign-in links: a mailbox cannot be flooded, from one
    -- sign-in or from many.
    IF v_sends >= 5 OR (SELECT count(*) FROM external_sign_in
                         WHERE email = p_email AND sent_at > NOW() - INTERVAL '15 minutes') >= 5 THEN
        RAISE EXCEPTION 'too many links to %', p_email
            USING HINT = 'too_many_requests';
    END IF;

    v_token := encode(gen_random_bytes(32), 'hex');
    UPDATE external_sign_in
       SET email = p_email, email_hash = digest(v_token, 'sha256'), sends = sends + 1, sent_at = NOW()
     WHERE hash = digest(p_browser, 'sha256');
    RETURN v_token;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION send_external_email(TEXT, CITEXT) IS
'The person typed their email: returns the token of a link to it (sent
by email only, never through notification). A new link voids the one
before. sso_failed — the sign-in is unknown or over an hour old;
too_many_requests — 5 links from it already, or 5 to that address in 15
minutes. The application checks the address''s domain.';


CREATE OR REPLACE FUNCTION confirm_external_email(p_browser TEXT, p_token TEXT)
RETURNS TEXT AS $$
DECLARE
    r external_sign_in;
    v_id INT;
BEGIN
    SELECT * INTO r FROM external_sign_in
     WHERE email_hash = digest(p_token, 'sha256') AND created_at > NOW() - INTERVAL '1 hour'
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'email token is unknown, replaced or expired'
            USING HINT = 'invalid_token';
    END IF;
    IF p_browser IS NULL OR r.hash <> digest(p_browser, 'sha256') THEN
        RAISE EXCEPTION 'the link is opened outside the browser that signed in'
            USING HINT = 'sso_other_browser';
    END IF;
    -- Two tabs following the link at once must not create two people.
    PERFORM pg_advisory_xact_lock(hashtext('yartt.sso'), hashtext(r.sub));

    SELECT e.id INTO v_id
      FROM employee e JOIN human h ON h.employee_id = e.id
     WHERE e.email = r.email AND e.dismissed_at IS NULL;
    IF v_id IS NULL THEN
        IF EXISTS (SELECT 1 FROM employee WHERE email = r.email AND kind = 'human') THEN
            RAISE EXCEPTION 'employee with email % is dismissed', r.email
                USING HINT = 'dismissed';
        END IF;
        INSERT INTO employee (email, full_name, locale, time_zone)
        VALUES (r.email, r.full_name, r.locale, r.time_zone)
        RETURNING id INTO v_id;
        INSERT INTO human (employee_id) VALUES (v_id);
    END IF;

    -- One person per provider account: whoever held it lets go.
    UPDATE human SET external_id = NULL WHERE external_id = r.sub AND employee_id <> v_id;
    UPDATE human
       SET external_id = r.sub,
           idp_refresh_token = COALESCE(r.refresh_token, idp_refresh_token),
           idp_checked_at = NOW(),
           idp_blocked_at = NULL
     WHERE employee_id = v_id;
    DELETE FROM external_sign_in WHERE sub = r.sub;
    RETURN start_session(v_id);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION confirm_external_email(TEXT, TEXT) IS
'The link from send_external_email(), opened in the browser that signed
in (p_browser — its cookie): returns a session token. The working
employee with that email — invited, imported, or someone whose provider
account is new — is the person, and is known by the provider id from now
on; with nobody working at that address someone new is created, and a
dismissed one is refused (dismissed). invalid_token — unknown, replaced
or over an hour old; sso_other_browser — opened elsewhere, so a forwarded
link binds nobody''s account to the provider account of whoever asked.';

COMMENT ON FUNCTION start_session(INT) IS
'A new session for a person: returns the token for the cookie, keeps its
hash. Called once the person is known — by a sign-in link (login()) or
by the identity provider (sign_in_external(), confirm_external_email()).';


-- A plan says what is left to do for its hours (decision 88).

ALTER TABLE estimate_minutes
    ADD COLUMN about TEXT CHECK (about <> '' AND length(about) <= 1000);

COMMENT ON COLUMN estimate_minutes.about IS
'What they still mean to do for these minutes, in their words (decision
88): so the owner of a closed task knows what a plan left on it is about,
and others what the hours are for. NULL — not said.';


-- Whoever comes without an invite is greeted with a link to sign in.

COMMENT ON TABLE employee IS
'An employee. The account: what a person (kind human) and a bot (kind bot)
have in common — a name, a manager, tasks, comments, mentions,
notifications. What only one kind has lives in human or bot, and tables
only a person has rows in (timesheet, time entries, scores, sessions,
reminders, visits) refer to human, so a bot cannot have them.
Only another employee can create one (an invite of a person, checked by
the application; a bot with create_bot()). The application creates the
first employee on its first start (from .env); the installation''s
administrator may add people outside the API. Whoever comes without an
invite is greeted (notify(), kind welcome).
Dismissal sets dismissed_at: records are kept, signing in is impossible.
The email stays, so bringing the employee back needs nothing typed again.
An employee cannot be deleted (trigger).

manager_id — the direct manager. One field, no history.
Changing the manager is a plain UPDATE (by the employee). The new manager
is automatically added to all of the employee''s tasks. The old one stays.
A cycle (A -> B -> A) is forbidden by a trigger. Only a person manages
(manager_id refers to human); a bot always has a manager.

time_zone — the employee''s time zone. It defines day boundaries for the
timesheet, time entries and scores.';
