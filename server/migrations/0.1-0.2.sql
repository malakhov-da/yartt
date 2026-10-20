-- 0.1 -> 0.2

-- Whether an employee works is dismissed_at, never the email: a dismissed
-- employee keeps their address (no longer holding it), and someone working
-- may have none.
ALTER TABLE employee
    DROP CONSTRAINT employee_email_key,
    DROP CONSTRAINT chk_employee_dismissed,
    DROP CONSTRAINT chk_employee_dismissed_manager,
    ADD CONSTRAINT chk_employee_dismissed_manager
        CHECK (dismissed_at IS NULL OR manager_id IS NOT NULL);
CREATE UNIQUE INDEX uq_employee_email ON employee(email) WHERE dismissed_at IS NULL;

COMMENT ON TABLE employee IS
'An employee. The account.
Only another employee can create one (an invite, checked by the application).
The application creates the first employee on its first start (from .env).
Dismissal sets dismissed_at: records are kept, signing in is impossible.
The email stays, so bringing the employee back needs nothing typed again.
An employee cannot be deleted (trigger).

manager_id — the direct manager. One field, no history.
Changing the manager is a plain UPDATE (by the employee). The new manager
is automatically added to all of the employee''s tasks. The old one stays.
A cycle (A -> B -> A) is forbidden by a trigger.

next_day — when the employee is back at work after any absence
(vacation, sick leave, a day off). While next_day is in the
future, all notifications go both to them and to their manager
(recursively up manager_id until an available one is found). Cron clears
past dates.

time_zone — the employee''s time zone. It defines day boundaries for the
timesheet, time entries and scores.';

COMMENT ON COLUMN employee.email IS
'CITEXT, case-insensitive. One working account per email
(uq_employee_email); a dismissed employee keeps theirs, and someone new
may get the same address.
NULL — no address: no emails and no sign-in link; the bell still works.
Whether the employee works is dismissed_at, never the email.
The employee may change it in the profile (the next sign-in link goes
to the new address).';

COMMENT ON COLUMN employee.dismissed_at IS
'When the employee was dismissed (dismiss_employee); NULL — working.
Cleared when they come back. A dismissed employee cannot sign in and gets
no notifications. My team
shows a dismissed employee only for ranges they worked in: dismissed on
or after the range''s first day.';

COMMENT ON CONSTRAINT chk_employee_dismissed_manager ON employee IS
'A dismissed employee always has a manager — the one who can bring them
back. Someone without a manager cannot be dismissed (they first pick a
manager — their successor, once that one stepped out from under them),
and a dismissed manager''s reports,
dismissed ones included, move to the manager above.';

COMMENT ON INDEX uq_employee_email IS
'One working employee per email. Dismissed ones keep their address
without holding it.';

DROP FUNCTION restore_employee(INT, CITEXT, INT);

CREATE OR REPLACE FUNCTION notify(
    p_employee_id INT,
    p_task_id INT,
    p_payload JSONB
)
RETURNS VOID AS $$
DECLARE
    v_id INT := p_employee_id;
    v_dismissed_at TIMESTAMPTZ;
    v_next_day DATE;
    v_manager_id INT;
    v_payload JSONB := p_payload;
BEGIN
    SELECT dismissed_at INTO v_dismissed_at FROM employee WHERE id = p_employee_id;
    IF NOT FOUND OR v_dismissed_at IS NOT NULL THEN
        RETURN;
    END IF;

    LOOP
        SELECT dismissed_at, next_day, manager_id
          INTO v_dismissed_at, v_next_day, v_manager_id
          FROM employee WHERE id = v_id;

        IF v_dismissed_at IS NULL THEN
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

CREATE OR REPLACE FUNCTION trg_mention_check()
RETURNS TRIGGER AS $$
DECLARE
    v_author_id INT;
