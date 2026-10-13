-- ============================================================================
--  Database: yartt (Yet Another Radical Task Tracker)
--
--  The current schema as a whole. All semantics live in COMMENT ON; read
--  them with \d+, \dt+, \dn+ or SELECT * FROM pg_description.
--
--  The schema version is major.minor, stored in schema_version (below).
--  New installation: this file is applied to an empty database as a whole.
--  Upgrade: migrations server/migrations/<from>-<to>.sql in a chain.
--  Until a version is released all changes go here only. On the 1.0
--  release this file is copied to server/migrations/1.0.sql (a snapshot
--  to verify the chain); every later release that changes the schema adds
--  a migration and bumps the version here.
--  The application creates the first employee on startup (from .env).
--
--  Business rule errors: RAISE EXCEPTION ... USING HINT = '<code>'
--  [, DETAIL = '<JSON parameters>']. The code is stable; the application
--  translates it into the user's language, substituting the parameters.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- ============================================================================
-- schema_version — schema version
-- ============================================================================
CREATE TABLE schema_version (
    version TEXT NOT NULL CHECK (version ~ '^[0-9]+\.[0-9]+$'),
    entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expired_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_schema_version_active
    ON schema_version((TRUE)) WHERE expired_at IS NULL;

INSERT INTO schema_version (version) VALUES ('1.0');

COMMENT ON TABLE schema_version IS
'History of database schema versions (major.minor). Current = expired_at IS NULL.
Matches the product version without the patch (patches never change the schema).
Installation: a single row with the db.sql version.
Migrations — server/migrations/<from>-<to>.sql:
  - minor: X.Y-X.(Y+1);
  - major: only from the last minor, X.last-(X+1).0.
At every step the application closes the current row and opens a new one.
The whole chain is one transaction: on failure the database stays at the
old version. No downgrades.';

COMMENT ON COLUMN schema_version.version IS
'Schema version major.minor.';

COMMENT ON COLUMN schema_version.entered_at IS
'When the database moved to this version (installation or migration).';

COMMENT ON COLUMN schema_version.expired_at IS
'When the database left this version. NULL = current.';

COMMENT ON INDEX uq_schema_version_active IS
'Exactly one current version.';


-- ============================================================================
-- 0. Philosophy, rules, operations, invariants
-- ============================================================================
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
  - An employee sees only the tasks where they are an active observer.
    The owner is always an observer. The manager (recursively up
    manager_id) is automatically added as an observer to every task of
    their reports.
  - All work happens in comments. Task context and priority are visible
    to everyone, but only the owner can change them.
  - Comments are never deleted or hidden. If a comment is outdated, reply
    to it (reply_to_id) and say so.
  - A task cannot be deleted. A task is closed by setting finished_at in
    the past. The owner can move finished_at (later or earlier) or clear
    it — owners of dependent tasks are notified.
  - A task has an owner (owner_id). There is no separate creator role.
  - Ownership can be transferred by the owner or by the owner''s direct
    manager. The previous owner stays an observer. When the owner is
    dismissed, their tasks go to their manager. With no manager the task
    is left without an owner and any observer can take it.
  - Observers are those who see the task. Any observer can log their own
    time and set reminders for themselves.
  - Access is revoked explicitly: an observer can leave, the owner can
    remove an observer. There is also an access request flow: an employee
    files a request (added_at = NULL), the owner is notified and approves
    it (added_at = NOW()) or rejects it (deleted_at = NOW()).
  - The deadline (finished_at) lives in an interval table. The current
    value = expired_at IS NULL. Clearing = closing the active row without
    opening a new one.
  - A hard dependency (min_minutes_after IS NOT NULL) ties deadlines: a
    task cannot finish earlier than min_minutes_after after its
    dependency. To move a dependency''s deadline later, owners of the
    dependent tasks move theirs first — that is how a postponement is
    agreed.
  - Work quality is scored only per employee per day, never per task.
    The current manager (employee.manager_id) scores any past day with a
    filled timesheet. A score is final: after it neither the score, nor
    the timesheet, nor time entries of that day can change.
  - Workload comes from the timesheet (work). Quality and workload are
    kept apart. A bonus is the manager''s decision; the system provides
    both metrics.
  - The timesheet only moves forward: a closed shift cannot be changed
    or deleted. People think when closing a shift instead of editing it
    afterwards.
  - While an employee is away (employee.next_day in the future),
    notifications go both to them and to their manager (recursively up
    manager_id until an available manager is found).
  - Notifications are a queue in the database. The worker delivers them
    through an outgoing webhook (sent_at); the user handles a
    notification (closed_at). Cleaned up after a year. The system never
    sends email itself: email, Telegram, Slack, etc. are up to the
    webhook receiver.
  - Comments are never edited. The interface protects against accidental
    sending: a sent comment can be pulled back into editing for a few
    seconds and only then goes to the server.
  - Attachments live in a separate table, deduplicated by hash. A comment
    refers to them by an array of ids.
  - Reminders (remind) are explicit: an employee decides when to be
    reminded about a task. Deleted once sent.
  - Only an employee can create another employee (an invite). The first
    employee is created by the application on its first start. No roles.
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
  Reminders (remind) are explicit: an employee sets them.

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

  - By tags: autocomplete on tag.name (trigrams), then tasks
    WHERE tag_ids @> ARRAY[...] (GIN).
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
    - Request sign-in by email -> issue_token(), send the link through the
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
    - Set / change manager_id (the employee themselves).
    - Dismiss an employee (dismiss_employee).
    - Bring a dismissed employee back (restore the email).

  Tasks:
    - Create a task (owner = creator, tags, priority).
    - Change tag_ids / priority / context (owner only).
    - Mark as reviewed (reviewed_at = NOW, owner only).
    - Transfer ownership (the owner or the owner''s manager).
    - Take an ownerless task (owner_id IS NULL, any observer).

  Access:
    - Add an observer (add_observer: the owner or an observer).
    - Request access (request_access: the employee themselves).
    - Approve a request (approve_access: the owner).
    - Reject a request (reject_access: the owner).
    - Remove an observer (the owner).
    - Leave a task (the observer themselves, except the owner and the
      manager of an observing report).

  Dependencies:
    - Add / change / remove a dependency (owner of task_id only).

  Deadlines:
    - Set / move finished_at (set_finished_at, owner only).
    - Clear finished_at (clear_finished_at, owner only).

  Time estimates:
    - Set / change estimate_minutes for oneself (any observer).

  Time entries:
    - Log spent_minutes for oneself (an observer; the owner is always one).
    - Delete one''s own time entry.

  Timesheet:
    - Open a shift (started_at = NOW, spent_minutes = NULL).
    - Change the open shift (started_at, about).
    - Close a shift (spent_minutes = N, about = text).
    - Delete the open shift.
    - Closed shifts are immutable.

  Comments:
    - Upload an attachment (deduplicated by hash) -> attachment.id.
    - Leave a comment (with attachment_ids).
    - Reply to a comment (reply_to_id).
    - Attach an employee -> mention.
    - Attach a task -> task_mention.

  Mentions:
    - Close a mention (closed_at = NOW, explicitly or by replying).

  Reminders:
    - Set a remind (an observer).
    - Delete a remind (its author).

  Notifications:
    - Close a notification (closed_at = NOW).

  Scores:
    - Score an employee''s past day (the manager, once).


============================================================================
ACCESS RULES
============================================================================

  Task:
    - priority, tag_ids, context — owner only.
    - reviewed_at — owner only.
    - owner_id — the current owner or the owner''s direct manager.
    - finished_at — owner only.
    - dependency — owner of task_id only.

  Observers:
    - Any observer can add another observer.
    - Any employee can request access.
    - Approve / reject a request — owner only.
    - Remove an observer — the owner.
    - Leave a task — the observer themselves. The owner cannot leave.
    - A manager cannot be removed (and cannot leave) while a report of
      theirs (recursively) observes the task.

  Estimates and time entries:
    - estimate_minutes — any observer, for themselves only.
    - spent_minutes — any observer, for themselves only (by = them).
    - remind — any observer, for themselves only.
    - work — the employee themselves (their own shift).

  Comments:
    - Leave a comment — any observer.
    - Attach an employee or a task — any observer.
    - Only an employee who observes the task can be attached.

  Scores:
    - score — only the current manager (employee.manager_id).

  Employees:
    - Invite — any employee.
    - manager_id — the employee themselves (own profile). No confirmation
      from the manager: such a substitution is too noticeable.
    - Dismiss — any employee (no roles).


============================================================================
INVARIANTS (forbidden; all checked in the database)
============================================================================

  Task:
    - Empty tag_ids, NULL inside, duplicates, unknown tags.
    - Two tasks with the same set of tags.
    - Deleting a task.
    - An owner who is not an observer.

  Tags:
    - Deleting a tag that is in use.

  Dependencies:
    - Self-dependency (task_id = value).
    - A cycle (A -> B -> A).
    - Breaking a hard dependency: the dependent task has a deadline while
      the dependency has none, or
      finished_at(value) + min_minutes_after > finished_at(task_id).

  Observers:
    - Two open rows (task_id, value): request + access, two requests,
      two accesses.
    - An active observer whose manager is not an observer.
    - Closing a manager''s access while a report of theirs observes the task.

  Mentions:
    - Self-mention.
    - Mentioning an employee who does not observe the task.
    - A comment attaching its own task.

  Hierarchy:
    - A cycle in manager_id (A -> B -> A).
    - An employee being their own manager.

  Timesheet:
    - Overlapping shifts of one employee (including two open ones).
    - spent_minutes <= 0.
    - A shift in the future.
    - Changing or deleting a closed shift.
    - Any timesheet change for a scored day.

  Time entries:
    - An entry by a non-observer, for a future day, for a scored day.
    - Changing an entry (only delete and create).

  Deadlines:
    - finished_at.value IS NULL (clearing = closing the row without a new one).

  Scores:
    - A score not by the current manager.
    - Scoring today or a future day.
    - Scoring a day without closed shifts or with an open shift.
    - Changing or deleting a score.

  Comments:
    - Changing or deleting a comment.
    - attachment_ids with duplicates or unknown attachments.
    - Deleting an attachment referenced by a comment.
    - reply_to_id pointing to a missing comment of the same task.

  Employees:
    - Deleting an employee (dismissal only).


============================================================================
WHAT THE APPLICATION DOES ITSELF (not in the database)
============================================================================

  - Permission checks "owner only" / "manager only" for task operations
    (priority, tag_ids, context, owner_id, finished_at, dependency).
  - The "for oneself" check for estimate_minutes and remind.
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
    IS NULL, sends it to the webhook (URL and secret in the config, body
    signed with HMAC-SHA256) and sets sent_at = NOW(). The body holds the
    recipient (email, locale), kind and payload; the webhook receiver
    produces the text.
  - The close_delay metric (delay in closing a shift) — on the frontend.
  - Rate limiting of issue_token — if ever needed.


============================================================================
CRON JOBS (outside SQL)
============================================================================

  - every minute: SELECT send_due_reminds();
  - every hour:   DELETE FROM token WHERE sent_at < NOW() - INTERVAL ''1 hour'';
  - every day:    DELETE FROM session WHERE last_seen_at < NOW() - INTERVAL ''30 days'';
  - every day:    DELETE FROM notification WHERE added_at < NOW() - INTERVAL ''1 year'';
  - every day:    DELETE FROM attachment a
                   WHERE used_at < NOW() - INTERVAL ''1 day''
                     AND NOT EXISTS (SELECT 1 FROM comment
                                      WHERE attachment_ids @> ARRAY[a.id]);
  - every day:    UPDATE employee SET next_day = NULL
                   WHERE next_day <= local_today(id);
';


-- ============================================================================
-- Helper functions needed before the tables
-- ============================================================================
CREATE OR REPLACE FUNCTION is_int_set(p_values INT[])
RETURNS BOOLEAN AS $$
    SELECT COALESCE(
        cardinality(p_values) > 0
        AND array_ndims(p_values) = 1
        AND array_position(p_values, NULL) IS NULL
        AND cardinality(p_values) = (SELECT COUNT(DISTINCT x) FROM unnest(p_values) AS x),
        FALSE)
$$ LANGUAGE sql IMMUTABLE;

COMMENT ON FUNCTION is_int_set(INT[]) IS
'TRUE if the array is one-dimensional, non-empty, without NULLs and duplicates.
Used in CHECK (a subquery directly in CHECK is not allowed).';


CREATE OR REPLACE FUNCTION work_period(p_started_at TIMESTAMPTZ, p_minutes INT)
RETURNS TSTZRANGE AS $$
    SELECT tstzrange(p_started_at, p_started_at + p_minutes * INTERVAL '1 minute')
$$ LANGUAGE sql IMMUTABLE;

COMMENT ON FUNCTION work_period(TIMESTAMPTZ, INT) IS
'Shift interval. p_minutes IS NULL -> open interval up to infinity.
Marked IMMUTABLE: adding minutes to a timestamptz does not depend on the
time zone (only days and months do).';


-- ============================================================================
-- 1. employee
-- ============================================================================
CREATE TABLE employee (
    id SERIAL PRIMARY KEY,
    email CITEXT UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    about TEXT,
    manager_id INT REFERENCES employee(id),
    next_day DATE,
    time_zone TEXT NOT NULL DEFAULT 'UTC',
    locale VARCHAR(10) NOT NULL DEFAULT 'ru' CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),

    CONSTRAINT chk_employee_manager_not_self
        CHECK (manager_id <> id),
    CONSTRAINT chk_employee_time_zone
        CHECK ((TIMESTAMPTZ '2000-01-01 00:00Z' AT TIME ZONE time_zone) IS NOT NULL)
);
CREATE INDEX idx_employee_manager ON employee(manager_id);

