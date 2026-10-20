-- 0.1 -> 0.2: data that only appeared in 0.2, with every column explicit.

-- A bot: before 0.2 a bot was a person with an API token.
INSERT INTO employee (id, kind, email, full_name, about, manager_id, time_zone, locale, pronoun, dismissed_at, created_at)
VALUES (100, 'bot', NULL, 'Release bot', 'Tags releases', 1, 'Europe/Moscow', 'ru', NULL, NULL, '2026-10-17 17:02:20+00');
INSERT INTO bot (employee_id, kind, key_hash, key_issued_at, permissions, webhook_url, webhook_secret, key_reminded_at)
VALUES (100, 'bot', '\x5d41402abc4b2a76b9719d911017c592ae0b0a77d3dee8e8dcf0e5b1b6e3a1f0', '2026-10-17 17:02:20+00',
        '{comment,task}', 'https://hooks.example.com/release', 'b1d3c9e0f2a4b6c8d0e2f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6', NULL);
INSERT INTO bot_usage (bot_id, day, requests, refused, deliveries, failed_deliveries, last_request_at)
VALUES (100, '2026-10-17', 12, 1, 3, 0, '2026-10-17 18:30:00+00');