BEGIN
    SELECT created_by INTO v_author_id FROM comment
     WHERE task_id = NEW.task_id AND id = NEW.comment_id;

    IF NEW.value = v_author_id THEN
        RAISE EXCEPTION 'self-mention is not allowed'
            USING HINT = 'self_mention';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM employee WHERE id = NEW.value AND dismissed_at IS NULL) THEN
        RAISE EXCEPTION 'employee % is unknown or dismissed', NEW.value
            USING HINT = 'not_found';
    END IF;

    IF NOT is_public(NEW.task_id) THEN
        PERFORM grant_observer(NEW.task_id, NEW.value, v_author_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_mention_check() IS
'Forbids self-mentions and mentioning a dismissed employee. In a private
task makes the mentioned employee an observer (added_by = the author);
a public task stays without observers.';

CREATE OR REPLACE FUNCTION issue_token(p_email CITEXT)
RETURNS TEXT AS $$
DECLARE
    v_employee_id INT;
    v_token TEXT;
BEGIN
    SELECT id INTO v_employee_id FROM employee WHERE email = p_email AND dismissed_at IS NULL;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    -- At most 5 links in 15 minutes: beyond that, silently as for an unknown
    -- address, so an inbox cannot be flooded and nothing is revealed.
    IF (SELECT count(*) FROM token
         WHERE employee_id = v_employee_id AND sent_at > NOW() - INTERVAL '15 minutes') >= 5 THEN
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
NULL — no such employee (or dismissed), or 5 links in the last 15 minutes
already (the same answer, so the limit reveals nothing).
The application should not reveal to the user that the email is unknown.';

CREATE OR REPLACE FUNCTION issue_api_token(p_employee_id INT, p_actor_id INT, p_name TEXT)
RETURNS TEXT AS $$
DECLARE
    v_token TEXT := 'yartt_' || encode(gen_random_bytes(32), 'hex');
BEGIN
    IF NOT EXISTS (SELECT 1 FROM employee WHERE id = p_employee_id AND dismissed_at IS NULL) THEN
        RAISE EXCEPTION 'employee % is unknown or dismissed', p_employee_id
            USING HINT = 'not_found';
    END IF;
    IF p_actor_id <> p_employee_id
       AND p_actor_id IS DISTINCT FROM (SELECT manager_id FROM employee WHERE id = p_employee_id) THEN
        RAISE EXCEPTION 'only the employee or their direct manager issues tokens for %', p_employee_id
            USING HINT = 'forbidden';
    END IF;
    INSERT INTO api_token (employee_id, name, hash, created_by)
    VALUES (p_employee_id, btrim(p_name), digest(v_token, 'sha256'), p_actor_id);
    RETURN v_token;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION issue_api_token(INT, INT, TEXT) IS
'Issues an API token for an employee: by themselves or their direct
manager, for an active employee. Returns the token — the only time it is
seen.';

CREATE OR REPLACE FUNCTION authenticate_token(p_token TEXT)
RETURNS INT AS $$
DECLARE
    v_employee_id INT;
BEGIN
    UPDATE api_token SET last_used_at = NOW()
     WHERE hash = digest(p_token, 'sha256') AND revoked_at IS NULL
       AND (last_used_at IS NULL OR last_used_at < NOW() - INTERVAL '5 minutes');

    SELECT t.employee_id INTO v_employee_id
      FROM api_token t JOIN employee e ON e.id = t.employee_id
     WHERE t.hash = digest(p_token, 'sha256') AND t.revoked_at IS NULL AND e.dismissed_at IS NULL;
    RETURN v_employee_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION dismiss_employee(p_employee_id INT, p_actor_id INT)
RETURNS VOID AS $$
DECLARE
    v_dismissed_at TIMESTAMPTZ;
    v_manager_id INT;
    v_task_id INT;
BEGIN
    SELECT dismissed_at, manager_id INTO v_dismissed_at, v_manager_id
      FROM employee WHERE id = p_employee_id
       FOR UPDATE;

    IF NOT FOUND OR v_dismissed_at IS NOT NULL THEN
        RAISE EXCEPTION 'employee % is unknown or already dismissed', p_employee_id
            USING HINT = 'not_found';
    END IF;
    IF v_manager_id IS DISTINCT FROM p_actor_id THEN
        RAISE EXCEPTION 'only the direct manager can dismiss employee %', p_employee_id
            USING HINT = 'not_manager',
                  DETAIL = json_build_object('employeeId', p_employee_id)::text;
    END IF;

    -- The direct manager is the heir: they are active, they are acting.
    FOR v_task_id IN
        UPDATE task SET owner_id = v_manager_id
         WHERE owner_id = p_employee_id
        RETURNING id
    LOOP
        PERFORM notify(v_manager_id, v_task_id, jsonb_build_object(
            'kind', 'owner_change', 'from', p_employee_id));
    END LOOP;

    UPDATE employee SET manager_id = v_manager_id WHERE manager_id = p_employee_id;

    UPDATE employee SET next_day = NULL, dismissed_at = NOW() WHERE id = p_employee_id;

    DELETE FROM token WHERE employee_id = p_employee_id;
    DELETE FROM session WHERE employee_id = p_employee_id;
    UPDATE api_token SET revoked_at = NOW() WHERE employee_id = p_employee_id AND revoked_at IS NULL;
    DELETE FROM remind WHERE employee_id = p_employee_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION dismiss_employee(INT, INT) IS
'Dismisses an employee. Only the direct manager (p_actor_id) can do it;
an employee without a manager cannot be dismissed.
  1. All tasks (open and closed — a closed one can be reopened) go to the
     manager with a notification.
  2. Reports move to the manager (who is notified: new_report).
  3. dismissed_at = NOW() — signing in is impossible. The email and
     manager_id are kept, so the same manager can bring the employee back
     as they were.
  4. Sessions, magic tokens and reminders are deleted; API tokens are
     revoked.
History (scores, time entries, comments) is kept.';

CREATE OR REPLACE FUNCTION dismiss_with_heir(p_employee_id INT, p_heir_id INT)
RETURNS VOID AS $$
DECLARE
    v_manager_id INT;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('yartt.hierarchy'));
    SELECT manager_id INTO v_manager_id FROM employee WHERE id = p_employee_id AND dismissed_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'employee % is unknown or already dismissed', p_employee_id
            USING HINT = 'not_found';
    END IF;
    IF p_heir_id = p_employee_id OR NOT EXISTS (SELECT 1 FROM employee WHERE id = p_heir_id AND dismissed_at IS NULL) THEN
        RAISE EXCEPTION 'heir % is unknown, dismissed or the employee themselves', p_heir_id
            USING HINT = 'not_found';
    END IF;

    -- An heir from the employee's own subtree steps out of it first: their place is above.
    IF p_heir_id IN (SELECT subordinates(p_employee_id)) THEN
        UPDATE employee SET manager_id = v_manager_id WHERE id = p_heir_id;
    END IF;
    UPDATE employee SET manager_id = p_heir_id WHERE id = p_employee_id;
    PERFORM dismiss_employee(p_employee_id, p_heir_id);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION dismiss_with_heir(INT, INT) IS
'For the installation administrator (server/admin.ts), not the API: the
way to dismiss someone who will not hand over — in particular someone at
the top, whom nobody in the product can dismiss. The heir becomes the
employee''s manager and dismisses them (dismiss_employee): the tasks and
the team, dismissed reports included, go to the heir, the only one who
can bring the employee back. An heir from the employee''s own subtree
first leaves it for the employee''s place (under their manager, or at
the top): otherwise they would be their own manager''s manager.';