COMMENT ON TABLE employee IS
'An employee. The account.
Only another employee can create one (an invite, checked by the application).
The application creates the first employee on its first start (from .env).
Dismissal = email -> NULL: records are kept, signing in is impossible.
An employee cannot be deleted (trigger).

manager_id — the direct manager. One field, no history.
Changing the manager is a plain UPDATE (by the employee). The new manager
is automatically added to all of the employee''s tasks. The old one stays.
A cycle (A -> B -> A) is forbidden by a trigger.

next_day — when the employee is back at work. While next_day is in the
future, all notifications go both to them and to their manager
(recursively up manager_id until an available one is found). Cron clears
past dates.

time_zone — the employee''s time zone. It defines day boundaries for the
timesheet, time entries and scores.';

COMMENT ON COLUMN employee.id IS
'Employee id.';

COMMENT ON COLUMN employee.email IS
'CITEXT, case-insensitive, UNIQUE. One account per email.
NULL = dismissed. A dismissed employee cannot sign in.
When the employee comes back, the email is restored and history is kept.';

COMMENT ON COLUMN employee.full_name IS
'Display name. Filled by the inviter on invite.';

COMMENT ON COLUMN employee.about IS
'Free text: how to reach me. Filled by the employee.';

COMMENT ON COLUMN employee.manager_id IS
'The direct manager. One field, no history.
The current manager scores the day.
A cycle (A -> B -> A) is forbidden by a trigger.';

COMMENT ON COLUMN employee.next_day IS
'When the employee is back at work.
NULL or a past date = available (cron clears past dates).
A future date = away: notifications go both to them and to their manager.';

COMMENT ON COLUMN employee.locale IS
'Language of the interface and notifications (ru, en, pt-BR, ...).
Sent to the webhook with every notification.';

COMMENT ON COLUMN employee.time_zone IS
'IANA time zone (Europe/Moscow). Defines the employee''s day boundaries.
Changing it shifts past day boundaries — do it rarely.';

COMMENT ON CONSTRAINT chk_employee_manager_not_self ON employee IS
'An employee cannot be their own manager.';


CREATE OR REPLACE FUNCTION local_today(p_employee_id INT)
RETURNS DATE AS $$
    SELECT (NOW() AT TIME ZONE time_zone)::date FROM employee WHERE id = p_employee_id
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION local_today(INT) IS
'Today''s date in the employee''s time zone.';


CREATE OR REPLACE FUNCTION local_day(p_employee_id INT, p_at TIMESTAMPTZ)
RETURNS DATE AS $$
    SELECT (p_at AT TIME ZONE time_zone)::date FROM employee WHERE id = p_employee_id
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION local_day(INT, TIMESTAMPTZ) IS
'The day the moment p_at falls on in the employee''s time zone.';


CREATE OR REPLACE FUNCTION subordinates(p_manager_id INT)
RETURNS SETOF INT AS $$
    WITH RECURSIVE tree AS (
        SELECT id FROM employee WHERE manager_id = p_manager_id
        UNION
        SELECT e.id FROM employee e JOIN tree t ON e.manager_id = t.id
    )
    SELECT id FROM tree
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION subordinates(INT) IS
'All reports, recursively. For the "reports'' tasks" section:
SELECT * FROM task WHERE owner_id IN (SELECT subordinates(:me)).';


-- ============================================================================
-- 1a. avatar
-- ============================================================================
CREATE TABLE avatar (
    employee_id INT PRIMARY KEY REFERENCES employee(id),
    value BYTEA NOT NULL,
    mime VARCHAR(50) NOT NULL
);

COMMENT ON TABLE avatar IS
'Employee avatar, stored as BYTEA.
One avatar per employee (PK = employee_id).';

COMMENT ON COLUMN avatar.employee_id IS
'PK. One avatar per employee.';

COMMENT ON COLUMN avatar.value IS
'Image bytes.';

COMMENT ON COLUMN avatar.mime IS
'MIME type (image/png, image/jpeg, ...).';


