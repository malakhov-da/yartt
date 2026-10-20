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