CREATE OR REPLACE FUNCTION restore_employee(p_employee_id INT, p_actor_id INT, p_email CITEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
    v_dismissed_at TIMESTAMPTZ;
    v_manager_id INT;
BEGIN
    SELECT dismissed_at, manager_id INTO v_dismissed_at, v_manager_id
      FROM employee WHERE id = p_employee_id
       FOR UPDATE;

    IF NOT FOUND OR v_dismissed_at IS NULL THEN
        RAISE EXCEPTION 'employee % is unknown or not dismissed', p_employee_id
            USING HINT = 'not_found';
    END IF;
    IF v_manager_id IS DISTINCT FROM p_actor_id THEN
        RAISE EXCEPTION 'only the direct manager can bring back employee %', p_employee_id
            USING HINT = 'not_manager',
                  DETAIL = json_build_object('employeeId', p_employee_id)::text;
    END IF;

    UPDATE employee SET email = COALESCE(p_email, email), dismissed_at = NULL WHERE id = p_employee_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION restore_employee(INT, INT, CITEXT) IS
'Brings a dismissed employee back under the same manager, with the email
they had — or p_email, when the address changed or someone working holds
it now (uq_employee_email). Only their direct manager (p_actor_id) can do it: the one at the
time of dismissal, or the manager above when that one left too. Moving to
another manager is then the employee''s own choice (manager_id is theirs
to set), never the manager''s. History was kept; tasks and reports that
were handed over stay where they went.';

CREATE OR REPLACE FUNCTION add_observer(
    p_task_id INT,
    p_employee_id INT,
    p_actor_id INT
)
RETURNS VOID AS $$
BEGIN
    PERFORM check_owner(p_task_id, p_actor_id);
    IF is_public(p_task_id) THEN
        RAISE EXCEPTION 'task % is public', p_task_id
            USING HINT = 'task_public',
                  DETAIL = json_build_object('taskId', p_task_id)::text;
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
'The owner adds an observer to a private task, or brings a former one
back. Access is active at once, a pending request is approved, and the
employee is notified (access_opened). A public task has no observers:
make it private first.';

CREATE OR REPLACE FUNCTION make_private(p_task_id INT, p_actor_id INT)
RETURNS INT[] AS $$
DECLARE
    v_employee_id INT;
    v_left_out INT[] := '{}';
BEGIN
    PERFORM check_owner(p_task_id, p_actor_id);
    IF NOT is_public(p_task_id) THEN
        RETURN v_left_out;
    END IF;

    -- The owner first: their managers follow (observer_add_manager).
    PERFORM grant_observer(p_task_id, p_actor_id, NULL);

    FOR v_employee_id IN
        SELECT DISTINCT m.value
          FROM mention m JOIN employee e ON e.id = m.value
         WHERE m.task_id = p_task_id
           AND m.closed_at IS NULL
           AND e.dismissed_at IS NULL
    LOOP
        PERFORM grant_observer(p_task_id, v_employee_id, NULL);
    END LOOP;

    FOR v_employee_id IN
        SELECT DISTINCT c.created_by
          FROM comment c JOIN employee e ON e.id = c.created_by
         WHERE c.task_id = p_task_id
           AND e.dismissed_at IS NULL
           AND NOT is_observer(p_task_id, c.created_by)
         ORDER BY c.created_by
    LOOP
        v_left_out := v_left_out || v_employee_id;
        PERFORM notify(v_employee_id, p_task_id, jsonb_build_object(
            'kind', 'access_closed', 'by', p_actor_id));
    END LOOP;

    RETURN v_left_out;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION make_private(INT, INT) IS
'The owner makes a public task private. Stay: the owner, their managers
and everyone with an open mention (and their managers). Those who
commented and are not among them are notified (access_closed) and
returned, so the interface can offer to bring them back
(add_observer). A private task is left as it is.';

CREATE OR REPLACE FUNCTION send_weekly_digests(p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS INT AS $$
DECLARE
    v_manager RECORD;
    v_unscored INT;
    v_expired INT;
    v_at_risk INT;
    v_sent INT := 0;
BEGIN
    FOR v_manager IN
        SELECT e.id, e.time_zone FROM employee e
         WHERE e.dismissed_at IS NULL
           AND EXISTS (SELECT 1 FROM employee r WHERE r.manager_id = e.id AND r.dismissed_at IS NULL)
           AND extract(isodow FROM p_now AT TIME ZONE e.time_zone) = 1
           AND (p_now AT TIME ZONE e.time_zone)::time >= TIME '09:00'
           AND (e.weekly_digest_on IS NULL OR e.weekly_digest_on < (p_now AT TIME ZONE e.time_zone)::date)
         FOR UPDATE OF e SKIP LOCKED
    LOOP
        -- Past days of direct reports (the last 30) with a closed timesheet and no standing score.
        SELECT count(*) INTO v_unscored FROM (
            SELECT w.employee_id, local_day(w.employee_id, w.started_at) AS day
              FROM work w JOIN employee r ON r.id = w.employee_id
             WHERE r.manager_id = v_manager.id AND r.dismissed_at IS NULL
             GROUP BY 1, 2
            HAVING bool_and(w.spent_minutes IS NOT NULL)
        ) d
         WHERE d.day < (p_now AT TIME ZONE v_manager.time_zone)::date
           AND d.day >= (p_now AT TIME ZONE v_manager.time_zone)::date - 30
           AND NOT EXISTS (SELECT 1 FROM score s
                            WHERE s.employee_id = d.employee_id AND s.day = d.day AND s.value IS NOT NULL);
        -- Tasks of the team closed automatically last week: a deadline set in advance came.
        SELECT count(*) INTO v_expired
          FROM task k JOIN finished_at f ON f.task_id = k.id AND f.expired_at IS NULL
         WHERE k.owner_id IN (SELECT subordinates(v_manager.id))
           AND f.value <= p_now AND f.value > p_now - INTERVAL '7 days'
           AND f.value - f.entered_at > INTERVAL '1 minute';
        SELECT count(*) INTO v_at_risk
          FROM task k
         WHERE k.owner_id IN (SELECT subordinates(v_manager.id))
           AND EXISTS (SELECT 1 FROM deadline_risk(k.id));

        UPDATE employee SET weekly_digest_on = (p_now AT TIME ZONE v_manager.time_zone)::date WHERE id = v_manager.id;
        -- Nothing to say, nothing sent: a quiet week needs no email.
        IF v_unscored + v_expired + v_at_risk > 0 THEN
            INSERT INTO notification (employee_id, task_id, payload)
            VALUES (v_manager.id, NULL, jsonb_build_object(
                'kind', 'weekly_digest', 'unscored', v_unscored, 'expired', v_expired, 'atRisk', v_at_risk));
            v_sent := v_sent + 1;
        END IF;
    END LOOP;
    RETURN v_sent;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION send_weekly_digests(TIMESTAMPTZ) IS
'Cron, every hour: on Monday from 09:00 in each manager''s time zone,
once a week, a summary of what waits for them — days of direct reports
waiting for a score (the last 30), tasks of the subtree closed
automatically last week, tasks of the subtree at risk now. Sent only if
something is there; not copied to anyone (it is about their own team).
Safe with several workers (SKIP LOCKED, weekly_digest_on). p_now is the
moment to act as of — NOW() for the cron, a chosen Monday in tests.';


-- People and bots: employee keeps what both have, human and bot the rest.
-- Everyone who exists is a person; a bot made as a person before stays one
-- (its manager creates a bot and dismisses it). Personal API tokens go.
CREATE TYPE employee_kind AS ENUM ('human', 'bot');
CREATE TYPE bot_permission AS ENUM ('task', 'task.transfer', 'comment', 'observers');

ALTER TABLE employee
    ADD COLUMN kind employee_kind NOT NULL DEFAULT 'human',
    ADD CONSTRAINT uq_employee_kind UNIQUE (id, kind),
    ADD CONSTRAINT chk_employee_bot_email CHECK (kind = 'human' OR email IS NULL),
    ADD CONSTRAINT chk_employee_bot_manager CHECK (kind = 'human' OR manager_id IS NOT NULL);

CREATE TABLE human (
    employee_id INT PRIMARY KEY,
    kind employee_kind NOT NULL DEFAULT 'human' CHECK (kind = 'human'),
    next_day DATE,
    keyboards keyboard[],
    weekly_digest_on DATE,
    FOREIGN KEY (employee_id, kind) REFERENCES employee(id, kind)
);
INSERT INTO human (employee_id, next_day, keyboards, weekly_digest_on)
SELECT id, next_day, keyboards, weekly_digest_on FROM employee;

ALTER TABLE employee
    DROP COLUMN next_day,
    DROP COLUMN keyboards,
    DROP COLUMN weekly_digest_on;

CREATE TABLE bot (
    employee_id INT PRIMARY KEY,
    kind employee_kind NOT NULL DEFAULT 'bot' CHECK (kind = 'bot'),
    key_hash BYTEA NOT NULL UNIQUE,
    key_issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    permissions bot_permission[] NOT NULL DEFAULT '{}',
    webhook_url TEXT CHECK (webhook_url ~ '^https?://'),
    webhook_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    FOREIGN KEY (employee_id, kind) REFERENCES employee(id, kind)
);

-- What only a person has refers to human.
ALTER TABLE employee DROP CONSTRAINT employee_manager_id_fkey,
    ADD CONSTRAINT employee_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES human(employee_id);
ALTER TABLE token DROP CONSTRAINT token_employee_id_fkey,
    ADD CONSTRAINT token_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES human(employee_id);
ALTER TABLE session DROP CONSTRAINT session_employee_id_fkey,
    ADD CONSTRAINT session_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES human(employee_id);
ALTER TABLE user_tag DROP CONSTRAINT user_tag_employee_id_fkey,
    ADD CONSTRAINT user_tag_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES human(employee_id);
ALTER TABLE estimate_minutes DROP CONSTRAINT estimate_minutes_by_fkey,
    ADD CONSTRAINT estimate_minutes_by_fkey FOREIGN KEY ("by") REFERENCES human(employee_id);
ALTER TABLE spent_minutes DROP CONSTRAINT spent_minutes_by_fkey,
    ADD CONSTRAINT spent_minutes_by_fkey FOREIGN KEY ("by") REFERENCES human(employee_id);
ALTER TABLE work DROP CONSTRAINT work_employee_id_fkey,
    ADD CONSTRAINT work_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES human(employee_id);
ALTER TABLE remind DROP CONSTRAINT remind_employee_id_fkey,
    ADD CONSTRAINT remind_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES human(employee_id);
ALTER TABLE score DROP CONSTRAINT score_employee_id_fkey,
    ADD CONSTRAINT score_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES human(employee_id),
    DROP CONSTRAINT score_by_fkey,
    ADD CONSTRAINT score_by_fkey FOREIGN KEY ("by") REFERENCES human(employee_id);
ALTER TABLE visit DROP CONSTRAINT visit_employee_id_fkey,
    ADD CONSTRAINT visit_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES human(employee_id);

DROP FUNCTION issue_api_token(INT, INT, TEXT);
DROP FUNCTION authenticate_token(TEXT);
DROP FUNCTION revoke_api_token(INT, INT);
DROP TABLE api_token;

COMMENT ON TYPE keyboard IS
'A keyboard layout someone types with (human.keyboards). The keys of
each are a table in the application (shared/keyboards.ts); a new layout
is a value here and a line there.';

COMMENT ON TYPE employee_kind IS
'What an employee is: a person (human) or a program acting through the
API (bot). Each has a row of its own kind in human or bot.';

COMMENT ON TYPE bot_permission IS
'What a bot may change, on top of reading what its relationships show it:
  task          — create tasks and run its own (tags, priority, context,
                  deadline, dependencies, public or private, reviewed);
  task.transfer — hand its own tasks to someone;
  comment       — comment and close its mentions;
  observers     — run the observers of its own tasks, request access.
Checked by the application. Never: timesheet, time, scores, people, keys.';

COMMENT ON TABLE employee IS
'An employee. The account: what a person (kind human) and a bot (kind bot)
have in common — a name, a manager, tasks, comments, mentions,
notifications. What only one kind has lives in human or bot, and tables
only a person has rows in (timesheet, time entries, scores, sessions,
reminders, visits) refer to human, so a bot cannot have them.
Only another employee can create one (an invite of a person, checked by
the application; a bot with create_bot()). The application creates the
first employee on its first start (from .env).
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

COMMENT ON COLUMN employee.kind IS
'human — a person; bot — a program acting through the API with its key.
Never changes: a mistake is fixed by dismissing one and creating the other.';

COMMENT ON COLUMN employee.email IS
'CITEXT, case-insensitive. One working account per email
(uq_employee_email); a dismissed employee keeps theirs, and someone new
may get the same address.
NULL — no address: no emails and no sign-in link; the bell still works.
A bot never has one (chk_employee_bot_email).
Whether the employee works is dismissed_at, never the email.
The employee may change it in the profile (the next sign-in link goes
to the new address).';

COMMENT ON COLUMN employee.manager_id IS
'The direct manager — always a person. One field, no history.
The current manager scores the day.
A cycle (A -> B -> A) is forbidden by a trigger.
A person picks their own; a bot''s is whoever created it or got it
handed over (transfer_bot()).';

COMMENT ON COLUMN employee.locale IS
'Language of the interface and notifications (ru, en, pt-BR, ...).
Sent to the webhook with every notification. A bot gets its creator''s:
the language its program is expected to write in.';

COMMENT ON COLUMN employee.pronoun IS
'How to speak of the employee: he | she — a bot too, named as its team
likes. Picks verb forms in languages that have them ("упомянул" /
"упомянула"). NULL — not given: the neutral form with both endings.';

COMMENT ON INDEX uq_employee_email IS
'One working employee per email. Dismissed ones keep their address
without holding it. The email lives here, not in human, because the
uniqueness needs it next to dismissed_at.';

COMMENT ON CONSTRAINT uq_employee_kind ON employee IS
'The target of the (employee_id, kind) foreign keys of human and bot:
a row there matches the kind here, so nobody is both.';

COMMENT ON CONSTRAINT chk_employee_bot_email ON employee IS
'A bot has no email: it neither signs in nor gets mail.';

COMMENT ON CONSTRAINT chk_employee_bot_manager ON employee IS
'A bot always has a manager: the one who sets it up and answers for it.';

COMMENT ON TABLE human IS
'A person: an employee of kind human. Signs in, keeps a timesheet, logs
time, is scored, manages; those tables refer here. Created with the
employee row, in the same transaction (employee_kind_row).';

COMMENT ON COLUMN human.employee_id IS
'The employee.';

COMMENT ON COLUMN human.kind IS
'Always human: with employee_id, the foreign key to employee(id, kind).';

COMMENT ON COLUMN human.next_day IS
'When the person is back at work after an absence (vacation, sick
leave, a day off). NULL or a past date = available (cron clears past
dates). A future date = away: notifications go both to them and to their
manager (recursively up manager_id until an available one is found).';

COMMENT ON COLUMN human.keyboards IS
'Keyboard layouts the person switches between (en, ru, ...), for text
typed with the wrong one: the tag search reads the same keys with each
other layout. NULL — not chosen: the layout of the interface language and
the US one.';

COMMENT ON COLUMN human.weekly_digest_on IS
'The Monday the weekly email for managers last went out (or was due
with nothing to say), in their time zone: it goes once a week.';