-- ============================================================================
-- 2. auth
-- ============================================================================
CREATE TABLE token (
    hash BYTEA PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employee(id),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_token_employee ON token(employee_id);
CREATE INDEX idx_token_sent_at ON token(sent_at);

COMMENT ON TABLE token IS
'Single-use magic tokens for signing in by email.
Issued by issue_token(), redeemed by login(). Valid for 10 minutes; cron
removes unused ones after an hour. Only the SHA-256 of the token is stored.';

COMMENT ON COLUMN token.hash IS
'SHA-256 of the token from the email. The token itself is not stored.';

COMMENT ON COLUMN token.employee_id IS
'Whom the token belongs to.';

COMMENT ON COLUMN token.sent_at IS
'When the token was issued. Valid for 10 minutes.';

COMMENT ON INDEX idx_token_sent_at IS
'For the cron cleanup of old tokens.';


CREATE TABLE session (
    hash BYTEA PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employee(id),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_session_employee ON session(employee_id);
CREATE INDEX idx_session_last_seen ON session(last_seen_at);

COMMENT ON TABLE session IS
'Live cookies. Created by login(), checked by authenticate().
Session TTL is by inactivity: cron deletes sessions not seen for > 30 days.
An active user is never logged out.
Logout — DELETE. "Log out everywhere" — DELETE WHERE employee_id = ?.
Dismissal deletes all sessions of the employee.';

COMMENT ON COLUMN session.hash IS
'SHA-256 of the cookie token. The token itself lives only in the cookie.';

COMMENT ON COLUMN session.employee_id IS
'Whose session.';

COMMENT ON COLUMN session.last_seen_at IS
'Moment of the last activity.
Updated by authenticate() when older than 5 minutes.
Cron deletes sessions where last_seen_at < NOW() - INTERVAL ''30 days''.';


-- ============================================================================
-- 3. tag / user_tag_color
-- ============================================================================
CREATE TABLE tag (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);
CREATE INDEX idx_tag_name_trgm ON tag USING GIN (name gin_trgm_ops);

COMMENT ON TABLE tag IS
'A tag. Name only. The color is a personal setting (user_tag_color).
Tags are stored in task.tag_ids as a sorted array.
A tag in use cannot be deleted (trigger).';

COMMENT ON COLUMN tag.id IS
'Tag id.';

COMMENT ON COLUMN tag.name IS
'Unique tag name.';


CREATE TABLE user_tag_color (
    employee_id INT NOT NULL REFERENCES employee(id),
    tag_id INT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
    value VARCHAR(7) NOT NULL CHECK (value ~ '^#[0-9a-fA-F]{6}$'),
    PRIMARY KEY (employee_id, tag_id)
);

COMMENT ON TABLE user_tag_color IS
'Personal tag color of an employee.
Lets everyone see tags in their own colors.
No row — the default color (decided by the frontend).';

COMMENT ON COLUMN user_tag_color.employee_id IS
'Whose personal color.';

COMMENT ON COLUMN user_tag_color.tag_id IS
'Which tag.';

COMMENT ON COLUMN user_tag_color.value IS
'Hex color code (#RRGGBB).';


-- ============================================================================
-- 4. task — a thin entity
-- ============================================================================
CREATE TYPE priority AS ENUM ('LOW','NORMAL','HIGH','CRITICAL');

COMMENT ON TYPE priority IS
'Task priority. LOW / NORMAL / HIGH / CRITICAL.
Visible to everyone, changed only by the task owner.';


CREATE TABLE task (
    id SERIAL PRIMARY KEY,
    owner_id INT REFERENCES employee(id),

    tag_ids INT[] NOT NULL,
    priority priority NOT NULL DEFAULT 'NORMAL',

    context TEXT,
    reviewed_at TIMESTAMPTZ,

    CONSTRAINT chk_task_tag_ids_set
        CHECK (is_int_set(tag_ids)),
    CONSTRAINT uq_task_tag_ids
        UNIQUE (tag_ids)
);
CREATE INDEX idx_task_owner ON task(owner_id);
CREATE INDEX idx_task_tag_ids ON task USING GIN (tag_ids);
CREATE INDEX idx_task_context_trgm ON task USING GIN (context gin_trgm_ops);

COMMENT ON TABLE task IS
'A task — only "what this entity is".

id — SERIAL, immutable PK. All FKs and URLs use it.

tag_ids — the set of tags, which is also the task "title". Stored sorted
(trigger), so UNIQUE (tag_ids) forbids two tasks with the same set. An
empty set, duplicates and unknown tags are forbidden.

owner_id — the current owner, responsible for getting it done on time and
well thought out. Always an observer of the task (trigger). May be NULL —
an ownerless task (after the owner was dismissed with no manager).

priority, context — visible to everyone, changed only by the owner.

reviewed_at — when the owner last explicitly confirmed the task is still
relevant. Updated only by an explicit owner action ("Mark as reviewed").
"Needs attention" rule: reviewed_at IS NULL or there is a comment after
reviewed_at (not counting the owner''s comments).
Reset to NULL when the owner changes (trigger).

A task cannot be deleted (trigger). A task is closed by setting
finished_at in the past. A closed task can be commented on, have time
logged, have its tags changed — just like an open one. "When it was
created" is not stored — it is not a metric, to avoid gaming lead time.';

COMMENT ON COLUMN task.id IS
'SERIAL PRIMARY KEY. Immutable. All FKs and URLs use it.';

COMMENT ON COLUMN task.owner_id IS
'The current task owner, responsible for the result. Always an observer.
May be NULL: an ownerless task. Then the first observer to take it
becomes the owner.
Ownership is transferred by the current owner or the owner''s direct
manager. The previous owner stays an observer.
reviewed_at is reset to NULL on transfer.';

COMMENT ON COLUMN task.tag_ids IS
'Sorted set of tag ids. Unique among tasks.
Changed only by the owner. Non-empty, no duplicates, tags exist.';

COMMENT ON COLUMN task.priority IS
'Priority. Visible to everyone, changed only by the owner. Default NORMAL.';

COMMENT ON COLUMN task.context IS
'Task description from the owner''s point of view. Visible to everyone,
changed only by the owner.';

COMMENT ON COLUMN task.reviewed_at IS
'When the owner last explicitly confirmed the task is still relevant.
Updated only by the "Mark as reviewed" action.
"Needs attention" rule: reviewed_at IS NULL or a comment after
reviewed_at (not counting the owner''s comments).
Reset to NULL when the owner changes.';

COMMENT ON CONSTRAINT chk_task_tag_ids_set ON task IS
'Tags: non-empty, no NULLs, no duplicates.';

COMMENT ON CONSTRAINT uq_task_tag_ids ON task IS
'The set of tags is unique — it is the task "title".';


-- ============================================================================
-- 5. observer — who sees a task, and access requests
-- ============================================================================
CREATE TABLE observer (
    id SERIAL PRIMARY KEY,
    task_id INT NOT NULL REFERENCES task(id),
    value INT NOT NULL REFERENCES employee(id),
    added_by INT REFERENCES employee(id),
    added_at TIMESTAMPTZ,
    deleted_by INT REFERENCES employee(id),
    deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_observer_open
    ON observer(task_id, value)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_observer_value
    ON observer(value)
    WHERE added_at IS NOT NULL AND deleted_at IS NULL;

COMMENT ON TABLE observer IS
'Access to a task and access requests.

STATES:
  - added_at IS NULL AND deleted_at IS NULL — a request awaiting approval.
  - added_at IS NOT NULL AND deleted_at IS NULL — active access.
  - deleted_at IS NOT NULL — access closed or request rejected.
At most one open row per (task_id, value).

WHO CREATES A ROW:
  - The employee requests access: added_by = NULL, added_at = NULL.
    The owner is notified.
  - The owner or an observer adds someone: added_by = them, added_at = NOW().
  - The system: added_by = NULL, added_at = NOW(). This is how the owner
    (on task creation and transfer) and the managers of all active
    observers, recursively, are added (triggers).

WHO APPROVES:
  - The task owner: approve_access / reject_access.

ACCESS IS REVOKED:
  - An observer can leave (deleted_by = value).
  - The owner can remove an observer.
  - The owner cannot leave.
  - A manager cannot leave or be removed while an active report of theirs
    (recursively) observes the task.

When an observer leaves, their current estimate_minutes row is closed
(expired_at = NOW()) and their reminders (remind) are deleted (trigger).';

COMMENT ON COLUMN observer.id IS
'Row id.';

COMMENT ON COLUMN observer.task_id IS
'Which task the access is for.';

COMMENT ON COLUMN observer.value IS
'Who gets access to the task.';

COMMENT ON COLUMN observer.added_by IS
'Who granted access.
NULL with added_at IS NULL = the employee requested access.
NULL with added_at NOT NULL = added by the system.';

COMMENT ON COLUMN observer.added_at IS
'When the access became active.
NULL = a request awaiting the owner''s approval.';

COMMENT ON COLUMN observer.deleted_by IS
'Who closed the access or rejected the request.';

COMMENT ON COLUMN observer.deleted_at IS
'When closed. NULL = access active or request pending.';


-- ============================================================================
-- 6. dependency — the dependency graph
-- ============================================================================
CREATE TABLE dependency (
    task_id INT NOT NULL REFERENCES task(id),
    value INT NOT NULL REFERENCES task(id),
    min_minutes_after INT CHECK (min_minutes_after >= 0),
    PRIMARY KEY (task_id, value),

    CONSTRAINT chk_dependency_not_self CHECK (task_id <> value)
);
CREATE INDEX idx_dependency_value ON dependency(value);

COMMENT ON TABLE dependency IS
'The dependency graph. task_id depends on value.
Set, changed and removed only by the owner of task_id.
Cycles are forbidden (trigger). Self-dependency is forbidden (CHECK).
Deletion is physical. No audit.
When finished_at of value is set, moved or cleared, owners of all
dependent tasks are notified.';

COMMENT ON COLUMN dependency.task_id IS
'The dependent task.';

COMMENT ON COLUMN dependency.value IS
'The task task_id depends on.';

COMMENT ON COLUMN dependency.min_minutes_after IS
'Minimum minutes needed to finish task_id after value is finished.
NULL = a soft dependency: deadlines are not tied.
NOT NULL = a hard one: if task_id has a deadline, value must have one too
and finished_at(value) + min_minutes_after <= finished_at(task_id).
Checked at commit (deferred trigger). So the deadline of value can be
moved later or cleared only after owners of the dependent tasks have
moved theirs.';


-- ============================================================================
-- 7. finished_at — task deadline history
-- ============================================================================
CREATE TABLE finished_at (
    task_id INT NOT NULL REFERENCES task(id),
    value TIMESTAMPTZ NOT NULL,
    entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expired_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_finished_at_active
    ON finished_at(task_id) WHERE expired_at IS NULL;
CREATE INDEX idx_finished_at_task ON finished_at(task_id);

COMMENT ON TABLE finished_at IS
'Task deadline history.
Current = expired_at IS NULL. There may be no rows — "not set".
The task is done when the current value <= NOW().

Set, moved (later or earlier) and cleared only by the owner —
through set_finished_at / clear_finished_at.
Move: the old row is closed and a new one opened.
Clear: the old row is closed, no new one is created.
Owners of dependent tasks are notified.
Hard dependencies are checked at commit.';

COMMENT ON COLUMN finished_at.task_id IS
'Which task.';

COMMENT ON COLUMN finished_at.value IS
'Moment of completion. NOT NULL.';

COMMENT ON COLUMN finished_at.entered_at IS
'When this value became current.';

COMMENT ON COLUMN finished_at.expired_at IS
'When it stopped being current. NULL = current.';

COMMENT ON INDEX uq_finished_at_active IS
'Exactly one current deadline: UNIQUE (task_id) WHERE expired_at IS NULL.';


-- ============================================================================
-- 8. estimate_minutes — time estimate history
-- ============================================================================
CREATE TABLE estimate_minutes (
    task_id INT NOT NULL REFERENCES task(id),
    by INT NOT NULL REFERENCES employee(id),
    value INT NOT NULL CHECK (value > 0),
    entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expired_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_estimate_minutes_active
    ON estimate_minutes(task_id, by) WHERE expired_at IS NULL;
CREATE INDEX idx_estimate_minutes_task ON estimate_minutes(task_id);

COMMENT ON TABLE estimate_minutes IS
'History of time estimates from each observer.
Current row = expired_at IS NULL.
Set by any observer — for themselves (by = them).
A change closes the old row and opens a new one.
When an observer leaves the task, their current row is closed.
Does not notify the task owner.';

COMMENT ON COLUMN estimate_minutes.by IS
'Who estimates.';

COMMENT ON COLUMN estimate_minutes.value IS
'How many minutes they plan to spend. > 0.';

COMMENT ON COLUMN estimate_minutes.entered_at IS
'When this value became current.';

COMMENT ON COLUMN estimate_minutes.expired_at IS
'When it stopped being current. NULL = current.';


-- ============================================================================
-- 9. spent_minutes — time entries
-- ============================================================================
CREATE TABLE spent_minutes (
    id SERIAL PRIMARY KEY,
    task_id INT NOT NULL REFERENCES task(id),
    by INT NOT NULL REFERENCES employee(id),
    day DATE NOT NULL,
    value INT NOT NULL CHECK (value > 0),
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_spent_minutes_task ON spent_minutes(task_id);
CREATE INDEX idx_spent_minutes_by_day ON spent_minutes(by, day);

COMMENT ON TABLE spent_minutes IS
'Time entries.
by — who logged it. Only for oneself, only an active observer
(the owner is always one). Checked by a trigger.
Time cannot be logged for a future day or a scored day (trigger).
No updates: delete your own entry and create it again (except for
scored days).
When the day''s entries exceed the timesheet hours, the frontend shows
a warning (in the employee''s timesheet).
Does not notify the task owner.';

COMMENT ON COLUMN spent_minutes.id IS
'Entry id (for deletion).';

COMMENT ON COLUMN spent_minutes.task_id IS
'Which task the time is logged to.';

COMMENT ON COLUMN spent_minutes.by IS
'Who logged it — and for whom: only for oneself.';

COMMENT ON COLUMN spent_minutes.day IS
'The day the time is logged for (in the time zone of by).';

COMMENT ON COLUMN spent_minutes.value IS
'Minutes spent. CHECK > 0.';


-- ============================================================================
-- 10. work — timesheet
-- ============================================================================
CREATE TABLE work (
    employee_id INT NOT NULL REFERENCES employee(id),
    started_at TIMESTAMPTZ NOT NULL,
    spent_minutes INT CHECK (spent_minutes > 0),
    about TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (employee_id, started_at),
    CONSTRAINT excl_work_overlap EXCLUDE USING gist (
        employee_id WITH =,
        work_period(started_at, spent_minutes) WITH &&
    )
);

COMMENT ON TABLE work IS
'Timesheet. The employee records: "started at 10:00, worked N minutes".
Optional — if nobody keeps it, the day cannot be scored.

spent_minutes IS NULL — the shift is open (working right now).
An open shift lasts until infinity, so an employee has at most one open
shift and no shift can follow it.
The employee always closes the shift themselves, with whatever time
they consider right.
Shift end = started_at + spent_minutes. Shift day = local_day(started_at).
Shifts of one employee never overlap (EXCLUDE).
A shift cannot be in the future.

Only moves forward: the open shift can be changed, closed or deleted.
A closed one can be neither changed nor deleted. For a scored day the
timesheet is fully frozen.

about — what was done during the shift. Free text, optional.

The close_delay metric (delay in closing a shift) is computed on the
frontend: the difference between updated_at and
(started_at + spent_minutes). A large one is a signal for the manager.

If more time is logged to tasks (spent_minutes) than worked (work), the
employee''s timesheet shows a warning.';

COMMENT ON COLUMN work.employee_id IS
'Who worked.';

COMMENT ON COLUMN work.started_at IS
'When work started. Part of the PK.';

COMMENT ON COLUMN work.spent_minutes IS
'Minutes worked. NULL = the shift is open.
Filled by the employee when closing the shift.';

COMMENT ON COLUMN work.about IS
'What was done during the shift. Free text. Optional.';

COMMENT ON COLUMN work.updated_at IS
'When the row last changed (for a closed shift — the moment it was closed).';

COMMENT ON CONSTRAINT excl_work_overlap ON work IS
'Shifts of one employee never overlap. An open one lasts until infinity.';


-- ============================================================================
-- 10a. attachment — attachments
-- ============================================================================
CREATE TABLE attachment (
    id SERIAL PRIMARY KEY,
    hash BYTEA NOT NULL,
    size INT NOT NULL CHECK (size >= 0),
    mime VARCHAR(100) NOT NULL,
    value BYTEA NOT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_attachment_hash ON attachment(hash);
CREATE INDEX idx_attachment_used_at ON attachment(used_at);

COMMENT ON TABLE attachment IS
'Comment attachments.
Uploaded before the comment is sent; the comment refers to them by the
array comment.attachment_ids (by id, not by hash — hashes may collide).
There is no file name here: the same file may arrive under different
names; the name is stored in comment.attachment_names.
Deduplication: on upload the application looks for a row with the same
hash and size and compares the bytes; on a match it returns the existing
id and updates used_at.
Cron deletes, once a day, attachments no comment refers to that have not
been used for more than a day (uploaded, but the comment was never sent).
An attachment referenced by a comment cannot be deleted (trigger) —
comments live forever.';

COMMENT ON COLUMN attachment.id IS
'Id. Referenced by comment.attachment_ids.';

COMMENT ON COLUMN attachment.hash IS
'SHA-256 of the content. For a quick duplicate lookup, not unique.';

COMMENT ON COLUMN attachment.size IS
'Size in bytes.';

COMMENT ON COLUMN attachment.mime IS
'MIME type.';

COMMENT ON COLUMN attachment.value IS
'File content.';

COMMENT ON COLUMN attachment.added_at IS
'When first uploaded.';

COMMENT ON COLUMN attachment.used_at IS
'When last uploaded again or attached to a comment.';


-- ============================================================================
-- 11. comment — comments
-- ============================================================================
CREATE TABLE comment (
    task_id INT NOT NULL REFERENCES task(id),
    id INT NOT NULL,
    created_by INT NOT NULL REFERENCES employee(id),
    value TEXT NOT NULL,
    attachment_ids INT[] NOT NULL DEFAULT '{}',
    attachment_names TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reply_to_id INT,
    PRIMARY KEY (task_id, id),
    FOREIGN KEY (task_id, reply_to_id) REFERENCES comment(task_id, id),

    CONSTRAINT chk_comment_attachment_ids
        CHECK (cardinality(attachment_ids) = 0 OR is_int_set(attachment_ids)),
    CONSTRAINT chk_comment_attachment_names
        CHECK (cardinality(attachment_names) = cardinality(attachment_ids)
               AND array_position(attachment_names, NULL) IS NULL)
);
CREATE INDEX idx_comment_reply_to ON comment(task_id, reply_to_id);
CREATE INDEX idx_comment_attachment_ids ON comment USING GIN (attachment_ids);
CREATE INDEX idx_comment_value_trgm ON comment USING GIN (value gin_trgm_ops);

COMMENT ON TABLE comment IS
'Comments. id is local (max+1 within task_id).
reply_to_id is the local id of the parent in the same task.
Comments are never edited, deleted or hidden (trigger).
If a comment is outdated, reply to it (reply_to_id) and say so.
The interface protects against accidental sending: for a few seconds
after "Send" the comment can be pulled back into editing, and only then
it goes to the server.
All communication about a task happens here.
Employees (mention) and tasks (task_mention) are attached to a comment.
A comment notifies the task owner (unless the owner wrote it).';

COMMENT ON COLUMN comment.task_id IS
'Which task.';

COMMENT ON COLUMN comment.id IS
'Local id: max+1 within task_id. Trigger with an advisory lock.';

COMMENT ON COLUMN comment.created_by IS
'Comment author.';

COMMENT ON COLUMN comment.value IS
'Comment text.';

COMMENT ON COLUMN comment.created_at IS
'When the comment was created.';

COMMENT ON COLUMN comment.attachment_ids IS
'Attachment ids (attachment). No duplicates, all exist (trigger).
Their used_at is updated on insert.';

COMMENT ON COLUMN comment.attachment_names IS
'File names in the same order as attachment_ids.';

COMMENT ON COLUMN comment.reply_to_id IS
'Local id of the parent comment in the same task. NULL — a root comment.';


-- ============================================================================
-- 12. mention / task_mention — what is attached to a comment
-- ============================================================================
CREATE TABLE mention (
    task_id INT NOT NULL,
    comment_id INT NOT NULL,
    value INT NOT NULL REFERENCES employee(id),
    closed_at TIMESTAMPTZ,
    PRIMARY KEY (task_id, comment_id, value),
    FOREIGN KEY (task_id, comment_id) REFERENCES comment(task_id, id)
);
CREATE INDEX idx_mention_value ON mention(value) WHERE closed_at IS NULL;

COMMENT ON TABLE mention IS
'An employee attached to a comment (a mention).
Attached explicitly, the text is not parsed.
closed_at IS NULL — the mention is open.
Closed (a) explicitly as "read", (b) by replying to the source comment.
Self-mention is forbidden. Only an active observer of the task can be
mentioned (trigger).
The mentioned employee is always notified.';

COMMENT ON COLUMN mention.task_id IS
'Which task.';

COMMENT ON COLUMN mention.comment_id IS
'Local comment id.';

COMMENT ON COLUMN mention.value IS
'Who is mentioned.';

COMMENT ON COLUMN mention.closed_at IS
'When the mention was closed. NULL = open.';


CREATE TABLE task_mention (
    task_id INT NOT NULL,
    comment_id INT NOT NULL,
    value INT NOT NULL REFERENCES task(id),
    PRIMARY KEY (task_id, comment_id, value),
    FOREIGN KEY (task_id, comment_id) REFERENCES comment(task_id, id),

    CONSTRAINT chk_task_mention_not_self CHECK (value <> task_id)
);
CREATE INDEX idx_task_mention_value ON task_mention(value);

COMMENT ON TABLE task_mention IS
'A task attached to a comment of another task.
idx_task_mention_value serves backlinks ("where this task is mentioned").
The owner of the attached task is notified (unless they wrote the
comment).';

COMMENT ON COLUMN task_mention.task_id IS
'The comment''s task.';

COMMENT ON COLUMN task_mention.comment_id IS
'Local comment id.';

COMMENT ON COLUMN task_mention.value IS
'Which task is attached.';


-- ============================================================================
-- 13. remind — reminders
-- ============================================================================
CREATE TABLE remind (
    employee_id INT NOT NULL REFERENCES employee(id),
    task_id INT NOT NULL REFERENCES task(id),
    at TIMESTAMPTZ NOT NULL,
    value TEXT,

    PRIMARY KEY (employee_id, task_id, at)
);
CREATE INDEX idx_remind_at ON remind(at);

COMMENT ON TABLE remind IS
'Task reminders. Any observer can set a reminder for themselves at a
given moment. send_due_reminds() sends and deletes them. Leaving the task
deletes the reminders.
value — reminder text (what exactly to remind about). Optional.';

COMMENT ON COLUMN remind.employee_id IS
'Whom to remind.';

COMMENT ON COLUMN remind.task_id IS
'Which task.';

COMMENT ON COLUMN remind.at IS
'When to remind.';

COMMENT ON COLUMN remind.value IS
'Reminder text.';


-- ============================================================================
-- 14. notification — notification queue
-- ============================================================================
CREATE TABLE notification (
    id BIGSERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employee(id),
    task_id INT REFERENCES task(id),
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    payload JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_notification_employee
    ON notification(employee_id) WHERE closed_at IS NULL;
CREATE INDEX idx_notification_unsent
    ON notification(added_at) WHERE sent_at IS NULL;
CREATE INDEX idx_notification_added_at ON notification(added_at);

COMMENT ON TABLE notification IS
'Notification queue. Not an inbox.
Created only through notify(), which handles absence and dismissal.
payload JSONB — context; kind is stored inside payload.
The worker takes WHERE sent_at IS NULL (FOR UPDATE SKIP LOCKED), sends
to the webhook and sets sent_at. The user handles the notification —
closed_at. Cleaned up after a year.

RULES:
  - comment -> the task owner (unless they wrote it).
  - mention -> the mentioned employee, always.
  - task attached to a comment -> the owner of the attached task
    (unless they wrote the comment).
  - reminder (remind) -> whoever set it.
  - access request -> the task owner.
  - finished_at set / moved / cleared -> owners of dependent tasks.
  - owner change -> the new owner. If the manager initiated it — the
    previous owner too.
  - score -> the scored employee.
  - invite -> the invitee.
If the recipient is away, a copy goes to their manager (recursively).
Dismissed employees get no notifications.

Delivery is only through the outgoing webhook (URL and secret in the
config). Channels (email, Telegram, Slack, ...) and texts in the
employee.locale language are up to the webhook receiver.';

COMMENT ON COLUMN notification.id IS
'Notification id.';

COMMENT ON COLUMN notification.employee_id IS
'Recipient.';

COMMENT ON COLUMN notification.task_id IS
'Which task (may be NULL).';

COMMENT ON COLUMN notification.added_at IS
'When the notification was created.';

COMMENT ON COLUMN notification.sent_at IS
'When sent to the webhook. NULL = queued.';

COMMENT ON COLUMN notification.closed_at IS
'When the user handled the notification. NULL = not handled.';

COMMENT ON COLUMN notification.payload IS
'JSONB context. Contains kind:
  comment | mention | task_mention | remind | access_request | finished_at_change |
  owner_change | score | invite.
A copy for an absent employee''s manager has for = the recipient id.';


-- ============================================================================
-- 15. score — daily work score
-- ============================================================================
CREATE TABLE score (
    employee_id INT NOT NULL REFERENCES employee(id),
    day DATE NOT NULL,
    by INT NOT NULL REFERENCES employee(id),
    value INT NOT NULL CHECK (value BETWEEN 0 AND 100),
    reason TEXT,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (employee_id, day)
);
CREATE INDEX idx_score_day ON score(day);

COMMENT ON TABLE score IS
'An employee''s work score for a day. 0–100.
Set by the current manager (employee.manager_id) for any past day (in the
employee''s time zone) that has closed shifts and no open one.
A score is final: it cannot be changed or deleted. After it the
timesheet and time entries of that day are frozen too (triggers).

The score is about the quality of the day''s decisions:
  - did the employee pick the right priorities;
  - do their decisions match the manager''s understanding.
Not about the task result. A task may fail while the scores are good, if
the employee chose well every day.

reason — an optional justification. Needed first of all for bad scores,
so the employee understands what went wrong.

Hours per day for weighting come from work:
  SUM(spent_minutes) / 60 for local_day(started_at) = day.

Weighted average score for a period:
  SUM(value * hours) / SUM(hours), where hours come from work.
Workload — SUM(hours) — is a separate metric; the manager weighs it on
their own when deciding on a bonus.';

COMMENT ON COLUMN score.employee_id IS
'Who is scored.';

COMMENT ON COLUMN score.day IS
'Which day is scored.';

COMMENT ON COLUMN score.by IS
'Who scored — the manager at the time of scoring (manager_id has no history).';

COMMENT ON COLUMN score.value IS
'Score 0–100. Quality of the day''s decisions.';

COMMENT ON COLUMN score.reason IS
'Justification. Optional. Needed first of all for bad scores.';

COMMENT ON COLUMN score.added_at IS
'When the score was given.';


-- ============================================================================
-- FUNCTIONS used by triggers
-- ============================================================================

-- ----------------------------------------------------------------------------
-- notify — create a notification, honoring absence
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify(
    p_employee_id INT,
    p_task_id INT,
    p_payload JSONB
)
RETURNS VOID AS $$
DECLARE
    v_id INT := p_employee_id;
    v_email CITEXT;
    v_next_day DATE;
    v_manager_id INT;
    v_payload JSONB := p_payload;
BEGIN
    SELECT email INTO v_email FROM employee WHERE id = p_employee_id;
    IF v_email IS NULL THEN
        RETURN;
    END IF;

    LOOP
        SELECT email, next_day, manager_id
          INTO v_email, v_next_day, v_manager_id
          FROM employee WHERE id = v_id;

        IF v_email IS NOT NULL THEN
            INSERT INTO notification (employee_id, task_id, payload)
            VALUES (v_id, p_task_id, v_payload);
            EXIT WHEN v_next_day IS NULL OR v_next_day <= local_today(v_id);
        END IF;

        EXIT WHEN v_manager_id IS NULL;
        v_id := v_manager_id;
        v_payload := p_payload || jsonb_build_object('for', p_employee_id);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION notify(INT, INT, JSONB) IS
'The only way to create a notification.
A dismissed employee gets nothing. If the recipient is away (next_day in
the future), a copy goes to their manager, and so on up until an
available one is found. Copies carry for = the original recipient.';


-- ----------------------------------------------------------------------------
-- grant_observer — grant active access
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grant_observer(
    p_task_id INT,
    p_employee_id INT,
    p_actor_id INT
)
RETURNS VOID AS $$
BEGIN
    UPDATE observer
       SET added_at = NOW(),
           added_by = p_actor_id
     WHERE task_id = p_task_id
       AND value = p_employee_id
       AND added_at IS NULL
       AND deleted_at IS NULL;

    IF NOT FOUND THEN
        INSERT INTO observer (task_id, value, added_by, added_at)
        VALUES (p_task_id, p_employee_id, p_actor_id, NOW())
        ON CONFLICT (task_id, value) WHERE deleted_at IS NULL DO NOTHING;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION grant_observer(INT, INT, INT) IS
'Makes an employee an active observer. No permission checks.
A pending request -> approved. Already active -> nothing. Otherwise -> a new row.
p_actor_id = NULL — a system action.';


-- ----------------------------------------------------------------------------
-- check_deadlines — hard dependencies
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_deadlines(p_task_id INT)
RETURNS VOID AS $$
DECLARE
    v_task_id INT;
    v_value INT;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('yartt.deadline'));

    SELECT d.task_id, d.value INTO v_task_id, v_value
      FROM dependency d
      JOIN finished_at fa
        ON fa.task_id = d.task_id AND fa.expired_at IS NULL
      LEFT JOIN finished_at fb
        ON fb.task_id = d.value AND fb.expired_at IS NULL
     WHERE (d.task_id = p_task_id OR d.value = p_task_id)
       AND d.min_minutes_after IS NOT NULL
       AND (fb.value IS NULL
            OR fb.value + d.min_minutes_after * INTERVAL '1 minute' > fa.value)
     LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'deadline of task % violates hard dependency on task %',
            v_task_id, v_value
            USING HINT = 'hard_dependency_violated',
                  DETAIL = json_build_object('taskId', v_task_id, 'dependencyId', v_value)::text;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_deadlines(INT) IS
'Checks the task''s hard dependencies in both directions.
A global advisory lock serializes the checks so that two concurrent
transactions cannot break the invariant together.';


-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- no deletion: employee, task, comment
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_forbid_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% on % is not allowed', TG_OP, TG_TABLE_NAME
            USING HINT = 'immutable_row';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_forbid_delete() IS
'Forbids DELETE (and UPDATE for comment). An employee is dismissed, a task
is closed, a comment stays forever and is never edited.';

CREATE TRIGGER employee_forbid_delete
BEFORE DELETE ON employee
FOR EACH ROW EXECUTE FUNCTION trg_forbid_delete();

CREATE TRIGGER task_forbid_delete
BEFORE DELETE ON task
FOR EACH ROW EXECUTE FUNCTION trg_forbid_delete();

CREATE TRIGGER comment_forbid_change
BEFORE UPDATE OR DELETE ON comment
FOR EACH ROW EXECUTE FUNCTION trg_forbid_delete();


-- ----------------------------------------------------------------------------
-- employee: no cycles in manager_id
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_employee_manager_cycle()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.manager_id IS NULL THEN
        RETURN NEW;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('yartt.hierarchy'));

    IF EXISTS (
        WITH RECURSIVE chain AS (
            SELECT NEW.manager_id AS id
            UNION
            SELECT e.manager_id FROM employee e
            JOIN chain c ON e.id = c.id
            WHERE e.manager_id IS NOT NULL
        )
        SELECT 1 FROM chain WHERE id = NEW.id
    ) THEN
        RAISE EXCEPTION 'manager cycle detected for employee %', NEW.id
            USING HINT = 'manager_cycle',
                  DETAIL = json_build_object('employeeId', NEW.id)::text;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_employee_manager_cycle() IS
'Forbids a cycle in employee.manager_id (direct or through a chain).
The advisory lock prevents a race between two concurrent UPDATEs.';

CREATE TRIGGER employee_manager_cycle
BEFORE INSERT OR UPDATE OF manager_id ON employee
FOR EACH ROW EXECUTE FUNCTION trg_employee_manager_cycle();


-- ----------------------------------------------------------------------------
-- employee: the new manager sees the employee's tasks
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_employee_manager_observe()
RETURNS TRIGGER AS $$
DECLARE
    v_task_id INT;
BEGIN
    FOR v_task_id IN
        SELECT task_id FROM observer
         WHERE value = NEW.id
           AND added_at IS NOT NULL
           AND deleted_at IS NULL
    LOOP
        PERFORM grant_observer(v_task_id, NEW.manager_id, NULL);
    END LOOP;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_employee_manager_observe() IS
'When manager_id changes, the new manager (and recursively their managers)
becomes an observer of all the employee''s tasks. The tasks of the
employee''s reports are already among them — the employee observes them.';

CREATE TRIGGER employee_manager_observe
AFTER UPDATE OF manager_id ON employee
FOR EACH ROW
WHEN (NEW.manager_id IS NOT NULL AND NEW.manager_id IS DISTINCT FROM OLD.manager_id)
EXECUTE FUNCTION trg_employee_manager_observe();


-- ----------------------------------------------------------------------------
-- tag: a tag in use cannot be deleted
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_tag_in_use()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM task WHERE tag_ids @> ARRAY[OLD.id]) THEN
        RAISE EXCEPTION 'tag % is used by tasks', OLD.id
            USING HINT = 'tag_in_use',
                  DETAIL = json_build_object('tagId', OLD.id)::text;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_tag_in_use() IS
'Forbids deleting a tag that appears in task.tag_ids.';

CREATE TRIGGER tag_in_use
BEFORE DELETE ON tag
FOR EACH ROW EXECUTE FUNCTION trg_tag_in_use();


-- ----------------------------------------------------------------------------
-- task: normalize tag_ids
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_task_tag_ids()
RETURNS TRIGGER AS $$
DECLARE
    v_found INT;
BEGIN
    NEW.tag_ids := ARRAY(SELECT x FROM unnest(NEW.tag_ids) AS x ORDER BY x);

    PERFORM 1 FROM tag WHERE id = ANY(NEW.tag_ids) FOR KEY SHARE;
    GET DIAGNOSTICS v_found = ROW_COUNT;
    IF v_found <> (SELECT COUNT(DISTINCT x) FROM unnest(NEW.tag_ids) AS x) THEN
        RAISE EXCEPTION 'tag_ids contain unknown tags'
            USING HINT = 'unknown_tag';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_task_tag_ids() IS
'Sorts tag_ids (for UNIQUE) and checks that all tags exist.
FOR KEY SHARE prevents a concurrent deletion of a tag.';

CREATE TRIGGER task_tag_ids
BEFORE INSERT OR UPDATE OF tag_ids ON task
FOR EACH ROW EXECUTE FUNCTION trg_task_tag_ids();


-- ----------------------------------------------------------------------------
-- task: an owner change resets reviewed_at
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_task_owner_reset_review()
RETURNS TRIGGER AS $$
BEGIN
    NEW.reviewed_at := NULL;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_task_owner_reset_review() IS
'reviewed_at = NULL when the owner changes.';

CREATE TRIGGER task_owner_reset_review
BEFORE UPDATE OF owner_id ON task
FOR EACH ROW
WHEN (NEW.owner_id IS DISTINCT FROM OLD.owner_id)
EXECUTE FUNCTION trg_task_owner_reset_review();


-- ----------------------------------------------------------------------------
-- task: the owner is always an observer
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_task_owner_observe()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM grant_observer(NEW.id, NEW.owner_id, NULL);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_task_owner_observe() IS
'The creator and every new owner become observers
(and, through observer_add_manager, their managers too).';

CREATE TRIGGER task_owner_observe_insert
AFTER INSERT ON task
FOR EACH ROW
WHEN (NEW.owner_id IS NOT NULL)
EXECUTE FUNCTION trg_task_owner_observe();

CREATE TRIGGER task_owner_observe_update
AFTER UPDATE OF owner_id ON task
FOR EACH ROW
WHEN (NEW.owner_id IS NOT NULL AND NEW.owner_id IS DISTINCT FROM OLD.owner_id)
EXECUTE FUNCTION trg_task_owner_observe();


-- ----------------------------------------------------------------------------
-- observer: the manager of an active observer is an observer too
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_observer_add_manager()
RETURNS TRIGGER AS $$
DECLARE
    v_manager_id INT;
BEGIN
    IF NEW.added_at IS NULL OR NEW.deleted_at IS NOT NULL THEN
        RETURN NULL;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.added_at IS NOT NULL THEN
        RETURN NULL;
    END IF;

    SELECT manager_id INTO v_manager_id FROM employee WHERE id = NEW.value;
    IF v_manager_id IS NOT NULL THEN
        PERFORM grant_observer(NEW.task_id, v_manager_id, NULL);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_observer_add_manager() IS
'When access becomes active, the observer''s manager gets access too.
The recursion up the hierarchy goes through this same trigger.';

CREATE TRIGGER observer_add_manager
AFTER INSERT OR UPDATE OF added_at ON observer
FOR EACH ROW EXECUTE FUNCTION trg_observer_add_manager();


-- ----------------------------------------------------------------------------
-- observer: leaving a task
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_observer_leave()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.value = (SELECT owner_id FROM task WHERE id = NEW.task_id) THEN
        RAISE EXCEPTION 'owner cannot leave task %', NEW.task_id
            USING HINT = 'owner_cannot_leave',
                  DETAIL = json_build_object('taskId', NEW.task_id)::text;
    END IF;

    IF EXISTS (
        SELECT 1 FROM observer
         WHERE task_id = NEW.task_id
           AND value IN (SELECT subordinates(NEW.value))
           AND added_at IS NOT NULL
           AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'manager % cannot leave task % while a subordinate observes it',
            NEW.value, NEW.task_id
            USING HINT = 'manager_cannot_leave',
                  DETAIL = json_build_object('employeeId', NEW.value, 'taskId', NEW.task_id)::text;
    END IF;

    UPDATE estimate_minutes SET expired_at = NOW()
     WHERE task_id = NEW.task_id AND by = NEW.value AND expired_at IS NULL;
    DELETE FROM remind
     WHERE task_id = NEW.task_id AND employee_id = NEW.value;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_observer_leave() IS
'On closing access: keeps the owner and any manager whose report
(recursively) observes the task; closes the leaver''s estimate_minutes
and deletes their reminders.';

CREATE TRIGGER observer_leave
BEFORE UPDATE OF deleted_at ON observer
FOR EACH ROW
WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND OLD.added_at IS NOT NULL)
EXECUTE FUNCTION trg_observer_leave();


-- ----------------------------------------------------------------------------
-- dependency: no cycles
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_dependency_cycle()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('yartt.dependency'));

    IF EXISTS (
        WITH RECURSIVE chain AS (
            SELECT NEW.value AS id
            UNION
            SELECT d.value FROM dependency d
            JOIN chain c ON d.task_id = c.id
        )
        SELECT 1 FROM chain WHERE id = NEW.task_id
    ) THEN
        RAISE EXCEPTION 'dependency cycle detected'
            USING HINT = 'dependency_cycle';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_dependency_cycle() IS
'Forbids a cycle in the dependency graph.
The advisory lock prevents a race between A->B and B->A in concurrent
transactions.';

CREATE TRIGGER dependency_cycle
BEFORE INSERT OR UPDATE OF task_id, value ON dependency
FOR EACH ROW EXECUTE FUNCTION trg_dependency_cycle();


-- ----------------------------------------------------------------------------
-- dependency / finished_at: hard dependencies (at commit)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_check_deadlines()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM check_deadlines(NEW.task_id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_check_deadlines() IS
'Calls check_deadlines() for the task of the changed row.';

CREATE CONSTRAINT TRIGGER dependency_deadlines
AFTER INSERT OR UPDATE ON dependency
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION trg_check_deadlines();

CREATE CONSTRAINT TRIGGER finished_at_deadlines
AFTER INSERT OR UPDATE ON finished_at
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION trg_check_deadlines();


-- ----------------------------------------------------------------------------
-- comment: local id
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_comment_local_id()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('yartt.comment'), NEW.task_id);
    SELECT COALESCE(MAX(id), 0) + 1 INTO NEW.id
    FROM comment WHERE task_id = NEW.task_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_comment_local_id() IS
'Assigns comment.id = max+1 within task_id.
Advisory lock (space yartt.comment, key task_id), so that concurrent
inserts never get the same MAX(id)+1.';

CREATE TRIGGER comment_local_id
BEFORE INSERT ON comment
FOR EACH ROW EXECUTE FUNCTION trg_comment_local_id();


-- ----------------------------------------------------------------------------
-- comment: attachments exist, used_at is updated
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_comment_attachments()
RETURNS TRIGGER AS $$
DECLARE
    v_found INT;
BEGIN
    UPDATE attachment SET used_at = NOW() WHERE id = ANY(NEW.attachment_ids);
    GET DIAGNOSTICS v_found = ROW_COUNT;
    IF v_found <> cardinality(NEW.attachment_ids) THEN
        RAISE EXCEPTION 'attachment_ids contain unknown attachments'
            USING HINT = 'unknown_attachment';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_comment_attachments() IS
'Checks that all attachment_ids exist and updates their used_at.
The UPDATE locks the attachment rows, so cron cannot delete them
concurrently.';

CREATE TRIGGER comment_attachments
BEFORE INSERT ON comment
FOR EACH ROW
WHEN (cardinality(NEW.attachment_ids) > 0)
EXECUTE FUNCTION trg_comment_attachments();


-- ----------------------------------------------------------------------------
-- attachment: an attachment in use cannot be deleted
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_attachment_in_use()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM comment WHERE attachment_ids @> ARRAY[OLD.id]) THEN
        RAISE EXCEPTION 'attachment % is used by comments', OLD.id
            USING HINT = 'attachment_in_use',
                  DETAIL = json_build_object('attachmentId', OLD.id)::text;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_attachment_in_use() IS
'Forbids deleting an attachment referenced by a comment.';

CREATE TRIGGER attachment_in_use
BEFORE DELETE ON attachment
FOR EACH ROW EXECUTE FUNCTION trg_attachment_in_use();


-- ----------------------------------------------------------------------------
-- mention: not oneself, and only an observer
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_mention_check()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.value = (SELECT created_by FROM comment
                     WHERE task_id = NEW.task_id AND id = NEW.comment_id) THEN
        RAISE EXCEPTION 'self-mention is not allowed'
            USING HINT = 'self_mention';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM observer
         WHERE task_id = NEW.task_id
           AND value = NEW.value
           AND added_at IS NOT NULL
           AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'employee % is not an observer of task %', NEW.value, NEW.task_id
            USING HINT = 'not_observer',
                  DETAIL = json_build_object('employeeId', NEW.value, 'taskId', NEW.task_id)::text;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_mention_check() IS
'Forbids self-mentions and mentioning someone who does not observe the task.';

CREATE TRIGGER mention_check
BEFORE INSERT ON mention
FOR EACH ROW EXECUTE FUNCTION trg_mention_check();


-- ----------------------------------------------------------------------------
-- work: forward only, not in the future, not for a scored day
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_work_check()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF OLD.spent_minutes IS NOT NULL THEN
            RAISE EXCEPTION 'closed shift cannot be changed'
            USING HINT = 'shift_closed';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    IF NEW.started_at > NOW()
       OR NEW.started_at + NEW.spent_minutes * INTERVAL '1 minute' > NOW() THEN
        RAISE EXCEPTION 'shift cannot be in the future'
            USING HINT = 'shift_in_future';
    END IF;

    IF EXISTS (
        SELECT 1 FROM score
         WHERE employee_id = NEW.employee_id
           AND day = local_day(NEW.employee_id, NEW.started_at)
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
'The timesheet only moves forward:
  - a closed shift cannot be changed or deleted;
  - a shift is not in the future (neither its start nor its end);
  - nothing can be added for a scored day.
Updates updated_at on UPDATE.';

CREATE TRIGGER work_check
BEFORE INSERT OR UPDATE OR DELETE ON work
FOR EACH ROW EXECUTE FUNCTION trg_work_check();


-- ----------------------------------------------------------------------------
-- spent_minutes: for oneself, by an observer, not in the future, not scored
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_spent_minutes_check()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'spent_minutes cannot be changed, delete and add again'
            USING HINT = 'spent_immutable';
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF EXISTS (SELECT 1 FROM score WHERE employee_id = OLD."by" AND day = OLD.day) THEN
            RAISE EXCEPTION 'day is already scored'
            USING HINT = 'day_scored';
        END IF;
        RETURN OLD;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM observer
         WHERE task_id = NEW.task_id
           AND value = NEW."by"
           AND added_at IS NOT NULL
           AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'employee % is not an observer of task %', NEW."by", NEW.task_id
            USING HINT = 'not_observer',
                  DETAIL = json_build_object('employeeId', NEW."by", 'taskId', NEW.task_id)::text;
    END IF;

    IF NEW.day > local_today(NEW."by") THEN
        RAISE EXCEPTION 'cannot spend time in the future'
            USING HINT = 'spent_in_future';
    END IF;

    IF EXISTS (SELECT 1 FROM score WHERE employee_id = NEW."by" AND day = NEW.day) THEN
        RAISE EXCEPTION 'day is already scored'
            USING HINT = 'day_scored';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_spent_minutes_check() IS
'Time entries: only by an active observer, not for a future day, not for
a scored day. UPDATE is forbidden.';

CREATE TRIGGER spent_minutes_check
BEFORE INSERT OR UPDATE OR DELETE ON spent_minutes
FOR EACH ROW EXECUTE FUNCTION trg_spent_minutes_check();


-- ----------------------------------------------------------------------------
-- score: by the manager, for a past day with a timesheet, final
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_score_check()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'score is final'
            USING HINT = 'score_final';
    END IF;

    IF NEW."by" IS DISTINCT FROM (SELECT manager_id FROM employee WHERE id = NEW.employee_id) THEN
        RAISE EXCEPTION 'only current manager can score employee %', NEW.employee_id
            USING HINT = 'not_manager',
                  DETAIL = json_build_object('employeeId', NEW.employee_id)::text;
    END IF;

    IF NEW.day >= local_today(NEW.employee_id) THEN
        RAISE EXCEPTION 'only past days can be scored'
            USING HINT = 'score_day_not_past';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM work
         WHERE employee_id = NEW.employee_id
           AND local_day(employee_id, started_at) = NEW.day
           AND spent_minutes IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'no closed shifts for this day'
            USING HINT = 'no_work_for_day';
    END IF;

    IF EXISTS (
        SELECT 1 FROM work
         WHERE employee_id = NEW.employee_id
           AND local_day(employee_id, started_at) = NEW.day
           AND spent_minutes IS NULL
    ) THEN
        RAISE EXCEPTION 'shift of this day is still open'
            USING HINT = 'shift_open';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_score_check() IS
'Score: only by the current manager, only for a past day with a closed
timesheet. UPDATE and DELETE are forbidden.';

CREATE TRIGGER score_check
BEFORE INSERT OR UPDATE OR DELETE ON score
FOR EACH ROW EXECUTE FUNCTION trg_score_check();


-- ============================================================================
-- FUNCTIONS (API)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- auth
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION issue_token(p_email CITEXT)
RETURNS TEXT AS $$
DECLARE
    v_employee_id INT;
    v_token TEXT;
BEGIN
    SELECT id INTO v_employee_id FROM employee WHERE email = p_email;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    v_token := encode(gen_random_bytes(32), 'hex');
    INSERT INTO token (hash, employee_id)
    VALUES (digest(v_token, 'sha256'), v_employee_id);
    RETURN v_token;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION issue_token(CITEXT) IS
'Issues a magic token for the sign-in link (sent to the webhook directly).
NULL — no such employee (or dismissed).
The application should not reveal to the user that the email is unknown.';


CREATE OR REPLACE FUNCTION login(p_token TEXT)
RETURNS TEXT AS $$
DECLARE
    v_employee_id INT;
    v_session TEXT;
BEGIN
    DELETE FROM token
     WHERE hash = digest(p_token, 'sha256')
       AND sent_at > NOW() - INTERVAL '10 minutes'
    RETURNING employee_id INTO v_employee_id;

    IF v_employee_id IS NULL THEN
        RETURN NULL;
    END IF;

    v_session := encode(gen_random_bytes(32), 'hex');
    INSERT INTO session (hash, employee_id)
    VALUES (digest(v_session, 'sha256'), v_employee_id);
    RETURN v_session;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION login(TEXT) IS
'Redeems a magic token (at most 10 minutes old) and returns a session
token for the cookie. NULL — the token is invalid.';


CREATE OR REPLACE FUNCTION authenticate(p_session TEXT)
RETURNS INT AS $$
DECLARE
    v_employee_id INT;
BEGIN
    UPDATE session SET last_seen_at = NOW()
     WHERE hash = digest(p_session, 'sha256')
       AND last_seen_at < NOW() - INTERVAL '5 minutes'
       AND last_seen_at > NOW() - INTERVAL '30 days';

    SELECT employee_id INTO v_employee_id FROM session
     WHERE hash = digest(p_session, 'sha256')
       AND last_seen_at > NOW() - INTERVAL '30 days';
    RETURN v_employee_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION authenticate(TEXT) IS
'Employee id for a cookie token, or NULL. Extends the session
(last_seen_at is written at most once every 5 minutes).';


-- ----------------------------------------------------------------------------
-- dismiss_employee — dismissal
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dismiss_employee(p_employee_id INT)
RETURNS VOID AS $$
DECLARE
    v_heir_id INT;
    v_task_id INT;
BEGIN
    WITH RECURSIVE chain AS (
        SELECT manager_id AS id, 1 AS depth FROM employee WHERE id = p_employee_id
        UNION ALL
        SELECT e.manager_id, c.depth + 1 FROM employee e
        JOIN chain c ON e.id = c.id
        WHERE e.email IS NULL
    )
    SELECT c.id INTO v_heir_id
      FROM chain c JOIN employee e ON e.id = c.id
     WHERE e.email IS NOT NULL
     ORDER BY c.depth
     LIMIT 1;

    FOR v_task_id IN
        UPDATE task SET owner_id = v_heir_id
         WHERE owner_id = p_employee_id
        RETURNING id
    LOOP
        IF v_heir_id IS NOT NULL THEN
            PERFORM notify(v_heir_id, v_task_id, jsonb_build_object(
                'kind', 'owner_change', 'from', p_employee_id));
        END IF;
    END LOOP;

    UPDATE employee SET manager_id = v_heir_id WHERE manager_id = p_employee_id;

    UPDATE employee SET email = NULL, next_day = NULL WHERE id = p_employee_id;

    DELETE FROM token WHERE employee_id = p_employee_id;
    DELETE FROM session WHERE employee_id = p_employee_id;
    DELETE FROM remind WHERE employee_id = p_employee_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION dismiss_employee(INT) IS
'Dismisses an employee.
  1. The heir is the nearest active manager up the chain.
  2. All tasks (open and closed — a closed one can be reopened) go to the
     heir with a notification; without an heir owner_id = NULL.
  3. Reports move to the heir.
  4. email = NULL — signing in is impossible.
  5. Sessions, magic tokens and reminders are deleted.
History (scores, time entries, comments) is kept.';


-- ----------------------------------------------------------------------------
-- task access
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION add_observer(
    p_task_id INT,
    p_employee_id INT,
    p_actor_id INT
)
RETURNS VOID AS $$
BEGIN
    IF p_actor_id IS DISTINCT FROM (SELECT owner_id FROM task WHERE id = p_task_id)
       AND NOT EXISTS (
            SELECT 1 FROM observer
             WHERE task_id = p_task_id
               AND value = p_actor_id
               AND added_at IS NOT NULL
               AND deleted_at IS NULL
       ) THEN
        RAISE EXCEPTION 'employee % cannot add observers to task %',
            p_actor_id, p_task_id
            USING HINT = 'forbidden',
                  DETAIL = json_build_object('employeeId', p_actor_id, 'taskId', p_task_id)::text;
    END IF;

    PERFORM grant_observer(p_task_id, p_employee_id, p_actor_id);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION add_observer(INT, INT, INT) IS
'The owner or an observer adds an observer.
Access is active at once. A pending request of that employee is approved.';


CREATE OR REPLACE FUNCTION request_access(
    p_task_id INT,
    p_employee_id INT
)
RETURNS VOID AS $$
DECLARE
    v_owner_id INT;
BEGIN
    IF EXISTS (
        SELECT 1 FROM observer
         WHERE task_id = p_task_id
           AND value = p_employee_id
           AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'employee % already has access or a pending request to task %',
            p_employee_id, p_task_id
            USING HINT = 'already_observer',
                  DETAIL = json_build_object('employeeId', p_employee_id, 'taskId', p_task_id)::text;
    END IF;

    INSERT INTO observer (task_id, value, added_by, added_at)
    VALUES (p_task_id, p_employee_id, NULL, NULL);

    SELECT owner_id INTO v_owner_id FROM task WHERE id = p_task_id;
    IF v_owner_id IS NOT NULL THEN
        PERFORM notify(v_owner_id, p_task_id, jsonb_build_object(
            'kind', 'access_request', 'employee_id', p_employee_id));
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION request_access(INT, INT) IS
'An employee requests access to a task: added_by = NULL, added_at = NULL.
The owner is notified and calls approve_access or reject_access.';


CREATE OR REPLACE FUNCTION approve_access(
    p_task_id INT,
    p_employee_id INT,
    p_actor_id INT
)
RETURNS VOID AS $$
BEGIN
    IF p_actor_id IS DISTINCT FROM (SELECT owner_id FROM task WHERE id = p_task_id) THEN
        RAISE EXCEPTION 'only owner can approve access'
            USING HINT = 'forbidden';
    END IF;

    UPDATE observer
       SET added_at = NOW(),
           added_by = p_actor_id
     WHERE task_id = p_task_id
       AND value = p_employee_id
       AND added_at IS NULL
       AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'no pending request from % to task %', p_employee_id, p_task_id
            USING HINT = 'no_pending_request',
                  DETAIL = json_build_object('employeeId', p_employee_id, 'taskId', p_task_id)::text;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION approve_access(INT, INT, INT) IS
'The owner approves a request: added_at = NOW(), added_by = the owner.';


CREATE OR REPLACE FUNCTION reject_access(
    p_task_id INT,
    p_employee_id INT,
    p_actor_id INT
)
RETURNS VOID AS $$
BEGIN
    IF p_actor_id IS DISTINCT FROM (SELECT owner_id FROM task WHERE id = p_task_id) THEN
        RAISE EXCEPTION 'only owner can reject access'
            USING HINT = 'forbidden';
    END IF;

    UPDATE observer
       SET deleted_at = NOW(),
           deleted_by = p_actor_id
     WHERE task_id = p_task_id
       AND value = p_employee_id
       AND added_at IS NULL
       AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'no pending request from % to task %', p_employee_id, p_task_id
            USING HINT = 'no_pending_request',
                  DETAIL = json_build_object('employeeId', p_employee_id, 'taskId', p_task_id)::text;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reject_access(INT, INT, INT) IS
'The owner rejects a request: deleted_at = NOW(), deleted_by = the owner.';


-- ----------------------------------------------------------------------------
-- deadlines
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_dependents(p_task_id INT)
RETURNS VOID AS $$
DECLARE
    v_actor_id INT;
    v_dependent_id INT;
    v_owner_id INT;
BEGIN
    SELECT owner_id INTO v_actor_id FROM task WHERE id = p_task_id;

    FOR v_dependent_id, v_owner_id IN
        SELECT t.id, t.owner_id
          FROM dependency d JOIN task t ON t.id = d.task_id
         WHERE d.value = p_task_id
           AND t.owner_id IS NOT NULL
           AND t.owner_id IS DISTINCT FROM v_actor_id
    LOOP
        PERFORM notify(v_owner_id, v_dependent_id, jsonb_build_object(
            'kind', 'finished_at_change', 'dependency_id', p_task_id));
    END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION notify_dependents(INT) IS
'Notifies owners of the tasks that depend on p_task_id
(except the owner of p_task_id itself).';


CREATE OR REPLACE FUNCTION set_finished_at(p_task_id INT, p_value TIMESTAMPTZ)
RETURNS VOID AS $$
BEGIN
    UPDATE finished_at SET expired_at = NOW()
     WHERE task_id = p_task_id AND expired_at IS NULL;
    INSERT INTO finished_at (task_id, value) VALUES (p_task_id, p_value);
    PERFORM notify_dependents(p_task_id);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_finished_at(INT, TIMESTAMPTZ) IS
'Sets or moves the deadline (later or earlier). Permissions — in the
application. Hard dependencies are checked at commit.';


CREATE OR REPLACE FUNCTION clear_finished_at(p_task_id INT)
RETURNS VOID AS $$
BEGIN
    UPDATE finished_at SET expired_at = NOW()
     WHERE task_id = p_task_id AND expired_at IS NULL;
    IF FOUND THEN
        PERFORM notify_dependents(p_task_id);
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION clear_finished_at(INT) IS
'Clears the deadline. Permissions — in the application.
Forbidden if tasks with a deadline depend on this task hard.';


-- ----------------------------------------------------------------------------
-- reminders
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION send_due_reminds()
RETURNS VOID AS $$
DECLARE
    r remind;
BEGIN
    FOR r IN
        DELETE FROM remind WHERE at <= NOW() RETURNING *
    LOOP
        PERFORM notify(r.employee_id, r.task_id, jsonb_build_object(
            'kind', 'remind', 'text', r.value));
    END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION send_due_reminds() IS
'Cron, every minute: due reminders -> notification, the remind is deleted.';
