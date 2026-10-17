# API for bots and scripts

A program — a CI pipeline, monitoring, a chat bot — can act in yartt as an
employee: comment, mention people, log time. It does so through the same
API the interface uses, with a token instead of a browser session.

## Give the bot an account and a token

1. **Invite the bot** like a person (the person with a plus in the top
   line): a name ("CI-бот") and an address you control
   (`ci-bot@company.com`). Leave its pronoun empty — verbs about it then
   keep both endings ("упомянул(а)"). Its manager is whoever invited it.
2. **Issue a token.** The bot cannot sign in, so its direct manager opens
   the bot's page and, under **API tokens**, issues one named after what
   uses it ("GitHub Actions"). The token is shown once — put it into the
   program's secrets right away. Anyone can also issue tokens for
   themselves in **Profile → API**.
3. **Add the bot to tasks** it should write to, as an observer — it sees
   exactly what an employee in its place would see, no more.

A token is revoked on the same page; dismissing the bot revokes all of
them. The page shows when each token was last used.

## Calling the API

The API is tRPC over HTTP at `https://<your yartt>/api/trpc/<Namespace>.<procedure>`,
JSON with the [superjson](https://github.com/flightcontrolhq/superjson)
envelope: the input goes inside `{"json": ...}`, the result comes back
inside `{"result": {"data": {"json": ...}}}`.

- **Queries** — `GET` with `?input=` (URL-encoded JSON); without input,
  no parameter.
- **Mutations** — `POST` with the JSON body.
- **Authorization** — `Authorization: Bearer <token>`.

Who am I:

```sh
curl -s https://yartt.company.com/api/trpc/Auth.me \
  -H "Authorization: Bearer $YARTT_TOKEN"
```

A comment that mentions someone (task 42, employee 7):

```sh
curl -s https://yartt.company.com/api/trpc/Comment.create \
  -H "Authorization: Bearer $YARTT_TOKEN" -H 'content-type: application/json' \
  -d '{"json": {"taskId": 42, "html": "<p>Build #512 failed on e2e</p>",
                "replyToId": null, "files": [], "mentionIds": [7], "taskIds": []}}'
```

Errors come back with an HTTP status and a stable code in
`error.json.message` (`no_access`, `not_found`, ...); the codes are listed
in `shared/errors.ts`. Every procedure, its input and what it throws are
described next to it in `server/trpc/<Namespace>.ts`.