COMMENT ON TABLE bot IS
'A bot: an employee of kind bot — CI, monitoring — that comments, owns
tasks and is mentioned like a person, through the API with its key
(Authorization: Bearer). It never signs in and keeps no timesheet.
Anyone creates one under themselves (create_bot()); only its direct
manager changes it, resets its key or hands it to someone
(transfer_bot()). Its notifications go to its own webhook, as JSON.';

COMMENT ON COLUMN bot.employee_id IS
'The employee.';

COMMENT ON COLUMN bot.kind IS
'Always bot: with employee_id, the foreign key to employee(id, kind).';

COMMENT ON COLUMN bot.key_hash IS
'SHA-256 of the key. One key, without expiry: the manager replaces it
when they want (reset_bot_key(); the key is shown once). A handover and
the dismissal of its manager replace it with one nobody knows: the
previous manager knew the old one.';

COMMENT ON COLUMN bot.key_issued_at IS
'When the key was issued or replaced.';

COMMENT ON COLUMN bot.permissions IS
'What it may change (bot_permission); empty — read only.';

COMMENT ON COLUMN bot.webhook_url IS
'Where its notifications go, as JSON signed with webhook_secret.
NULL — nowhere: they stay in its bell.';

COMMENT ON COLUMN bot.webhook_secret IS
'The HMAC-SHA256 key that signs its webhook bodies. Its own, so one bot
cannot forge another''s messages; kept in the clear, the server signs with it.';


