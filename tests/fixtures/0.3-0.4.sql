-- 0.3 -> 0.4: data that only appeared in 0.4, with every column explicit.

-- A limit of hours on "сайт" (tag 1) for a half-year, changed once: the first
-- row closed and replaced, the second current.
INSERT INTO tag_limit (id, employee_id, tag_ids, starts_on, ends_on, minutes, created_at, expired_at, replaced_by)
VALUES (2, 1, '{1}', '2026-10-01', '2027-03-31', 12000, '2026-10-20 09:00:00+00', NULL, NULL);
INSERT INTO tag_limit (id, employee_id, tag_ids, starts_on, ends_on, minutes, created_at, expired_at, replaced_by)
VALUES (1, 1, '{1}', '2026-10-01', '2027-03-31', 6000, '2026-10-15 09:00:00+00', '2026-10-20 09:00:00+00', 2);
SELECT setval('tag_limit_id_seq', 2);