CREATE OR REPLACE FUNCTION trg_employee_kind_row()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.kind = 'human' AND NOT EXISTS (SELECT 1 FROM human WHERE employee_id = NEW.id)
       OR NEW.kind = 'bot' AND NOT EXISTS (SELECT 1 FROM bot WHERE employee_id = NEW.id) THEN
        RAISE EXCEPTION 'employee % has no % row', NEW.id, NEW.kind
            USING HINT = 'invalid_data';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_employee_kind_row() IS
'An employee is created together with the row of its kind (human or bot)
in one transaction; checked at commit. The (employee_id, kind) foreign
keys keep anyone from having both.';

CREATE CONSTRAINT TRIGGER employee_kind_row
AFTER INSERT ON employee
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION trg_employee_kind_row();

CREATE OR REPLACE FUNCTION new_bot_key()
RETURNS TEXT AS $$
    SELECT 'yartt_' || encode(gen_random_bytes(32), 'hex')
$$ LANGUAGE sql VOLATILE;

COMMENT ON FUNCTION new_bot_key() IS
'A fresh bot key: yartt_ and 32 random bytes in hex. Only its hash is kept.';

CREATE OR REPLACE FUNCTION create_bot(p_actor_id INT, p_full_name TEXT)
RETURNS TABLE (bot_id INT, key TEXT) AS $$
DECLARE
    v_id INT;
    v_key TEXT := new_bot_key();
BEGIN
    INSERT INTO employee (kind, full_name, manager_id, locale, time_zone)
    SELECT 'bot', btrim(p_full_name), e.id, e.locale, e.time_zone
      FROM employee e
     WHERE e.id = p_actor_id AND e.kind = 'human' AND e.dismissed_at IS NULL
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'employee % is unknown, dismissed or a bot', p_actor_id
            USING HINT = 'forbidden';
    END IF;
    INSERT INTO bot (employee_id, key_hash) VALUES (v_id, digest(v_key, 'sha256'));
    RETURN QUERY SELECT v_id, v_key;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_bot(INT, TEXT) IS
'A person creates a bot under themselves: its manager, its language and
time zone are theirs, it may change nothing yet (no permissions) and has
no webhook. Returns its id and key — the only time the key is seen.';

CREATE OR REPLACE FUNCTION check_bot_manager(p_bot_id INT, p_actor_id INT)
RETURNS VOID AS $$
DECLARE
    v_manager_id INT;
BEGIN
    SELECT manager_id INTO v_manager_id FROM employee
     WHERE id = p_bot_id AND kind = 'bot' AND dismissed_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'bot % is unknown or dismissed', p_bot_id
            USING HINT = 'not_found';
    END IF;
    IF v_manager_id IS DISTINCT FROM p_actor_id THEN
        RAISE EXCEPTION 'only the direct manager runs bot %', p_bot_id
            USING HINT = 'not_manager',
                  DETAIL = json_build_object('employeeId', p_bot_id)::text;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_bot_manager(INT, INT) IS
'Raises not_found for an unknown or dismissed bot and not_manager unless
p_actor_id is its direct manager — the only one who changes it.';

CREATE OR REPLACE FUNCTION reset_bot_key(p_bot_id INT, p_actor_id INT)
RETURNS TEXT AS $$
DECLARE
    v_key TEXT := new_bot_key();
BEGIN
    PERFORM check_bot_manager(p_bot_id, p_actor_id);
    UPDATE bot SET key_hash = digest(v_key, 'sha256'), key_issued_at = NOW()
     WHERE employee_id = p_bot_id;
    RETURN v_key;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reset_bot_key(INT, INT) IS
'The direct manager replaces the bot''s key: the old one stops at once,
the new one is returned — the only time it is seen.';

CREATE OR REPLACE FUNCTION transfer_bot(p_bot_id INT, p_actor_id INT, p_to_id INT)
RETURNS VOID AS $$
BEGIN
    PERFORM check_bot_manager(p_bot_id, p_actor_id);
    IF NOT EXISTS (SELECT 1 FROM employee WHERE id = p_to_id AND kind = 'human' AND dismissed_at IS NULL) THEN
        RAISE EXCEPTION 'employee % is unknown, dismissed or a bot', p_to_id
            USING HINT = 'not_found';
    END IF;
    UPDATE employee SET manager_id = p_to_id WHERE id = p_bot_id;
    UPDATE bot SET key_hash = digest(new_bot_key(), 'sha256'), key_issued_at = NOW()
     WHERE employee_id = p_bot_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION transfer_bot(INT, INT, INT) IS
'The direct manager hands the bot to another person, at once, without
their consent — like tasks of someone dismissed. The new manager is
notified (new_report) and sees its tasks; the key is replaced with one
nobody knows, so the new manager issues the next (reset_bot_key()).';

CREATE OR REPLACE FUNCTION authenticate_bot(p_key TEXT)
RETURNS INT AS $$
    SELECT b.employee_id
      FROM bot b JOIN employee e ON e.id = b.employee_id
     WHERE b.key_hash = digest(p_key, 'sha256') AND e.dismissed_at IS NULL
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION authenticate_bot(TEXT) IS
'The bot a key belongs to, or NULL (unknown, replaced, or the bot dismissed).';

CREATE OR REPLACE FUNCTION notify(
    p_employee_id INT,
    p_task_id INT,
    p_payload JSONB
)
RETURNS VOID AS $$
DECLARE
    v_id INT := p_employee_id;
    v_dismissed_at TIMESTAMPTZ;
    v_next_day DATE;
    v_manager_id INT;
    v_payload JSONB := p_payload;
BEGIN
    SELECT dismissed_at INTO v_dismissed_at FROM employee WHERE id = p_employee_id;
    IF NOT FOUND OR v_dismissed_at IS NOT NULL THEN
        RETURN;
    END IF;

    LOOP
        SELECT e.dismissed_at, h.next_day, e.manager_id
          INTO v_dismissed_at, v_next_day, v_manager_id
          FROM employee e LEFT JOIN human h ON h.employee_id = e.id
         WHERE e.id = v_id;

        IF v_dismissed_at IS NULL THEN
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
A dismissed employee gets nothing. If the recipient is away
(human.next_day in the future), a copy goes to their manager, and so on up until an
available one is found. Copies carry for = the original recipient.';

CREATE OR REPLACE FUNCTION dismiss_employee(p_employee_id INT, p_actor_id INT)
RETURNS VOID AS $$
DECLARE
    v_dismissed_at TIMESTAMPTZ;
    v_manager_id INT;
    v_task_id INT;
BEGIN
    SELECT dismissed_at, manager_id INTO v_dismissed_at, v_manager_id
      FROM employee WHERE id = p_employee_id
       FOR UPDATE;

    IF NOT FOUND OR v_dismissed_at IS NOT NULL THEN
        RAISE EXCEPTION 'employee % is unknown or already dismissed', p_employee_id
            USING HINT = 'not_found';
    END IF;
    IF v_manager_id IS DISTINCT FROM p_actor_id THEN
        RAISE EXCEPTION 'only the direct manager can dismiss employee %', p_employee_id
            USING HINT = 'not_manager',
                  DETAIL = json_build_object('employeeId', p_employee_id)::text;
    END IF;

    -- The direct manager is the heir: they are active, they are acting.
    FOR v_task_id IN
        UPDATE task SET owner_id = v_manager_id
         WHERE owner_id = p_employee_id
        RETURNING id
    LOOP
        PERFORM notify(v_manager_id, v_task_id, jsonb_build_object(
            'kind', 'owner_change', 'from', p_employee_id));
    END LOOP;

    -- The leaver knew their bots' keys: the bots move on with keys nobody knows.
    UPDATE bot SET key_hash = digest(new_bot_key(), 'sha256'), key_issued_at = NOW()
     WHERE employee_id IN (SELECT id FROM employee WHERE manager_id = p_employee_id AND kind = 'bot');
    UPDATE employee SET manager_id = v_manager_id WHERE manager_id = p_employee_id;

    UPDATE employee SET dismissed_at = NOW() WHERE id = p_employee_id;
    UPDATE human SET next_day = NULL WHERE employee_id = p_employee_id;

    DELETE FROM token WHERE employee_id = p_employee_id;
    DELETE FROM session WHERE employee_id = p_employee_id;
    DELETE FROM remind WHERE employee_id = p_employee_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION dismiss_employee(INT, INT) IS
'Dismisses an employee. Only the direct manager (p_actor_id) can do it;
an employee without a manager cannot be dismissed.
  1. All tasks (open and closed — a closed one can be reopened) go to the
     manager with a notification.
  2. Reports move to the manager (who is notified: new_report); the keys
     of their bots are replaced with ones nobody knows.
  3. dismissed_at = NOW() — signing in is impossible. The email and
     manager_id are kept, so the same manager can bring the employee back
     as they were.
  4. Sessions, magic tokens and reminders are deleted; a dismissed bot''s
     key stops working (authenticate_bot).
History (scores, time entries, comments) is kept.';

CREATE OR REPLACE FUNCTION send_weekly_digests(p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS INT AS $$
DECLARE
    v_manager RECORD;
    v_unscored INT;
    v_expired INT;
    v_at_risk INT;
    v_sent INT := 0;
BEGIN
    FOR v_manager IN
        SELECT e.id, e.time_zone FROM employee e JOIN human h ON h.employee_id = e.id
         WHERE e.dismissed_at IS NULL
           AND EXISTS (SELECT 1 FROM employee r
                        WHERE r.manager_id = e.id AND r.kind = 'human' AND r.dismissed_at IS NULL)
           AND extract(isodow FROM p_now AT TIME ZONE e.time_zone) = 1
           AND (p_now AT TIME ZONE e.time_zone)::time >= TIME '09:00'
           AND (h.weekly_digest_on IS NULL OR h.weekly_digest_on < (p_now AT TIME ZONE e.time_zone)::date)
         FOR UPDATE OF h SKIP LOCKED
    LOOP
        -- Past days of direct reports (the last 30) with a closed timesheet and no standing score.
        SELECT count(*) INTO v_unscored FROM (
            SELECT w.employee_id, local_day(w.employee_id, w.started_at) AS day
              FROM work w JOIN employee r ON r.id = w.employee_id
             WHERE r.manager_id = v_manager.id AND r.dismissed_at IS NULL
             GROUP BY 1, 2
            HAVING bool_and(w.spent_minutes IS NOT NULL)
        ) d
         WHERE d.day < (p_now AT TIME ZONE v_manager.time_zone)::date
           AND d.day >= (p_now AT TIME ZONE v_manager.time_zone)::date - 30
           AND NOT EXISTS (SELECT 1 FROM score s
                            WHERE s.employee_id = d.employee_id AND s.day = d.day AND s.value IS NOT NULL);
        -- Tasks of the team closed automatically last week: a deadline set in advance came.
        SELECT count(*) INTO v_expired
          FROM task k JOIN finished_at f ON f.task_id = k.id AND f.expired_at IS NULL
         WHERE k.owner_id IN (SELECT subordinates(v_manager.id))
           AND f.value <= p_now AND f.value > p_now - INTERVAL '7 days'
           AND f.value - f.entered_at > INTERVAL '1 minute';
        SELECT count(*) INTO v_at_risk
          FROM task k
         WHERE k.owner_id IN (SELECT subordinates(v_manager.id))
           AND EXISTS (SELECT 1 FROM deadline_risk(k.id));

        UPDATE human SET weekly_digest_on = (p_now AT TIME ZONE v_manager.time_zone)::date WHERE employee_id = v_manager.id;
        -- Nothing to say, nothing sent: a quiet week needs no email.
        IF v_unscored + v_expired + v_at_risk > 0 THEN
            INSERT INTO notification (employee_id, task_id, payload)
            VALUES (v_manager.id, NULL, jsonb_build_object(
                'kind', 'weekly_digest', 'unscored', v_unscored, 'expired', v_expired, 'atRisk', v_at_risk));
            v_sent := v_sent + 1;
        END IF;
    END LOOP;
    RETURN v_sent;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION send_weekly_digests(TIMESTAMPTZ) IS
'Cron, every hour: on Monday from 09:00 in each manager''s time zone,
once a week, a summary of what waits for them — days of direct reports
waiting for a score (the last 30), tasks of the subtree closed
automatically last week, tasks of the subtree at risk now. Sent only if
something is there; not copied to anyone (it is about their own team).
Only for someone with people under them (bots do not count).
Safe with several workers (SKIP LOCKED, weekly_digest_on). p_now is the
moment to act as of — NOW() for the cron, a chosen Monday in tests.';


-- The specification (COMMENT ON SCHEMA) as of this version.
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
    explain why the task is closed but not done. Hard dependencies may
    forbid the move; then the owner has to negotiate with the owners of
    the dependent tasks.
  - A task has an owner (owner_id). There is no separate creator role.
  - Ownership can be transferred by the owner or by the owner''s direct
    manager. The previous owner stays an observer. When the owner is
    dismissed, their tasks go to their manager. With no manager the task
    is left without an owner and any observer can take it.
  - Observers see the task and change only their own things: comments,
    their time entries, their time left, their reminders, their mentions.
    Access belongs to the owner: only the owner adds and removes
    observers, answers requests and makes the task public or private.
    Anyone who sees a private task can still bring a colleague in by
    mentioning them — the mention makes them an observer.
  - Access is revoked explicitly: an observer can leave, the owner can
    remove an observer. There is also an access request flow: an employee
    files a request (added_at = NULL), the owner is notified and approves
    it (added_at = NOW()) or rejects it (deleted_at = NOW()). Opening and
    closing someone''s access is notified to them.
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
    reminded about a task. Deleted once sent.
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
  - Visits are logged: opening a task and opening "My day". They show the
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
    - Edit the profile (full_name, email, about, next_day, time_zone, locale).

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
    - Open a task / open "My day" -> log_visit().

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

  Time left:
    - Set / change / clear estimate_minutes for oneself (anyone who sees
      the task).

  Time entries:
    - Log spent_minutes for oneself (anyone who sees the task).
    - Delete one''s own time entry.

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
    - A private task: an attached employee who does not observe it
      becomes an observer (added_by = the author). A public task: any
      active employee can be attached.

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
    - Mentioning a dismissed employee.
    - A comment attaching its own task.

  Hierarchy:
    - A cycle in manager_id (A -> B -> A).
    - An employee being their own manager.

  Timesheet:
    - Overlapping shifts of one employee (including two open ones).
    - spent_minutes <= 0.
    - A shift that starts in the future or ends after the current minute.
    - Changing or deleting a closed shift.
    - Any timesheet change for a scored day.

  Time entries:
    - An entry by someone who does not see the task, for a future day,
      for a scored day.
    - Changing an entry (only delete and create).

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
    IS NULL, sends an email in the recipient''s language (SMTP from the
    config) and/or posts it to the webhook (URL and secret in the config,
    body signed with HMAC-SHA256), then sets sent_at = NOW().
  - The close_delay metric (delay in closing a shift) — on the frontend.
  - Rate limiting of issue_token: 5 links per employee in 15 minutes.


============================================================================
CRON JOBS (outside SQL)
============================================================================

  - every minute: SELECT send_due_reminds();
  - every hour:   DELETE FROM token WHERE sent_at < NOW() - INTERVAL ''1 hour'';
  - every hour:   SELECT send_weekly_digests();
  - every day:    DELETE FROM session WHERE last_seen_at < NOW() - INTERVAL ''30 days'';
  - every day:    DELETE FROM notification WHERE added_at < NOW() - INTERVAL ''1 year'';
  - every day:    DELETE FROM attachment a
                   WHERE used_at < NOW() - INTERVAL ''1 day''
                     AND NOT attachment_in_use(a.id);
  - every day:    DELETE FROM visit WHERE at < NOW() - INTERVAL ''1 year'';
  - every day:    DELETE FROM tag t
                   WHERE created_at < NOW() - INTERVAL ''1 day''
                     AND NOT EXISTS (SELECT 1 FROM task WHERE tag_ids @> ARRAY[t.id])
                     AND NOT EXISTS (SELECT 1 FROM user_tag WHERE tag_id = t.id);
  - every day:    UPDATE human SET next_day = NULL
                   WHERE next_day <= local_today(employee_id);
';
